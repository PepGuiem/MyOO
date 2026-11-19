-- Versión de la sesión: cerrar sesión invalida los tokens ya emitidos.
-- Los tokens sin versión (emitidos antes de esta migración) cuentan como 0.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
