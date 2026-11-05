import { pino, type Logger } from 'pino';

/** Felder, die nie im Klartext geloggt werden. */
export const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'apiKey',
  '*.apiKey',
  'authorization',
  '*.authorization',
  'headers.cookie',
  'req.headers.cookie',
  'req.headers.authorization',
];

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: process.env.ONYX_SERVICE ?? 'onyx' },
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type { Logger };
