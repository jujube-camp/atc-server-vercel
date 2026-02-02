# API test results

Run: `./scripts/test-api.sh http://localhost:3000` (start Vercel dev first: `pnpm run dev:vercel`).

## Summary

| Area | Endpoints | Status |
|------|-----------|--------|
| **Public** | `/health`, `/api/health`, `/api/v1/airports/all`, `/api/v1/airports?icao_code=`, `/api/v1/training-modes`, `/api/v1/liveatc/feeds`, `/api/v1/liveatc/regions`, `/api/v1/membership/plans`, `/api/v1/version/check` | All working |
| **Auth** | `POST /api/v1/auth/register` | Returns 400 Validation error – check body (email, password min 8). If you see this after updating `vercel.json`, restart `pnpm run dev:vercel`. |
| **Auth** | `POST /api/v1/auth/login`, `GET /api/v1/auth/me` | Work when a valid token is used |
| **Authenticated** | `/api/v1/sessions`, `/api/v1/membership`, `/api/v1/membership/limits`, `/api/v1/aircraft-types`, `POST /api/v1/sessions`, `/api/v1/recordings` | Work with Bearer token |
| **Unauthorized** | `GET /api/v1/auth/me` without token | Correctly returns 401 |

## Vercel rewrite

`vercel.json` is set so `/api/*` is not rewritten twice:

1. `/api/(.*)` → `/api/$1` (passthrough)
2. `/(.*)` → `/api/$1` (e.g. `/health` → `/api/health`)

Restart `pnpm run dev:vercel` after changing `vercel.json`.

## Register validation

If `POST /api/v1/auth/register` keeps returning 400 "Validation error", try:

- Body: `{"email":"user@example.com","password":"password123"}` (password ≥ 8 chars).
- Restart Vercel dev so the rewrite and latest server code are used.
