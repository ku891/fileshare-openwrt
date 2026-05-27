package main

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxFailedAttempts = 5
	lockoutDuration   = 24 * time.Hour
)

type attempt struct {
	count    int
	lockUntil time.Time
}

type authState struct {
	cfg      Config
	attempts map[string]*attempt
	mu       sync.Mutex
}

func newAuth(cfg Config) *authState {
	return &authState{cfg: cfg, attempts: make(map[string]*attempt)}
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-Ip"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return strings.TrimPrefix(r.RemoteAddr, "::ffff:")
	}
	return strings.TrimPrefix(host, "::ffff:")
}

func isPrivateIP(ip string) bool {
	if ip == "" {
		return false
	}
	ip = strings.TrimPrefix(ip, "::ffff:")
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	private := []string{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"}
	for _, cidr := range private {
		_, n, _ := net.ParseCIDR(cidr)
		if n.Contains(parsed) {
			return true
		}
	}
	return false
}

func (a *authState) writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func (a *authState) middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		host := r.Host
		ext := !isPrivateIP(ip)

		if !ext {
			for _, allowed := range a.cfg.AllowedHosts {
				if strings.Contains(host, allowed) || strings.Contains(ip, allowed) {
					next(w, r)
					return
				}
			}
		}

		a.mu.Lock()
		rec := a.attempts[ip]
		if rec != nil && !rec.lockUntil.IsZero() && time.Now().Before(rec.lockUntil) {
			remaining := int(rec.lockUntil.Sub(time.Now()).Hours()) + 1
			a.mu.Unlock()
			a.writeJSON(w, http.StatusUnauthorized, map[string]any{
				"requiresPassword": true,
				"message":          "密码错误次数过多，账户已被锁定",
				"locked":           true,
				"remainingHours":   remaining,
			})
			return
		}
		a.mu.Unlock()

		pw := r.Header.Get("x-access-password")
		if pw == "" {
			pw = r.URL.Query().Get("password")
		}
		if pw == "" {
			msg := "需要密码才能访问"
			if ext {
				msg = "外网访问必须提供密码"
			}
			a.writeJSON(w, http.StatusUnauthorized, map[string]any{
				"requiresPassword": true,
				"message":          msg,
				"isExternalAccess": ext,
			})
			return
		}
		if pw != a.cfg.Password {
			a.mu.Lock()
			rec = a.attempts[ip]
			count := 0
			if rec != nil {
				count = rec.count
			}
			count++
			if count >= maxFailedAttempts {
				a.attempts[ip] = &attempt{count: count, lockUntil: time.Now().Add(lockoutDuration)}
				a.mu.Unlock()
				a.writeJSON(w, http.StatusUnauthorized, map[string]any{
					"requiresPassword": true,
					"message":          "密码错误次数过多，账户已被锁定24小时",
					"locked":           true,
					"remainingHours":   24,
				})
				return
			}
			a.attempts[ip] = &attempt{count: count}
			remain := maxFailedAttempts - count
			a.mu.Unlock()
			a.writeJSON(w, http.StatusUnauthorized, map[string]any{
				"requiresPassword":  true,
				"message":           "密码错误，剩余尝试次数：" + strconv.Itoa(remain),
				"remainingAttempts": remain,
			})
			return
		}

		a.mu.Lock()
		delete(a.attempts, ip)
		a.mu.Unlock()
		next(w, r)
	}
}
