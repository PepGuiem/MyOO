import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { AppConfig } from '../config/env.validation';

/**
 * Almacenamiento de archivos (imágenes subidas por los usuarios).
 *
 * La base de datos solo guarda la CLAVE del archivo (p. ej. "assets/<uuid>"),
 * nunca el contenido. Esta clase abstracta permite cambiar de almacenamiento
 * sin tocar el resto: en desarrollo se usa el disco local (LocalDiskStorage);
 * en producción se implementaría con un servicio de objetos (S3, MinIO, R2...).
 */
export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer | null>;
  abstract delete(key: string): Promise<void>;
}

/** Claves válidas: generadas por el servidor, sin "..", sin rutas absolutas. */
const SAFE_KEY = /^[a-z0-9]+(\/[a-z0-9-]+)+$/;

@Injectable()
export class LocalDiskStorage extends StorageService {
  private readonly root: string;

  constructor(config: ConfigService<AppConfig, true>) {
    super();
    this.root = resolve(config.get('STORAGE_DIR', { infer: true }));
  }

  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
    const full = resolve(this.root, key);
    // Defensa extra: el archivo SIEMPRE dentro de la carpeta raíz.
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.pathFor(key);
    await mkdir(dirname(file), { recursive: true });
    // flag "wx": falla si ya existe (las claves son únicas, nunca se sobrescribe).
    await writeFile(file, data, { flag: 'wx' });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
