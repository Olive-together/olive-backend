import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.APP_PORT ?? '3000', 10),
  url: process.env.APP_URL ?? 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
  swaggerTitle: process.env.SWAGGER_TITLE ?? 'LetsDoTogether API',
  swaggerDescription: process.env.SWAGGER_DESCRIPTION ?? 'Social activity matching platform API',
  swaggerVersion: process.env.SWAGGER_VERSION ?? '1.0',
  swaggerPath: process.env.SWAGGER_PATH ?? 'api/docs',
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logPretty: process.env.LOG_PRETTY === 'true',
}));
