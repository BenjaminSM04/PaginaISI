import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class TwoFactorPasswordDto {
  @IsString() @MinLength(1) @MaxLength(72)
  password: string;
}

export class TwoFactorCodeDto extends TwoFactorPasswordDto {
  @IsString() @Matches(/^(?:\d{6}|[a-fA-F0-9]{20})$/, { message: 'Ingresa el código de 6 dígitos o un código de recuperación.' })
  code: string;
}

export class TwoFactorLoginDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/)
  challengeToken: string;

  @IsString() @Matches(/^(?:\d{6}|[a-fA-F0-9]{20})$/, { message: 'Ingresa el código de 6 dígitos o un código de recuperación.' })
  code: string;
}
