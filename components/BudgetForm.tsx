'use client';
import { useState } from 'react';
import { Category } from '@/lib/db';

export default function BudgetForm({ categories, month, action }: {
  categories: Category[]; month: string; action: (fd: FormData) => void;
}) {
  const [ledger, setLedger] = useState('personal');
  const cats = categories.filter(c => c.ledger === ledger);
  return (
    <form action={action} className="card p-4 flex flex-wrap gap-3 items-end">
      <input type="hidden" name="month" value={month} />
      <label className="flex flex-col gap-1"><span className="label">장부</span>
        <select name="ledger" value={ledger} onChange={e => setLedger(e.target.value)} className="select">
          <option value="personal">개인</option><option value="business">사업자</option>
        </select>
      </label>
      <label className="flex flex-col gap-1"><span className="label">카테고리</span>
        <select name="category_id" required className="select">
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1"><span className="label">예산 (원)</span>
        <input type="number" name="amount" min="0" step="1000" required className="input text-right tabular-nums" />
      </label>
      <button className="btn-primary">저장 / 수정</button>
    </form>
  );
}
