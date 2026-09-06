import { Module } from '@nestjs/common';
import { MediaService, CloudinaryMediaStorageService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  controllers: [MediaController],
  providers: [MediaService, CloudinaryMediaStorageService],
  exports: [MediaService],
})
export class MediaModule {}
