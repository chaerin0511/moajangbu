import type { ReactNode } from 'react';

type Tone = 'blue' | 'indigo' | 'amber' | 'rose' | 'emerald' | 'violet' | 'slate';

const TONE_BG: Record<Tone, string> = {
  blue: 'bg-[var(--primary-soft)] text-[var(--primary)]',
  indigo: 'bg-indigo-100 text-indigo-600',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  violet: 'bg-violet-100 text-violet-600',
  slate: 'bg-slate-100 text-slate-600',
};

export default function SectionHeader({
  icon, title, tone = 'blue', right,
}: { icon: ReactNode; title: string; tone?: Tone; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TONE_BG[tone]}`}>
          {icon}
        </span>
        <span>{title}</span>
      </h2>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const Icon = {
  wallet: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7H7a2 2 0 0 1 0-4h14"/>
      <circle cx="17" cy="13" r="1.2"/>
    </svg>
  ),
  receipt: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3z"/>
      <path d="M8 9h8M8 13h8"/>
    </svg>
  ),
  card: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M3 10h18M7 15h3"/>
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3l10 18H2z"/>
      <path d="M12 10v4M12 17v.5"/>
    </svg>
  ),
  repeat: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 19V5M4 19h16"/>
      <rect x="8" y="11" width="3" height="6"/>
      <rect x="13" y="7" width="3" height="10"/>
    </svg>
  ),
  trending: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <polyline points="3 17 9 11 13 15 21 7"/>
      <polyline points="15 7 21 7 21 13"/>
    </svg>
  ),
  book: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 4h11a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/>
      <path d="M4 16a4 4 0 0 1 4-4h11"/>
    </svg>
  ),
  target: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    </svg>
  ),
  list: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M8 6h13M8 12h13M8 18h13"/>
      <circle cx="4" cy="6" r="1" fill="currentColor"/>
      <circle cx="4" cy="12" r="1" fill="currentColor"/>
      <circle cx="4" cy="18" r="1" fill="currentColor"/>
    </svg>
  ),
};
