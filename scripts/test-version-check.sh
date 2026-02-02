#!/bin/bash

# Test script for version check endpoint
# Usage: ./scripts/test-version-check.sh [server_url]

SERVER_URL="${1:-http://localhost:3000}"

echo "🧪 Testing Version Check Endpoint"
echo "=================================="
echo "Server: $SERVER_URL"
echo ""

# Test 1: Old version (should require update)
echo "Test 1: Old version (0.1.0) - Should require update"
echo "---------------------------------------------------"
curl -X POST "$SERVER_URL/api/v1/version/check" \
  -H "Content-Type: application/json" \
  -d '{"currentVersion": "0.1.0", "platform": "ios"}' \
  -s | jq '.'
echo ""
echo ""

# Test 2: Minimum version (should not require update, but may have available update)
echo "Test 2: Minimum version (0.1.5) - Should not require update"
echo "-----------------------------------------------------------"
curl -X POST "$SERVER_URL/api/v1/version/check" \
  -H "Content-Type: application/json" \
  -d '{"currentVersion": "0.1.5", "platform": "ios"}' \
  -s | jq '.'
echo ""
echo ""

# Test 3: Latest version (should not require update)
echo "Test 3: Latest version (0.1.6) - Should not require update"
echo "----------------------------------------------------------"
curl -X POST "$SERVER_URL/api/v1/version/check" \
  -H "Content-Type: application/json" \
  -d '{"currentVersion": "0.1.6", "platform": "ios"}' \
  -s | jq '.'
echo ""
echo ""

# Test 4: Android platform
echo "Test 4: Android platform (0.1.0) - Should require update"
echo "--------------------------------------------------------"
curl -X POST "$SERVER_URL/api/v1/version/check" \
  -H "Content-Type: application/json" \
  -d '{"currentVersion": "0.1.0", "platform": "android"}' \
  -s | jq '.'
echo ""
echo ""

echo "✅ Tests completed!"
echo ""
echo "Expected results:"
echo "- Test 1: isUpdateRequired=true, isUpdateAvailable=true"
echo "- Test 2: isUpdateRequired=false, isUpdateAvailable=false (or true if newer version exists)"
echo "- Test 3: isUpdateRequired=false, isUpdateAvailable=false"
echo "- Test 4: isUpdateRequired=true, isUpdateAvailable=true"

