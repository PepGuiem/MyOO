import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { normalizeUsername } from '../profile-options';

export class UsernameQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeUsername(value) : value,
  )
  @IsString()
  @MaxLength(40)
  username!: string;
}
