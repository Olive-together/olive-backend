import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  public readonly code: string;

  constructor(message: string, statusCode: HttpStatus, code?: string) {
    super({ message, code: code ?? 'APP_ERROR' }, statusCode);
    this.code = code ?? 'APP_ERROR';
  }
}

export class NotFoundException extends AppException {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id "${id}" not found` : `${resource} not found`,
      HttpStatus.NOT_FOUND,
      'NOT_FOUND',
    );
  }
}

export class ConflictException extends AppException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, 'CONFLICT');
  }
}

export class ForbiddenException extends AppException {
  constructor(message = 'Access denied') {
    super(message, HttpStatus.FORBIDDEN, 'FORBIDDEN');
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized') {
    super(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
  }
}

export class BadRequestException extends AppException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST, 'BAD_REQUEST');
  }
}

export class TooManyRequestsException extends AppException {
  constructor(message = 'Too many requests') {
    super(message, HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED');
  }
}

export class ServiceUnavailableException extends AppException {
  constructor(message = 'Service temporarily unavailable') {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }
}
