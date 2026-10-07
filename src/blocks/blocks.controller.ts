import {
  Controller,
  Post,
  Body,
  Delete,
  Param,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BlocksService } from './blocks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Blocks')
@ApiBearerAuth('access-token')
@Controller({ path: 'blocks', version: '1' })
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  /**
   * POST /api/v1/blocks
   * Block a user. Idempotent — safe to call multiple times.
   */
  @Post()
  @ApiOperation({ summary: 'Block a user' })
  blockUser(
    @CurrentUser('sub') userId: string,
    @Body() dto: { blockedUserId: string; reason?: string },
  ) {
    return this.blocks.blockUser(userId, dto.blockedUserId, dto.reason);
  }

  /**
   * DELETE /api/v1/blocks/:blockedUserId
   * Unblock a previously blocked user.
   */
  @Delete(':blockedUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblock a user' })
  async unblockUser(
    @CurrentUser('sub') userId: string,
    @Param('blockedUserId') blockedUserId: string,
  ) {
    await this.blocks.unblockUser(userId, blockedUserId);
  }

  /**
   * GET /api/v1/blocks
   * Returns all users blocked by the current user.
   */
  @Get()
  @ApiOperation({ summary: 'Get list of blocked users' })
  getBlockList(@CurrentUser('sub') userId: string) {
    return this.blocks.getBlockList(userId);
  }

  /**
   * GET /api/v1/blocks/status/:targetUserId
   * Returns whether the current user has blocked the target.
   */
  @Get('status/:targetUserId')
  @ApiOperation({ summary: 'Check if current user has blocked a specific user' })
  async getBlockStatus(
    @CurrentUser('sub') userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    const block = await this.blocks.getBlock(userId, targetUserId);
    return { isBlocked: !!block, blockId: block?.id ?? null };
  }
}
