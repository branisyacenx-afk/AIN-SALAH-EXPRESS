# Ain Salah Express — Production Readiness & Operations

Last reviewed: 2026-11-20

## Current production architecture
- Frontend: React 18 + TypeScript + Vite, deployed on Vercel.
- Identity, database, realtime and object storage: Supabase.
- Map display: Leaflet + OpenStreetMap tiles.
- Road geometry in the tracking view: public OSRM routing endpoint, with a straight-line/polyline fallback when routing is unavailable.
- Checkout: database RPC validates product availability, locks finite stock, snapshots prices, applies eligible coupons, records order history and creates merchant notifications.
- Payment currently supported in the customer flow: cash on delivery. Online payment is intentionally disabled until a regulated/local provider is integrated and verified.

## Important accuracy and launch limitations
1. Checkout currently calculates delivery distance with a great-circle (straight-line) formula, not road-network distance. Do not advertise road-distance billing until a dependable routing service is implemented server-side and tested.
2. The public OSRM demo endpoint is best-effort only. It is not a contracted production SLA. Navigation links open the user's map application; turn-by-turn navigation is not embedded in the platform.
3. GPS depends on device location permission, a working sensor, HTTPS and network connectivity. Background tracking is subject to Android/browser power-saving restrictions.
4. Push notifications when the browser is fully closed require a real Web Push subscription and server-side sender. Current in-app notifications/realtime updates are not a substitute for guaranteed push delivery.
5. Legal templates are operational drafts, not legal advice. Have Algerian counsel review commercial, courier, privacy and consumer terms before signing or public scale.
6. Do not enable online payments by changing a UI flag alone. Implement provider checkout, signed webhooks, idempotency, reconciliation and refunds first.

## Pre-launch acceptance tests
- Create a customer account; sign out/in; reset password.
- Create a merchant from the admin portal; verify it can only manage its own store and products.
- Create a driver application; approve it; verify app role refresh and online/offline state.
- Place an order with multiple products from one store; reject mixed-store checkout.
- Race two checkouts against the last inventory item; only one should succeed.
- Test coupon minimum, expiry, usage limit and maximum discount.
- Test each order transition and verify order history + notification rows.
- Verify a driver cannot claim two orders simultaneously and cannot update another driver's order.
- Verify customer tracking exposes only that customer's order; verify merchant and driver see only assigned/owned orders.
- Test GPS denied, stale GPS, intermittent network and app backgrounding on a real Android phone.
- Test offline shell, service-worker update and recovery after reconnect.
- Verify storage policies prevent cross-store product writes and cross-user driver-document reads.
- Review Supabase Security and Performance Advisors after schema or policy changes.

## Security notes
- Role checks must use server-controlled app_metadata, never user-editable user_metadata.
- Never expose Supabase service-role credentials in browser bundles.
- Keep RLS enabled on every exposed public table and test access with real role accounts.
- Three SECURITY DEFINER tracking/order RPCs are intentionally guarded by auth.uid() and ownership/role checks. Do not change them to SECURITY INVOKER or revoke their authenticated execution without first redesigning the RLS access path and re-running role-based tests.
- Supabase currently reports leaked-password protection disabled. Enable it in Supabase Auth password security settings.
- The current advisor output also flags multiple permissive RLS policies. Review and consolidate only after confirming equivalent access for admin, customer, merchant and driver roles; do not delete policies mechanically.

## Release process
1. Merge reviewed changes to main.
2. Confirm GitHub Quality Gate passes.
3. Confirm Vercel production deployment reaches READY for the intended commit.
4. Smoke-test the production URL on Android Chrome and a second browser.
5. Verify Supabase logs, advisor output and order creation after the release.
6. Keep the previous READY production deployment available for rollback.