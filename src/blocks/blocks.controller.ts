import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BlocksService } from './blocks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Blocks')
@ApiBearerAuth('access-token')
@Controller({ path: 'blocks', version: '1' })
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post()
  blockUser(
    @CurrentUser('sub') userId: string,
    @Body() dto: { blockedUserId: string; reason?: string },
  ) {
    return this.blocks.blockUser(userId, dto.blockedUserId, dto.reason);
  }

  @Delete(':id')
  unblockUser(@CurrentUser('sub') userId: string, @Param('id') blockedUserId: string) {
    return this.blocks.unblockUser(userId, blockedUserId);
  }
}
