# Phase 12 — Reference-led visual rebuild

## Goal

Rebuild the four primary destinations around the supplied Half-Life reference: a centred nightly decision, a left-photo/right-confirmation record flow, a curfew checklist, and time-rail patterns.

## Implemented scope

- Tonight: centred low-impact-time decision, one joined Night Map/Sip Trace panel, and a single Snap action.
- Snap & Confirm: optional private image at left, confirmed drink and caffeine estimate at right, Impact directly below.
- Plan: wake/deadline split card, caffeine-curfew checklist, and Curfew Stamp.
- Patterns: vertical time rails, range-aware Curfew Stamps, and segmented period control.
- Sip Trace: each recorded drink creates a dose-, time-, and color-specific fading trace plus a concise sleep-impact record.
- Night Map: shows a planning target sleep time alongside the current low-impact estimate and visual drink beacons.
- Caffeine Weather: a concise, data-derived sleep-weather summary between Tonight's main decision and detailed signals.
- Curfew Stamp generator: derives a different motif from the real drinks in a day or displayed period — coffee/orbit, tea/wave, energy/beam, cola/ripple, mixed/constellation, or quiet/no-drink.

## Constraints retained

- No fake drink photography ships with the app; the photo slot is populated only through an explicit local user choice.
- Times, dose, and traces derive from local records and the existing caffeine model.
- Interactive controls retain at least 44 pt touch targets.

## Verification

```sh
PATH="$PWD/.tools/node-v24.18.0-darwin-arm64/bin:$PATH" npm run typecheck
PATH="$PWD/.tools/node-v24.18.0-darwin-arm64/bin:$PATH" npx expo export --platform web
```
