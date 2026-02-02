#!/bin/bash

# Test script for App Store and Google Play API
# This tests if we can successfully fetch version information from stores

echo "🧪 Testing Store API Integration"
echo "=================================="
echo ""

# iOS App Store ID
IOS_APP_ID="6754862272"

# Android Package Name
ANDROID_PACKAGE="com.jujubecamp.aviateai"

# Test 1: iOS App Store API
echo "Test 1: Fetching iOS version from App Store"
echo "-------------------------------------------"
echo "App ID: $IOS_APP_ID"
echo ""

IOS_RESPONSE=$(curl -s "https://itunes.apple.com/lookup?id=$IOS_APP_ID")
IOS_VERSION=$(echo "$IOS_RESPONSE" | jq -r '.results[0].version // "Not found"')
IOS_BUNDLE=$(echo "$IOS_RESPONSE" | jq -r '.results[0].bundleId // "Not found"')
IOS_RELEASE=$(echo "$IOS_RESPONSE" | jq -r '.results[0].currentVersionReleaseDate // "Not found"')

if [ "$IOS_VERSION" != "Not found" ]; then
  echo "✅ Success!"
  echo "   Version: $IOS_VERSION"
  echo "   Bundle ID: $IOS_BUNDLE"
  echo "   Release Date: $IOS_RELEASE"
else
  echo "❌ Failed to fetch iOS version"
  echo "   Response: $IOS_RESPONSE"
fi

echo ""
echo ""

# Test 2: Android Google Play Store
echo "Test 2: Fetching Android version from Google Play"
echo "-------------------------------------------------"
echo "Package: $ANDROID_PACKAGE"
echo ""

ANDROID_URL="https://play.google.com/store/apps/details?id=$ANDROID_PACKAGE&hl=en"
ANDROID_RESPONSE=$(curl -s -A "Mozilla/5.0" "$ANDROID_URL")
ANDROID_VERSION=$(echo "$ANDROID_RESPONSE" | grep -o '\[\[\["[0-9.]*"\]\]\]' | head -1 | grep -o '[0-9.]*')

if [ -n "$ANDROID_VERSION" ]; then
  echo "✅ Success!"
  echo "   Version: $ANDROID_VERSION"
else
  echo "⚠️  Could not extract Android version"
  echo "   Note: Google Play doesn't have a public API"
  echo "   This is expected if the app is not published yet"
fi

echo ""
echo ""

# Test 3: Full version check endpoint
echo "Test 3: Testing version check endpoint with store API"
echo "-----------------------------------------------------"

SERVER_URL="${1:-http://localhost:3000}"
echo "Server: $SERVER_URL"
echo ""

echo "Testing with current version 0.1.4 (should trigger update):"
RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v1/version/check" \
  -H "Content-Type: application/json" \
  -d '{"currentVersion": "0.1.4", "platform": "ios"}')

echo "$RESPONSE" | jq '.'
echo ""

IS_UPDATE_REQUIRED=$(echo "$RESPONSE" | jq -r '.isUpdateRequired')
LATEST_FROM_STORE=$(echo "$RESPONSE" | jq -r '.latestVersion')

if [ "$IS_UPDATE_REQUIRED" = "true" ]; then
  echo "✅ Update detection working!"
  echo "   Latest version from store: $LATEST_FROM_STORE"
else
  echo "⚠️  Update not required (might be expected if versions match)"
fi

echo ""
echo ""

# Summary
echo "📊 Summary"
echo "=========="
echo ""
echo "iOS App Store API:"
if [ "$IOS_VERSION" != "Not found" ]; then
  echo "  ✅ Working - Version: $IOS_VERSION"
else
  echo "  ❌ Not working - Check App Store ID"
fi

echo ""
echo "Android Google Play:"
if [ -n "$ANDROID_VERSION" ]; then
  echo "  ✅ Working - Version: $ANDROID_VERSION"
else
  echo "  ⚠️  Not available - App may not be published yet"
fi

echo ""
echo "Version Check Endpoint:"
if [ -n "$LATEST_FROM_STORE" ] && [ "$LATEST_FROM_STORE" != "null" ]; then
  echo "  ✅ Working - Latest: $LATEST_FROM_STORE"
else
  echo "  ⚠️  Check if server is running at $SERVER_URL"
fi

echo ""
echo "✅ Tests completed!"

