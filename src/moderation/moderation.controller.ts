import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModerationService } from './moderation.service';

@ApiTags('Moderation')
@Controller({ path: 'moderation', version: '1' })
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}
}
