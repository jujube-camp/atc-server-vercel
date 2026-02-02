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

# Test 2: V1 format (with password)
echo "Test 2: Sending V1 webhook (unified_receipt format)"
echo "Expected: 401 Unauthorized (wrong password) or 200 OK (correct password)"
echo ""

curl -X POST http://localhost:3000/api/v1/webhooks/apple \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "TEST",
    "password": "wrong_password",
    "environment": "Sandbox"
  }' \
  -w "\nHTTP Status: %{http_code}\n" \
  -s

echo ""
echo "---"
echo ""

echo "✅ Test complete!"
echo ""
echo "Check server logs for:"
echo "  - [AppleWebhook] 🔔 Incoming webhook notification"
echo "  - [AppleWebhook] 📦 Processing V2 notification (for Test 1)"
echo "  - [AppleWebhook] 📦 Processing V1 notification (for Test 2)"
echo ""
echo "For real testing, wait for Apple to send actual webhooks after purchase."
