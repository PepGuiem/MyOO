import {
  IdeaStatus,
  ReleaseTag,
  ReportStatus,
  ReportTarget,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;
}

export class AdminUsersQueryDto extends PageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  /** all: todas. banned: suspendidas ahora. admins: con rol admin. reported: con denuncias abiertas. */
  @IsOptional()
  @IsIn(['all', 'banned', 'admins', 'reported'])
  status: 'all' | 'banned' | 'admins' | 'reported' = 'all';
}

export class BanUserDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  /** Días de suspensión; sin días = indefinida (hasta que la levantes). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;
}

export class UpdateIdeaAdminDto {
  @IsOptional()
  @IsEnum(IdeaStatus)
  status?: IdeaStatus;

  /** Respuesta del equipo; cadena vacía o null la quita. */
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  adminReply?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  duplicateOfId?: string | null;
}

export class AdminReportsQueryDto extends PageDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportTarget)
  targetType?: ReportTarget;
}

export class UpdateReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  resolution?: string;

  /** Avisar a quien denunció de que se ha revisado (sin contarle qué se hizo). */
  @IsOptional()
  @IsBoolean()
  notifyReporter?: boolean;
}

export class ReleaseDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(30)
  version?: string | null;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(ReleaseTag, { each: true })
  tags?: ReleaseTag[];
}

export class PublishReleaseDto {
  /** Mandar el aviso a todas las cuentas (por defecto sí). */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
