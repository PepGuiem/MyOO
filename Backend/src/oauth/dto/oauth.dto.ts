import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** Código de un solo uso que el frontend recibe en el fragmento (#result=...). */
export class OAuthExchangeDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  result!: string;
}

export class OAuthPrepareDto {
  /** link: conectar la cuenta. reauth: confirmar tu identidad. */
  @IsIn(['link', 'reauth'])
  intent!: 'link' | 'reauth';
}
