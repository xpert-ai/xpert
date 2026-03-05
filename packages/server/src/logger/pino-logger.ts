import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { Params } from 'nestjs-pino';
import * as path from 'path';

const SERVICE_NAME = 'xpert-server';

const resolveEnv = (): string => process.env.NODE_ENV || 'development';

const resolveLogLevel = (): string => {
  const level = process.env.LOG_LEVEL || 'log';
  // Map NestJS log levels to pino levels
  const levelMap: Record<string, string> = {
    verbose: 'trace',
    debug: 'debug',
    log: 'info',
    warn: 'warn',
    error: 'error',
  };
  return levelMap[level] || level;
};

const resolveLogFilePath = (): string => {
  if (process.env.LOG_FILE_PATH) {
    return process.env.LOG_FILE_PATH;
  }
  const dataPath = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
  return path.join(dataPath, 'xpert-server.log');
};

const normalizeHeaderValue = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidRequestId = (value: string | undefined): value is string => {
  return !!value && UUID_PATTERN.test(value);
};

const resolvePathname = (url?: string): string => {
  if (!url) {
    return '/';
  }
  const [pathname] = url.split('?');
  const normalized = pathname?.replace(/\/+$/, '');
  return normalized || '/';
};

const isHealthPath = (url?: string): boolean => {
  const pathname = resolvePathname(url);
  return pathname === '/health' || pathname === '/api/health';
};

const buildConsoleTarget = (logLevel: string, env: string) => {
  if (env === 'production') {
    return {
      target: 'pino/file',
      level: logLevel,
      options: {
        destination: 1,
      },
    };
  }

  return {
    target: 'pino-pretty',
    level: logLevel,
    options: {
      colorize: true,
      singleLine: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
};

const buildFileTarget = (logLevel: string) => ({
  target: 'pino/file',
  level: logLevel,
  options: {
    destination: resolveLogFilePath(),
    mkdir: true,
    append: true,
  },
});

export function buildPinoLoggerParams(): Params {
  const env = resolveEnv();
  const logLevel = resolveLogLevel();

  return {
    pinoHttp: {
      level: logLevel,
      transport: {
        targets: [buildConsoleTarget(logLevel, env), buildFileTarget(logLevel)],
      },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const headerValue = normalizeHeaderValue(req.headers['x-request-id']);
        const requestId = isValidRequestId(headerValue) ? headerValue : randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      customProps: (req: IncomingMessage) => ({
        service: SERVICE_NAME,
        env,
        traceparent: normalizeHeaderValue(req.headers.traceparent),
        tracestate: normalizeHeaderValue(req.headers.tracestate),
      }),
      autoLogging: {
        ignore: (req: IncomingMessage) => isHealthPath(req.url),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
          'req.body.password',
          'req.body.token',
          'req.body.accessToken',
          'req.body.refreshToken',
        ],
        censor: '[Redacted]',
      },
    },
  };
}

export function providePinoLoggerModule() {
  return PinoLoggerModule.forRoot(buildPinoLoggerParams());
}
