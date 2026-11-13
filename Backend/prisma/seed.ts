/**
 * Seed de desarrollo. Se ejecuta con:
 *   npx prisma db seed
 * (o automáticamente tras `prisma migrate reset`).
 *
 * Es idempotente: puedes ejecutarlo tantas veces como quieras.
 */
import { PrismaClient } from '@prisma/client';
import { DEMO_USER, seedDemoData, seedReferenceData } from './seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Sembrando planes y tipos de prenda...');
  await seedReferenceData(prisma);

  console.log('🌱 Sembrando usuario de demostración...');
  await seedDemoData(prisma);

  console.log('✅ Seed completado.');
  console.log(
    `   Usuario demo: ${DEMO_USER.email} / ${DEMO_USER.password} (solo local)`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('❌ Error en el seed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
