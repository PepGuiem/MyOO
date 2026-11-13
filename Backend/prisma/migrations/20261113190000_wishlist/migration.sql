-- WISHLIST: prendas que quieres comprar (son WardrobeItem con wishlistStatus),
-- historial de precios y presupuesto.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PRICE_DROP';

-- CreateEnum
CREATE TYPE "WishlistStatus" AS ENUM ('WANT', 'SAVING', 'PENDING', 'PURCHASED');

-- CreateEnum
CREATE TYPE "WishlistCategory" AS ENUM ('SNEAKERS', 'HOODIES', 'TSHIRTS', 'PANTS', 'JACKETS', 'ACCESSORIES', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('MANUAL', 'TRACKER');

-- AlterTable
ALTER TABLE "WardrobeItem" ADD COLUMN "wishlistStatus" "WishlistStatus",
ADD COLUMN "wishlistCategory" "WishlistCategory",
ADD COLUMN "currentPrice" DECIMAL(10,2),
ADD COLUMN "targetPrice" DECIMAL(10,2),
ADD COLUMN "trackPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "photoAssetId" UUID,
ADD COLUMN "fromWishlistAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WishlistPrice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "source" "PriceSource" NOT NULL DEFAULT 'MANUAL',
    "note" VARCHAR(200),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistSettings" (
    "userId" UUID NOT NULL,
    "budget" DECIMAL(10,2),
    "saved" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "WishlistPrice_itemId_recordedAt_idx" ON "WishlistPrice"("itemId", "recordedAt");

-- CreateIndex
CREATE INDEX "WardrobeItem_userId_wishlistStatus_idx" ON "WardrobeItem"("userId", "wishlistStatus");

-- AddForeignKey
ALTER TABLE "WishlistPrice" ADD CONSTRAINT "WishlistPrice_itemId_userId_fkey" FOREIGN KEY ("itemId", "userId") REFERENCES "WardrobeItem"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistSettings" ADD CONSTRAINT "WishlistSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
