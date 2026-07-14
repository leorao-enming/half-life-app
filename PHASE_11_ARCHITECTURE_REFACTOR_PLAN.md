# Phase 11 — Caffeine-domain architecture refactor

## Goal

Make Tonight, Record, Plan, and Patterns use one explainable caffeine model instead of maintaining separate calculations and temporary UI state.

## Scope

- Add a pure caffeine domain module for drink presets, impact forecasts, and curfew planning.
- Add a minute-granularity shared hook for live caffeine snapshots.
- Make Record correctly explain the first drink of the day as a new estimate.
- Make Plan persist the selected wake-up time and deadline preference locally.
- Make the 7/30/90-day Patterns control change the actual analysis window.
- Remove developer-facing sync copy from the user-facing Tonight screen.

## Files changed

- `src/domain/caffeine.ts`
- `src/domain/patterns.ts`
- `hooks/useCaffeineSnapshot.ts`
- `src/store/useBioStore.ts`
- `app/(tabs)/index.tsx`
- `app/(tabs)/inject.tsx`
- `app/(tabs)/lab.tsx`
- `app/(tabs)/analytics.tsx`

## Rollback

The refactor is local-first. Reverting these files restores the prior screens and does not require a database migration. Older persisted profiles remain usable because Plan falls back to its default preferences until the user changes a setting.
