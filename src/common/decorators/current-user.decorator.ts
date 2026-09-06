import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { User } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
}

/**
 * Decorator that extracts the authenticated user from the JWT payload.
 * Use @CurrentUser() to get the full payload or @CurrentUser('sub') for userId.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

export type CurrentUserType = Pick<User, 'id' | 'email' | 'role' | 'status'>;
