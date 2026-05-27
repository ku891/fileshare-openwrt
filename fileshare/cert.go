package main

import (
	"crypto/tls"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func loadOrGenerateTLS(base string, cfg Config) (*tls.Config, error) {
	certDir := filepath.Join(base, "certs")
	crt := filepath.Join(certDir, "server.crt")
	key := filepath.Join(certDir, "server.key")
	info := filepath.Join(certDir, "cert.info")

	if err := os.MkdirAll(certDir, 0o755); err != nil {
		return nil, err
	}

	domain := cfg.DomainName
	if !cfg.UseDomain {
		domain = "localhost"
	}

	needGen := true
	if b, err := os.ReadFile(info); err == nil && string(b) == domain {
		if _, err1 := os.Stat(crt); err1 == nil {
			if _, err2 := os.Stat(key); err2 == nil {
				needGen = false
			}
		}
	}
	if needGen {
		if err := genCert(crt, key, domain); err != nil {
			return nil, err
		}
		_ = os.WriteFile(info, []byte(domain), 0o644)
	}

	cert, err := tls.LoadX509KeyPair(crt, key)
	if err != nil {
		return nil, err
	}
	return &tls.Config{Certificates: []tls.Certificate{cert}}, nil
}

func genCert(crt, key, domain string) error {
	if _, err := exec.LookPath("openssl"); err != nil {
		return fmt.Errorf("openssl not found")
	}
	subj := fmt.Sprintf("/CN=%s/O=FileShare/C=CN", domain)
	cmd := exec.Command("openssl", "req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", crt,
		"-days", "3650", "-nodes", "-subj", subj)
	return cmd.Run()
}
