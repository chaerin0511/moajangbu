import Link from 'next/link';
import { auth, signOut } from '@/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: '더보기' };

const items = [
  { href: '/recurring', label: '고정거래', desc: '매월 자동 반복' },
  { href: '/budgets', label: '예산', desc: '카테고리별 한도' },
  { href: '/categories', label: '카테고리', desc: '수입·지출 분류' },
  { href: '/people', label: '가족·관계인', desc: '거래 상대 관리' },
  { href: '/settings', label: '설정', desc: '시작 잔액·세금 충당금' },
  { href: '/profile', label: '프로필', desc: '내 정보·회원탈퇴' },
];

export default async function MorePage() {
  const session = await auth();
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
        {items.map(it => (
          <Link key={it.href} href={it.href} className="flex items-center px-4 py-3.5 active:bg-slate-50">
            <div className="flex-1">
              <div className="font-medium text-[15px]">{it.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{it.desc}</div>
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
