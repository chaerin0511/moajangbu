'use client';
import { useState } from 'react';
import { Category, Person } from '@/lib/db';

const TYPES = [
  { v: 'expense',  label: '지출' },
  { v: 'income',   label: '수입' },
  { v: 'transfer', label: '이체' },
];

export default function TransactionForm({ categories, people = [], action, initial, submitLabel = '추가' }: {
  categories: Category[];
  people?: Person[];
  action: (fd: FormData) => void;
  initial?: any;
  submitLabel?: string;
}) {
  const [type, setType] = useState<string>(initial?.type || 'expense');
  const [ledger, setLedger] = useState<string>(initial?.ledger || 'personal');
  const cats = categories.filter(c => c.ledger === ledger);

  return (
    <form action={action} className="card p-5 space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex bg-[#f2f4f6] rounded-[10px] p-[3px]">
          {TYPES.map(t => (
            <button
              key={t.v}
              type="button"
              onClick={() => setType(t.v)}
              className={`px-4 py-1.5 text-sm font-medium rounded-[8px] transition ${
                type === t.v ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type} />

        {type !== 'transfer' ? (
          <div className="inline-flex bg-[#f2f4f6] rounded-[10px] p-[3px]">
            {[
              { v: 'personal', label: '개인' },
              { v: 'business', label: '사업자' },
            ].map(l => (
              <button
                key={l.v}
                type="button"
                onClick={() => setLedger(l.v)}
                className={`px-4 py-1.5 text-sm font-medium rounded-[8px] transition ${
                  ledger === l.v ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {l.label}
              </button>
            ))}
            <input type="hidden" name="ledger" value={ledger} />
          </div>
        ) : (
          <input type="hidden" name="ledger" value="personal" />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {type === 'transfer' && (
          <>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">출발</span>
              <select name="from_ledger" defaultValue={initial?.from_ledger || 'business'} className="select">
                <option value="personal">개인</option>
                <option value="business">사업자</option>
              </select>
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">도착</span>
              <select name="to_ledger" defaultValue={initial?.to_ledger || 'personal'} className="select">
                <option value="personal">개인</option>
                <option value="business">사업자</option>
              </select>
            </label>
          </>
        )}

        <label className="md:col-span-3 flex flex-col gap-1">
          <span className="label">날짜</span>
          <input type="date" name="date" defaultValue={initial?.date || new Date().toISOString().slice(0, 10)} required className="input" />
        </label>

        <label className={`flex flex-col gap-1 ${type === 'transfer' ? 'md:col-span-3' : 'md:col-span-4'}`}>
          <span className="label">금액 (원)</span>
          <input
            type="number" name="amount" defaultValue={initial?.amount || ''} min="0" step="100" required
            placeholder="0"
            className="input text-right text-lg font-semibold tabular-nums"
          />
        </label>

        {type !== 'transfer' && (
          <label className="md:col-span-5 flex flex-col gap-1">
            <span className="label">카테고리</span>
            <select name="category_id" defaultValue={initial?.category_id || ''} className="select">
              <option value="">(선택)</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        {type !== 'transfer' && (
          <label className="md:col-span-4 flex flex-col gap-1">
            <span className="label">사람 (선택)</span>
            <select name="person_id" defaultValue={initial?.person_id || ''} className="select">
              <option value="">(없음)</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.relation ? ` · ${p.relation}` : ''}</option>)}
            </select>
          </label>
        )}

        <label className={`flex flex-col gap-1 ${type === 'transfer' ? 'md:col-span-9' : 'md:col-span-5'}`}>
          <span className="label">메모</span>
          <input type="text" name="memo" defaultValue={initial?.memo || ''} className="input" placeholder="간단한 메모" />
        </label>

        <div className="md:col-span-3 flex items-end">
          <button type="submit" className="btn-primary w-full py-2.5">{submitLabel}</button>
        </div>
      </div>
    </form>
  );
}
