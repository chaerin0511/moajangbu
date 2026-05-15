'use client';
import { useState } from 'react';
import { Category, Person } from '@/lib/db';

type TxType = 'expense' | 'income';
type Row = {
  type: TxType;
  date: string;
  amount: string;
  category_name: string;
  person_name: string;
  memo: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const blank = (type: TxType = 'expense', over: Partial<Row> = {}): Row => ({
  type, date: today(), amount: '', category_name: '', person_name: '', memo: '', ...over,
});

export default function BulkTransactionForm({ categories, people, action }: {
  categories: Category[];
  people: Person[];
  action: (fd: FormData) => void;
}) {
  const [ledger, setLedger] = useState<'personal' | 'business'>('personal');
  const [defaultType, setDefaultType] = useState<TxType>('expense');
  const [showPerson, setShowPerson] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, () => blank('expense')));

  const update = (i: number, patch: Partial<Row>) => {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };
  const toggleType = (i: number) => {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, type: r.type === 'expense' ? 'income' : 'expense' } : r));
  };
  const addRow = () => setRows(rs => [...rs, blank(defaultType)]);
  const removeRow = (i: number) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);
  const reset = () => setRows(Array.from({ length: 5 }, () => blank(defaultType)));

  const filledCount = rows.filter(r => Number(r.amount) > 0).length;
  const datalistId = ledger === 'personal' ? 'cats-personal' : 'cats-business';

  // when default type changes, also reset empty rows to that type
  const changeDefaultType = (t: TxType) => {
    setDefaultType(t);
    setRows(rs => rs.map(r => Number(r.amount) > 0 ? r : { ...r, type: t }));
  };

  return (
    <form action={action} onSubmit={() => setTimeout(reset, 100)} className="card p-5 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h2>여러 건 한번에 입력</h2>
          <p className="text-xs text-slate-500 mt-1">
            카테고리는 <b>타이핑하면 자동완성</b>. 없는 이름은 자동 생성. 유형은 행마다 클릭해서 토글.
          </p>
        </div>
        <span className="text-xs text-slate-500">{filledCount}건 입력 대기</span>
      </div>

      {/* Top toggles */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="label">장부</span>
          <div className="inline-flex bg-[#f2f4f6] rounded-[10px] p-[3px]">
            {[
              { v: 'personal', label: '개인' },
              { v: 'business', label: '사업자' },
            ].map(l => (
              <button key={l.v} type="button"
                      onClick={() => setLedger(l.v as 'personal' | 'business')}
                      className={`px-4 py-1.5 text-sm font-medium rounded-[8px] transition ${
                        ledger === l.v ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-slate-500 hover:text-slate-700'
                      }`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="label">기본 유형</span>
          <div className="inline-flex bg-[#f2f4f6] rounded-[10px] p-[3px]">
            {[
              { v: 'expense', label: '지출' },
              { v: 'income', label: '수입' },
            ].map(t => (
              <button key={t.v} type="button"
                      onClick={() => changeDefaultType(t.v as TxType)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-[8px] transition ${
                        defaultType === t.v ? 'bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-slate-500 hover:text-slate-700'
                      }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 select-none cursor-pointer">
          <input type="checkbox" checked={showPerson} onChange={e => setShowPerson(e.target.checked)} className="accent-[#3182f6]" />
          가족·사람 칸 보이기
        </label>
      </div>

      {/* shared datalists */}
      <datalist id="cats-personal">
        {categories.filter(c => c.ledger === 'personal').map(c => <option key={c.id} value={c.name} />)}
      </datalist>
      <datalist id="cats-business">
        {categories.filter(c => c.ledger === 'business').map(c => <option key={c.id} value={c.name} />)}
      </datalist>
      <datalist id="people-list">
        {people.map(p => <option key={p.id} value={p.name} />)}
      </datalist>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-y-1">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="text-left font-medium px-1 w-20">유형</th>
              <th className="text-left font-medium px-1 w-32">날짜</th>
              <th className="text-right font-medium px-1 w-32">금액</th>
              <th className="text-left font-medium px-1">카테고리</th>
              {showPerson && <th className="text-left font-medium px-1 w-32">사람</th>}
              <th className="text-left font-medium px-1">메모</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-1">
                  <button type="button" onClick={() => toggleType(i)}
                          className={`w-full px-2 py-2 rounded-[10px] text-sm font-semibold transition ${
                            r.type === 'expense'
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                              : 'bg-blue-50 text-[#3182f6] hover:bg-blue-100'
                          }`}
                          title="클릭해서 지출↔수입 전환">
                    {r.type === 'expense' ? '지출' : '수입'}
                  </button>
                  <input type="hidden" name="type" value={r.type} />
                </td>
                <td className="px-1">
                  <input type="date" name="date" value={r.date}
                         onChange={e => update(i, { date: e.target.value })}
                         className="input w-full" />
                </td>
                <td className="px-1">
                  <input type="number" name="amount" min="0" step="100" value={r.amount}
                         onChange={e => update(i, { amount: e.target.value })}
                         placeholder="0" className="input w-full text-right tabular-nums" />
                </td>
                <td className="px-1">
                  <input type="text" name="category_name" value={r.category_name}
                         onChange={e => update(i, { category_name: e.target.value })}
                         list={datalistId}
                         placeholder={ledger === 'personal' ? '식비, 교통...' : '매출, 매입...'}
                         className="input w-full" autoComplete="off" />
                </td>
                {showPerson && (
                  <td className="px-1">
                    <input type="text" name="person_name" value={r.person_name}
                           onChange={e => update(i, { person_name: e.target.value })}
                           list="people-list" placeholder="엄마, 동생..."
                           className="input w-full" autoComplete="off" />
                  </td>
                )}
                {!showPerson && <input type="hidden" name="person_name" value="" />}
                <td className="px-1">
                  <input type="text" name="memo" value={r.memo}
                         onChange={e => update(i, { memo: e.target.value })}
                         placeholder="메모" className="input w-full" />
                </td>
                <td className="px-1 text-center">
                  <button type="button" onClick={() => removeRow(i)}
                          className="text-slate-400 hover:text-rose-500 text-lg leading-none"
                          disabled={rows.length === 1}
                          aria-label="행 삭제">×</button>
                </td>
                <input type="hidden" name="ledger" value={ledger} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center">
        <button type="button" onClick={addRow} className="btn-ghost">+ 행 추가</button>
        <div className="flex gap-2">
          <button type="button" onClick={reset} className="btn-ghost">초기화</button>
          <button type="submit" className="btn-primary" disabled={filledCount === 0}>
            {filledCount}건 저장
          </button>
        </div>
      </div>
    </form>
  );
}
