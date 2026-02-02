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
4. Set the **Production Server URL** to:
   ```
   https://your-domain.com/api/v1/webhooks/apple
   ```
5. Set the **Sandbox Server URL** to:
   ```
   https://your-dev-domain.com/api/v1/webhooks/apple
   ```

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

