# Visual reference implementation standard

The approved visual reference is the four-screen Half-Life concept supplied on 2026-07-13. It is the primary UI specification for this release.

## Screens to match

1. **Tonight** — centred evening decision, a low-impact time, Night Map, one thin Sip Trace, and one full-width capture action.
2. **Snap & Confirm** — one private photo area, large detected/confirmed drink name and dose, one impact delta, confidence/explanation, one confirmation action.
3. **Plan** — wake-up/deadline split card, ordered curfew checklist, one Curfew Stamp.
4. **Patterns** — minimal title, Curfew Stamp explanation, vertical 7-day time rails, segmented range control.

## Non-negotiable visual rules

- Use a near-black field, warm off-white text, aquamarine as the primary light, and amber/purple only as semantic accents.
- Prefer hairline dividers, generous empty space, thin SVG curves, orbit rings, pulse bars and time rails.
- A screen has one main decision and one primary action. Remove secondary dashboard cards that compete with it.
- Use real local data for every displayed time, dose and trace. Mockup imagery is layout reference only; it must not be shipped as a fake user drink photo.
- Do not introduce branded coffee graphics, characters, cutout stickers or copied third-party artwork.

## Acceptance

- Each target screen follows the visual hierarchy above at iPhone width.
- All interactions remain 44pt or larger and VoiceOver labels explain charts.
- Verify each screen on device/simulator after the next clean Xcode build.
