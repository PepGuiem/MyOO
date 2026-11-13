/**
 * Dar (o quitar) el rol de administrador a una cuenta. Solo desde el servidor;
 * no hay ningún endpoint para hacerlo desde la web.
 *
 *   npm run admin:grant -- tu@email.com            # dar
 *   npm run admin:grant -- tu@email.com --revoke   # quitar
 *   npm run admin:grant -- --list                  # ver quién es admin
 *
 * La cuenta tiene que existir (regístrate primero en la web). El cambio vale
 * al momento: el servidor lee el rol de la base de datos en cada petición.
 */
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

function dbLabel(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(DATABASE_URL no válida)';
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const list = args.includes('--list');
  const email = args
    .find((a) => !a.startsWith('--'))
    ?.trim()
    .toLowerCase();

  console.log(`Base de datos: ${dbLabel()}`);

  if (list) {
    const admins = await prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: { email: true, username: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    if (admins.length === 0)
      console.log('No hay ninguna cuenta de administrador.');
    for (const a of admins)
      console.log(`- ${a.email}${a.username ? ` (@${a.username})` : ''}`);
    return;
  }

  if (!email || !email.includes('@')) {
    console.error(
      'Uso: npm run admin:grant -- <email> [--revoke]   |   npm run admin:grant -- --list',
    );
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, bannedAt: true },
  });
  if (!user) {
    console.error(
      `No existe ninguna cuenta con el email ${email}. Regístrate primero en la web.`,
    );
    process.exitCode = 1;
    return;
  }

  const role = revoke ? UserRole.USER : UserRole.ADMIN;
  if (user.role === role) {
    console.log(
      revoke
        ? `${email} ya no era administrador.`
        : `${email} ya era administrador.`,
    );
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(
    revoke
      ? `✅ ${email} ya no es administrador.`
      : `✅ ${email} ahora es administrador. Recarga la web para ver «Admin».`,
  );
  if (!revoke && user.bannedAt)
    console.log(
      '⚠️  Esa cuenta está suspendida: levanta la suspensión para que pueda entrar.',
    );
}

main()
  .catch((error: unknown) => {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
