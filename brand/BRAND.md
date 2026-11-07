# Sortix brand

**Sortix is the new name of this app, and the logo in this folder is its new logo.**

The app in `sustain-app/` has not been changed yet. It still shows its old name and has no logo. These files are ready to use when the rename happens.

## The logo

A fan of four fabric swatches pinned on one rivet, like a textile sample book being sorted. The wordmark is lowercase `sortix` in Inter Bold.

| File | Use |
|---|---|
| `svg/sortix-logo.svg` | Primary horizontal logo (mark + wordmark), for light backgrounds |
| `svg/sortix-logo-light.svg` | Same logo with a white wordmark, for dark backgrounds |
| `svg/sortix-mark.svg` | Mark only, transparent background |
| `svg/sortix-wordmark.svg` | Wordmark only |
| `svg/sortix-icon.svg` | App icon: mark on a rounded cream tile |
| `svg/sortix-icon-square.svg` | Full-bleed square icon (apple-touch / maskable) |
| `png/` | Raster exports: logo (light and dark), mark (512 and 1024), wordmark, `icon-192`, `icon-512`, `apple-touch-icon` (180), `favicon-16`, `favicon-32` |
| `favicon.ico` | Multi-size favicon (16, 32, 48) |

The wordmark in every SVG is outlined, so the files render the same everywhere with no font installed.

## Colours

| Name | Hex | Where |
|---|---|---|
| Ember | `#E4572E` | Swatch 1 |
| Saffron | `#F2B134` | Swatch 2 |
| Teal | `#2E8B8B` | Swatch 3 |
| Denim | `#1F3A68` | Swatch 4 |
| Ink | `#141413` | Wordmark, rivet ring |
| Cream | `#F7F5F0` | Icon background |

## Usage

- Keep clear space around the logo of at least the width of one swatch.
- Use the light-background logo on cream or white and the light-wordmark version on dark backgrounds. Don't recolour the swatches.
- For favicons, use `favicon.ico` or `png/favicon-32.png`. Use `png/apple-touch-icon.png` and `png/icon-192.png` / `png/icon-512.png` for the home screen and web manifest.
