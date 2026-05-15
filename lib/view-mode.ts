import { cookies } from 'next/headers';

export type ViewMode = 'all' | 'personal' | 'business';

const COOKIE = 'ledger_view';

export function getViewMode(): ViewMode {
  const v = cookies().get(COOKIE)?.value;
  if (v === 'personal' || v === 'business' || v === 'all') return v;
  return 'all';
}
