# TestFlight beta release checklist

## One-time Apple setup

- [ ] In Apple Developer, register `com.leorao.halflifeapp` and enable HealthKit.
- [ ] In Xcode, select the Apple Developer team for the HalfLife target and confirm automatic signing produces a distribution profile containing the application identifier and HealthKit entitlement.
- [ ] Publish `PRIVACY_POLICY.md` at a public HTTPS URL and enter that URL in App Store Connect. Add the same link to the in-app Privacy & Data Use screen.
- [ ] Set a public support URL and support email in App Store Connect/TestFlight. The support contact must accept cloud-data deletion requests if cloud sync is enabled.
- [ ] Complete App Privacy in App Store Connect from the deployed configuration: Health data and User Content (notes) are collected and linked to the account when cloud sync is enabled; optional drink photos stay on-device. Do not select tracking.
- [ ] Confirm whether the build's encryption use is exempt before relying on `ITSAppUsesNonExemptEncryption=false`; answer TestFlight export-compliance questions truthfully.

## Pre-upload checks

- [ ] Install Node 20 LTS or newer, then run `npm ci` and `npm run typecheck`.
- [ ] Archive a Release build; increment the build number for every upload.
- [ ] On a physical iPhone or iPad, confirm Apple Health has no prompt at launch, then connect it from Plan and verify the requested data types and denial handling.
- [ ] Confirm camera and photo-library prompts appear only after tapping the relevant drink-photo action.
- [ ] With cloud sync configured, verify a user can read, insert, update, and delete only their own `bio_logs` rows; RLS policies already exist in `supabase/migrations/202607090001_create_bio_logs.sql`.
- [ ] Verify the Privacy & Data Use screen is reachable from Plan and matches the deployed cloud-sync behavior.

## TestFlight setup

- [ ] Upload the archive and resolve Processing and Missing Compliance status.
- [ ] Add beta description, test focus, reviewer/tester instructions, and a monitored feedback email.
- [ ] Start with internal testers. Submit the build for Beta App Review before inviting external testers.
