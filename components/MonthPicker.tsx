'use client';
import { useEffect, useRef, useState } from 'react';

function parse(v: string): { y: number; m: number } {
  const [y, m] = v.split('-').map(Number);
  return { y: y || new Date().getFullYear(), m: m || new Date().getMonth() + 1 };
}
function fmt(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}
function shift(value: string, delta: number): string {
  const { y, m } = parse(value);
  const d = new Date(y, (m - 1) + delta, 1);
  return fmt(d.getFullYear(), d.getMonth() + 1);
}
function label(value: string): string {
  const { y, m } = parse(value);
  return `${y}년 ${m}월`;
}

export default function MonthPicker({ name = 'month', value }: { name?: string; value: string }) {
  const [current, setCurrent] = useState(value);
  const [open, setOpen] = useState(false);
  const [yearView, setYearView] = useState(() => parse(value).y);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setCurrent(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    setYearView(parse(current).y);
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, current]);

  const submit = () => { inputRef.current?.form?.requestSubmit(); };

  const apply = (next: string) => {
    setCurrent(next);
    if (inputRef.current) inputRef.current.value = next;
    setOpen(false);
    submit();
  };

  const selected = parse(current);
  const today = new Date();
  const thisY = today.getFullYear();
  const thisM = today.getMonth() + 1;

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 p-1 shadow-[0_1px_2px_rgba(25,31,40,0.04)]">
      <input ref={inputRef} type="hidden" name={name} value={current} readOnly />

      <button
        type="button"
        onClick={() => apply(shift(current, -1))}
        aria-label="이전 달"
        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="px-3 h-8 rounded-full text-sm font-semibold tabular-nums text-slate-900 hover:bg-slate-50"
      >
        {label(current)}
      </button>

      <button
        type="button"
        onClick={() => apply(shift(current, 1))}
        aria-label="다음 달"
        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-2 z-30 w-64 rounded-2xl bg-white border border-slate-200 shadow-xl p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setYearView(y => y - 1)}
              aria-label="이전 해"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span className="text-sm font-semibold tabular-nums">{yearView}년</span>
            <button
              type="button"
              onClick={() => setYearView(y => y + 1)}
              aria-label="다음 해"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const isSelected = yearView === selected.y && m === selected.m;
              const isToday = yearView === thisY && m === thisM;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => apply(fmt(yearView, m))}
                  className={
                    'h-9 rounded-lg text-sm font-medium tabular-nums transition ' +
                    (isSelected
                      ? 'bg-[var(--primary)] text-white'
                      : isToday
                        ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                        : 'text-slate-700 hover:bg-slate-100')
                  }
                >
                  {m}월
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setYearView(thisY)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              {thisY}년으로
            </button>
            <button
              type="button"
              onClick={() => apply(fmt(thisY, thisM))}
              className="text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              이번 달
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
