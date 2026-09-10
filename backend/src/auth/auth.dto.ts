import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const normalizeIdentifier = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const normalizeName = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class RegisterDto {
  @ApiProperty({ example: 'jperez@est.isi.edu.bo' })
  @Transform(normalizeIdentifier)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'jperez' })
  @Transform(normalizeIdentifier)
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_.-]+$/, { message: 'El usuario solo puede tener minúsculas, números, punto, guion y guion bajo' })
  username: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @Transform(normalizeName)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  fullName: string;

  @ApiProperty({ minLength: 12, maxLength: 72, format: 'password' })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/\S/, { message: 'La contraseña no puede contener solo espacios' })
  password: string;

  @ApiProperty({ required: false, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  semester?: number;
}

export class LoginDto {
  @ApiProperty({ description: 'Email o nombre de usuario' })
  @Transform(normalizeIdentifier)
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  @Matches(/^\S+$/, { message: 'El identificador no puede contener espacios' })
  identifier: string;

  @ApiProperty({ maxLength: 72, format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export class ForgotPasswordDto {
  @ApiProperty({ example: 'avargas@est.isi.edu.bo' })
  @Transform(normalizeIdentifier)
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido en el enlace de recuperación' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  @Matches(TOKEN_PATTERN, { message: 'Token inválido' })
  token: string;

  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/\S/, { message: 'La contraseña no puede contener solo espacios' })
  newPassword: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token recibido en el enlace de verificación' })
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  @Matches(TOKEN_PATTERN, { message: 'Token inválido' })
  token: string;
}

export class ChangePasswordDto {
  @ApiProperty({ maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ minLength: 12, maxLength: 72 })
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/\S/, { message: 'La contraseña no puede contener solo espacios' })
  newPassword: string;
}

export class SessionIdDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id: string;
}
