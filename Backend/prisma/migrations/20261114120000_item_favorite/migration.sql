-- Prendas favoritas del armario. Columna nueva con valor por defecto: no toca
-- ninguna prenda existente (todas empiezan como no favoritas).
ALTER TABLE "WardrobeItem" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
