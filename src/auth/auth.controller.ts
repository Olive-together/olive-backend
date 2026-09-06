import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered, OTP sent' })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({ summary: 'Log in and receive access + refresh tokens' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke current session' })
  logout(@CurrentUser() user: JwtPayload) {
    return this.auth.logout(user.sessionId);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @ApiOperation({ summary: 'Verify email with 6-digit OTP' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Resend email verification OTP' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Request a password reset token' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token from email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List active sessions for current user' })
  getSessions(@CurrentUser('sub') userId: string) {
    return this.auth.getSessions(userId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a specific session' })
  revokeSession(@CurrentUser('sub') userId: string, @Param('id') sessionId: string) {
    return this.auth.revokeSession(userId, sessionId);
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────

  @Get('google')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth flow — redirects to Google consent screen' })
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  googleAuth(): void {}

  @Get('google/callback')
  @Public()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback — issues session cookie and redirects to frontend' })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    // req.user is populated by GoogleStrategy.validate() with the token pair
    const tokens = req.user as { accessToken: string; refreshToken: string; sessionId: string };

    const frontendUrl = this.config.get<string>('app.frontendUrl') ?? 'http://localhost:5173';
    const isProd = this.config.get<string>('app.nodeEnv') === 'production';

    // Store refresh token in a Secure HttpOnly cookie (same as the existing refresh flow)
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    // Store access token in a short-lived readable cookie so the frontend
    // can pick it up once, then store in memory (not localStorage).
    res.cookie('oauth_access_token', tokens.accessToken, {
      httpOnly: false,   // intentionally readable by JS (one-time pickup)
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: 60 * 1000, // 1 minute — frontend must pick this up quickly
      path: '/',
    });

    res.redirect(`${frontendUrl}/auth/callback`);
  }
}
