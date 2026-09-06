import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      clientID: config.get<string>('google.clientId') ?? '',
      clientSecret: config.get<string>('google.clientSecret') ?? '',
      callbackURL: config.get<string>('google.callbackUrl') ?? '',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    const displayName = profile.displayName;
    const avatarUrl = profile.photos?.[0]?.value;

    try {
      const tokens = await this.auth.oauthLogin({
        provider: 'GOOGLE',
        providerUid: profile.id,
        email: email ?? '',
        displayName: displayName ?? '',
        avatarUrl: avatarUrl ?? '',
        accessToken,
        refreshToken,
      });
      done(null, tokens);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
