'use client';
import { MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/logo';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <Link href="/" className="mb-8 inline-block">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </motion.div>
      </main>
    </MotionConfig>
  );
}
