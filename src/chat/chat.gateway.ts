import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ChatService } from './chat.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  email?: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*', credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly chat: ChatService,
  ) {}

  // ─── Authentication Middleware ─────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token =
      (client.handshake.auth['token'] as string | undefined) ??
      (client.handshake.headers['authorization'] as string | undefined)?.replace('Bearer ', '');

    if (!token) {
      this.logger.warn(`WS connection rejected: no token [${client.id}]`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.userId = payload.sub;
      client.email = payload.email;

      // Set presence
      await this.redis.hset('ws:presence', payload.sub, 'online');
      client.join(`user:${payload.sub}`);

      this.logger.log(`WS connected: ${payload.sub} [${client.id}]`);
      client.emit('connected', { userId: payload.sub });
    } catch (err) {
      this.logger.warn(`WS auth failed: ${(err as Error).message} [${client.id}]`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (client.userId) {
      await this.redis.hdel('ws:presence', client.userId);
      this.logger.log(`WS disconnected: ${client.userId} [${client.id}]`);
    }
  }

  // ─── Message Events ────────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async handleMessageSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string; content: string },
  ) {
    if (!client.userId) throw new WsException('Unauthorized');
    if (!payload.conversationId || !payload.content?.trim()) {
      throw new WsException('conversationId and content are required');
    }

    const message = await this.chat.sendMessage(client.userId, payload.conversationId, payload.content);

    // Broadcast to all members in the conversation room
    this.server.to(`conv:${payload.conversationId}`).emit('message:new', message);

    return message;
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    if (!client.userId) throw new WsException('Unauthorized');

    // Security: verify the user is actually a member before letting them
    // subscribe to the Socket.IO room — prevents eavesdropping on arbitrary convs.
    const isMember = await this.chat.isMember(client.userId, payload.conversationId);
    if (!isMember) throw new WsException('Not a member of this conversation');

    await client.join(`conv:${payload.conversationId}`);
    return { joined: payload.conversationId };
  }

  @SubscribeMessage('message:read')
  async handleMessageRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    if (!client.userId) throw new WsException('Unauthorized');
    await this.chat.markRead(client.userId, payload.conversationId);
    this.server.to(`conv:${payload.conversationId}`).emit('message:read', {
      userId: client.userId,
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    if (!client.userId) return;
    client.to(`conv:${payload.conversationId}`).emit('typing:start', {
      userId: client.userId,
      conversationId: payload.conversationId,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { conversationId: string },
  ) {
    if (!client.userId) return;
    client.to(`conv:${payload.conversationId}`).emit('typing:stop', {
      userId: client.userId,
      conversationId: payload.conversationId,
    });
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  async getPresence(userIds: string[]): Promise<Record<string, boolean>> {
    const presence = await this.redis.hgetall('ws:presence');
    return Object.fromEntries(userIds.map((id) => [id, !!presence[id]]));
  }
}
