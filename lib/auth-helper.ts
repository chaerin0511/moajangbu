import { auth } from '@/auth';

export async function currentUserId(): Promise<number> {
  const session = await auth();
  const id = (session as any)?.userId;
  if (!id) throw new Error('Not authenticated');
  return Number(id);
}
