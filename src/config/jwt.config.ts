import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '30d',
  emailVerifySecret: process.env.JWT_EMAIL_VERIFY_SECRET,
  emailVerifyExpiry: process.env.JWT_EMAIL_VERIFY_EXPIRY ?? '1h',
  passwordResetSecret: process.env.JWT_PASSWORD_RESET_SECRET,
  passwordResetExpiry: process.env.JWT_PASSWORD_RESET_EXPIRY ?? '1h',
}));
