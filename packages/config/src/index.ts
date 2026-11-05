import { z } from 'zod';

/**
 * Zentrale, validierte Server-Konfiguration.
 * Fehlende oder ungültige Werte führen zu einem Startfehler – nie zu stillen Defaults
 * für sicherheitsrelevante Werte.
 */
const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET muss mindestens 32 Zeichen haben'),
    APP_URL: z.url(),
    SMTP_URL: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined)),
    MAIL_FROM: z.string().default('ONYX <no-reply@example.com>'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL ist in Produktion Pflicht (E-Mail-Verifikation, Einladungen).',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Ungültige Umgebungskonfiguration:\n${issues}`);
  }
  return result.data;
}

/** Lazily validiert, damit Build-Schritte ohne Laufzeit-Secrets möglich bleiben. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
