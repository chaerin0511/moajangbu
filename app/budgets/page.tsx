import { listBudgets, listCategories } from '@/lib/queries';
import { upsertBudget, deleteBudget } from '@/lib/actions';
import { currentMonth, formatWon } from '@/lib/utils';
import BudgetForm from '@/components/BudgetForm';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const month = searchParams.month || currentMonth();
  const categories = listCategories();
  const budgets = listBudgets(month);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">예산</h1>
      <form className="bg-white border border-slate-200 rounded p-3 flex gap-2 items-end text-sm">
        <label className="flex flex-col text-xs">월
          <input type="month" name="month" defaultValue={month} className="border rounded p-1.5" />
        </label>
        <button className="bg-slate-900 text-white rounded px-3 py-1.5">조회</button>
      </form>
      <BudgetForm categories={categories} month={month} action={upsertBudget} />
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="p-2">장부</th><th>카테고리</th><th>월</th><th className="text-right">예산</th><th className="text-right">지출</th><th>진행</th><th></th></tr>
          </thead>
          <tbody>
            {budgets.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">예산이 없습니다.</td></tr>}
            {budgets.map(b => {
              const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
              const color = pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <tr key={b.id} className="border-t">
                  <td className="p-2">{b.ledger === 'personal' ? '개인' : '사업자'}</td>
                  <td>{b.category_name}</td>
                  <td>{b.month}</td>
                  <td className="text-right">{formatWon(b.amount)}</td>
                  <td className={`text-right ${pct > 100 ? 'text-rose-600' : pct > 80 ? 'text-amber-600' : ''}`}>{formatWon(b.spent)}</td>
                  <td className="w-40">
                    <div className="w-full h-2 bg-slate-100 rounded overflow-hidden">
                      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{pct.toFixed(0)}%</div>
                  </td>
                  <td>
                    <form action={deleteBudget}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs text-rose-600 hover:underline px-2">삭제</button>
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
