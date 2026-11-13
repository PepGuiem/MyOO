-- Cómo se lleva cada prenda dentro de un outfit (por dentro, remangada...).
-- Columna nueva con valor por defecto: las filas existentes quedan con '{}'.
ALTER TABLE "OutfitItem" ADD COLUMN "styling" JSONB NOT NULL DEFAULT '{}';
