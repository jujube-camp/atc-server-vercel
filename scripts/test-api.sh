#!/usr/bin/env bash
# Test API endpoints. Usage: ./scripts/test-api.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000

BASE_URL="${1:-http://localhost:3000}"
TOKEN=""
PASSED=0
FAILED=0

run() {
  local name="$1"
  local method="$2"
  local path="$3"
  local data="$4"
  local auth="$5"
  local url="${BASE_URL}${path}"
  local curl_args=(-s -w "\n%{http_code}" -X "$method")
  [ -n "$data" ] && curl_args+=(-H "Content-Type: application/json" -d "$data")
  [ -n "$auth" ] && curl_args+=(-H "Authorization: Bearer $auth")
  local out
  out=$(curl "${curl_args[@]}" "$url")
  local body=$(echo "$out" | sed '$d')
  local code=$(echo "$out" | tail -1)
  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    echo "PASS [$code] $method $path"
    ((PASSED++)) || true
    return 0
  else
    echo "FAIL [$code] $method $path"
    echo "  body: ${body:0:150}..."
    ((FAILED++)) || true
    return 0
  fi
}

echo "=== Testing API at $BASE_URL ==="
echo ""

echo "--- Public ---"
run "Health" GET "/health" "" ""
run "API Health" GET "/api/health" "" ""
run "Airports all" GET "/api/v1/airports/all" "" ""
# Airport by icao: 200 or 404 (not in DB) = endpoint works
AIRPORT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/airports?icao_code=KJFK")
if [[ "$AIRPORT_CODE" == "200" || "$AIRPORT_CODE" == "404" ]]; then
  echo "PASS [$AIRPORT_CODE] GET /api/v1/airports?icao_code=KJFK"
  ((PASSED++)) || true
else
  echo "FAIL [$AIRPORT_CODE] GET /api/v1/airports?icao_code=KJFK"
  ((FAILED++)) || true
fi
run "Training modes" GET "/api/v1/training-modes" "" ""
# aircraft-types requires auth - tested below with token
run "LiveATC feeds" GET "/api/v1/liveatc/feeds" "" ""
run "LiveATC regions" GET "/api/v1/liveatc/regions" "" ""
run "Membership plans" GET "/api/v1/membership/plans" "" ""
run "Version check" POST "/api/v1/version/check" '{"currentVersion":"1.0.0","platform":"ios"}' ""

echo ""
echo "--- Auth (register then login for token) ---"
REG_EMAIL="api-test-$(date +%s)@example.com"
REG_JSON=$(printf '{"email":"%s","password":"password123"}' "$REG_EMAIL")
REG_RESP=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$REG_JSON" "$BASE_URL/api/v1/auth/register")
REG_BODY=$(echo "$REG_RESP" | sed '$d')
REG_CODE=$(echo "$REG_RESP" | tail -1)
if echo "$REG_BODY" | grep -q '"token"'; then
  TOKEN=$(echo "$REG_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  echo "PASS [201] POST /api/v1/auth/register (token received)"
  ((PASSED++)) || true
elif [ "$REG_CODE" = "400" ] && echo "$REG_BODY" | grep -q "already exists"; then
  LOG_RESP=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"email\":\"$REG_EMAIL\",\"password\":\"password123\"}" "$BASE_URL/api/v1/auth/login")
  if echo "$LOG_RESP" | grep -q '"token"'; then
    TOKEN=$(echo "$LOG_RESP" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "PASS [200] POST /api/v1/auth/login (token received)"
    ((PASSED++)) || true
  else
    echo "FAIL register + login: $REG_BODY / $LOG_RESP"
    ((FAILED++)) || true
  fi
else
  echo "FAIL register [$REG_CODE]: $REG_BODY"
  ((FAILED++)) || true
fi

if [ -n "$TOKEN" ]; then
  echo ""
  echo "--- Authenticated ---"
  run "Auth me" GET "/api/v1/auth/me" "" "$TOKEN"
  run "Sessions list" GET "/api/v1/sessions" "" "$TOKEN"
  run "Membership" GET "/api/v1/membership" "" "$TOKEN"
  run "Membership limits" GET "/api/v1/membership/limits" "" "$TOKEN"
  run "Aircraft types" GET "/api/v1/aircraft-types" "" "$TOKEN"
  run "Create session" POST "/api/v1/sessions" '{"airportIcao":"KJFK","aircraftTailNumber":"N12345"}' "$TOKEN"
  run "Recordings list" GET "/api/v1/recordings" "" "$TOKEN"
fi

echo ""
echo "--- Unauthorized (expect 401) ---"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/auth/me")
if [ "$UNAUTH" = "401" ]; then
  echo "PASS [401] GET /api/v1/auth/me (no token)"
  ((PASSED++)) || true
else
  echo "FAIL [$UNAUTH] GET /api/v1/auth/me (expected 401)"
  ((FAILED++)) || true
fi

echo ""
echo "=== Result: $PASSED passed, $FAILED failed ==="
[ "$FAILED" -eq 0 ]
