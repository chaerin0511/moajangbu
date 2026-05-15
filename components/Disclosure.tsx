'use client';
import { useState, useEffect, useRef, ReactNode } from 'react';

export default function Disclosure({
  openLabel = '＋ 열기',
  closeLabel = '− 닫기',
  children,
}: {
  openLabel?: string;
  closeLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="btn-ghost">
        {open ? closeLabel : openLabel}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-[min(960px,calc(100vw-2.5rem))]">
          {children}
        </div>
      )}
    </div>
  );
}
