#!/bin/bash

# Test script for Apple Webhook V2
# This simulates what Apple sends in V2 format

echo "🧪 Testing Apple Webhook V2 endpoint..."
echo ""

# Test 1: V2 format (with signedPayload)
echo "Test 1: Sending V2 webhook (signedPayload format)"
echo "Expected: 200 OK"
echo ""

curl -X POST http://localhost:3000/api/v1/webhooks/apple \
  -H "Content-Type: application/json" \
  -d '{
    "signedPayload": "test.jwt.payload"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo ""
echo "---"
echo ""

# Test 2: V1 format (with password). Use APPLE_SHARED_SECRET from env if set to test V1 auth.
echo "Test 2: Sending V1 webhook (unified_receipt format)"
echo "Expected: 200 OK (server always returns 200; check logs for auth success or 'No receipt info')"
echo ""

PASSWORD="${APPLE_SHARED_SECRET:-wrong_password}"
curl -X POST http://localhost:3000/api/v1/webhooks/apple \
  -H "Content-Type: application/json" \
  -d "{
    \"notification_type\": \"TEST\",
    \"password\": \"$PASSWORD\",
    \"environment\": \"Sandbox\"
  }" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo ""
echo "---"
echo ""

echo "✅ Test complete!"
echo ""
echo "Check server logs for:"
echo "  - [AppleWebhook] 📨 Raw webhook request received"
echo "  - Test 1: V2 decode (will fail on invalid JWT; that's expected)"
echo "  - Test 2: V1 auth (if APPLE_SHARED_SECRET is set: 'V1 Notification authenticated'; then 'No receipt info')"
echo ""
echo "To receive real webhooks locally, use ngrok (see APPLE_IAP_SETUP.md)."
