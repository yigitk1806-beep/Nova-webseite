import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { can } from '@onyx/tenancy';
import { TenantSettingsForm } from '@/components/simple-forms';
import { PageHeader } from '@/components/tenant/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';
import { updateTenantAction } from '../actions';

export const metadata: Metadata = { title: 'Einstellungen' };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'tenant:update')) notFound();

  return (
    <>
      <PageHeader title="Einstellungen" />
      <Card>
        <CardHeader
          title="Unternehmen"
          description={`Adresse: /t/${access.tenantSlug} (nicht änderbar)`}
        />
        <TenantSettingsForm action={updateTenantAction.bind(null, slug)} name={access.tenantName} />
      </Card>
    </>
  );
}
