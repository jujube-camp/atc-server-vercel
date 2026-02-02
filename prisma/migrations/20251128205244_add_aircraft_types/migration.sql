CREATE TABLE "aircraft_types" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aircraft_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_types_value_key" ON "aircraft_types"("value");

-- Seed default aircraft types
INSERT INTO "aircraft_types" ("id", "value", "label", "display_order") VALUES
  ('seed-aircraft-cessna', 'cessna', 'Cessna', 0),
  ('seed-aircraft-piper', 'piper', 'Piper', 1),
  ('seed-aircraft-cirrus', 'cirrus', 'Cirrus', 2),
  ('seed-aircraft-beechcraft', 'beechcraft', 'Beechcraft', 3),
  ('seed-aircraft-mooney', 'mooney', 'Mooney', 4),
  ('seed-aircraft-diamond', 'diamond', 'Diamond', 5),
  ('seed-aircraft-bonanza', 'bonanza', 'Bonanza', 6),
  ('seed-aircraft-baron', 'baron', 'Baron', 7),
  ('seed-aircraft-skyhawk', 'skyhawk', 'Skyhawk', 8),
  ('seed-aircraft-cherokee', 'cherokee', 'Cherokee', 9);

