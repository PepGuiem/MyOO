import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { readImageInfo } from './image-info';

/** Límites de las imágenes subidas. */
export const ASSET_LIMITS = {
  /** 2 MB: de sobra para un logo o estampado. */
  maxBytes: 2 * 1024 * 1024,
  /** Lado máximo en píxeles (texturas más grandes no aportan en el 3D). */
  maxSide: 4096,
  /** Imágenes por usuario (límite técnico, independiente del plan). */
  maxPerUser: 100,
} as const;

/** Lo que necesitamos del archivo que entrega multer. */
export interface UploadedImageFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

export const assetSelect = {
  id: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  name: true,
  createdAt: true,
} satisfies Prisma.AssetSelect;

/** Nombre original solo informativo: sin rutas, sin caracteres raros, 120 máx. */
function cleanName(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const safe = base.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim();
  return (safe || 'imagen').slice(0, 120);
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(userId: string, file: UploadedImageFile | undefined) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException(
        'file is required (multipart field "file")',
      );
    }
    if (file.size > ASSET_LIMITS.maxBytes) {
      throw new BadRequestException('file is too large (max 2 MB)');
    }
    return this.storeImage(userId, file.buffer, file.originalname ?? '');
  }

  /**
   * Descarga una imagen de un proveedor (foto de Google o de Instagram) y la
   * guarda como imagen del usuario. Solo de los dominios permitidos y solo
   * por HTTPS: así nadie puede usar el servidor para pedir URLs internas
   * (lo que se llama SSRF).
   */
  async importRemoteImage(
    userId: string,
    url: string,
    allowedHostSuffixes: string[],
    name: string,
  ) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid image URL');
    }
    const host = parsed.hostname.toLowerCase();
    const allowed = allowedHostSuffixes.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    if (parsed.protocol !== 'https:' || !allowed)
      throw new BadRequestException('Image host not allowed');

    let res: Response;
    try {
      res = await fetch(parsed, {
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new UnprocessableEntityException('Could not download the image');
    }
    if (!res.ok || !res.body)
      throw new UnprocessableEntityException('Could not download the image');
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > ASSET_LIMITS.maxBytes)
      throw new UnprocessableEntityException('image is too large (max 2 MB)');

    // Se lee por trozos y se corta en cuanto pasa del límite.
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > ASSET_LIMITS.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new UnprocessableEntityException('image is too large (max 2 MB)');
      }
      chunks.push(value);
    }
    return this.storeImage(userId, Buffer.concat(chunks), name);
  }

  /** Comprueba que es una imagen válida y la guarda (archivo + fila). */
  private async storeImage(
    userId: string,
    buffer: Buffer,
    originalName: string,
  ) {
    const file = { buffer, size: buffer.length, originalname: originalName };
    const info = readImageInfo(file.buffer);
    if (!info) {
      throw new UnprocessableEntityException(
        'file must be a PNG, JPEG or WebP image',
      );
    }
    if (
      info.width > ASSET_LIMITS.maxSide ||
      info.height > ASSET_LIMITS.maxSide
    ) {
      throw new UnprocessableEntityException(
        `image must be at most ${ASSET_LIMITS.maxSide}x${ASSET_LIMITS.maxSide} pixels`,
      );
    }

    const id = randomUUID();
    const storageKey = `assets/${id}`;
    // Primero el archivo y luego la fila: si la fila falla, borramos el archivo.
    await this.storage.put(storageKey, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Bloqueo de la fila del usuario: dos subidas a la vez no superan el límite.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
        `;
        if (locked.length === 0) throw new NotFoundException('User not found');
        const count = await tx.asset.count({ where: { userId } });
        if (count >= ASSET_LIMITS.maxPerUser) {
          throw new ConflictException(
            `You can store at most ${ASSET_LIMITS.maxPerUser} images. Delete some first.`,
          );
        }
        return tx.asset.create({
          data: {
            id,
            userId,
            storageKey,
            mimeType: info.mime,
            sizeBytes: file.size,
            width: info.width,
            height: info.height,
            name: cleanName(file.originalname ?? ''),
          },
          select: assetSelect,
        });
      });
    } catch (err) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw err;
    }
  }

  /** Imágenes para logos y estampados (no incluye la foto de perfil ni la portada). */
  list(userId: string) {
    return this.prisma.asset.findMany({
      where: { userId, avatarOf: { is: null }, coverOf: { is: null } },
      select: assetSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: ASSET_LIMITS.maxPerUser,
    });
  }

  async content(
    userId: string,
    id: string,
  ): Promise<{ data: Buffer; mimeType: string }> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, userId },
      select: { storageKey: true, mimeType: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    const data = await this.storage.get(asset.storageKey);
    if (!data) throw new NotFoundException('Asset not found');
    return { data, mimeType: asset.mimeType };
  }

  /** Borra una imagen si ninguna prenda la usa (si no, 409). */
  async remove(userId: string, id: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, userId },
      select: { storageKey: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    // ¿La usa algún detalle de alguna prenda del usuario, o es la foto de una?
    const used = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "WardrobeItem"
      WHERE "userId" = ${userId}::uuid
        AND (
          "photoAssetId" = ${id}::uuid
          OR jsonb_path_exists("customization", '$.details[*] ? (@.assetId == $id)', jsonb_build_object('id', ${id}::text))
        )
      LIMIT 1
    `;
    if (used.length > 0) {
      throw new ConflictException(
        'This image is used by a garment. Remove it from the garment first.',
      );
    }

    await this.prisma.asset.deleteMany({ where: { id, userId } });
    await this.storage.delete(asset.storageKey).catch(() => undefined);
  }

  /**
   * Borra una imagen que ya no se usa (p. ej. la foto de perfil anterior).
   * Si una prenda la usa o ya no existe, no hace nada.
   */
  async removeIfUnused(userId: string, id: string): Promise<void> {
    try {
      await this.remove(userId, id);
    } catch (err) {
      if (err instanceof ConflictException || err instanceof NotFoundException)
        return;
      throw err;
    }
  }

  /** Comprueba que todas las imágenes existen y son del usuario (400 si no). */
  async assertOwned(
    userId: string,
    ids: string[],
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (ids.length === 0) return;
    const found = await db.asset.count({ where: { userId, id: { in: ids } } });
    if (found !== ids.length) {
      throw new BadRequestException(
        'customization uses an image (assetId) that does not exist',
      );
    }
  }
}
