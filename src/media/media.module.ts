import { Module } from '@nestjs/common';
import { MediaService, CloudinaryMediaStorageService } from './media.service';
import { MediaController } from './media.controller';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [ProfilesModule],
  controllers: [MediaController],
  providers: [MediaService, CloudinaryMediaStorageService],
  exports: [MediaService],
})
export class MediaModule {}
