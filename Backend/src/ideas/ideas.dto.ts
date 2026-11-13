import { IdeaCategory, IdeaStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateIdeaDto {
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(120)
  title!: string;

  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsEnum(IdeaCategory)
  category?: IdeaCategory;
}

export class ListIdeasDto {
  /** top: más votadas. new: más recientes. mine: las tuyas. */
  @IsOptional()
  @IsIn(['top', 'new', 'mine'])
  sort: 'top' | 'new' | 'mine' = 'top';

  @IsOptional()
  @IsEnum(IdeaStatus)
  status?: IdeaStatus;

  @IsOptional()
  @IsEnum(IdeaCategory)
  category?: IdeaCategory;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;
}
