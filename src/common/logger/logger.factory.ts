import pino from 'pino';

export function createLogger(context: string) {
  const isDev = process.env.NODE_ENV !== 'production';
  const level = process.env.LOG_LEVEL ?? 'info';

  const logger = pino({
    level,
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });

  return {
    log: (msg: string, ...args: unknown[]) =>
      logger.info({ context, ...buildMeta(args) }, msg),
    error: (msg: string, trace?: string, ...args: unknown[]) =>
      logger.error({ context, trace, ...buildMeta(args) }, msg),
    warn: (msg: string, ...args: unknown[]) =>
      logger.warn({ context, ...buildMeta(args) }, msg),
    debug: (msg: string, ...args: unknown[]) =>
      logger.debug({ context, ...buildMeta(args) }, msg),
    verbose: (msg: string, ...args: unknown[]) =>
      logger.trace({ context, ...buildMeta(args) }, msg),
  };
}

function buildMeta(args: unknown[]): Record<string, unknown> {
  if (args.length === 0) return {};
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    return args[0] as Record<string, unknown>;
  }
  return { args };
}
