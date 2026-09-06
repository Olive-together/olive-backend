import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string;

    return next.handle().pipe(
      map((data: unknown) => {
        // If the response is already wrapped (e.g., health check), pass through
        if (data && typeof data === 'object' && 'success' in (data as object)) {
          return data;
        }
        return {
          success: true,
          data,
          requestId,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
