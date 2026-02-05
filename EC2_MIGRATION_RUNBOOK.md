# EC2 Migration Runbook (RDS → Neon)

This is a concise, repeatable record of the steps used to migrate data from the AWS RDS PostgreSQL instance to Neon using an EC2 host that can reach RDS.

## 1) SSH to EC2

```bash
ssh -i "~/.ssh/arcadea-server-key.pem" ubuntu@44.250.132.179
```

## 2) Install PostgreSQL 17 client on EC2

RDS was running PostgreSQL 17.x, so `pg_dump` needs to be 17.x as well.

```bash
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates gnupg

# Add PostgreSQL APT repo (Ubuntu noble)
echo "deb http://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor --batch --yes -o /etc/apt/trusted.gpg.d/postgresql.gpg

sudo apt-get update -y
sudo apt-get install -y postgresql-client-17

/usr/lib/postgresql/17/bin/pg_dump --version
```

## 3) Full schema + data restore (recommended when schemas drift)

Use a **full dump + restore** (schema + data) if data-only restore fails due to:
- missing tables/columns in Neon, or
- duplicate seed rows (e.g. `aircraft_types`, `training_mode_configs`, `tier_limit_configs`)

```bash
# RDS → dump
/usr/lib/postgresql/17/bin/pg_dump "<RDS_DATABASE_URL_WITHOUT_SCHEMA_QUERY>" \
  -F c \
  --no-owner \
  --no-acl \
  -f /tmp/rds.dump

# Neon ← restore
/usr/lib/postgresql/17/bin/pg_restore \
  -d "<NEON_DATABASE_URL>?sslmode=require" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  /tmp/rds.dump

rm -f /tmp/rds.dump
```

## 4) Quick verification (example)

```bash
# RDS
/usr/lib/postgresql/17/bin/psql "<RDS_DATABASE_URL_WITHOUT_SCHEMA_QUERY>" -t -c "select count(*) from users;"
/usr/lib/postgresql/17/bin/psql "<RDS_DATABASE_URL_WITHOUT_SCHEMA_QUERY>" -t -c "select count(*) from sessions;"

# Neon (explicit schema)
/usr/lib/postgresql/17/bin/psql "<NEON_DATABASE_URL>?sslmode=require" -t -c "select count(*) from public.users;"
/usr/lib/postgresql/17/bin/psql "<NEON_DATABASE_URL>?sslmode=require" -t -c "select count(*) from public.sessions;"
```

## Notes

- For RDS URLs from Prisma `.env`, strip `?schema=public` when using `pg_dump`.
- Neon requires `sslmode=require`.
- If you prefer using the local migration script, run it on the EC2 host once `pg_dump`/`pg_restore` are installed:

```bash
export SOURCE_DATABASE_URL="<RDS_DATABASE_URL_WITHOUT_SCHEMA_QUERY>"
export TARGET_DATABASE_URL="<NEON_DATABASE_URL>?sslmode=require"
pnpm run migrate:rds-to-neon
```
