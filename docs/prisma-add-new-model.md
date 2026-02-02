# How to Safely Add a New Prisma Model

This guide explains how to add a new model to Prisma and create a new table in the database without affecting existing tables.

## Steps

### 1. Add the new model to `schema.prisma`

Add your new model to the `prisma/schema.prisma` file. For example:

```prisma
model NewTable {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("new_table")
}
```

**Notes:**
- New models will not affect existing tables
- If the new model needs to relate to existing tables, use `@relation` to define relationships
- Use `@@map` to specify the database table name (recommended to use snake_case)

### 2. Create migration file

Run the following command to create a migration:

```bash
# Development environment
pnpm prisma:migrate

# Or use prisma command directly
pnpm prisma migrate dev --name add_new_table
```

**Command explanation:**
- `prisma migrate dev` will:
  1. Detect changes in schema.prisma
  2. Generate SQL migration file (only containing CREATE TABLE statements for new tables)
  3. Apply migration to development database
  4. Regenerate Prisma Client

**Important:** Prisma will only generate SQL statements for **new additions**, and will not modify existing tables.

### 3. Review the generated migration file

Migration files are saved in the `prisma/migrations/` directory, for example:

```
prisma/migrations/
└── 20250115123456_add_new_table/
    └── migration.sql
```

Open the `migration.sql` file to review. It should only contain `CREATE TABLE` statements, for example:

```sql
-- CreateTable
CREATE TABLE "new_table" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "new_table_pkey" PRIMARY KEY ("id")
);
```

**Verification checklist:**
- ✅ Only `CREATE TABLE` statements
- ✅ No `ALTER TABLE` or `DROP TABLE` statements
- ✅ No statements modifying existing tables

### 4. Apply to production environment

After confirming the migration is correct, apply it to production:

```bash
# Production environment
pnpm prisma:deploy:prod

# Or development environment
pnpm prisma:deploy:dev
```

## Complete Example

Let's say you want to add a `Notification` table:

### Step 1: Add model to schema.prisma

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("notifications")
}
```

If there are relationships, you also need to add the relation field to the related model:

```prisma
model User {
  // ... existing fields
  notifications Notification[]  // Add this line
}
```

### Step 2: Create migration

```bash
pnpm prisma:migrate
```

Prisma will prompt for a migration name, for example: `add_notifications_table`

### Step 3: Verify migration

Check the generated SQL file to confirm it only contains CREATE TABLE statements for the new table.

### Step 4: Apply migration

```bash
# Development environment (applied automatically)
pnpm prisma:migrate

# Production environment (requires manual deployment)
pnpm prisma:deploy:prod
```

## Safety Guarantees

### How Prisma Ensures Safety

1. **Incremental migrations**: Prisma only generates SQL for the changed parts
2. **Migration history**: All migrations have timestamps and names for tracking
3. **Rollback support**: You can manually create rollback migrations if needed

### Best Practices

1. **Test in development first**: Complete migrations in development before applying to production
2. **Review migration files**: Check the generated SQL after each migration
3. **Backup database**: Backup the database before production migrations
4. **Use meaningful migration names**: Use descriptive migration names, e.g., `add_notifications_table`

## FAQ

### Q: What if a migration fails?

A: Prisma maintains migration history. You can:
1. Fix schema.prisma
2. Create a new migration to fix the issue
3. Or manually modify the database and mark the migration as applied

### Q: How to modify existing tables?

A: After modifying an existing model, run `pnpm prisma:migrate`. Prisma will generate `ALTER TABLE` statements. However, modifying existing tables requires more caution. It's recommended to:
- Backup data first
- Review the generated SQL
- Test thoroughly in development environment

### Q: How to delete a table?

A: Remove the model from schema.prisma, then run the migration. **Warning: This will delete all data in the table!**

### Q: Will migrations affect existing data?

A: Adding new tables will not affect existing data. However, modifying existing tables (adding/removing columns, changing types, etc.) may affect data and requires careful handling.

## Related Commands

```bash
# Create new migration (development environment, applies automatically)
pnpm prisma:migrate

# Apply pending migrations (production environment)
pnpm prisma:deploy:prod

# Check migration status
pnpm prisma migrate status

# Reset database (⚠️ Will delete all data, development only)
pnpm prisma migrate reset

# Generate Prisma Client (executed automatically after migration, can also run manually)
pnpm prisma:generate
```

## Summary

Process for adding a new model:
1. ✅ Add model to `schema.prisma`
2. ✅ Run `pnpm prisma:migrate` to create migration
3. ✅ Review the generated SQL file
4. ✅ Apply to production: `pnpm prisma:deploy:prod`

**Key point:** Prisma's migration system is incremental. Adding new tables will not affect existing tables and data.
