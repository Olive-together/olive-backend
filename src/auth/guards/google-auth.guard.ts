import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Used on the initiation route (`GET /auth/google`) to redirect the user to
 * the Google OAuth consent screen, and on the callback route
 * (`GET /auth/google/callback`) to process the response from Google.
 *
 * Both routes must be marked @Public() so the global JwtAuthGuard skips them.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
