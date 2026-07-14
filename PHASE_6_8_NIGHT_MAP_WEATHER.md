# Phase 6 & 8 — Night Map and Caffeine Weather

## Delivered

- **Night Map** turns recorded caffeine events into an original night route that converges on a green low-impact window.
- **Caffeine Weather** gives one plain-language, non-medical evening read before the detail.
- Both are local, derived from recorded caffeine and the existing effective half-life.

## Design constraints met

- No coffee characters, logos, cutout stickers, or generic dashboard charting.
- A decision leads; detail follows.
- Every prediction is framed as an estimate based on recorded caffeine.

## Verification

```sh
PATH="$PWD/.tools/node-v24.18.0-darwin-arm64/bin:$PATH" npm run typecheck
```
