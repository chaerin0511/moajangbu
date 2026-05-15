import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { ensureDb } from '@/lib/db';
import { ALL_NAV_ITEMS, parseNavOrder } from '@/lib/nav-items';

export const dynamic = 'force-dynamic';
export const metadata = { title: '더보기' };

const DESCRIPTIONS: Record<string, string> = {
  '/': '메인 대시보드',
  '/transactions': '거래 내역',
  '/statistics': '저축률·수입·지출 통계',
  '/investments': '주식·ETF·암호화폐',
  '/debts': '대출·부채 현황',
  '/sales': '사업자 매출·부가세',
  '/recurring': '매월 자동 반복',
  '/budgets': '카테고리별 한도',
  '/categories': '수입·지출 분류',
  '/people': '거래 상대 관리',
  '/settings': '시작 잔액·세금 충당금',
};

export default async function MorePage() {
  const session = await auth();
  let navOrderRaw: string | null = null;
  if (session && (session as any).userId) {
    try {
      const db = await ensureDb();
      const r = await db.execute({ sql: 'SELECT nav_order FROM users WHERE id=?', args: [Number((session as any).userId)] });
      navOrderRaw = (r.rows[0] as any)?.nav_order || null;
    } catch { /* ignore */ }
  }
  const order = parseNavOrder(navOrderRaw);
  const inMain = new Set(order);
  const hidden = ALL_NAV_ITEMS.filter(i => !inMain.has(i.href));

  const extraItems = [
    ...hidden,
    { href: '/profile', label: '프로필' },
    { href: '/settings/nav', label: '메뉴 순서 편집' },
  ];

  return (
    <div className="space-y-5 pb-8">
      <h1>더보기</h1>

      {session?.user && (
        <Link href="/profile" className="card p-4 flex items-center gap-3 active:bg-slate-50">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.user.image} alt="" className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-lg text-slate-500">
              {String(session.user.name || '?').charAt(0)}
            </div>
          )}
          <div className="flex-1">
            <div className="font-semibold">{session.user.name}</div>
            <div className="text-xs text-slate-500">{session.user.email || '내 프로필'}</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400"><polyline points="9 18 15 12 9 6"/></svg>
        </Link>
      )}

      <div className="card divide-y divide-slate-100 overflow-hidden">
        {extraItems.map(it => (
          <Link key={it.href} href={it.href} className="flex items-center px-4 py-3.5 active:bg-slate-50">
            <div className="flex-1">
              <div className="font-medium text-[15px]">{it.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{DESCRIPTIONS[it.href] || ''}</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        ))}
      </div>

      <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}>
        <button className="w-full card p-4 text-rose-600 font-medium active:bg-rose-50">로그아웃</button>
      </form>
    </div>
  );
}
