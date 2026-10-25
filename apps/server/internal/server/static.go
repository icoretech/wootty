package server

import (
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/icoretech/wootty/apps/server/internal/webassets"
)

func (s *Server) registerStaticRoutes(mux *http.ServeMux) {
	staticDir := s.cfg.StaticDir
	if staticDir != "" {
		info, err := os.Stat(staticDir)
		if err == nil && info.IsDir() {
			s.registerDirectoryRoutes(mux, staticDir)
			return
		}
	}

	if embeddedAssets, ok := webassets.EmbeddedFS(); ok {
		s.registerEmbeddedRoutes(mux, embeddedAssets)
		return
	}

	s.registerFallbackRoute(mux)
}

func (s *Server) registerFallbackRoute(mux *http.ServeMux) {
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || (r.Method != http.MethodGet && r.Method != http.MethodHead) {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"service": "wootty-server",
			"message": "Web app is not built yet. Run `pnpm --filter @icoretech/wootty-web build`.",
		})
	})
}

func (s *Server) registerDirectoryRoutes(mux *http.ServeMux, staticDir string) {
	root, err := os.OpenRoot(staticDir)
	if err != nil {
		s.log.Error("failed to open static assets", "err", err)
		s.registerFallbackRoute(mux)
		return
	}
	s.staticRoot = root
	s.registerEmbeddedRoutes(mux, root.FS())
}

func (s *Server) registerEmbeddedRoutes(mux *http.ServeMux, assets fs.FS) {
	fileServer := http.FileServer(http.FS(assets))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}

		if assetPath := cleanEmbeddedPath(r.URL.Path); assetPath != "" && embeddedAssetExists(assets, assetPath) {
			clone := cloneRequestWithPath(r, "/"+assetPath)
			fileServer.ServeHTTP(w, clone)
			return
		}

		serveEmbeddedAsset(w, assets, "index.html")
	})
}

func cleanEmbeddedPath(requestPath string) string {
	trimmed := strings.TrimPrefix(requestPath, "/")
	cleaned := path.Clean(trimmed)
	if cleaned == "." {
		return ""
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return ""
	}
	if strings.HasPrefix(cleaned, "/") {
		return ""
	}

	return cleaned
}

func embeddedAssetExists(assets fs.FS, assetPath string) bool {
	info, err := fs.Stat(assets, assetPath)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func cloneRequestWithPath(request *http.Request, requestPath string) *http.Request {
	clone := request.Clone(request.Context())
	clone.URL = new(*request.URL)
	clone.URL.Path = requestPath
	clone.URL.RawPath = requestPath
	return clone
}

func serveEmbeddedAsset(w http.ResponseWriter, assets fs.FS, assetPath string) {
	content, err := fs.ReadFile(assets, assetPath)
	if err != nil {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	if contentType := mime.TypeByExtension(path.Ext(assetPath)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}
