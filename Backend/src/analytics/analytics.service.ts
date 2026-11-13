import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { dayKey } from '../calendar/calendar.rules';
import { garmentTypeSummarySelect } from '../garment-types/garment-types.service';
import { toRatingItem } from '../outfits/rating/rating.service';
import { OutfitStyleKey } from '../outfits/rating/rating.types';
import { PrismaService } from '../prisma/prisma.service';
import { analyze, isValidTimeZone } from './analytics.rules';

const itemSelect = {
  id: true,
  name: true,
  color: true,
  season: true,
  attributes: true,
  customization: true,
  styles: true,
  createdAt: true,
  garmentType: { select: garmentTypeSummarySelect },
} satisfies Prisma.WardrobeItemSelect;

/** Tope de seguridad de filas que se leen por persona. */
const MAX_ROWS = 5000;

/**
 * STYLE ANALYTICS: se calcula al pedirlo, con los datos de ahora mismo (por
 * eso se actualiza solo al crear, editar o borrar prendas y outfits). Todas
 * las consultas van filtradas por el usuario autenticado.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string, tz = 'Europe/Madrid') {
    if (!isValidTimeZone(tz))
      throw new BadRequestException('tz must be an IANA time zone');
    const [items, outfits, worn] = await Promise.all([
      this.prisma.wardrobeItem.findMany({
        // Solo el armario: la wishlist son prendas que aún no tienes.
        where: { userId, wishlistStatus: null },
        select: itemSelect,
        take: MAX_ROWS,
      }),
      this.prisma.outfit.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          style: true,
          createdAt: true,
          ratingScore: true,
          isFavorite: true,
          items: { select: { wardrobeItemId: true } },
        },
        take: MAX_ROWS,
      }),
      this.prisma.calendarEntry.findMany({
        where: { userId, wornAt: { not: null } },
        select: { outfitId: true, date: true },
        take: MAX_ROWS,
      }),
    ]);
    return analyze({
      items: items.map((i) => {
        const brand = (i.attributes as Record<string, unknown> | null)?.brand;
        return {
          ...toRatingItem(i, {}),
          createdAt: i.createdAt,
          brand: typeof brand === 'string' ? brand : null,
        };
      }),
      outfits: outfits.map((o) => ({
        id: o.id,
        name: o.name,
        style: o.style as OutfitStyleKey | null,
        createdAt: o.createdAt,
        ratingScore: o.ratingScore,
        isFavorite: o.isFavorite,
        itemIds: o.items.map((x) => x.wardrobeItemId),
      })),
      worn: worn.map((w) => ({ outfitId: w.outfitId, date: dayKey(w.date) })),
      now: new Date(),
      tz,
    });
  }
}
