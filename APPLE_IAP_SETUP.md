# Apple In-App Purchase Setup Guide

This document describes how to configure Apple In-App Purchases for the ATC Training app.

## Required Environment Variables

Add the following to your `.env.development` and `.env.production` files:

```bash
# Apple In-App Purchase Configuration
APPLE_SHARED_SECRET=your_shared_secret_here
```

### How to Get the Shared Secret

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Navigate to **My Apps** → Select your app
3. Go to **App Information** → **App-Specific Shared Secret**
4. Click **Generate** if you haven't created one yet
5. Copy the shared secret and add it to your `.env` file

## Product IDs

The following product IDs are configured:

- **Monthly Premium**: `com.aviateai.premium.monthly` ($14.99/month)
- **Yearly Premium**: `com.aviateai.premium.yearly` ($69.99/year, 60% discount)

### Legacy Product IDs (for backwards compatibility):
- `com.aviateai.golden.monthly`
- `com.aviateai.golden.yearly`

## Apple Server Notifications Setup

To receive automatic subscription updates (renewals, cancellations, refunds), configure Server-to-Server notifications:

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Navigate to **My Apps** → Select your app
3. Go to **App Information** → **App Store Server Notifications**
4. Set the **Production Server URL** to (for Vercel):
   ```
   https://atc-server-vercel.vercel.app/api/v1/webhooks/apple
   ```
5. Set the **Sandbox Server URL** to the same URL for testing, or a separate preview URL if you use one.

**Vercel checklist:** Ensure in Vercel project settings you have: `APPLE_CLIENT_ID` (bundle ID, e.g. `com.jujubecamp.aviateai`), `APPLE_SHARED_SECRET`, and `VERCEL_ENV` set (production deploy uses production App Store verification).

### Testing the webhook locally

You can test in two ways:

**1. Hit the endpoint from your machine (no Apple involved)**

1. Start the server: `pnpm dev` (or `vercel dev`).
2. In another terminal run: `./scripts/test-webhook-v2.sh`.
3. You should get HTTP 200 and see logs like `[AppleWebhook] 📨 Raw webhook request received` and either V2 decode failure (invalid JWT) or V1 invalid password. That confirms the route and controller run.

**2. Receive real webhooks from Apple on your machine (ngrok)**

Apple can only send requests to a **public HTTPS URL**. To test with real sandbox notifications:

1. Install [ngrok](https://ngrok.com/) and start a tunnel to your local server:
   ```bash
   ngrok http 3000
   ```
2. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`).
3. In App Store Connect → App Information → App Store Server Notifications, set **Sandbox Server URL** to:
   ```
   https://YOUR_NGROK_URL/api/v1/webhooks/apple
   ```
4. Run your server locally: `pnpm dev`.
5. Make a sandbox subscription purchase (or use a renewal test). Apple will POST to your ngrok URL; ngrok forwards to localhost and you’ll see the webhook in server logs.

Leave Production Server URL pointing at Vercel; only Sandbox can point at ngrok for local testing.

### Testing on Sandbox (end-to-end)

**1. Create Sandbox Testers (App Store Connect)**

1. Go to [App Store Connect](https://appstoreconnect.apple.com/) → **Users and Access** → **Sandbox** → **Testers** (or **App Store Connect** → **Sandbox** in the sidebar).
2. Click **+** to add a sandbox tester.
3. Use a **new email** that is not a real Apple ID (e.g. `you+sandbox1@gmail.com`). Apple will not send real email to it.
4. Set password, country, etc. Save.

**2. Use Sandbox on Your Device**

- **iOS:** On the device, do **not** sign into Settings → App Store with this sandbox account. When you make a purchase **inside your app**, iOS will prompt for an Apple ID — then sign in with the **sandbox tester** email/password. You’ll see “[Environment: Sandbox]” in the purchase dialog.
- **Important:** If you’re already signed into the App Store with a real Apple ID, you can still use sandbox: when the in-app purchase sheet appears, tap to use a different Apple ID and enter the sandbox tester. Or sign out of the App Store in Settings and sign in only when the app asks during purchase (then use the sandbox account).

**3. Point the App at Your Backend**

- For **Vercel:** Set the app’s API URL to `https://atc-server-vercel.vercel.app/api/v1`. Sandbox purchases will hit this; your server uses `Environment.SANDBOX` when not in production (e.g. `VERCEL_ENV` ≠ production or local dev).
- For **local:** Use ngrok and set **Sandbox Server URL** in App Store Connect to your ngrok URL (see “Receive real webhooks from Apple on your machine” above). Point the app at your local server (e.g. `API_BASE_URL=http://YOUR_IP:3000/api/v1`).

**4. Sandbox Server URL (webhooks)**

- In App Store Connect → **App Information** → **App Store Server Notifications**, set **Sandbox Server URL** to:
  - **Same as production:** `https://atc-server-vercel.vercel.app/api/v1/webhooks/apple` (sandbox notifications go to Vercel; server must use SANDBOX for verification — it does when `VERCEL_ENV` is not `production`), or
  - **Local via ngrok:** `https://YOUR_NGROK_URL/api/v1/webhooks/apple` when testing webhooks locally.

**5. Sandbox subscription timing**

- Sandbox subscriptions renew much faster (e.g. monthly → 5 minutes, yearly → 1 hour). Use this to test renewals, expiration, and webhooks without waiting real time.

**Quick checklist**

| Step | Action |
|------|--------|
| Sandbox tester | Created in App Store Connect (Users and Access → Sandbox) |
| Device | When app asks for Apple ID at purchase, sign in with sandbox tester |
| App API URL | Points to Vercel (or local IP if testing locally) |
| Sandbox Server URL | Set in App Store Connect so webhooks hit your backend (Vercel or ngrok) |
| Server env | Local / preview uses SANDBOX; production deploy uses PRODUCTION |

### Supported Notification Types

The webhook handles the following notification types:

- `INITIAL_BUY` - First subscription purchase
- `DID_RENEW` - Subscription renewed successfully
- `DID_FAIL_TO_RENEW` - Subscription renewal failed (payment issue)
- `DID_CHANGE_RENEWAL_STATUS` - User turned auto-renewal on/off
- `DID_CHANGE_RENEWAL_PREF` - User upgraded/downgraded
- `CANCEL` - User cancelled auto-renewal (access maintained until expiration)
- `REFUND` - Purchase refunded (access revoked immediately)
- `INTERACTIVE_RENEWAL` - User renewed through UI

## API Endpoints

### 1. Verify Payment
```
POST /api/v1/membership/verify-payment
Authorization: Bearer <token>

Body:
{
  "transactionId": "string",
  "productId": "string",
  "receiptData": "string",
  "deviceId": "string",           // required
  "deviceName": "string (optional)",
  "deviceModel": "string (optional)"
}

Response:
{
  "success": true,
  "membership": {
    "tier": "PREMIUM",
    "expiresAt": "2025-12-10T00:00:00.000Z",
    "isActive": true
  }
}
```

### 2. Restore Purchases
```
POST /api/v1/membership/restore
Authorization: Bearer <token>

Body:
{
  "receiptData": "string"
}

Response:
{
  "success": true,
  "membership": {
    "tier": "PREMIUM",
    "expiresAt": "2025-12-10T00:00:00.000Z",
    "isActive": true
  }
}
```

### 3. Apple Webhook (Server-to-Server)
```
POST /api/v1/webhooks/apple
No Authorization Required (sent directly by Apple)

Body:
{
  "notification_type": "DID_RENEW",
  "password": "your_shared_secret",
  "environment": "PROD",
  "unified_receipt": {
    "latest_receipt_info": [...]
  }
}

Response:
{
  "status": "ok"
}
```

## Receipt Verification Flow

### Client-Side (React Native)
1. User initiates purchase via `InAppPurchases.purchaseItemAsync()`
2. Apple processes payment
3. App receives purchase response with `transactionReceipt`
4. App sends receipt to backend for verification

### Server-Side (Node.js)
1. Receives receipt data from client
2. Sends receipt to Apple's verification servers:
   - Production: `https://buy.itunes.apple.com/verifyReceipt`
   - Sandbox: `https://sandbox.itunes.apple.com/verifyReceipt`
3. Validates Apple's response:
   - Checks status code (0 = valid)
   - Verifies product ID matches
   - Verifies transaction ID matches
   - Checks subscription is not cancelled
   - Checks subscription hasn't expired
4. Updates user's membership in database
5. Returns success to client

## Security Features

### Implemented
✅ Server-side receipt verification with Apple
✅ Product ID validation
✅ Transaction ID validation
✅ Cancellation check
✅ Expiration date validation
✅ Automatic sandbox/production detection
✅ Webhook signature validation (via shared secret)

### Error Handling
✅ Network error retry with exponential backoff (3 retries)
✅ Graceful degradation for offline mode
✅ Detailed error messages
✅ Purchase restoration capability

## Testing

### Sandbox Testing
1. Use a sandbox test account from App Store Connect
2. Set `APPLE_SHARED_SECRET` to your sandbox shared secret
3. Receipts will be verified against sandbox environment

### Production Testing
1. Use real Apple ID
2. Set `APPLE_SHARED_SECRET` to your production shared secret
3. Receipts will be verified against production environment

## Troubleshooting

### Common Issues

**"APPLE_SHARED_SECRET not configured"**
- Add the shared secret to your `.env` file

**"Receipt could not be authenticated" (status 21003)**
- Check that the shared secret is correct
- Verify you're using the right environment (sandbox vs production)

**"This receipt is from the test environment" (status 21007)**
- The code automatically retries with sandbox URL
- Make sure you're testing with a sandbox account

**"No active subscription found"**
- The subscription has expired
- Check the expiration date in the receipt

## Subscription Lifecycle

1. **Purchase** → User buys subscription → Membership updated to PREMIUM
2. **Renewal** → Apple auto-renews → Webhook updates expiration date
3. **Cancellation** → User cancels auto-renewal → Webhook maintains PREMIUM access until expiration date, then auto-downgrades to FREE
4. **Refund** → Apple issues refund → Webhook immediately downgrades to FREE
5. **Restore** → User restores on new device → Membership reactivated

## Notes

- Subscriptions are auto-renewable
- Users can cancel anytime through iOS Settings
- Grace period handling is built into Apple's system
- Billing retry is handled automatically by Apple

