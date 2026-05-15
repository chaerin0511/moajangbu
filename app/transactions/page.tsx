import { recentTransactions, listCategories, listPeople } from '@/lib/queries';
import { createTransaction, createTransactionsBulk, deleteTransaction } from '@/lib/actions';
import { formatWon } from '@/lib/utils';
import TransactionForm from '@/components/TransactionForm';
import BulkTransactionForm from '@/components/BulkTransactionForm';
import Disclosure from '@/components/Disclosure';
import ConfirmButton from '@/components/ConfirmButton';
import Link from 'next/link';
import { currentUserId } from '@/lib/auth-helper';
import { getViewMode } from '@/lib/view-mode';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const userId = await currentUserId();
  const view = getViewMode();
  const ledger = view !== 'all' ? view : undefined;
  const [categories, people, recent] = await Promise.all([
    listCategories(userId, ledger),
    listPeople(userId),
    recentTransactions(userId, 20, ledger),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1>거래 입력</h1>
          <Link href="/statistics" className="text-sm text-[#3182f6] hover:underline">조회·통계로 가기 →</Link>
        </div>
        <Disclosure openLabel="＋ 단건 입력 (이체 등)" closeLabel="− 단건 입력 닫기">
          <TransactionForm categories={categories} people={people} action={createTransaction} submitLabel="단건 추가" />
        </Disclosure>
      </div>

      <BulkTransactionForm categories={categories} people={people} action={createTransactionsBulk} />

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2>최근 거래 20건</h2>
          <Link href="/statistics" className="text-sm text-slate-500 hover:text-slate-900">전체 조회 →</Link>
        </div>
        <div className="card overflow-hidden">
          <table className="pretty">
            <thead>
              <tr><th>날짜</th><th>장부</th><th>유형</th><th>카테고리</th><th>사람</th><th>메모</th><th className="text-right">금액</th><th></th></tr>
            </thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-400">거래 내역이 없습니다.</td></tr>}
              {recent.map(t => (
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
                      <ConfirmButton message="이 거래를 삭제할까요?" className="btn-danger">삭제</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
