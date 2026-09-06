import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ConversationType } from '@prisma/client';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@Controller({ path: 'chat', version: '1' })
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // ─── Direct Conversations ─────────────────────────────────────────────────

  @Post('conversations')
  @ApiOperation({ summary: 'Get or create a direct conversation with another user' })
  getOrCreate(
    @CurrentUser('sub') userId: string,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.chat.getOrCreateDirectConversation(userId, targetUserId);
  }

  // ─── Conversation Listing ─────────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations (optionally filtered by type: DIRECT or GROUP)' })
  @ApiQuery({ name: 'type', enum: ConversationType, required: false })
  getConversations(
    @CurrentUser('sub') userId: string,
    @Query('type') type?: ConversationType,
  ) {
    return this.chat.getConversations(userId, type);
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages (cursor-paginated). Works for both DIRECT and GROUP conversations.' })
  getMessages(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.chat.getMessages(userId, id, { cursor, limit: limit ? Number(limit) : undefined });
  }
}
