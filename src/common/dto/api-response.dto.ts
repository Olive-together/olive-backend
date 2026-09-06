import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponse<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional({ example: 'Operation successful' })
  message?: string;

  @ApiPropertyOptional({ example: 'uuid-string' })
  requestId?: string;

  @ApiPropertyOptional()
  timestamp: string;

  constructor(partial: Partial<ApiResponse<T>>) {
    this.success = partial.success ?? true;
    this.data = partial.data;
    this.message = partial.message;
    this.requestId = partial.requestId;
    this.timestamp = new Date().toISOString();
  }

  static success<T>(data: T, message?: string): ApiResponse<T> {
    return new ApiResponse({ success: true, data, message });
  }

  static error(message: string): ApiResponse<null> {
    return new ApiResponse({ success: false, message });
  }
}

export class PaginatedResponse<T> {
  @ApiProperty()
  items: T[];

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNext: boolean;

  @ApiProperty({ example: false })
  hasPrev: boolean;

  constructor(items: T[], total: number, page: number, limit: number) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasNext = page < this.totalPages;
    this.hasPrev = page > 1;
  }
}

export class CursorPaginatedResponse<T> {
  @ApiProperty()
  items: T[];

  @ApiPropertyOptional({ example: 'base64cursor' })
  nextCursor?: string;

  @ApiPropertyOptional({ example: 'base64cursor' })
  prevCursor?: string;

  @ApiProperty({ example: true })
  hasMore: boolean;

  constructor(items: T[], nextCursor?: string, prevCursor?: string) {
    this.items = items;
    this.nextCursor = nextCursor;
    this.prevCursor = prevCursor;
    this.hasMore = !!nextCursor;
  }
}
