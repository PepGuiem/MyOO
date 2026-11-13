-- Dónde se compró cada prenda y sus estilos; señales del estilista.

-- CreateEnum
CREATE TYPE "StylistSignal" AS ENUM ('LIKE', 'DISLIKE', 'SAVE', 'WEAR', 'ACCEPT_TIP', 'REJECT_TIP', 'SWAP');

-- AlterTable
ALTER TABLE "WardrobeItem"
  ADD COLUMN "styles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "productName" VARCHAR(120),
  ADD COLUMN "storeName" VARCHAR(80),
  ADD COLUMN "purchasePlatform" VARCHAR(20),
  ADD COLUMN "productUrl" VARCHAR(2048),
  ADD COLUMN "productRef" VARCHAR(80),
  ADD COLUMN "purchasePrice" DECIMAL(10,2),
  ADD COLUMN "currency" VARCHAR(3),
  ADD COLUMN "purchaseDate" DATE;

-- CreateTable
CREATE TABLE "StylistFeedback" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "signal" "StylistSignal" NOT NULL,
    "itemIds" UUID[],
    "tipCode" VARCHAR(40),
    "style" VARCHAR(30),
    "occasion" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StylistFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StylistFeedback_userId_createdAt_idx" ON "StylistFeedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StylistFeedback" ADD CONSTRAINT "StylistFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
