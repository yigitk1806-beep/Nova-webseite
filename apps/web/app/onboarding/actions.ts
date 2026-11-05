'use server';
import { redirect } from 'next/navigation';
import { createTenant } from '@onyx/tenancy';
import { getRequestMeta, requireUser, runAction, type ActionResult } from '@/lib/server';

export async function createTenantAction(
  _prev: ActionResult<{ slug: string }> | null,
  formData: FormData,
) {
  const user = await requireUser();
  const result = await runAction(async () => {
    const tenant = await createTenant(
      user.id,
      { name: formData.get('name'), slug: formData.get('slug') },
      await getRequestMeta(),
    );
    return { slug: tenant.slug };
  });
  if (result.ok) redirect(`/t/${result.data.slug}`);
  return result;
}
