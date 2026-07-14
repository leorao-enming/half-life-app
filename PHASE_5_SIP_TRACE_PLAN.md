# Phase 5 — Sip Trace

## Goal

Turn individual caffeine records into a readable, original visual explanation of what is still influencing tonight.

## Scope

- Render up to four recent caffeine records as independent, time-decaying traces.
- Derive each trace from its recorded time, dose, and the user’s effective caffeine half-life.
- Make Sip Trace the single explanatory visual on Tonight; do not retain a competing forecast chart.
- Highlight the latest drink, fade older records, limit the visible legend to two items, and use a low-impact threshold band.
- Keep the trace abstract: no coffee characters, branded cups, cutout stickers, or medical claims.

## Acceptance checklist

- [x] A trace starts at the recorded drink time and decays over time.
- [x] Different drink categories have original semantic colors.
- [x] The user can identify the latest drink, its estimated dose, and why it remains visible.
- [x] The visualization remains readable with one or four recent caffeine records.
- [x] Sip Trace is the only detailed caffeine visual on Tonight.
- [x] All calculations are local and use the existing caffeine kinetics assumptions.

## Verification

```sh
PATH="$PWD/.tools/node-v24.18.0-darwin-arm64/bin:$PATH" npm run typecheck
```

## Rollback

Remove `components/SipTrace.tsx` and its import/render block in `app/(tabs)/index.tsx`.
