package server

import (
	"crypto/subtle"
	"net"
	"net/http"
	"slices"
	"strings"
)

func (s *Server) handleAuthBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if strings.TrimSpace(s.cfg.AuthToken) == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	token := readBearerAuthorizationToken(r)
	if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.AuthToken)) != 1 {
		writeUnauthorized(w)
		return
	}
	setAuthCookie(w, r, token)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) isAuthorizedRequest(r *http.Request) bool {
	if strings.TrimSpace(s.cfg.AuthToken) == "" {
		return s.isTrustedHost(r)
	}
	token := readCookieAuthorizationToken(r)
	if token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(s.cfg.AuthToken)) == 1
}

func (s *Server) isAllowedOrigin(r *http.Request) bool {
	if !s.isTrustedHost(r) {
		return false
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}

	if len(s.cfg.AllowedOrigins) > 0 {
		return slices.Contains(s.cfg.AllowedOrigins, origin)
	}

	expectedHost := strings.TrimSpace(r.Host)
	if expectedHost == "" {
		return false
	}
	return origin == "http://"+expectedHost || origin == "https://"+expectedHost
}

// Same-origin alone does not prevent DNS rebinding: an unrelated hostname can
// resolve to the loopback listener. Require a loopback Host for tokenless local
// access unless the operator explicitly allows the browser's origin.
func (s *Server) isTrustedHost(r *http.Request) bool {
	if s.cfg.AuthToken != "" || !isLoopbackName(s.cfg.Host) {
		return true
	}
	if origin := r.Header.Get("Origin"); origin != "" && slices.Contains(s.cfg.AllowedOrigins, origin) {
		return true
	}
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
	}
	return isLoopbackName(host)
}

func isLoopbackName(host string) bool {
	host = strings.Trim(host, "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func readBearerAuthorizationToken(r *http.Request) string {
	authorizationHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authorizationHeader), "bearer ") {
		token := strings.TrimSpace(authorizationHeader[len("Bearer "):])
		if token != "" {
			return token
		}
	}
	return ""
}

func readCookieAuthorizationToken(r *http.Request) string {
	if cookie, err := r.Cookie("wootty_auth"); err == nil {
		if token := strings.TrimSpace(cookie.Value); token != "" {
			return token
		}
	}
	return ""
}

func setAuthCookie(w http.ResponseWriter, r *http.Request, token string) {
	// Request cookies omit attributes, so renew the policy even when the token
	// matches. Forwarded HTTPS can only add Secure; it never grants access or
	// overrides a TLS connection. Proxies must overwrite this header.
	secure := r.TLS != nil || strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
	http.SetCookie(w, &http.Cookie{
		Name:     "wootty_auth",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
