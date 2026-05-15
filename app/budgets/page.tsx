import { listBudgets, listCategories } from '@/lib/queries';
import { upsertBudget, deleteBudget } from '@/lib/actions';
import { currentMonth, formatWon } from '@/lib/utils';
import BudgetForm from '@/components/BudgetForm';
import { currentUserId } from '@/lib/auth-helper';
import { getViewMode } from '@/lib/view-mode';
import MonthPicker from '@/components/MonthPicker';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const userId = await currentUserId();
  const view = getViewMode();
  const month = searchParams.month || currentMonth();
  const categories = await listCategories(userId, view !== 'all' ? view : undefined);
  const allBudgets = await listBudgets(userId, month);
  const budgets = view === 'all' ? allBudgets : allBudgets.filter(b => b.ledger === view);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">예산</h1>
      <form>
        <MonthPicker value={month} />
      </form>
      <BudgetForm categories={categories} month={month} action={upsertBudget} />
      <div className="card overflow-hidden">
        <table className="pretty">
          <thead>
            <tr><th>장부</th><th>카테고리</th><th>월</th><th className="text-right">예산</th><th className="text-right">지출</th><th>진행</th><th></th></tr>
          </thead>
          <tbody>
            {budgets.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-slate-400">예산이 없습니다.</td></tr>}
            {budgets.map(b => {
              const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
              const color = pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <tr key={b.id}>
                  <td>
                    <span className={`chip ${b.ledger === 'personal' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                      {b.ledger === 'personal' ? '개인' : '사업자'}
                    </span>
                  </td>
                  <td>{b.category_name}</td>
                  <td className="text-slate-600">{b.month}</td>
                  <td className="text-right tabular-nums">{formatWon(b.amount)}</td>
                  <td className={`text-right tabular-nums ${pct > 100 ? 'text-rose-600 font-semibold' : pct > 80 ? 'text-amber-600' : ''}`}>{formatWon(b.spent)}</td>
                  <td className="w-48">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1 tabular-nums">{pct.toFixed(0)}%</div>
                  </td>
                  <td className="text-right">
                    <form action={deleteBudget}>
                      <input type="hidden" name="id" value={b.id} />
                      <ConfirmButton message="이 예산을 삭제할까요?" className="btn-danger px-2 py-1 text-xs">삭제</ConfirmButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
