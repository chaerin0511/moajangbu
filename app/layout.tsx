import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '가계부', description: '개인 · 사업자 통합 가계부' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-50 text-slate-900 min-h-screen">
        <nav className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg">가계부</Link>
            <div className="flex gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-slate-900">대시보드</Link>
              <Link href="/transactions" className="hover:text-slate-900">거래내역</Link>
              <Link href="/recurring" className="hover:text-slate-900">고정거래</Link>
              <Link href="/budgets" className="hover:text-slate-900">예산</Link>
              <Link href="/categories" className="hover:text-slate-900">카테고리</Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
