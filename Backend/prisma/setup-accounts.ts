/**
 * Ajustes de cuentas que se aplican en el build de Vercel (después de las
 * migraciones), controlados por variables de entorno del proyecto:
 *
 *   ADMIN_USERNAMES=admin,otra     → esas cuentas pasan a ser administradoras.
 *   EXAMPLE_DATA_FOR=admin         → copia a esa cuenta los armarios, prendas y
 *                                    outfits de ejemplo (los mismos del seed).
 *
 * La cuenta se busca por nombre de usuario (sin distinguir mayúsculas); si no
 * hay ninguno, por nombre visible o por la parte del email antes de la @, pero
 * solo si coincide con UNA cuenta (nunca se adivina entre varias).
 *
 * Es idempotente: los ids de los ejemplos se derivan de la cuenta, así que si
 * ya están no se vuelven a crear ni se tocan (son del usuario). Nunca hace
 * fallar el despliegue: si no encuentra la cuenta, lo dice en el log y sigue.
 */
import { createHash } from 'node:crypto';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { DEMO_ITEMS, DEMO_OUTFITS } from './seed-data';

const prisma = new PrismaClient();

function names(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Id estable (formato UUID) para el ejemplo `demoId` de la cuenta `userId`. */
function exampleId(userId: string, demoId: string): string {
  const h = createHash('sha256').update(`myout-example:${userId}:${demoId}`).digest('hex');
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function findAccount(name: string): Promise<{ id: string; label: string } | null> {
  const select = { id: true, username: true, displayName: true } as const;
  const label = (u: { username: string | null; displayName: string | null }) =>
    u.username ? `@${u.username}` : `«${u.displayName ?? '(sin nombre)'}»`;

  const byUsername = await prisma.user.findFirst({
    where: { username: { equals: name, mode: 'insensitive' } },
    select,
  });
  if (byUsername) return { id: byUsername.id, label: label(byUsername) };

  const byName = await prisma.user.findMany({
    where: { displayName: { equals: name, mode: 'insensitive' } },
    select,
    take: 2,
  });
  if (byName.length === 1) return { id: byName[0].id, label: label(byName[0]) };
  if (byName.length > 1) {
    console.warn(`⚠️  Hay varias cuentas llamadas «${name}»: pon su nombre de usuario exacto.`);
    return null;
  }

  const byEmail = await prisma.user.findMany({
    where: { email: { startsWith: `${name.toLowerCase()}@` } },
    select,
    take: 2,
  });
  if (byEmail.length === 1) return { id: byEmail[0].id, label: label(byEmail[0]) };
  return null;
}

async function grantAdmin(name: string): Promise<void> {
  const account = await findAccount(name);
  if (!account) {
    console.warn(`⚠️  Admin: no encuentro ninguna cuenta «${name}». Regístrala y vuelve a desplegar.`);
    return;
  }
  await prisma.user.update({ where: { id: account.id }, data: { role: UserRole.ADMIN } });
  console.log(`✅ Admin: ${account.label} es administrador.`);
}

const EXAMPLE_WARDROBES: Record<string, { name: string; description: string }> = {
  '00000000-0000-4000-8000-000000000201': {
    name: 'Armario de ejemplo',
    description: 'Prendas de ejemplo para probar la app',
  },
  '00000000-0000-4000-8000-000000000202': {
    name: 'Maleta de ejemplo',
    description: 'Prendas de ejemplo para escapadas',
  },
};

async function addExamples(name: string): Promise<void> {
  const account = await findAccount(name);
  if (!account) {
    console.warn(`⚠️  Ejemplos: no encuentro ninguna cuenta «${name}».`);
    return;
  }
  const userId = account.id;
  const idOf = (demoId: string) => exampleId(userId, demoId);

  const firstWardrobe = idOf(Object.keys(EXAMPLE_WARDROBES)[0]);
  if (await prisma.wardrobe.findUnique({ where: { id: firstWardrobe }, select: { id: true } })) {
    console.log(`ℹ️  Ejemplos: ${account.label} ya los tiene; no se tocan.`);
    return;
  }

  const types = await prisma.garmentType.findMany({ select: { id: true, code: true } });
  const typeIdByCode = new Map(types.map((t) => [t.code, t.id]));

  // Todo o nada: si algo falla no quedan ejemplos a medias.
  await prisma.$transaction(
    async (tx) => {
      for (const [demoId, w] of Object.entries(EXAMPLE_WARDROBES)) {
        const taken = await tx.wardrobe.findFirst({ where: { userId, name: w.name }, select: { id: true } });
        await tx.wardrobe.create({
          data: { id: idOf(demoId), userId, name: taken ? `${w.name} (2)` : w.name, description: w.description },
        });
      }
      for (const item of DEMO_ITEMS) {
        const garmentTypeId = typeIdByCode.get(item.type);
        if (!garmentTypeId) throw new Error(`Tipo de prenda desconocido: ${item.type}`);
        await tx.wardrobeItem.create({
          data: {
            id: idOf(item.id),
            userId,
            wardrobeId: idOf(item.wardrobeId),
            garmentTypeId,
            name: item.name,
            color: item.color,
            size: item.size ?? null,
            season: item.season,
            attributes: (item.attributes ?? {}) as Prisma.InputJsonValue,
            customization: (item.customization ?? {}) as Prisma.InputJsonValue,
          },
        });
      }
      for (const o of DEMO_OUTFITS) {
        await tx.outfit.create({
          data: {
            id: idOf(o.id),
            userId,
            name: o.name,
            description: o.description ?? null,
            occasion: o.occasion ?? null,
            season: o.season ?? null,
            style: o.style ?? null,
            isFavorite: o.favorite ?? false,
          },
        });
        await tx.outfitItem.createMany({
          data: o.items.map((demoItemId, position) => ({
            userId,
            outfitId: idOf(o.id),
            wardrobeItemId: idOf(demoItemId),
            position,
            styling: (o.styling?.[demoItemId] ?? {}) as Prisma.InputJsonValue,
          })),
        });
      }
    },
    { timeout: 60_000 },
  );
  console.log(
    `✅ Ejemplos: ${account.label} tiene ${Object.keys(EXAMPLE_WARDROBES).length} armarios, ${DEMO_ITEMS.length} prendas y ${DEMO_OUTFITS.length} outfits de ejemplo.`,
  );
}

async function main(): Promise<void> {
  const admins = names(process.env.ADMIN_USERNAMES);
  const examples = names(process.env.EXAMPLE_DATA_FOR);
  if (admins.length === 0 && examples.length === 0) return;
  for (const name of admins) await grantAdmin(name);
  for (const name of examples) await addExamples(name);
}

main()
  .catch((error: unknown) => {
    // No rompe el despliegue: la app funciona igual sin estos ajustes.
    console.error('⚠️  Ajustes de cuentas no aplicados:', error);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
