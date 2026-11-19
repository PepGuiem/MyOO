import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env.validation';
import { hasVercelBlob, LocalDiskStorage, StorageService, VercelBlobStorage } from './storage.service';

/**
 * Proveedor de almacenamiento: Vercel Blob si el proyecto tiene un almacén
 * conectado (producción en Vercel); si no, la carpeta local STORAGE_DIR.
 */
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): StorageService =>
        hasVercelBlob() ? new VercelBlobStorage() : new LocalDiskStorage(config),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
