-- Maniquíes personalizados con medidas reales, limitados por plan.

-- AlterEnum
ALTER TYPE "LimitedResource" ADD VALUE 'MANNEQUINS';

-- CreateTable
CREATE TABLE "Mannequin" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "sex" VARCHAR(10) NOT NULL,
    "measures" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mannequin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mannequin_userId_name_key" ON "Mannequin"("userId", "name");

-- AddForeignKey
ALTER TABLE "Mannequin" ADD CONSTRAINT "Mannequin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
