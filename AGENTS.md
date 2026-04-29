# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Zero-dependency, single-file torrent-to-magnet converter. No `package.json`, no build tools, no bundler. Open [`index.html`](index.html) directly in a browser.

## Testing

- **CLI tests**: `node test-inline.mjs` — extracts inline bencode code from [`index.html`](index.html:452) and tests it in a Node.js `vm` sandbox
- Tests the **actually deployed** code, not a separate copy
- No test framework; custom `test()` / `assertEqual()` helpers
- Exit code 1 on failure via `process.exit(1)`

## Architecture

[`index.html`](index.html) is a self-contained SPA with three inline JS sections:
1. **Bencode parser** (lines 453–653) — recursive descent, operates on `Uint8Array`/`ArrayBuffer`
2. **Magnet URI generator** (lines 655–728) — uses `crypto.subtle.digest('SHA-1', ...)` for infohash
3. **App logic** (lines 730–953) — DOM manipulation, drag-and-drop, theme toggle

## Code Conventions

- All user-facing strings, comments, and error messages are in **Chinese (zh-CN)**
- Bencode parser uses hex byte comparisons (`0x69` for `'i'`) not character comparisons
- String decoding: UTF-8 with `fatal: true`, falls back to ISO-8859-1 for non-standard torrent files
- No linting or formatting tools configured
