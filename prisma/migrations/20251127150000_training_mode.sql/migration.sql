-- CreateTable
CREATE TABLE "training_mode_configs" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
    "training_mode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "show_departure_airport" BOOLEAN NOT NULL DEFAULT true,
    "show_arrival_airport" BOOLEAN NOT NULL DEFAULT false,
    "show_aircraft_type" BOOLEAN NOT NULL DEFAULT false,
    "show_tail_number" BOOLEAN NOT NULL DEFAULT true,
    "init_radio_type" TEXT NOT NULL DEFAULT 'GND',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_mode_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_mode_configs_training_mode_key" ON "training_mode_configs"("training_mode");

-- Insert training mode configurations
INSERT INTO "training_mode_configs" (
    "training_mode",
    "label",
    "description",
    "image_url",
    "display_order",
    "show_departure_airport",
    "show_arrival_airport",
    "show_aircraft_type",
    "show_tail_number",
    "init_radio_type"
) VALUES
(
    'traffic-pattern',
    'Traffic Pattern',
    'Practice airport traffic pattern procedures.',
    'https://d3bj6rlfgttbxc.cloudfront.net/training_modes/Traffic%20Pattern.jpeg',
    1,
    true,
    false,
    true,
    true,
    'GND'
),
(
    'approach',
    'Approach',
    'Fly visual approach.',
    'https://d3bj6rlfgttbxc.cloudfront.net/training_modes/Approach.jpeg',
    2,
    true,
    false,
    true,
    true,
    'TWR'
),
(
    'emergency',
    'Emergency',
    'Communicate confidently in abnormal events.',
    'https://d3bj6rlfgttbxc.cloudfront.net/training_modes/Emergency.jpeg',
    3,
    true,
    false,
    true,
    true,
    'TWR'
),
(
    'vfr',
    'VFR Point-to-Point',
    'Master visual flight rules radio work.',
    'https://d3bj6rlfgttbxc.cloudfront.net/training_modes/VFR%20Point-to-Point.jpeg',
    0,
    true,
    true,
    true,
    true,
    'GND'
);
