# AIN SALAH EXPRESS — Android app

The Android app is for **customers and delivery drivers only**. It connects to the same production web application, Supabase authentication, database, and live order records.

## Roles

- Customer: browse stores and products, place orders, manage delivery details, and track orders.
- Delivery driver: go online, receive eligible orders, share GPS location with permission, and update delivery status.
- Restaurant/merchant dashboards remain on the website.
- Admin and staff dashboards remain on the website and are not exposed inside the Android app.

## Build APK

1. Open GitHub Actions → **Build Android APK**.
2. Select **Run workflow** (or push a change to the configured Android app files).
3. Wait for the workflow to finish.
4. Open the GitHub Release created by the workflow and download `app-debug.apk`.

## Notes

- Internet access is required because the app connects to the live platform.
- Existing website accounts and orders are shared; no second database is created.
- Admin and merchant users who sign in from the Android app are shown a notice directing them to the website on a computer or iPad.
- This is an Android WebView package powered by Capacitor, not a separately rewritten native app.
- A signed Play Store release requires a separately managed signing key. Never commit signing credentials to this repository.
