import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() linkedIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() instagram?: string;
}

export class AddSkillDto {
  @ApiPropertyOptional() @IsString() skillId: string;
  @ApiPropertyOptional({ enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] })
  @IsOptional() @IsString() level?: string;
  @ApiPropertyOptional() @IsOptional() yearsExp?: number;
}
