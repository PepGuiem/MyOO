-- OUTFIT RATING: nota automática de cada outfit (0-100) con historial.

-- CreateEnum
CREATE TYPE "RatingTier" AS ENUM ('BEGINNER', 'CASUAL', 'GOOD_STYLE', 'FASHION_KILLER', 'STREETWEAR_LEGEND');

-- CreateEnum
CREATE TYPE "RatingTrigger" AS ENUM ('CREATE', 'UPDATE', 'MANUAL', 'BACKFILL');

-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN "ratingScore" INTEGER,
ADD COLUMN "ratingTier" "RatingTier",
ADD COLUMN "ratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OutfitRating" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "outfitId" UUID NOT NULL,
    "total" INTEGER NOT NULL,
    "colors" INTEGER NOT NULL,
    "style" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "details" INTEGER NOT NULL,
    "tier" "RatingTier" NOT NULL,
    "engine" VARCHAR(40) NOT NULL,
    "trigger" "RatingTrigger" NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "report" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutfitRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutfitRating_outfitId_createdAt_idx" ON "OutfitRating"("outfitId", "createdAt");

-- CreateIndex
CREATE INDEX "OutfitRating_userId_createdAt_idx" ON "OutfitRating"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Outfit_userId_ratingScore_idx" ON "Outfit"("userId", "ratingScore");

-- AddForeignKey
ALTER TABLE "OutfitRating" ADD CONSTRAINT "OutfitRating_outfitId_userId_fkey" FOREIGN KEY ("outfitId", "userId") REFERENCES "Outfit"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las notas van de 0 a 100 y cada categoría de 0 a 25.
ALTER TABLE "OutfitRating" ADD CONSTRAINT "OutfitRating_total_range" CHECK ("total" BETWEEN 0 AND 100 AND "colors" BETWEEN 0 AND 25 AND "style" BETWEEN 0 AND 25 AND "balance" BETWEEN 0 AND 25 AND "details" BETWEEN 0 AND 25);
ALTER TABLE "Outfit" ADD CONSTRAINT "Outfit_ratingScore_range" CHECK ("ratingScore" IS NULL OR "ratingScore" BETWEEN 0 AND 100);
