import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { createLogger } from './common/logger/logger.factory';

async function bootstrap() {
  const logger = createLogger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);

  // ── Security ───────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get<string>('app.frontendUrl'),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });

  // ── API Versioning ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(RequestIdMiddleware);

  // ── Global Pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global Filters & Interceptors ──────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerEnabled = configService.get<boolean>('app.swaggerEnabled');
  if (swaggerEnabled) {
    const swaggerPath = configService.get<string>('app.swaggerPath') ?? 'api/docs';
    const config = new DocumentBuilder()
      .setTitle(configService.get<string>('app.swaggerTitle') ?? 'LetsDoTogether API')
      .setDescription(
        configService.get<string>('app.swaggerDescription') ??
          'Social activity and interest matching platform',
      )
      .setVersion(configService.get<string>('app.swaggerVersion') ?? '1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addCookieAuth('refresh_token')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger available at /${swaggerPath}`);
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
  logger.log(`Environment: ${configService.get<string>('app.nodeEnv')}`);
}

void bootstrap();
