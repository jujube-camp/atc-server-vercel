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

   ```bash
   # Export from RDS
   pg_dump -h <rds-host> -U <user> -d <database> -F c -f backup.dump

   # Import to Neon (use connection details from Neon dashboard)
   pg_restore -h <neon-host> -U <user> -d <database> --no-owner --no-acl backup.dump
   ```

5. Run Prisma migrations on Neon:

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

Update the mobile app API base URL to your Vercel URL (e.g. `https://your-project.vercel.app`).
