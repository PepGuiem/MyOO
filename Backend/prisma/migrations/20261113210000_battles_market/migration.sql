-- STREETWEAR BATTLES (retos 1 vs 1 votados por la comunidad) y STREET MARKET
-- (anuncios para vender o intercambiar; el contacto va por el chat, sin pagos).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BATTLE_CHALLENGE';
ALTER TYPE "NotificationType" ADD VALUE 'BATTLE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'BATTLE_RESULT';

-- AlterEnum
ALTER TYPE "ReportTarget" ADD VALUE 'LISTING';

-- CreateEnum
CREATE TYPE "BattleStatus" AS ENUM ('PENDING', 'ACTIVE', 'FINISHED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BattleSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('SELL', 'SWAP');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('NEW_WITH_TAGS', 'LIKE_NEW', 'GOOD', 'FAIR');

-- CreateTable
CREATE TABLE "Battle" (
    "id" UUID NOT NULL,
    "challengerId" UUID NOT NULL,
    "opponentId" UUID,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "theme" VARCHAR(60),
    "challengerOutfit" JSONB NOT NULL,
    "challengerOutfitId" UUID,
    "opponentOutfit" JSONB,
    "opponentOutfitId" UUID,
    "status" "BattleStatus" NOT NULL DEFAULT 'PENDING',
    "votesA" INTEGER NOT NULL DEFAULT 0,
    "votesB" INTEGER NOT NULL DEFAULT 0,
    "winner" "BattleSide",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Battle_pkey" PRIMARY KEY ("id"),
    -- Nadie se reta a sí mismo, y los votos nunca son negativos.
    CONSTRAINT "Battle_not_self_check" CHECK ("opponentId" IS NULL OR "opponentId" <> "challengerId"),
    CONSTRAINT "Battle_votes_check" CHECK ("votesA" >= 0 AND "votesB" >= 0)
);

-- CreateTable
CREATE TABLE "BattleVote" (
    "battleId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "side" "BattleSide" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleVote_pkey" PRIMARY KEY ("battleId", "userId")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "ListingKind" NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(1000),
    "category" "WishlistCategory" NOT NULL,
    "brand" VARCHAR(40),
    "size" VARCHAR(20),
    "condition" "ListingCondition" NOT NULL,
    "price" DECIMAL(10,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "city" VARCHAR(60),
    "swapFor" VARCHAR(200),
    "itemId" UUID,
    "garment" JSONB,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "hiddenByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id"),
    -- Vender exige precio; ningún precio es negativo.
    CONSTRAINT "Listing_price_check" CHECK ("price" IS NULL OR "price" >= 0),
    CONSTRAINT "Listing_sell_price_check" CHECK ("kind" <> 'SELL' OR "price" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "ListingPhoto" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingFavorite" (
    "listingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingFavorite_pkey" PRIMARY KEY ("listingId", "userId")
);

-- CreateIndex
CREATE INDEX "Battle_status_endsAt_idx" ON "Battle"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Battle_status_expiresAt_idx" ON "Battle"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Battle_status_createdAt_idx" ON "Battle"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Battle_challengerId_createdAt_idx" ON "Battle"("challengerId", "createdAt");

-- CreateIndex
CREATE INDEX "Battle_opponentId_createdAt_idx" ON "Battle"("opponentId", "createdAt");

-- CreateIndex
CREATE INDEX "BattleVote_userId_createdAt_idx" ON "BattleVote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_category_status_createdAt_idx" ON "Listing"("category", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_userId_createdAt_idx" ON "Listing"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_id_userId_key" ON "Listing"("id", "userId");

-- CreateIndex
CREATE INDEX "ListingPhoto_assetId_idx" ON "ListingPhoto"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingPhoto_listingId_assetId_key" ON "ListingPhoto"("listingId", "assetId");

-- CreateIndex
CREATE INDEX "ListingFavorite_userId_createdAt_idx" ON "ListingFavorite"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Battle" ADD CONSTRAINT "Battle_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleVote" ADD CONSTRAINT "BattleVote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "Battle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleVote" ADD CONSTRAINT "BattleVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_listingId_userId_fkey" FOREIGN KEY ("listingId", "userId") REFERENCES "Listing"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPhoto" ADD CONSTRAINT "ListingPhoto_assetId_userId_fkey" FOREIGN KEY ("assetId", "userId") REFERENCES "Asset"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFavorite" ADD CONSTRAINT "ListingFavorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingFavorite" ADD CONSTRAINT "ListingFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
