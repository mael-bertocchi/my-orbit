ALTER TABLE "watchlist_entries" ADD COLUMN "episode_counts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "started_at" TIMESTAMP(3),
ADD COLUMN "season" INTEGER,
ADD COLUMN "episode" INTEGER,
ADD COLUMN "position" INTEGER;

CREATE INDEX "watchlist_entries_started_at_idx" ON "watchlist_entries"("started_at");
