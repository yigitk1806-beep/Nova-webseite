import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { serverEnv } from '@onyx/config';
import { getPrisma } from '@onyx/db';
import { sendMail } from './mail';

// OWASP-Empfehlung für argon2id (19 MiB, 2 Iterationen, Parallelität 1)
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

function createAuth() {
  const env = serverEnv();
  return betterAuth({
    appName: 'ONYX',
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(getPrisma(), { provider: 'postgresql' }),
    telemetry: { enabled: false },
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'ONYX – Passwort zurücksetzen',
          text: `Hallo ${user.name},\n\nüber diesen Link kannst du dein Passwort zurücksetzen:\n${url}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'ONYX – E-Mail-Adresse bestätigen',
          text: `Hallo ${user.name},\n\nbitte bestätige deine E-Mail-Adresse:\n${url}\n\nDer Link ist 1 Stunde gültig.`,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true, window: 60, max: 100 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __onyxAuth?: Auth };

/** Lazy, damit `next build` ohne Laufzeit-Secrets funktioniert. */
export function getAuth(): Auth {
  g.__onyxAuth ??= createAuth();
  return g.__onyxAuth;
}
