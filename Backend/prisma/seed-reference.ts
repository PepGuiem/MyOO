/**
 * Datos de referencia (planes y tipos de prenda), SIN el usuario de demo.
 * Lo ejecuta el build de Vercel tras las migraciones (`npm run vercel:migrate`).
 * Es idempotente (upserts): se puede repetir en cada despliegue.
 */
import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './seed-data';

const prisma = new PrismaClient();

seedReferenceData(prisma)
  .then(() => console.log('✅ Planes y tipos de prenda al día.'))
  .catch((error: unknown) => {
    console.error('❌ Error sembrando los datos de referencia:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
