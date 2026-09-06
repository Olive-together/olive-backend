import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '../common/exceptions/app.exception';
import { MediaEntityType } from '@prisma/client';

export abstract class MediaStorageService {
  abstract generateUploadSignature(folder: string, publicId?: string): Record<string, unknown>;
  abstract delete(publicId: string): Promise<void>;
}

@Injectable()
export class CloudinaryMediaStorageService extends MediaStorageService {
  constructor(private readonly config: ConfigService) {
    super();
    cloudinary.config({
      cloud_name: this.config.get<string>('cloudinary.cloudName'),
      api_key: this.config.get<string>('cloudinary.apiKey'),
      api_secret: this.config.get<string>('cloudinary.apiSecret'),
    });
  }

  generateUploadSignature(folder: string, publicId?: string): Record<string, unknown> {
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign: Record<string, string | number> = { timestamp, folder };
    if (publicId) paramsToSign['public_id'] = publicId;

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.config.get<string>('cloudinary.apiSecret') ?? '',
    );

    return {
      signature,
      timestamp,
      apiKey: this.config.get<string>('cloudinary.apiKey'),
      cloudName: this.config.get<string>('cloudinary.cloudName'),
      folder,
    };
  }

  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

@Injectable()
export class MediaService {
  constructor(
    private readonly storage: CloudinaryMediaStorageService,
    private readonly prisma: PrismaService,
  ) {}

  getUploadSignature(entityType: MediaEntityType, userId: string) {
    const folder = `letsdotogether/${entityType.toLowerCase()}/${userId}`;
    return this.storage.generateUploadSignature(folder);
  }

  async confirmUpload(
    userId: string,
    dto: {
      publicId: string;
      url: string;
      secureUrl: string;
      entityType: MediaEntityType;
      entityId?: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      resourceType?: string;
    },
  ) {
    return this.prisma.mediaAsset.create({
      data: {
        userId,
        publicId: dto.publicId,
        url: dto.url,
        secureUrl: dto.secureUrl,
        entityType: dto.entityType,
        entityId: dto.entityId,
        format: dto.format,
        width: dto.width,
        height: dto.height,
        bytes: dto.bytes,
        resourceType: dto.resourceType ?? 'image',
      },
    });
  }

  async deleteMedia(userId: string, mediaId: string) {
    const media = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media asset', mediaId);
    if (media.userId !== userId) throw new ForbiddenException('Cannot delete this asset');

    await this.storage.delete(media.publicId);
    await this.prisma.mediaAsset.delete({ where: { id: mediaId } });
    return { message: 'Media deleted' };
  }
}
