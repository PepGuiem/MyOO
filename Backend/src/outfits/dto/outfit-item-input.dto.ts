import { IsInt, IsObject, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class OutfitItemInputDto {
  /** Prenda del armario (debe ser tuya). */
  @IsUUID()
  wardrobeItemId!: string;

  /** Orden dentro del outfit. Si no se envía, se usa el orden del array. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  position?: number;

  /**
   * Cómo se lleva la prenda en este outfit (por dentro, remangada, abierta...).
   * Formato cerrado según el tipo de prenda: ver `outfits/styling.ts`.
   */
  @IsOptional()
  @IsObject()
  styling?: Record<string, unknown>;
}
