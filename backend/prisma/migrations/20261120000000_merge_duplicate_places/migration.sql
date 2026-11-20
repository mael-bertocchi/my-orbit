-- UpdateData
UPDATE "budget_operations" AS o SET "place_id" = k."keep" FROM (SELECT "id", first_value("id") OVER (PARTITION BY "name_en", "name_fr" ORDER BY "created_at", "id") AS "keep" FROM "budget_places") AS k WHERE o."place_id" = k."id" AND k."id" <> k."keep";

-- UpdateData
UPDATE "budget_recurring_operations" AS o SET "place_id" = k."keep" FROM (SELECT "id", first_value("id") OVER (PARTITION BY "name_en", "name_fr" ORDER BY "created_at", "id") AS "keep" FROM "budget_places") AS k WHERE o."place_id" = k."id" AND k."id" <> k."keep";

-- DeleteData
DELETE FROM "budget_places" AS p USING (SELECT "id", first_value("id") OVER (PARTITION BY "name_en", "name_fr" ORDER BY "created_at", "id") AS "keep" FROM "budget_places") AS k WHERE p."id" = k."id" AND k."id" <> k."keep";

-- UpdateData
UPDATE "budget_operations" AS o SET "place_id" = (SELECT p."id" FROM "budget_places" AS p WHERE lower(trim(o."location")) IN (lower(p."name_en"), lower(p."name_fr")) ORDER BY p."created_at", p."id" LIMIT 1) WHERE o."place_id" IS NULL AND NOT o."is_online" AND o."location" IS NOT NULL;

-- UpdateData
UPDATE "budget_recurring_operations" AS o SET "place_id" = (SELECT p."id" FROM "budget_places" AS p WHERE lower(trim(o."location")) IN (lower(p."name_en"), lower(p."name_fr")) ORDER BY p."created_at", p."id" LIMIT 1) WHERE o."place_id" IS NULL AND NOT o."is_online" AND o."location" IS NOT NULL;

-- UpdateData
UPDATE "budget_state" SET "revision" = "revision" + 1;
