import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public (no JWT auth required).
 * Works with JwtAuthGuard to skip authentication.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
