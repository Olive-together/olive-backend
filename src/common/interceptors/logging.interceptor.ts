import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url } = request;
    const requestId = request.headers['x-request-id'] as string;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          const statusCode = response.statusCode;
          this.logger.log(
            `${method} ${url} ${statusCode} ${ms}ms [${requestId ?? '-'}]`,
          );
        },
        error: (err: Error) => {
          const ms = Date.now() - start;
          this.logger.error(
            `${method} ${url} ERROR ${ms}ms [${requestId ?? '-'}]: ${err.message}`,
          );
        },
      }),
    );
  }
}
