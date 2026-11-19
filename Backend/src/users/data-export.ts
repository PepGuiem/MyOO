import type { PrismaClient } from '@prisma/client';

/**
 * «Descargar mis datos»: todo lo que la cuenta tiene en MyOO, en JSON.
 *
 * Solo datos de la propia cuenta (nunca los de otras personas más allá de su
 * id en relaciones como seguidores o conversaciones). Nunca salen secretos:
 * hash de la contraseña, tokens de Google/Apple/Instagram, flujos de login ni
 * claves internas del almacenamiento. Las imágenes van como metadatos (el
 * archivo se ve en la web).
 */
const SECRET_KEYS = new Set(['passwordHash', 'accessTokenEnc', 'storageKey', 'sessionVersion']);

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && !(value instanceof Date) && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !SECRET_KEYS.has(k))
        .map(([k, v]) => [k, clean(v)]),
    );
  }
  return value;
}

export async function exportUserData(prisma: PrismaClient, userId: string): Promise<Record<string, unknown>> {
  const where = { userId };
  const [account, outfitItems, outfitRatings, wishlistPrices, sneakerDetails, listingPhotos] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: { include: { plan: { select: { code: true, name: true } } } },
        wardrobes: true,
        wardrobeItems: true,
        outfits: true,
        calendarEntries: true,
        wishlistSettings: true,
        assets: true,
        mannequins: true,
        stylistFeedback: true,
        authAccounts: true,
        following: true,
        followers: true,
        blocking: true,
        conversationMembers: true,
        messages: true,
        ideas: true,
        ideaVotes: true,
        reportsMade: true,
        notifications: true,
        activeDays: true,
        battlesStarted: true,
        battlesAnswered: true,
        battleVotes: true,
        listings: true,
        listingFavorites: true,
      },
    }),
    prisma.outfitItem.findMany({ where }),
    prisma.outfitRating.findMany({ where }),
    prisma.wishlistPrice.findMany({ where }),
    prisma.sneakerDetails.findMany({ where }),
    prisma.listingPhoto.findMany({ where }),
  ]);
  return clean({
    exportedAt: new Date().toISOString(),
    app: 'MyOO',
    account,
    outfitItems,
    outfitRatings,
    wishlistPrices,
    sneakerDetails,
    listingPhotos,
  }) as Record<string, unknown>;
}
