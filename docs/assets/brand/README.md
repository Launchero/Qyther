# Brand artwork

> **Status**: live — regeneration instructions for the shipped PNGs (docs/AGENTS.md freshness rule).

Deterministic HTML/CSS-rendered PNGs; regenerate with the commands below, never by hand-editing pixels.

- `social-preview.png` — 1280x640 CSS px @2x (2560x1280), GitHub OpenGraph image; dark-theme tokens. Source: `src/social.html`.
- `banner-dark.png` / `banner-light.png` — 1600x400 CSS px @2x (3200x800), README hero lockup. One source: `src/banner.html` (default = dark, `#light` = light).

## Render commands (headless Chrome, run from this folder)

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1280,640 --screenshot="$PWD/social-preview.png" \
  "file://$PWD/src/social.html"
# banners: --window-size=1600,400, output banner-dark.png / banner-light.png,
# URL src/banner.html and src/banner.html#light respectively.
```

If Chrome reports "Access is denied" writing the PNG, pass an absolute Windows path to `--screenshot` and add `--user-data-dir` pointing at a scratch folder on the same drive.

## Token source of truth

Colours are verbatim OKLCH from `src/renderer/styles/semantic/theme.css` (`:root` = light artwork, `.dark` = dark artwork) and `src/renderer/styles/tokens/colors.css` (brand-500 accent). Type is JetBrains Mono per `tokens/typography.css`; radii, shadows, key-cap and 800px palette widths come from `tokens/radius.css`, `tokens/shadow.css`, `tokens/spacing.css`. Mark geometry is reused from `public/logo-nothing-terminal.svg`.
