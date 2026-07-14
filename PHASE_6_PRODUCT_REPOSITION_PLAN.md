# Phase 6 — Caffeine Curfew product repositioning

## Goal

Move Half-Life from a generic bio-state dashboard to an accessible caffeine-curfew coach, while preserving its local-first data model and the existing caffeine kinetics engine.

## Scope and phases

### Phase 6.1 — Tonight foundation (in progress)

- Replace user-facing backend/configuration labels with neutral local-state copy.
- Make the Tonight screen lead with a low-impact estimate and an explanation.
- Replace low-priority sugar/sodium cards on the home screen with a caffeine-focused Night Map summary.
- Raise typography and tap-target sizes to the baseline accessibility gate.
- Keep quick logging available while the new capture flow is built.

### Phase 6.2 — Record and impact preview

- Build a fast drink-first record flow for coffee, tea, energy drinks, cola, and custom entries.
- Add optional photo capture/selection behind explicit user action.
- Show estimated caffeine, editable assumptions, and the impact on the low-impact window before saving.
- Generate an original Sip Trace from drink type, dose, and time.

### Phase 6.3 — Plan and Caffeine Weather

- Add tomorrow wake-up time and optional deadline inputs.
- Generate a practical curfew plan, with lower-caffeine alternatives.
- Add plain-language Caffeine Weather to Tonight and widget-ready state models.

### Phase 6.4 — Patterns and personal calibration

- Replace generic analytics with personal late-caffeine insights.
- Gate insights on enough data and provide an honest “keep logging” state.
- Add Curfew Stamps only as history tokens derived from Sip Traces.

### Phase 6.5 — release quality

- Add onboarding, data-source explanation, permissions, empty/loading/error/offline states.
- Complete Dynamic Type, VoiceOver labels, contrast, and 44pt touch-target audit.
- Run the five-user task test described in `docs/PRODUCT_DIRECTION_2026.md`.

## Files expected to change

- `app/(tabs)/index.tsx`
- `app/(tabs)/inject.tsx`
- `app/(tabs)/analytics.tsx`
- `app/(tabs)/lab.tsx`
- `app/(tabs)/_layout.tsx`
- `src/theme/tokens.ts`
- new reusable trace, map, and capture components as needed

## Rollback

Every sub-phase is isolated to user-interface and documentation changes unless explicitly noted. The Zustand data schema and native HealthKit/Supabase integration are not changed in Phase 6.1.
