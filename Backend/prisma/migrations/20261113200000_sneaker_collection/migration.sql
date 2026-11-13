-- SNEAKER COLLECTION: ficha de coleccionista (marca, modelo, colorway, estado
-- y usos) unida 1:1 a una prenda del armario o de la wishlist.

-- CreateEnum
CREATE TYPE "SneakerBrand" AS ENUM ('NIKE', 'JORDAN', 'ADIDAS', 'NEW_BALANCE', 'ASICS', 'PUMA', 'SALOMON', 'CONVERSE', 'VANS', 'OTHER');

-- CreateEnum
CREATE TYPE "SneakerCondition" AS ENUM ('DEADSTOCK', 'LIKE_NEW', 'GOOD', 'WORN', 'BEAT');

-- CreateTable
CREATE TABLE "SneakerDetails" (
    "itemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "brand" "SneakerBrand" NOT NULL,
    "brandName" VARCHAR(40),
    "model" VARCHAR(80) NOT NULL,
    "colorway" VARCHAR(80),
    "condition" "SneakerCondition" NOT NULL DEFAULT 'GOOD',
    "wearCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SneakerDetails_pkey" PRIMARY KEY ("itemId"),
    -- Los usos no pueden ser negativos.
    CONSTRAINT "SneakerDetails_wearCount_check" CHECK ("wearCount" >= 0)
);

-- CreateIndex
CREATE INDEX "SneakerDetails_userId_brand_idx" ON "SneakerDetails"("userId", "brand");

-- CreateIndex
CREATE UNIQUE INDEX "SneakerDetails_itemId_userId_key" ON "SneakerDetails"("itemId", "userId");

-- AddForeignKey
ALTER TABLE "SneakerDetails" ADD CONSTRAINT "SneakerDetails_itemId_userId_fkey" FOREIGN KEY ("itemId", "userId") REFERENCES "WardrobeItem"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
