-- AlterTable
ALTER TABLE "budget_operations" ADD COLUMN     "place_id" TEXT;

-- AlterTable
ALTER TABLE "budget_recurring_operations" ADD COLUMN     "place_id" TEXT;

-- CreateTable
CREATE TABLE "budget_places" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_operations_place_id_idx" ON "budget_operations"("place_id");

-- AddForeignKey
ALTER TABLE "budget_operations" ADD CONSTRAINT "budget_operations_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "budget_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_recurring_operations" ADD CONSTRAINT "budget_recurring_operations_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "budget_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

