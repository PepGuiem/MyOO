-- Perfil ampliado, inicio de sesión con Google y Apple, y cuentas conectadas (Instagram).

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "OAuthIntent" AS ENUM ('LOGIN', 'LINK', 'REAUTH');

-- AlterTable: las cuentas creadas con Google/Apple pueden no tener contraseña.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable: campos del perfil (todos opcionales: las cuentas existentes no cambian).
ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "username" VARCHAR(30),
  ADD COLUMN "bio" VARCHAR(300),
  ADD COLUMN "pronouns" VARCHAR(30),
  ADD COLUMN "location" VARCHAR(60),
  ADD COLUMN "website" VARCHAR(200),
  ADD COLUMN "instagramHandle" VARCHAR(30),
  ADD COLUMN "styleTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "favoriteColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sizeTop" VARCHAR(10),
  ADD COLUMN "sizeBottom" VARCHAR(10),
  ADD COLUMN "sizeShoes" VARCHAR(10),
  ADD COLUMN "accentColor" VARCHAR(7),
  ADD COLUMN "avatarAssetId" UUID,
  ADD COLUMN "coverAssetId" UUID;

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(254),
    "username" VARCHAR(60),
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthFlow" (
    "id" UUID NOT NULL,
    "stateHash" CHAR(64) NOT NULL,
    "browserHash" VARCHAR(64) NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "intent" "OAuthIntent" NOT NULL,
    "userId" UUID,
    "nonce" VARCHAR(64) NOT NULL,
    "codeVerifier" VARCHAR(128),
    "claimedAt" TIMESTAMP(3),
    "resultHash" CHAR(64),
    "outcome" JSONB,
    "proofHash" CHAR(64),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarAssetId_key" ON "User"("avatarAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "User_coverAssetId_key" ON "User"("coverAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAccount_userId_provider_key" ON "AuthAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthFlow_stateHash_key" ON "OAuthFlow"("stateHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthFlow_resultHash_key" ON "OAuthFlow"("resultHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthFlow_proofHash_key" ON "OAuthFlow"("proofHash");

-- CreateIndex
CREATE INDEX "OAuthFlow_expiresAt_idx" ON "OAuthFlow"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthFlow" ADD CONSTRAINT "OAuthFlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
