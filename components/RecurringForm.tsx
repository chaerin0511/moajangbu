'use client';
import { useState } from 'react';
import { Category } from '@/lib/db';

export default function RecurringForm({ categories, action, defaultDate }: {
  categories: Category[]; action: (fd: FormData) => void; defaultDate: string;
}) {
  const [type, setType] = useState('expense');
  const [ledger, setLedger] = useState('personal');
  const cats = categories.filter(c => c.ledger === ledger);
  return (
    <form action={action} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end bg-white border border-slate-200 rounded p-3">
      <label className="text-xs flex flex-col">유형
        <select name="type" value={type} onChange={e => setType(e.target.value)} className="border rounded p-1.5">
          <option value="income">수입</option><option value="expense">지출</option><option value="transfer">이체</option>
        </select>
      </label>
      {type !== 'transfer' ? (
        <label className="text-xs flex flex-col">장부
          <select name="ledger" value={ledger} onChange={e => setLedger(e.target.value)} className="border rounded p-1.5">
            <option value="personal">개인</option><option value="business">사업자</option>
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name="ledger" value={ledger} />
          <label className="text-xs flex flex-col">출발
            <select name="from_ledger" defaultValue="business" className="border rounded p-1.5">
              <option value="personal">개인</option><option value="business">사업자</option>
            </select>
          </label>
          <label className="text-xs flex flex-col">도착
            <select name="to_ledger" defaultValue="personal" className="border rounded p-1.5">
              <option value="personal">개인</option><option value="business">사업자</option>
            </select>
          </label>
        </>
      )}
      {type !== 'transfer' && (
        <label className="text-xs flex flex-col">카테고리
          <select name="category_id" className="border rounded p-1.5">
            <option value="">(선택)</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="text-xs flex flex-col">매월 (일)
        <input type="number" name="day_of_month" min="1" max="31" defaultValue="1" required className="border rounded p-1.5" />
      </label>
      <label className="text-xs flex flex-col">시작일
        <input type="date" name="start_date" defaultValue={defaultDate} required className="border rounded p-1.5" />
      </label>
      <label className="text-xs flex flex-col">금액(원)
        <input type="number" name="amount" min="0" required className="border rounded p-1.5" />
      </label>
      <label className="text-xs flex flex-col md:col-span-2">메모
        <input type="text" name="memo" className="border rounded p-1.5" />
      </label>
      <button type="submit" className="bg-slate-900 text-white text-sm rounded p-2">추가</button>
    </form>
  );
}
