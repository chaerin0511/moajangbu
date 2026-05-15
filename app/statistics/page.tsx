import { listTransactions, listCategories } from '@/lib/queries';
import { deleteTransaction } from '@/lib/actions';
import { formatWon } from '@/lib/utils';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const categories = await listCategories();
  const txs = await listTransactions(searchParams as any);
  const filterLedger = searchParams.ledger || '';
  const filterType = searchParams.type || '';
  const filterMonth = searchParams.month || '';
  const filterCat = searchParams.category_id || '';
  const filterFixed = searchParams.fixed || '';
  const filterSort = searchParams.sort || 'date_desc';

  const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-3">
        <h1>통계 · 조회</h1>
        <span className="text-sm text-slate-500">{txs.length}건 조회됨</span>
      </div>

      <form className="card p-3 flex flex-wrap gap-2 text-sm items-center">
        <select name="ledger" defaultValue={filterLedger} className="select">
          <option value="">전체 장부</option><option value="personal">개인</option><option value="business">사업자</option>
        </select>
        <select name="type" defaultValue={filterType} className="select">
          <option value="">전체 유형</option><option value="income">수입</option><option value="expense">지출</option><option value="transfer">이체</option>
        </select>
        <input type="month" name="month" defaultValue={filterMonth} className="input" />
        <select name="category_id" defaultValue={filterCat} className="select">
          <option value="">전체 카테고리</option>
          {categories.map(c => <option key={c.id} value={c.id}>[{c.ledger === 'personal' ? '개' : '사'}] {c.name}</option>)}
        </select>
        <select name="fixed" defaultValue={filterFixed} className="select">
          <option value="">고정/변동 전체</option>
          <option value="fixed">고정만</option>
          <option value="variable">변동만</option>
        </select>
        <select name="sort" defaultValue={filterSort} className="select">
          <option value="date_desc">최신순</option>
          <option value="date_asc">오래된순</option>
          <option value="amount_desc">금액 많은순</option>
          <option value="amount_asc">금액 적은순</option>
        </select>
        <button className="btn-primary">필터</button>
        <Link href="/statistics" className="btn-ghost">초기화</Link>
      </form>

      <section className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="label">조회된 수입</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(totalIncome)}</div>
        </div>
        <div className="card p-4">
          <div className="label">조회된 지출</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(totalExpense)}</div>
        </div>
        <div className="card p-4">
          <div className="label">차액</div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${(totalIncome - totalExpense) < 0 ? 'text-rose-600' : ''}`}>
            {formatWon(totalIncome - totalExpense)}
          </div>
        </div>
      </section>

      <div className="card overflow-hidden">
        <table className="pretty">
          <thead>
            <tr><th>날짜</th><th>장부</th><th>유형</th><th>카테고리</th><th>사람</th><th>메모</th><th className="text-right">금액</th><th></th></tr>
          </thead>
          <tbody>
            {txs.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-400">조회된 거래가 없습니다.</td></tr>}
            {txs.map(t => (
              <tr key={t.id}>
                <td className="text-slate-600 tabular-nums">{t.date}</td>
                <td>
                  <span className={`chip ${(t.ledger === 'personal' || t.from_ledger === 'personal') ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                    {t.type === 'transfer'
                      ? `${t.from_ledger === 'personal' ? '개인' : '사업자'} → ${t.to_ledger === 'personal' ? '개인' : '사업자'}`
                      : (t.ledger === 'personal' ? '개인' : '사업자')}
                  </span>
                </td>
                <td>
                  <span className={`chip ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : t.type === 'expense' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                    {t.type === 'income' ? '수입' : t.type === 'expense' ? '지출' : '이체'}
                  </span>
                  {(t as any).recurring_id && <span className="chip ml-1 bg-slate-100 text-slate-600">고정</span>}
                </td>
                <td>{t.category_name || '-'}</td>
                <td className="text-slate-700">{(t as any).person_name || '-'}</td>
                <td className="text-slate-500">{t.memo || ''}</td>
                <td className={`text-right tabular-nums font-medium ${t.type === 'income' ? 'text-emerald-600' : t.type === 'expense' ? 'text-rose-600' : 'text-slate-700'}`}>
                  {formatWon(t.amount)}
                </td>
                <td className="text-right">
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn-danger">삭제</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
