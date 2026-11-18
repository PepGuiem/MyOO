import { Global, Module } from '@nestjs/common';
import { LocalDiskStorage, StorageService } from './storage.service';

/** Proveedor de almacenamiento. Para usar S3/MinIO, cambia `useClass`. */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: LocalDiskStorage }],
  exports: [StorageService],
})
export class StorageModule {}
