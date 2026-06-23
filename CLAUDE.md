# CLAUDE.md

## Role

You are Leo's coding agent for this repository. Your job is to implement changes safely, with minimal manual work required from Leo.

Leo is not using this project as a coding exercise. He wants reliable execution, clear phase progress, stable commits, and reversible changes.

## Working Rules

- Start every task by checking git status.
- Prefer small, reviewable changes.
- Do not make broad rewrites unless explicitly requested.
- Do not modify unrelated files.
- Do not read or expose secrets, .env files, credentials, private keys, or tokens.
- Do not push, force-push, reset hard, delete large folders, or run destructive commands unless Leo explicitly asks.
- Before risky changes, create or recommend a backup point.
- After changes, summarize files changed, commands run, verification result, remaining risks, and suggested commit message.

## Development Style

Use phase-based development when tasks are non-trivial.

Each phase should have:
- Goal
- Scope
- Files changed
- Acceptance checklist
- Verification commands
- Rollback notes

No `PHASE_N_PLAN.md` files exist here yet — adopt the same `PHASE_N_PLAN.md` / `PHASE_N_ACCEPTANCE_CHECKLIST.md` pattern used in Leo's other repos (e.g. leologic-os) once phases are tracked here.

## Verification

Prefer running the smallest relevant checks:
- build
- test
- lint
- typecheck

Only run commands that are available in this repo.

## Output Format

At the end of each task, report:
1. What changed
2. Files changed
3. Commands run
4. Results
5. Risks / notes
6. Suggested commit message

## Project Notes: Half-Life

This is Leo's personal iOS health / metabolism app.

Stack focus:
- Expo / React Native
- iOS dev build
- HealthKit
- Supabase

Rules:
- Do not assume HealthKit works in Expo Go.
- Avoid adding native modules without explaining build impact.
- Before dependency changes, check compatibility with the existing Expo / React Native setup.

### Repo layout notes
- Expo Router app (`main: "expo-router/entry"`), TypeScript, React 19 / React Native 0.81.
- Key deps: `expo-router`, `@supabase/supabase-js`, `react-native-health` (HealthKit), `zustand`, `expo-dev-client`.
- Scripts: `npm start` / `expo start`, `npm run ios`, `npm run android`, `npm run web`.
- `react-native-health` is excluded from the Expo Doctor `reactNativeDirectoryCheck` — a native module already in use; treat it as load-bearing, not optional.
- `docs/prd.md` holds the product requirements — read it before scoping new features.
- A git migration appears in progress (Expo Router `app/(tabs)/` restructure, `App.tsx`/`index.ts` removal) — do not touch those files unless the task is explicitly about that migration.
