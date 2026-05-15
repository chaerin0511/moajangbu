import { setViewMode } from '@/lib/actions';
import type { ViewMode } from '@/lib/view-mode';

const OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'personal', label: '개인' },
  { value: 'business', label: '사업자' },
];

export default function ViewModeToggle({ current }: { current: ViewMode }) {
  return (
    <form action={setViewMode} className="inline-flex bg-slate-100 rounded-full p-0.5 text-xs">
      {OPTIONS.map(o => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="submit"
            name="mode"
            value={o.value}
            className={`px-3 py-1.5 rounded-full font-semibold transition ${
              active ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
            style={active ? { background: 'var(--primary)' } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </form>
  );
}
