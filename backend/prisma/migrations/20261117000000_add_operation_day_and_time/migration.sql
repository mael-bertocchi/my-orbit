-- AlterTable
ALTER TABLE "budget_operations" ADD COLUMN "day" TEXT, ADD COLUMN "time" TEXT;

-- AlterTable
ALTER TABLE "budget_state" ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'Europe/Paris';

-- UpdateData
UPDATE "budget_operations" SET "day" = to_char("date", 'YYYY-MM-DD'), "time" = '12:00' WHERE "recurring_id" IS NOT NULL;

-- UpdateData
UPDATE "budget_operations" SET "day" = to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'), "time" = to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'HH24:MI') WHERE "day" IS NULL AND (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul') >= TIMESTAMP '2026-08-23 00:00:00';

-- UpdateData
UPDATE "budget_operations" SET "day" = to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD'), "time" = to_char(("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris', 'HH24:MI') WHERE "day" IS NULL;

-- UpdateData
UPDATE "budget_state" SET "time_zone" = 'Asia/Seoul';

-- AlterTable
ALTER TABLE "budget_operations" ALTER COLUMN "day" SET NOT NULL, ALTER COLUMN "time" SET NOT NULL;

-- CreateIndex
CREATE INDEX "budget_operations_day_idx" ON "budget_operations"("day");
