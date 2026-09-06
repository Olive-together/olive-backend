import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';

@ApiTags('AI')
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(private readonly ai: AiService) {}
}
