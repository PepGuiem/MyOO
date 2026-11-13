import { ApiPropertyOptional } from '@nestjs/swagger';
import { Season } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  MAX_STYLES_PER_ITEM,
  PURCHASE_PLATFORM_KEYS,
  STYLE_TAG_KEYS,
} from '../../stylist/vocabulary';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateWardrobeItemDto {
  /** Armario donde se guarda (debe ser tuyo). */
  @IsUUID()
  wardrobeId!: string;

  /** Tipo de prenda (ver GET /garment-types). */
  @IsUUID()
  garmentTypeId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Color principal en formato #RRGGBB. Se usa para pintar el modelo 3D. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^#[0-9A-F]{6}$/, {
    message: 'color must be a hex color like #1A2B3C',
  })
  color!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  size?: string;

  @ApiPropertyOptional({ enum: Season, default: Season.ALL_SEASON })
  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /** URL de una imagen alojada fuera (no se suben archivos todavía). */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string;

  /**
   * Modelo 3D real de la prenda en formato GLB/glTF: una URL http(s) o una
   * ruta servida por el frontend, p. ej. "/models/camiseta.glb".
   */
  @IsOptional()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/[^\s]+|\/(?!\/)[\w\-./]+)\.(glb|gltf)(\?[^\s]*)?$/i, {
    message:
      'modelUrl must be an http(s) URL or a /path ending in .glb or .gltf',
  })
  modelUrl?: string;

  /**
   * Atributos específicos del tipo de prenda, p. ej. { "sleeve": "short" }.
   * Se validan contra el `attributeSchema` del tipo.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { sleeve: 'short', material: 'Algodón' },
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  /**
   * Personalización: colores por componente, piezas que se ponen o quitan y
   * detalles colocados a mano (parches, bordados, texto, logos...). Se valida
   * contra las opciones del tipo (ver `customizationOptions` en /garment-types).
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {
      colors: { buttons: '#C9A15A', stitching: '#F2F2F2' },
      parts: { chestPocket: true },
      options: { buttonStyle: 'four_hole' },
      details: [
        {
          id: 'logo-1',
          kind: 'embroidery',
          position: [0.08, 1.32, 0.13],
          normal: [0, 0, 1],
          rotation: 0,
          size: 0.06,
          color: '#151517',
          text: 'MyOut',
          font: 'script',
        },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  customization?: Record<string, unknown>;

  /**
   * Estilos de la prenda (casual, streetwear, old_money...). El estilista los
   * usa para combinar; si no se ponen, los deduce del tipo de prenda.
   */
  @ApiPropertyOptional({
    enum: STYLE_TAG_KEYS,
    isArray: true,
    example: ['streetwear'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_STYLES_PER_ITEM)
  @ArrayUnique()
  @IsIn(STYLE_TAG_KEYS, { each: true })
  styles?: string[];

  // ---------------------------------------------------- dónde se compró
  // Todo opcional. La marca va en attributes.brand. En PATCH, null borra.

  /** Nombre comercial del producto ("Air Force 1 '07"). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  productName?: string | null;

  /** Tienda ("Nike", "Zara Gran Vía", "Vinted"...). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  storeName?: string | null;

  @ApiPropertyOptional({ enum: PURCHASE_PLATFORM_KEYS })
  @IsOptional()
  @IsIn(PURCHASE_PLATFORM_KEYS)
  purchasePlatform?: string | null;

  /** Enlace a la página del producto. Solo http(s). */
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  productUrl?: string | null;

  /** Referencia o código del producto (SKU, modelo...). */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  productRef?: string | null;

  /** Precio de compra (dos decimales como mucho). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(99_999_999)
  purchasePrice?: number | null;

  /** Moneda ISO 4217 en mayúsculas ("EUR"). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be an ISO 4217 code like EUR',
  })
  currency?: string | null;

  /** Fecha de compra (AAAA-MM-DD). */
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'purchaseDate must be a date like 2026-11-07',
  })
  purchaseDate?: string | null;
}
