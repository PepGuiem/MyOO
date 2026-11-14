-- Idioma de cada cuenta (español por defecto; las cuentas existentes siguen en español).

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ES', 'EN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "locale" "Locale" NOT NULL DEFAULT 'ES';
