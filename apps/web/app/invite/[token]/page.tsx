import type { Metadata } from 'next';
import { NotFoundError } from '@onyx/core';
import { previewInvitation } from '@onyx/tenancy';
import { SubmitOnlyForm } from '@/components/simple-forms';
import { Logo } from '@/components/logo';
import { Alert, Card } from '@/components/ui/card';
import { requireUser } from '@/lib/server';
import { acceptInvitationAction } from './actions';

export const metadata: Metadata = { title: 'Einladung' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();
  const preview = await previewInvitation(user.id, token).catch((e: unknown) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Logo />
      <Card className="mt-8">
        {!preview ? (
          <Alert>Diese Einladung ist ungültig.</Alert>
        ) : preview.expired ? (
          <Alert>Diese Einladung ist abgelaufen oder wurde bereits verwendet.</Alert>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Einladung zu {preview.tenantName}</h1>
            <p className="mt-2 text-sm text-muted">
              Rolle: {preview.roleName}. Die Einladung gilt für{' '}
              <strong className="text-text">{preview.email}</strong>.
            </p>
            {preview.email.toLowerCase() !== user.email.toLowerCase() ? (
              <div className="mt-4">
                <Alert>
                  Du bist als {user.email} angemeldet. Bitte melde dich mit der eingeladenen Adresse
                  an.
                </Alert>
              </div>
            ) : (
              <SubmitOnlyForm
                action={acceptInvitationAction.bind(null, token)}
                label="Einladung annehmen"
                className="mt-6 space-y-4"
              />
            )}
          </>
        )}
      </Card>
    </main>
  );
}
