import type { ReactElement } from 'react';
import { createElement } from 'react';

export type NavItem = { href: string; label: string };

export const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/',             label: '대시보드' },
  { href: '/transactions', label: '거래' },
  { href: '/statistics',   label: '통계' },
  { href: '/investments',  label: '투자' },
  { href: '/debts',        label: '대출' },
  { href: '/sales',        label: '매출' },
  { href: '/budgets',      label: '예산' },
  { href: '/recurring',    label: '고정거래' },
  { href: '/categories',   label: '카테고리' },
  { href: '/people',       label: '가족' },
  { href: '/settings',     label: '설정' },
];

export const DEFAULT_NAV_ORDER = ['/','/transactions','/statistics','/investments','/debts'];

export function navLabel(href: string): string {
  return ALL_NAV_ITEMS.find(i => i.href === href)?.label || href;
}

const svgProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export function navIcon(href: string): ReactElement {
  const svg = (children: ReactElement | ReactElement[]) => createElement('svg', svgProps, children);
  switch (href) {
    case '/':
      return svg([
        createElement('path', { key: 'a', d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
        createElement('polyline', { key: 'b', points: '9 22 9 12 15 12 15 22' }),
      ]);
    case '/transactions':
      return svg([
        createElement('path', { key: 'a', d: 'M12 5v14' }),
        createElement('path', { key: 'b', d: 'M5 12h14' }),
      ]);
    case '/statistics':
      return svg([
        createElement('line', { key: 'a', x1: 12, y1: 20, x2: 12, y2: 10 }),
        createElement('line', { key: 'b', x1: 18, y1: 20, x2: 18, y2: 4 }),
        createElement('line', { key: 'c', x1: 6, y1: 20, x2: 6, y2: 14 }),
      ]);
    case '/investments':
      return svg([
        createElement('polyline', { key: 'a', points: '23 6 13.5 15.5 8.5 10.5 1 18' }),
        createElement('polyline', { key: 'b', points: '17 6 23 6 23 12' }),
      ]);
    case '/debts':
      return svg([
        createElement('rect', { key: 'a', x: 2, y: 6, width: 20, height: 12, rx: 2 }),
        createElement('circle', { key: 'b', cx: 12, cy: 12, r: 2 }),
        createElement('path', { key: 'c', d: 'M6 12h.01M18 12h.01' }),
      ]);
    case '/sales':
      return svg([
        createElement('path', { key: 'a', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
        createElement('path', { key: 'b', d: 'M14 2v6h6' }),
        createElement('path', { key: 'c', d: 'M16 13H8' }),
        createElement('path', { key: 'd', d: 'M16 17H8' }),
        createElement('path', { key: 'e', d: 'M10 9H8' }),
      ]);
    case '/budgets':
      return svg([
        createElement('circle', { key: 'a', cx: 12, cy: 12, r: 10 }),
        createElement('circle', { key: 'b', cx: 12, cy: 12, r: 6 }),
        createElement('circle', { key: 'c', cx: 12, cy: 12, r: 2 }),
      ]);
    case '/recurring':
      return svg([
        createElement('polyline', { key: 'a', points: '23 4 23 10 17 10' }),
        createElement('polyline', { key: 'b', points: '1 20 1 14 7 14' }),
        createElement('path', { key: 'c', d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }),
      ]);
    case '/categories':
      return svg([
        createElement('path', { key: 'a', d: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z' }),
        createElement('line', { key: 'b', x1: 7, y1: 7, x2: 7.01, y2: 7 }),
      ]);
    case '/people':
      return svg([
        createElement('path', { key: 'a', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
        createElement('circle', { key: 'b', cx: 9, cy: 7, r: 4 }),
        createElement('path', { key: 'c', d: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' }),
      ]);
    case '/settings':
      return svg([
        createElement('circle', { key: 'a', cx: 12, cy: 12, r: 3 }),
        createElement('path', { key: 'b', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }),
      ]);
    case '/more':
      return svg([
        createElement('line', { key: 'a', x1: 3, y1: 6, x2: 21, y2: 6 }),
        createElement('line', { key: 'b', x1: 3, y1: 12, x2: 21, y2: 12 }),
        createElement('line', { key: 'c', x1: 3, y1: 18, x2: 21, y2: 18 }),
      ]);
    default:
      return svg(createElement('circle', { cx: 12, cy: 12, r: 2 }));
  }
}

export function parseNavOrder(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_NAV_ORDER];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_NAV_ORDER];
    const allowed = new Set(ALL_NAV_ITEMS.map(i => i.href));
    return parsed.filter((s: any) => typeof s === 'string' && allowed.has(s));
  } catch { return [...DEFAULT_NAV_ORDER]; }
}
