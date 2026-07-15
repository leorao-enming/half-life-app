# Xcode and App Store release

Half-Life is an Expo project with native iOS generation enabled. The generated `ios/` directory is the Xcode project to commit and maintain; it is required for HealthKit and App Store builds.

## First-time native setup

Use Node 20 LTS or newer and install the lockfile dependencies:

```bash
npm ci
npm run generate:ios
open ios/HalfLife.xcworkspace
```

If native dependencies or the Expo SDK change, regenerate with:

```bash
npm run generate:ios:clean
```

This recreates `ios/`; commit the resulting changes after checking the generated project.

## Xcode configuration

Open `ios/HalfLife.xcworkspace`, select the **HalfLife** target, and set:

1. **Signing & Capabilities**: select your Apple Developer team.
2. **Bundle Identifier**: keep `com.leorao.halflifeapp`, or change it to an identifier registered to your team.
3. **HealthKit**: enable the HealthKit capability. The Expo configuration already declares it and provides usage descriptions.
4. **General**: choose an iOS deployment target accepted by the current Expo SDK and ensure the version/build match the intended release.

Never commit provisioning profiles, certificates, or Apple account credentials.

## Release archive

Before an App Store archive:

```bash
npm run typecheck
```

Then in Xcode choose **Any iOS Device (arm64)**, select **Product → Archive**, and distribute the validated archive through App Store Connect.

## App Store Connect checklist

- Create the app record using the final bundle identifier.
- Set the App Store version to the user-visible version in `app.json`; increase `ios.buildNumber` for every upload.
- Publish [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) at a public HTTPS URL, enter it as the App Privacy policy URL, and set a monitored support URL and email.
- Complete privacy nutrition labels accurately. When cloud sync is enabled, drink entries and notes are stored with the signed-in account; Apple Health data is processed on-device and not uploaded.
- Test HealthKit permissions on a physical device. The app must not request Apple Health at launch; connect it from the Plan screen and verify the exact read permissions, grant flow, and denial flow.
- Provide review notes explaining that HealthKit is optional, is used only to personalize caffeine-clearance estimates, and the underlying Apple Health data is not uploaded.
- Follow [`TESTFLIGHT_BETA_CHECKLIST.md`](TESTFLIGHT_BETA_CHECKLIST.md) before inviting testers.
