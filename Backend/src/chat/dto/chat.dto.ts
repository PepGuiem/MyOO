import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Personas en un grupo como máximo (contándote a ti). */
export const MAX_GROUP_MEMBERS = 32;

export class DirectChatDto {
  @IsUUID()
  userId!: string;
}

export class CreateGroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title!: string;

  /** Personas que añades (sin contarte). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GROUP_MEMBERS - 1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  memberIds!: string[];
}

export class UpdateGroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title!: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GROUP_MEMBERS - 1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds!: string[];
}

export class SetRoleDto {
  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}

/** Un mensaje: texto, un outfit tuyo, o los dos. */
export class SendMessageDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsUUID()
  outfitId?: string;
}

export class MessagesQueryDto {
  /** Mensajes anteriores a esta fecha (para cargar más hacia arriba). */
  @IsOptional()
  @IsDateString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 40;
}
