import { Controller, Post, Delete, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConnectionsService } from './connections.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Connections')
@ApiBearerAuth('access-token')
@Controller({ path: 'connections', version: '1' })
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Post('request') @ApiOperation({ summary: 'Send a connection request' })
  request(@CurrentUser('sub') userId: string, @Body('toUserId') toUserId: string) { return this.connections.request(userId, toUserId); }

  @Post(':id/accept') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Accept a connection request' })
  accept(@CurrentUser('sub') userId: string, @Param('id') id: string) { return this.connections.accept(userId, id); }

  @Post(':id/reject') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Reject a connection request' })
  reject(@CurrentUser('sub') userId: string, @Param('id') id: string) { return this.connections.reject(userId, id); }

  @Delete(':id') @HttpCode(HttpStatus.OK) @ApiOperation({ summary: 'Remove a connection' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) { return this.connections.remove(userId, id); }

  @Get() @ApiOperation({ summary: 'List all accepted connections' })
  list(@CurrentUser('sub') userId: string) { return this.connections.list(userId); }

  @Get('pending') @ApiOperation({ summary: 'List pending connection requests' })
  listPending(@CurrentUser('sub') userId: string) { return this.connections.listPending(userId); }
}
