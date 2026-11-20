-- DropIndex
DROP INDEX "budget_operations_date_idx";

-- AlterTable
ALTER TABLE "budget_operations" DROP COLUMN "date";
