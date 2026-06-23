# Agent Workflow

Short loop any coding agent should follow when working in this repo.

## 1. Inspect

- Run `git status` to see current state before touching anything (there may already be uncommitted work-in-progress — don't assume a clean tree).
- Check `package.json` for current scripts/deps before adding new ones.
- Read `docs/prd.md` if the task touches product behavior.

## 2. Plan

- Define a clear goal and scope for the change.
- List files expected to change. Keep the list small.
- If the change adds or touches a native module (anything requiring a custom dev client / EAS build), call out the build impact before implementing.
- Note a rollback plan (current commit hash) for any risky change.

## 3. Implement

- Make the smallest change that satisfies the goal.
- Do not touch files outside the stated scope.
- Never read or write `.env`, secrets, credentials, keys, or tokens.
- Do not assume HealthKit (`react-native-health`) works in Expo Go — it requires a dev build.

## 4. Verify

- Run the smallest relevant check available, e.g. `npx tsc --noEmit`, `npx expo-doctor`.
- If no verification command applies, say so explicitly rather than skipping silently.

## 5. Summarize

Report:
1. What changed
2. Files changed
3. Commands run
4. Results
5. Risks / notes
6. Suggested commit message

## 6. Commit suggestion

- Propose a concise commit message; do not commit, push, or force-push unless Leo explicitly asks.
