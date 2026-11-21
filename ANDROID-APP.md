# AIN SALAH EXPRESS — Android

The Android package is built with Capacitor and opens the production AIN SALAH EXPRESS platform inside its native Android WebView. It therefore uses the same live application, authentication, database, orders, merchant portal, driver portal, and administration backend as the website.

## Build an APK

1. Open GitHub Actions → **Build Android APK**.
2. Select **Run workflow** (or push a change to the configured Android app files).
3. Wait for the workflow to finish.
4. Open the GitHub Release created by the workflow and download `app-debug.apk`.

## Important

- The APK requires an internet connection because it loads the live platform.
- User accounts and orders remain shared with the website; no second database is created.
- This first package is an installable Android WebView build, not a separately rewritten native application.
- A signed release APK for Play Store distribution requires a separately managed signing key. Never commit signing credentials to this repository.
