'use client';
import { useState } from 'react';
import { Category } from '@/lib/db';

export default function BudgetForm({ categories, month, action }: {
  categories: Category[]; month: string; action: (fd: FormData) => void;
}) {
  const [ledger, setLedger] = useState('personal');
  const cats = categories.filter(c => c.ledger === ledger);
  return (
    <form action={action} className="bg-white border border-slate-200 rounded p-3 flex flex-wrap gap-2 items-end text-sm">
      <input type="hidden" name="month" value={month} />
      <label className="flex flex-col text-xs">장부
        <select name="ledger" value={ledger} onChange={e => setLedger(e.target.value)} className="border rounded p-1.5">
          <option value="personal">개인</option><option value="business">사업자</option>
        </select>
      </label>
      <label className="flex flex-col text-xs">카테고리
        <select name="category_id" required className="border rounded p-1.5">
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col text-xs">예산(원)
        <input type="number" name="amount" min="0" required className="border rounded p-1.5" />
      </label>
      <button className="bg-slate-900 text-white rounded px-3 py-1.5">저장/수정</button>
    </form>
  );
}
