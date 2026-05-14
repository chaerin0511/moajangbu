import { listTransactions, listCategories } from '@/lib/queries';
import { createTransaction, deleteTransaction } from '@/lib/actions';
import { formatWon } from '@/lib/utils';
import TransactionForm from '@/components/TransactionForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const categories = listCategories();
  const txs = listTransactions(searchParams as any);
  const filterLedger = searchParams.ledger || '';
  const filterType = searchParams.type || '';
  const filterMonth = searchParams.month || '';
  const filterCat = searchParams.category_id || '';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">거래내역</h1>

      <TransactionForm categories={categories} action={createTransaction} submitLabel="추가" />

      <form className="flex flex-wrap gap-2 bg-white border border-slate-200 rounded p-3 text-sm">
        <select name="ledger" defaultValue={filterLedger} className="border rounded p-1.5">
          <option value="">전체 장부</option><option value="personal">개인</option><option value="business">사업자</option>
        </select>
        <select name="type" defaultValue={filterType} className="border rounded p-1.5">
          <option value="">전체 유형</option><option value="income">수입</option><option value="expense">지출</option><option value="transfer">이체</option>
        </select>
        <input type="month" name="month" defaultValue={filterMonth} className="border rounded p-1.5" />
        <select name="category_id" defaultValue={filterCat} className="border rounded p-1.5">
          <option value="">전체 카테고리</option>
          {categories.map(c => <option key={c.id} value={c.id}>[{c.ledger === 'personal' ? '개' : '사'}] {c.name}</option>)}
        </select>
        <button className="bg-slate-900 text-white rounded px-3 py-1.5">필터</button>
        <Link href="/transactions" className="text-slate-500 self-center">초기화</Link>
      </form>

      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="p-2">날짜</th><th>장부</th><th>유형</th><th>카테고리</th><th>메모</th><th className="text-right">금액</th><th></th></tr>
          </thead>
          <tbody>
            {txs.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">거래 내역이 없습니다.</td></tr>}
            {txs.map(t => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.date}</td>
                <td>{t.type === 'transfer' ? `${t.from_ledger === 'personal' ? '개인' : '사업자'} → ${t.to_ledger === 'personal' ? '개인' : '사업자'}` : (t.ledger === 'personal' ? '개인' : '사업자')}</td>
                <td>{t.type === 'income' ? '수입' : t.type === 'expense' ? '지출' : '이체'}</td>
                <td>{t.category_name || '-'}</td>
                <td className="text-slate-600">{t.memo || ''}</td>
                <td className={`text-right ${t.type === 'income' ? 'text-emerald-600' : t.type === 'expense' ? 'text-rose-600' : 'text-slate-700'}`}>{formatWon(t.amount)}</td>
                <td>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-rose-600 hover:underline px-2">삭제</button>
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
