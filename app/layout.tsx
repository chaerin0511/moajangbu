import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import NavLink from '@/components/NavLink';

export const metadata: Metadata = {
  title: { default: '모아장부 · 가계와 사업을 한곳에', template: '%s · 모아장부' },
  description: '개인·사업자 통합 가계부 — 저축률, 비상금, 세금 충당금까지 한눈에',
  applicationName: '모아장부',
  openGraph: {
    title: '모아장부',
    description: '개인·사업자 통합 가계부',
    locale: 'ko_KR',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <nav className="sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-5 h-12 flex items-center gap-6">
            <Link href="/" className="font-semibold text-sm flex items-center gap-2">
              <span className="relative inline-flex w-7 h-7 rounded-lg items-center justify-center text-white text-[14px] font-extrabold tracking-tighter"
                    style={{ background: 'linear-gradient(135deg, #4a98ff 0%, #3182f6 55%, #1b64da 100%)' }}>
                ₩
                <span className="absolute bottom-[3px] right-[3px] w-[5px] h-[5px] rounded-full bg-white/85" />
              </span>
              모아장부
            </Link>
            <div className="flex gap-1">
              <NavLink href="/">대시보드</NavLink>
              <NavLink href="/transactions">거래내역</NavLink>
              <NavLink href="/recurring">고정거래</NavLink>
              <NavLink href="/budgets">예산</NavLink>
              <NavLink href="/categories">카테고리</NavLink>
              <NavLink href="/people">가족</NavLink>
              <NavLink href="/settings">설정</NavLink>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
