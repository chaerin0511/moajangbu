'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: '홈', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  ) },
  { href: '/transactions', label: '거래', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
  ) },
  { href: '/statistics', label: '통계', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  ) },
  { href: '/debts', label: '대출', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
  ) },
  { href: '/more', label: '더보기', icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  ) },
];

export default function BottomTabs() {
  const path = usePathname();
  const isActive = (href: string) => href === '/' ? path === '/' : path.startsWith(href);
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 h-14">
        {tabs.map(t => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-[#3182f6]' : 'text-slate-500'}`}
            >
              {t.icon}
              <span>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
