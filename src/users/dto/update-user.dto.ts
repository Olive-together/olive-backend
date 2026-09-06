import { IsString, IsOptional, MinLength, MaxLength, Matches, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'new_username' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-z0-9_]+$/, { message: 'Username may only contain lowercase letters, numbers and underscores' })
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

export class UpdatePrivacyDto {
  @ApiPropertyOptional({ enum: ['PUBLIC', 'CONNECTIONS_ONLY', 'PRIVATE'] })
  @IsOptional()
  @IsString()
  profilePrivacy?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'CONNECTIONS_ONLY', 'PRIVATE'] })
  @IsOptional()
  @IsString()
  locationPrivacy?: string;
}

export class UpdateDiscoveryDto {
  @ApiPropertyOptional()
  @IsOptional()
  discoveryEnabled?: boolean;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  maxDiscoveryDistance?: number;
}
