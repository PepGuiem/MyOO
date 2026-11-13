-- CreateEnum
CREATE TYPE "OutfitStyle" AS ENUM ('STREETWEAR', 'TECHWEAR', 'OLD_MONEY', 'CASUAL', 'SKATE', 'GRUNGE', 'Y2K', 'MINIMAL', 'TRAP', 'LUXURY_STREETWEAR');

-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "style" "OutfitStyle";

-- CreateIndex
CREATE INDEX "Outfit_userId_isFavorite_idx" ON "Outfit"("userId", "isFavorite");

-- CreateIndex
CREATE INDEX "Outfit_userId_style_idx" ON "Outfit"("userId", "style");
