// Package fgaconsole holds the console's web pages, built into the program
// so the console runs as one file.
package fgaconsole

import "embed"

// Web is the web folder: the pages, styles and scripts the console serves.
//
//go:embed web
var Web embed.FS
