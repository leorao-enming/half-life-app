# Phase 5 Management and Stability Plan

## Goal

Make the current `rework/energy-optimizer` branch easier to verify, review, and continue developing without changing the product direction.

## Scope

- Track this phase with repo-local plan and acceptance checklist files.
- Add a first-class TypeScript verification command.
- Fix runtime safety around Supabase being unconfigured.
- Add a Supabase migration matching the app's actual `bio_logs` read/write shape.
- Confirm GitHub linkage and prepare the branch for a later push when Leo explicitly approves it.

## Files changed

- `PHASE_5_PLAN.md`
- `PHASE_5_ACCEPTANCE_CHECKLIST.md`
- `package.json`
- `lib/supabase.ts`
- `README.md`
- `supabase/migrations/202607090001_create_bio_logs.sql`

## Acceptance checklist

- Phase plan and checklist exist in the repo root.
- `npm run typecheck` runs `tsc --noEmit`.
- App code does not crash at startup when Supabase env vars are missing.
- Supabase setup docs and migration use `label`, `substance_type`, `amount_mg`, `timestamp`, and `note`.
- Existing TypeScript verification passes.
- No secrets, `.env` files, or unrelated migration files are touched.

## Verification commands

```bash
npm run typecheck
git status --short --branch
git branch -vv
git remote -v
```

## Rollback notes

Rollback is file-scoped:

```bash
git restore PHASE_5_PLAN.md PHASE_5_ACCEPTANCE_CHECKLIST.md package.json lib/supabase.ts README.md supabase/migrations/202607090001_create_bio_logs.sql
```

If these files are already committed, revert the commit instead of resetting the branch.

## Next development

After this phase passes, the next development slice should be one of:

- Push `rework/energy-optimizer` to GitHub after explicit approval.
- Add Supabase schema/migration documentation for `bio_logs`.
- Add pure TypeScript tests for kinetics and store-derived calculations.
- Wire HealthKit sleep data into the analytics screen.
