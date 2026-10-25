package server

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthBootstrapCookieTransportSecurity(t *testing.T) {
	cases := []struct {
		name           string
		tls            bool
		forwardedProto string
		existing       bool
		wantSecure     bool
	}{
		{name: "direct HTTP remains usable locally"},
		{name: "direct TLS", tls: true, wantSecure: true},
		{name: "forwarded HTTPS", forwardedProto: "https", wantSecure: true},
		{name: "forwarded HTTP", forwardedProto: "http"},
		{name: "forwarded header cannot downgrade TLS", tls: true, forwardedProto: "http", wantSecure: true},
		{name: "matching cookie is renewed with HTTPS policy", forwardedProto: "https", existing: true, wantSecure: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := testRuntimeConfig(t, true, "sh", "")
			cfg.AuthToken = "sample-test-token"
			s := New(cfg)
			defer s.Shutdown()
			request := httptest.NewRequest(http.MethodPost, "http://example.com/api/auth/bootstrap", nil)
			request.Header.Set("Authorization", "Bearer "+cfg.AuthToken)
			request.Header.Set("X-Forwarded-Proto", tc.forwardedProto)
			if tc.tls {
				request.TLS = &tls.ConnectionState{}
			}
			if tc.existing {
				request.AddCookie(&http.Cookie{Name: "wootty_auth", Value: cfg.AuthToken})
			}
			recorder := httptest.NewRecorder()
			s.http.Handler.ServeHTTP(recorder, request)
			response := recorder.Result()
			defer response.Body.Close()
			if response.StatusCode != http.StatusNoContent {
				t.Fatalf("bootstrap status: %d", response.StatusCode)
			}
			cookies := response.Cookies()
			if len(cookies) != 1 {
				t.Fatalf("expected renewed auth cookie, received %d", len(cookies))
			}
			cookie := cookies[0]
			if cookie.Secure != tc.wantSecure || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
				t.Fatalf("unexpected cookie policy: %+v", cookie)
			}
		})
	}
}

func TestForwardedHTTPSDoesNotAuthorizeBootstrap(t *testing.T) {
	cfg := testRuntimeConfig(t, true, "sh", "")
	cfg.AuthToken = "sample-test-token"
	s := New(cfg)
	defer s.Shutdown()
	request := httptest.NewRequest(http.MethodPost, "http://example.com/api/auth/bootstrap", nil)
	request.Header.Set("X-Forwarded-Proto", "https")
	response := httptest.NewRecorder()
	s.http.Handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || response.Header().Get("Set-Cookie") != "" {
		t.Fatalf("forwarded scheme changed authentication: status %d", response.Code)
	}
}
