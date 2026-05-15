import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import NavLink from '@/components/NavLink';
import BottomTabs from '@/components/BottomTabs';
import { auth, signOut } from '@/auth';
import { ALL_NAV_ITEMS, parseNavOrder, navLabel, navIcon } from '@/lib/nav-items';
import ViewModeToggle from '@/components/ViewModeToggle';
import { getViewMode } from '@/lib/view-mode';

export const metadata: Metadata = {
  title: { default: '모아장부 · 가계와 사업을 한곳에', template: '%s · 모아장부' },
  description: '개인·사업자 통합 가계부 — 저축률, 비상금, 세금 충당금까지 한눈에',
  applicationName: '모아장부',
  appleWebApp: { capable: true, title: '모아장부', statusBarStyle: 'default' },
  openGraph: {
    title: '모아장부',
    description: '개인·사업자 통합 가계부',
    locale: 'ko_KR',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2c9a6a',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // JWT 세션에서 직접 읽음 — DB 왕복 제거. 프로필/네비 변경 시 JWT가 trigger:'update'로 갱신됨.
  const displayName: string | null = session?.user?.name || null;
  const displayImage: string | null = session?.user?.image || null;
  const navOrderRaw: string | null = (session as any)?.navOrder || null;
  const initial = String(displayName || '?').charAt(0);
  const viewMode = getViewMode();
  const navOrder = parseNavOrder(navOrderRaw);
  const allowed = new Set(ALL_NAV_ITEMS.map(i => i.href));
  const mainItems = navOrder.filter(h => allowed.has(h));
  const mobileItems = [
    ...mainItems.slice(0, 4).map(href => ({ href, label: navLabel(href), icon: navIcon(href) })),
    { href: '/more', label: '더보기', icon: navIcon('/more') },
  ];

  return (
    <html lang="ko">
      <body>
        {session && (
          <>
            {/* 모바일 헤더 — 로고 + 아바타 + 모드 토글 */}
            <header className="sm:hidden sticky top-0 z-20 bg-white border-b border-slate-200">
              <div className="px-4 h-14 flex items-center justify-between">
                <Link href="/" className="font-semibold text-[16px] flex items-center gap-2.5 shrink-0">
                  <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
                    <circle cx="18" cy="18" r="16" fill="#2c9a6a" />
                    <circle cx="18" cy="18" r="11.5" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
                    <path d="M11.5 18.5 L16 23 L24.5 13.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  모아장부
                </Link>
                <Link href="/profile" className="flex items-center shrink-0">
                  {displayImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayImage} alt="" className="w-9 h-9 rounded-full" />
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-base font-medium text-slate-600">
                      {initial}
                    </span>
                  )}
                </Link>
              </div>
              <div className="px-4 pb-2 flex justify-center">
                <ViewModeToggle current={viewMode} />
              </div>
            </header>

            {/* 데스크탑 헤더 — 가로 메뉴 */}
            <nav className="hidden sm:block sticky top-0 z-20 bg-white border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-4 lg:gap-6">
                <Link href="/" className="font-semibold text-[16px] flex items-center gap-2.5 shrink-0">
                  <svg width="40" height="40" viewBox="0 0 36 36" aria-hidden>
                    <circle cx="18" cy="18" r="16" fill="#2c9a6a" />
                    <circle cx="18" cy="18" r="11.5" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
                    <path d="M11.5 18.5 L16 23 L24.5 13.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  모아장부
                </Link>
                <div className="flex gap-0.5 flex-1 min-w-0">
                  {mainItems.map(h => (
                    <NavLink key={h} href={h}>{navLabel(h)}</NavLink>
                  ))}
                  <NavLink href="/more">더보기</NavLink>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <ViewModeToggle current={viewMode} />
                  <Link href="/profile" className="flex items-center gap-2.5 hover:opacity-80">
                    {displayImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayImage} alt="" className="w-10 h-10 rounded-full" />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-base font-medium text-slate-600">
                        {initial}
                      </span>
                    )}
                    <span className="text-[15px] font-medium text-slate-700">{displayName}</span>
                  </Link>
                  <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}>
                    <button className="text-sm text-slate-500 hover:text-slate-700">로그아웃</button>
                  </form>
                </div>
              </div>
            </nav>
          </>
        )}

        <main className="max-w-6xl mx-auto px-4 sm:px-5 py-5 sm:py-8 pb-20 sm:pb-8">{children}</main>

        {session && <BottomTabs items={mobileItems} />}
      </body>
    </html>
  );
}
