import { listRecurring, generateRecurring } from '@/lib/queries';
import { listCategories } from '@/lib/queries';
import { createRecurring, deleteRecurring, toggleRecurring } from '@/lib/actions';
import { formatWon, todayISO } from '@/lib/utils';
import RecurringForm from '@/components/RecurringForm';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function runGenerate() {
  'use server';
  generateRecurring();
  revalidatePath('/recurring');
  revalidatePath('/');
}

export default async function Page() {
  const rules = listRecurring();
  const categories = listCategories();
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">고정거래</h1>
        <form action={runGenerate}><button className="text-sm bg-slate-200 rounded px-3 py-1.5 hover:bg-slate-300">지금 생성</button></form>
      </div>
      <p className="text-sm text-slate-500">규칙을 추가하면 시작일부터 이번 달까지 자동으로 거래가 생성됩니다 (중복 방지).</p>
      <RecurringForm categories={categories} action={createRecurring} defaultDate={todayISO()} />
      <div className="bg-white border border-slate-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="p-2">상태</th><th>장부</th><th>유형</th><th>카테고리</th><th>매월</th><th>시작일</th><th>메모</th><th className="text-right">금액</th><th></th></tr>
          </thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-slate-500">규칙이 없습니다.</td></tr>}
            {rules.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <form action={toggleRecurring}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className={`text-xs rounded px-2 py-0.5 ${r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{r.active ? '활성' : '중지'}</button>
                  </form>
                </td>
                <td>{r.type === 'transfer' ? `${r.from_ledger === 'personal' ? '개인' : '사업자'}→${r.to_ledger === 'personal' ? '개인' : '사업자'}` : (r.ledger === 'personal' ? '개인' : '사업자')}</td>
                <td>{r.type === 'income' ? '수입' : r.type === 'expense' ? '지출' : '이체'}</td>
                <td>{r.category_name || '-'}</td>
                <td>{r.day_of_month}일</td>
                <td>{r.start_date}</td>
                <td className="text-slate-600">{r.memo || ''}</td>
                <td className="text-right">{formatWon(r.amount)}</td>
                <td>
                  <form action={deleteRecurring}>
                    <input type="hidden" name="id" value={r.id} />
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
