-- CreateTable
CREATE TABLE "budget_recurring_operations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL,
    "location" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'EUR',
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "first_date" TEXT NOT NULL,
    "interval_months" INTEGER NOT NULL DEFAULT 1,
    "end_date" TEXT,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "generated_through" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_recurring_operations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "budget_operations" ADD COLUMN "recurring_id" TEXT;

-- CreateIndex
CREATE INDEX "budget_operations_recurring_id_idx" ON "budget_operations"("recurring_id");
