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
    <form action={action} className="card p-5 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
      <label className="flex flex-col gap-1"><span className="label">유형</span>
        <select name="type" value={type} onChange={e => setType(e.target.value)} className="select">
          <option value="income">수입</option><option value="expense">지출</option><option value="transfer">이체</option>
        </select>
      </label>
      {type !== 'transfer' ? (
        <label className="flex flex-col gap-1"><span className="label">장부</span>
          <select name="ledger" value={ledger} onChange={e => setLedger(e.target.value)} className="select">
            <option value="personal">개인</option><option value="business">사업자</option>
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name="ledger" value={ledger} />
          <label className="flex flex-col gap-1"><span className="label">출발</span>
            <select name="from_ledger" defaultValue="business" className="select">
              <option value="personal">개인</option><option value="business">사업자</option>
            </select>
          </label>
          <label className="flex flex-col gap-1"><span className="label">도착</span>
            <select name="to_ledger" defaultValue="personal" className="select">
              <option value="personal">개인</option><option value="business">사업자</option>
            </select>
          </label>
        </>
      )}
      {type !== 'transfer' && (
        <label className="flex flex-col gap-1"><span className="label">카테고리</span>
          <select name="category_id" className="select">
            <option value="">(선택)</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1"><span className="label">매월 (일)</span>
        <input type="number" name="day_of_month" min="1" max="31" defaultValue="1" required className="input" />
      </label>
      <label className="flex flex-col gap-1"><span className="label">시작일</span>
        <input type="date" name="start_date" defaultValue={defaultDate} required className="input" />
      </label>
      <label className="flex flex-col gap-1"><span className="label">금액 (원)</span>
        <input type="number" name="amount" min="0" step="100" required className="input text-right tabular-nums" />
      </label>
      <label className="flex flex-col gap-1 md:col-span-2"><span className="label">메모</span>
        <input type="text" name="memo" className="input" placeholder="예: 월세, 통신비" />
      </label>
      <button type="submit" className="btn-primary py-2.5">추가</button>
    </form>
  );
}
