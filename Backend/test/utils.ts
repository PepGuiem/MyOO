import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { seedReferenceData } from '../prisma/seed-data';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Protección: los tests BORRAN datos. Nos negamos a ejecutarlos si la
 * base de datos no parece ser la de test.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(
      `Refusing to run e2e tests: DATABASE_URL must point to a *_test database (got "${url.replace(/:[^:@/]+@/, ':****@')}")`,
    );
  }
}

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  assertTestDatabase();
  // Las imágenes de los tests van a su propia carpeta (está en .gitignore).
  process.env.STORAGE_DIR ??= 'storage-test';
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  setupApp(app);
  // listen(0) = puerto libre aleatorio. Necesario para peticiones simultáneas.
  await app.listen(0);

  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedReferenceData(prisma);

  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Borra los datos de usuario (en orden, por las claves foráneas). */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.dailyActive.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.ideaVote.deleteMany();
  await prisma.idea.deleteMany();
  await prisma.release.deleteMany();
  await prisma.adminAction.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.block.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.oAuthFlow.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.calendarEntry.deleteMany();
  await prisma.wishlistPrice.deleteMany();
  await prisma.sneakerDetails.deleteMany();
  await prisma.wishlistSettings.deleteMany();
  await prisma.outfitRating.deleteMany();
  await prisma.outfitItem.deleteMany();
  await prisma.outfit.deleteMany();
  await prisma.wardrobeItem.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.wardrobe.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;

/** Registra un usuario nuevo y devuelve su token. */
export async function registerUser(
  ctx: TestContext,
  prefix = 'user',
): Promise<{ token: string; userId: string; email: string }> {
  counter += 1;
  const email = `${prefix}-${Date.now()}-${counter}@test.local`;
  const res = await ctx
    .http()
    .post('/api/auth/register')
    .send({ email, password: 'Password123', displayName: prefix })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    userId: res.body.user.id as string,
    email,
  };
}

export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
