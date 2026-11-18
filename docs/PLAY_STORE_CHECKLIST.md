# Google Play Store Publishing Checklist (`com.listtube.app`)

ListTube is configured with `applicationId "com.listtube.app"`, `targetSdkVersion = 36`, `versionCode 4`, and `versionName "1.2.0"`.

## 1. Signed Android App Bundle (`.aab`)
Google Play Console requires an Android App Bundle (`.aab`) signed with an upload key (already configured via `signingConfigs.listtube`).
Build it locally anytime:
```bash
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/apk/... -> android/app/build/outputs/bundle/release/app-release.aab
```

## 2. Play Console Store Listing Requirements
- **App Name:** ListTube
- **Privacy Policy URL:** `https://listtube.vercel.app/privacy.html` (bundled at `public/privacy.html`)
- **App Access:** Free / works without login (note for Google Reviewer: optional AniList/MAL/Google sign-in, no paywall).
- **Content Rating (IARC):** 12+ / Teen (User-generated reviews/comments + anime database).
- **Data Safety Declarations:**
  - *Personal info (optional)*: Name / User IDs collected ONLY if user signs in for cloud sync; encrypted in transit (HTTPS/TLS).
  - *App activity*: Watchlist entries, comments/reviews (optional, sync-enabled only when logged in).
  - *Data deletion*: Available in-app via Settings + GitHub maintainer request link in Privacy Policy.
- **Store Graphics Needed:**
  - App icon `512×512 PNG` (already generated at `public/icon-512.png`).
  - Feature Graphic `1024×500 PNG`.
  - At least 2 phone screenshots (capture cleanly from your `ListTube_Pixel` emulator!).

## 3. Recommended First Track: Internal Testing -> Closed Testing (12 Testers for 14 Days) -> Production
For new personal Google Play developer accounts, Google requires Closed Testing opt-in by testers for 14 days before granting Production publish access. Upload `app-release.aab` to **Internal testing** first to verify Play App Signing, then promote to **Closed testing**.
