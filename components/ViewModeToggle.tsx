import { setViewMode } from '@/lib/actions';
import type { ViewMode } from '@/lib/view-mode';

const OPTIONS: { value: ViewMode; label: string; chip: string }[] = [
  { value: 'all', label: '전체', chip: 'text-slate-700' },
  { value: 'personal', label: '개인', chip: 'text-indigo-700' },
  { value: 'business', label: '사업자', chip: 'text-amber-700' },
];

export default function ViewModeToggle({ current }: { current: ViewMode }) {
  return (
    <form action={setViewMode} className="inline-flex bg-slate-100 rounded-full p-0.5 text-xs">
      {OPTIONS.map(o => (
        <button
          key={o.value}
          type="submit"
          name="mode"
          value={o.value}
          className={`px-3 py-1.5 rounded-full font-medium transition ${
            current === o.value ? `bg-white shadow-sm ${o.chip}` : 'text-slate-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </form>
  );
}
