import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaEntityType } from '@prisma/client';

@ApiTags('Media')
@ApiBearerAuth('access-token')
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('signature')
  @ApiOperation({ summary: 'Get Cloudinary upload signature' })
  getSignature(@CurrentUser('sub') userId: string, @Body('entityType') entityType: MediaEntityType) {
    return this.media.getUploadSignature(entityType, userId);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm media upload' })
  confirmUpload(@CurrentUser('sub') userId: string, @Body() dto: any) {
    return this.media.confirmUpload(userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete media asset' })
  deleteMedia(@CurrentUser('sub') userId: string, @Param('id') mediaId: string) {
    return this.media.deleteMedia(userId, mediaId);
  }
}
