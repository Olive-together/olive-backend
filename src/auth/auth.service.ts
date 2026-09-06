import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { OAuthProvider, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '../common/exceptions/app.exception';
import { JwtPayload } from '../common/decorators/current-user.decorator';

// Redis key prefixes
const OTP_PREFIX = 'otp:email:';
const RESET_PREFIX = 'reset:';
const SESSION_PREFIX = 'session:';

// ── OAuth DTO (internal — not exposed via HTTP body) ───────────────────────
export interface OauthLoginDto {
  provider: keyof typeof OAuthProvider;
  providerUid: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // Age check — must be at least 18
    const dob = new Date(dto.dateOfBirth);
    const minAge = new Date();
    minAge.setFullYear(minAge.getFullYear() - 18);
    if (dob > minAge) {
      throw new BadRequestException('You must be at least 18 years old to register');
    }

    // Uniqueness checks
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email already registered' : 'Username already taken',
      );
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        dateOfBirth: dob,
        status: UserStatus.PENDING_VERIFICATION,
        auth: { create: { passwordHash } },
        profile: { create: {} },
        reputationSummary: { create: {} },
      },
    });

    // Send OTP
    await this.sendEmailOtp(dto.email);

    this.logger.log(`User registered: ${user.id} (${user.email})`);
    return { message: 'Registration successful. Check your email for a verification OTP.' };
  }

  // ─── Email Verification ────────────────────────────────────────────────────

  async sendEmailOtp(email: string): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(`${OTP_PREFIX}${email}`, otp, 600); // 10 min TTL
    
    const resendKey = this.config.get<string>('RESEND_API_KEY') || process.env.RESEND_API_KEY;
    
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: this.config.get<string>('EMAIL_FROM') ?? 'noreply@letsdotogether.app',
          to: email,
          subject: 'Your Verification Code - LetsDoTogether',
          html: `<p>Welcome to LetsDoTogether!</p><p>Your verification code is: <strong>${otp}</strong></p><p>This code will expire in 10 minutes.</p>`,
        });
        this.logger.log(`OTP email sent to ${email} via Resend`);
      } catch (err) {
        this.logger.error(`Failed to send OTP email to ${email}`, err);
        // Fallback to logging in dev if it fails
        this.logger.log(`[DEV] OTP for ${email}: ${otp}`);
      }
    } else {
      this.logger.log(`[DEV] OTP for ${email}: ${otp}`);
    }
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const stored = await this.redis.get(`${OTP_PREFIX}${dto.email}`);
    if (!stored || stored !== dto.otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User', dto.email);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      }),
      this.prisma.userAuth.update({
        where: { userId: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    await this.redis.del(`${OTP_PREFIX}${dto.email}`);
    return { message: 'Email verified successfully' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User', dto.email);
    if (user.status !== UserStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Email already verified');
    }
    await this.sendEmailOtp(dto.email);
    return { message: 'Verification OTP resent' };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { auth: true },
    });

    if (!user || !user.auth?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    if (user.auth.lockedUntil && user.auth.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked until ${user.auth.lockedUntil.toISOString()}`,
      );
    }

    const validPassword = await argon2.verify(user.auth.passwordHash, dto.password);
    if (!validPassword) {
      // Increment failed attempts
      const failed = user.auth.failedLoginCount + 1;
      await this.prisma.userAuth.update({
        where: { userId: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.BANNED) {
      throw new UnauthorizedException(`Account ${user.status.toLowerCase()}`);
    }

    // Reset failed attempts, update last login
    await this.prisma.userAuth.update({
      where: { userId: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.createTokenPair(user.id, user.email, user.role, ipAddress, userAgent);
  }

  // ─── Token Generation ──────────────────────────────────────────────────────

  private async createTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const refreshTokenRaw = crypto.randomUUID();
    const refreshTokenHash = await argon2.hash(refreshTokenRaw, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: userId,
      email,
      role,
      sessionId: session.id,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: (this.config.get<string>('jwt.accessExpiry') ?? '15m') as StringValue,
    });

    const refreshToken = this.jwt.sign(
      { sub: userId, sessionId: session.id, type: 'refresh' },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: (this.config.get<string>('jwt.refreshExpiry') ?? '30d') as StringValue,
      },
    );

    // Store refresh token in Redis for fast revocation check
    await this.redis.set(
      `${SESSION_PREFIX}${session.id}`,
      refreshTokenRaw,
      30 * 24 * 60 * 60,
    );

    return { accessToken, refreshToken, sessionId: session.id };
  }

  // ─── Refresh ───────────────────────────────────────────────────────────────

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; sessionId: string; type: string };
    try {
      payload = this.jwt.verify<{ sub: string; sessionId: string; type: string }>(
        dto.refreshToken,
        { secret: this.config.get<string>('jwt.refreshSecret') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Revoke old session (rotation)
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(`${SESSION_PREFIX}${session.id}`);

    return this.createTokenPair(session.userId, session.user.email, session.user.role);
  }

  // ─── Logout ────────────────────────────────────────────────────────────────

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(`${SESSION_PREFIX}${sessionId}`);
    return { message: 'Logged out successfully' };
  }

  // ─── Sessions ──────────────────────────────────────────────────────────────

  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        ipAddress: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session', sessionId);

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(`${SESSION_PREFIX}${sessionId}`);
    return { message: 'Session revoked' };
  }

  // ─── OAuth Login (Google, etc.) ──────────────────────────────────────────

  async oauthLogin(
    dto: OauthLoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const provider = OAuthProvider[dto.provider];

    // 1. Try to find an existing OAuth account for this provider + uid
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUid: { provider, providerUid: dto.providerUid } },
      include: { user: true },
    });

    if (existing) {
      // Update stored tokens
      await this.prisma.oAuthAccount.update({
        where: { id: existing.id },
        data: {
          accessToken: dto.accessToken,
          refreshToken: dto.refreshToken ?? null,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });
      return this.createTokenPair(
        existing.user.id,
        existing.user.email,
        existing.user.role,
        ipAddress,
        userAgent,
      );
    }

    // 2. Check if a user with the same email already exists (account linking)
    const userByEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (userByEmail) {
      // Link the OAuth account to the existing user
      await this.prisma.oAuthAccount.create({
        data: {
          userId: userByEmail.id,
          provider,
          providerUid: dto.providerUid,
          accessToken: dto.accessToken,
          refreshToken: dto.refreshToken ?? null,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      });
      this.logger.log(`OAuth account linked: ${dto.provider} → user ${userByEmail.id}`);
      return this.createTokenPair(
        userByEmail.id,
        userByEmail.email,
        userByEmail.role,
        ipAddress,
        userAgent,
      );
    }

    // 3. Brand-new user — derive a unique username from display name
    const baseUsername = dto.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 24);
    let username = baseUsername || 'user';
    let suffix = 0;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      suffix += 1;
      username = `${baseUsername}_${suffix}`;
    }

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        username,
        // OAuth users have no password and are immediately active
        dateOfBirth: new Date('2000-01-01'), // placeholder — user should complete profile
        status: UserStatus.ACTIVE,
        auth: { create: { emailVerifiedAt: new Date() } },
        oauthAccounts: {
          create: {
            provider,
            providerUid: dto.providerUid,
            accessToken: dto.accessToken,
            refreshToken: dto.refreshToken ?? null,
            expiresAt: new Date(Date.now() + 3600 * 1000),
          },
        },
        profile: {
          create: {
            displayName: dto.displayName || null,
            avatarUrl: dto.avatarUrl || null,
          },
        },
        reputationSummary: { create: {} },
      },
    });

    this.logger.log(`New OAuth user created: ${newUser.id} (${newUser.email}) via ${dto.provider}`);
    return this.createTokenPair(newUser.id, newUser.email, newUser.role, ipAddress, userAgent);
  }

  // ─── Forgot / Reset Password ───────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always return success to prevent email enumeration
    if (!user) return { message: 'If this email exists, a reset link has been sent' };

    const resetToken = this.jwt.sign(
      { sub: user.id, email: user.email, type: 'password_reset' },
      {
        secret: this.config.get<string>('jwt.passwordResetSecret'),
        expiresIn: (this.config.get<string>('jwt.passwordResetExpiry') ?? '1h') as StringValue,
      },
    );

    await this.redis.set(`${RESET_PREFIX}${user.id}`, resetToken, 3600);
    this.logger.log(`[DEV] Password reset token for ${dto.email}: ${resetToken}`);

    return { message: 'If this email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: { sub: string; type: string };
    try {
      payload = this.jwt.verify<{ sub: string; type: string }>(dto.token, {
        secret: this.config.get<string>('jwt.passwordResetSecret'),
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (payload.type !== 'password_reset') throw new BadRequestException('Invalid token');

    const stored = await this.redis.get(`${RESET_PREFIX}${payload.sub}`);
    if (!stored || stored !== dto.token) {
      throw new BadRequestException('Reset token already used or expired');
    }

    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.userAuth.update({
      where: { userId: payload.sub },
      data: { passwordHash, refreshTokenHash: null, failedLoginCount: 0, lockedUntil: null },
    });

    // Revoke all sessions
    await this.prisma.session.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(`${RESET_PREFIX}${payload.sub}`);

    return { message: 'Password reset successful. Please log in again.' };
  }
}
