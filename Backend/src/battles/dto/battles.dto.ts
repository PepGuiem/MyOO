import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export const BATTLE_TABS = [
  'live',
  'open',
  'challenges',
  'mine',
  'finished',
] as const;
export type BattleTab = (typeof BATTLE_TABS)[number];

export class ListBattlesQueryDto extends PaginationQueryDto {
  /**
   * live: votándose ahora · open: retos abiertos a cualquiera · challenges:
   * retos que te han mandado · mine: en las que participas · finished: acabadas.
   */
  @ApiPropertyOptional({ enum: BATTLE_TABS })
  @IsOptional()
  @IsIn(BATTLE_TABS)
  tab?: BattleTab;
}

export class CreateBattleDto {
  /** Tu outfit para el reto. */
  @IsUUID()
  outfitId!: string;

  /** A quién retas. Sin esto, el reto queda abierto a cualquiera. */
  @IsOptional()
  @IsUUID()
  opponentId?: string;

  /** Tema del reto («Noche de club», «Todo negro»...). */
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(60)
  theme?: string | null;
}

export class AcceptBattleDto {
  /** Tu outfit para responder al reto. */
  @IsUUID()
  outfitId!: string;
}

export class VoteBattleDto {
  /** A = quien retó, B = quien respondió. */
  @IsIn(['A', 'B'])
  side!: 'A' | 'B';
}
