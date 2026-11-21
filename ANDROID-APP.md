# AIN SALAH EXPRESS — Native Android app

The Android application is being rebuilt as a **separate React Native / Expo native application**. It is not the website wrapped in Capacitor or a WebView.

## Product split

- **Customer experience:** native Android screens for sign-in, stores, products, cart, checkout, order history, and order status.
- **Driver experience:** native Android screens for assigned deliveries, delivery status transitions, and foreground GPS sharing with explicit permission.
- **Merchant and restaurant portals:** remain on the responsive website.
- **Admin and staff control panels:** remain on the website, optimized for desktop and iPad.

## Shared platform rules and data

The native app uses the existing Supabase project and the same authentication identities, profiles, stores, products, orders, driver locations, Realtime events, and trusted database RPC functions as the website. It must not create a second database or bypass Row Level Security.

The mobile app reads the role from the trusted Supabase `app_metadata.role` claim. It never allows a user to grant themselves a driver, merchant, or admin role.

## Native source

The application source is in `apps/mobile/`.

## Build APK using GitHub Actions

1. In the repository Settings → Secrets and variables → Actions, add these two repository secrets using the **same public Supabase project URL and anon/publishable key already configured for the website**:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Never put a Supabase service-role key in the Android app.
3. Open GitHub Actions → **Build Native Android App** → Run workflow, or push a change under `apps/mobile/`.
4. After a successful run, download the APK from the GitHub Release named `native-android-...`.

## Current implementation status

The native project foundation and first working screen flows have been added. This is **not yet a release-ready app**. Remaining work includes completing feature parity, native map experience, background-safe driver location, push notifications, robust offline/retry behavior, device testing, and a signed production build. Every database operation must continue to respect the existing Supabase RLS policies and RPC validations.

A debug APK is for testing. A Play Store release requires a production signing key stored securely in GitHub Actions or the build service, never committed to the repository.
