package webassets

import (
	"bytes"
	"embed"
	"io/fs"
)

const placeholderMarker = "WOOTTY_EMBED_PLACEHOLDER"

//go:embed dist
var embedded embed.FS

func EmbeddedFS() (fs.FS, bool) {
	assets, err := fs.Sub(embedded, "dist")
	if err != nil {
		return nil, false
	}

	indexContent, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		return nil, false
	}
	if bytes.Contains(indexContent, []byte(placeholderMarker)) {
		return nil, false
	}

	return assets, true
}
