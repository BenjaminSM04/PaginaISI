import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

const WEB_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  semester?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  githubUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  linkedinUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl(WEB_URL_OPTIONS)
  @MaxLength(2048)
  websiteUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Habilidades técnicas (reemplaza la lista completa)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  skills?: string[];
}
