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
 * en Vercel, un almacén PRIVADO de Vercel Blob (VercelBlobStorage). Las
 * imágenes nunca se enlazan directamente: la API las lee y las sirve tras
 * comprobar quién puede verlas, igual que con el disco.
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

/** Lo que usamos del SDK oficial `@vercel/blob` (se carga solo en Vercel). */
interface BlobSdk {
  put(
    pathname: string,
    body: Buffer,
    options: { access: 'private'; addRandomSuffix: boolean; allowOverwrite: boolean; contentType: string },
  ): Promise<unknown>;
  get(
    pathname: string,
    options: { access: 'private' },
  ): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  del(pathname: string): Promise<void>;
}

/** ¿Hay un almacén de Vercel Blob conectado al proyecto? */
export function hasVercelBlob(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/**
 * Imágenes en Vercel Blob (almacén privado). El disco de las funciones de
 * Vercel se borra en cada despliegue, así que en producción no sirve. Las
 * credenciales las pone Vercel al conectar el almacén al proyecto
 * (BLOB_READ_WRITE_TOKEN, o BLOB_STORE_ID con el token OIDC de la función).
 */
@Injectable()
export class VercelBlobStorage extends StorageService {
  private readonly sdk: BlobSdk;

  constructor() {
    super();
    // require (y no import): el paquete solo está instalado en Vercel.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.sdk = require('@vercel/blob') as BlobSdk;
  }

  private check(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
    return key;
  }

  async put(key: string, data: Buffer): Promise<void> {
    // Igual que en disco: las claves son únicas y nunca se sobrescriben.
    await this.sdk.put(this.check(key), data, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/octet-stream',
    });
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.sdk.get(this.check(key), { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.sdk.del(this.check(key));
  }
}
