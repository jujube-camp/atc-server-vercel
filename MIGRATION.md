# Vercel + Neon Migration Guide

## Phase 0: New Repository (Done)

This repo was created by copying `atc-server` and is ready for Vercel/Neon.

To push to your own remote:

```bash
git remote add origin <your-new-repo-url>
git branch -m main
git add . && git commit -m "Initial Vercel + Neon migration"
git push -u origin main
```

## Phase 1: Neon Database Setup (Manual)

1. Create a [Neon](https://neon.tech) account and project.
2. Create a PostgreSQL database (use PostgreSQL 16 to match RDS).
3. This repo uses the **standard Prisma client** with Neon's **pooled** connection string (no serverless driver). Use the pooled URL from the Neon dashboard as `DATABASE_URL`.

4. **Data migration from RDS to Neon** (when ready):

   Use the script (requires `pg_dump`/`pg_restore` in PATH, e.g. `brew install libpq` then `export PATH="/opt/homebrew/opt/libpq/bin:$PATH"`):

   ```bash
   export SOURCE_DATABASE_URL="postgresql://user:pass@<rds-host>:5432/smart-atc"
   export TARGET_DATABASE_URL="postgresql://user:pass@<neon-pooler-host>/neondb?sslmode=require"
   pnpm run migrate:rds-to-neon
   # Or: ./scripts/migrate-rds-to-neon.sh
   ```

   The script will:
   1. Run `prisma migrate deploy` on Neon so the schema is up to date.
   2. Dump data from RDS (data-only, custom format).
   3. Restore data into Neon (data-only, no-owner, no-acl).

   **If RDS connection times out:** RDS is often in a VPC and not reachable from your laptop. Run the migration from a host that can reach RDS (e.g. an EC2 instance in the same VPC, or after connecting via VPN/bastion). Copy the script and env vars to that host and run the same commands.

   **If data-only restore fails** (schema drift, missing tables/columns, duplicate keys): do a full schema+data restore to align Neon with RDS:

   ```bash
   pg_dump "<RDS_URL>" -F c --no-owner --no-acl -f /tmp/rds.dump
   pg_restore -d "<NEON_URL>?sslmode=require" --clean --if-exists --no-owner --no-acl /tmp/rds.dump
   ```

5. Run Prisma migrations on Neon (if not already done by the script):

   ```bash
   DATABASE_URL="<neon-pooled-url>" pnpm prisma migrate deploy
   ```

Set `DATABASE_URL` (Neon pooled URL) in Vercel environment variables (see Phase 5).

## Phase 2–4: Code Changes (Done in This Repo)

Prisma, Vercel handler, body limit, and env schema have been updated in this repo. Install deps and build:

```bash
pnpm install
pnpm build
```

## Phase 5: Deploy to Vercel

1. Install Vercel CLI: `pnpm add -D vercel` (already in devDependencies).
2. Link project: `vercel link`
3. Set environment variables in Vercel (Dashboard → Project → Settings → Environment Variables):
   - `DATABASE_URL` (Neon pooled URL)
   - `JWT_SECRET`, `OPENAI_API_KEY`, `FISH_AUDIO_API_KEY`, `APPLE_CLIENT_ID`, `APPLE_SHARED_SECRET`
   - `AWS_REGION`, `AWS_S3_AUDIO_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - `AUDIO_PROCESSOR_API_URL` (optional)
4. Deploy: `pnpm deploy` (preview) or `pnpm deploy:prod` (production).

Update the mobile app API base URL to your Vercel URL (e.g. `https://your-project.vercel.app/api/v1`).

## Sign in with Apple (Post-Migration Checklist)

Sign in with Apple uses the **same** backend endpoint as before; the only migration concern is that the **server** the app talks to is now Vercel, and **env** on Vercel must be correct.

### Server (Vercel)

1. **`APPLE_CLIENT_ID`** must be set in Vercel → Project → Settings → Environment Variables.
   - Value must be your **iOS app bundle ID**: `com.jujubecamp.aviateai`.
   - Used to verify the Apple identity token (`aud` claim). If missing or wrong, you get "Apple Sign-In is not configured" or token verification errors.

2. No Service ID or web redirect is required for **native iOS** (expo-apple-authentication). The identity token audience is the app bundle ID.

### Client (smart-atc)

1. **Production builds** must use the Vercel API base URL:
   - `app.config.js`: production uses `https://atc-server-vercel.vercel.app/api/v1`.
   - `eas.json`: production profile has `API_BASE_URL: "https://atc-server-vercel.vercel.app/api/v1"`.
   - The app then calls `POST ${BASE_URL}/auth/apple` → `https://atc-server-vercel.vercel.app/api/v1/auth/apple`.

2. **Development / Expo Go**: If you run with a dev profile, `apiBaseUrl` is usually `http://<local-ip>:3000/api/v1`. Sign in with Apple will hit your **local** server; ensure that server is running and has `APPLE_CLIENT_ID=com.jujubecamp.aviateai` in `.env`.

### Quick verification

- **Missing APPLE_CLIENT_ID on Vercel**: Server returns **500** and message "Apple Sign-In is not configured. Please set APPLE_CLIENT_ID environment variable."
- **Wrong APPLE_CLIENT_ID** (e.g. old Service ID): Token verification fails → **401** "Apple token verification failed: ...".
- **App pointing at wrong server**: Ensure you use a **production** (or preview) build with `API_BASE_URL` set to the Vercel URL when testing Sign in with Apple against Vercel.
