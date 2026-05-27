package main

import (
	"bufio"
	"os"
	"regexp"
	"strconv"
	"strings"
)

const configFile = "/etc/config/fileshare"

type Config struct {
	Port         int
	Password     string
	AllowedHosts []string
	EnableHTTPS  bool
	HTTPSPort    int
	UseDomain    bool
	DomainName   string
}

var optionRe = regexp.MustCompile(`^\s*option\s+(\w+)\s+['"]([^'"]+)['"]`)

func loadConfig() Config {
	cfg := Config{
		Port:       3000,
		Password:   "123456",
		HTTPSPort:  3443,
		DomainName: "fileshare.lan",
	}
	data, err := os.ReadFile(configFile)
	if err != nil {
		return cfg
	}
	for _, line := range strings.Split(string(data), "\n") {
		m := optionRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		key, val := m[1], m[2]
		switch key {
		case "port":
			if p, e := strconv.Atoi(val); e == nil && p > 0 && p < 65536 {
				cfg.Port = p
			}
		case "password":
			if val != "" {
				cfg.Password = val
			}
		case "allowed_hosts":
			for _, h := range strings.Split(val, ",") {
				h = strings.TrimSpace(h)
				if h != "" {
					cfg.AllowedHosts = append(cfg.AllowedHosts, h)
				}
			}
		case "enable_https":
			cfg.EnableHTTPS = val == "1"
		case "https_port":
			if p, e := strconv.Atoi(val); e == nil && p > 0 && p < 65536 {
				cfg.HTTPSPort = p
			}
		case "use_domain":
			cfg.UseDomain = val == "1"
		case "domain_name":
			if val != "" {
				cfg.DomainName = val
			}
		}
	}
	return cfg
}

func parseUCIEnabled() bool {
	f, err := os.Open(configFile)
	if err != nil {
		return true
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if strings.HasPrefix(line, "option enabled") {
			if strings.Contains(line, "'0'") || strings.Contains(line, `"0"`) {
				return false
			}
		}
	}
	return true
}
