'use server';
import { redirect } from 'next/navigation';
import { acceptInvitation } from '@onyx/tenancy';
import { getRequestMeta, requireUser, runAction, type ActionResult } from '@/lib/server';

export async function acceptInvitationAction(
  token: string,
  _prev: ActionResult<{ slug: string }> | null,
) {
  const user = await requireUser();
  const result = await runAction(async () => {
    const tenant = await acceptInvitation(
      { id: user.id, email: user.email, emailVerified: user.emailVerified },
      token,
      await getRequestMeta(),
    );
    return { slug: tenant.slug };
  });
  if (result.ok) redirect(`/t/${result.data.slug}`);
  return result;
}
