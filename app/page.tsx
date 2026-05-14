import { monthlyTotals, monthlySeries, listBudgets, recentTransactions, generateRecurring } from '@/lib/queries';
import { currentMonth, formatWon } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-slate-200 p-4 ${accent || ''}`}>
      <div className="text-xs text-slate-500 mb-1">{title}</div>
      <div className="text-xl font-semibold">{children}</div>
    </div>
  );
}

function BarChart({ data }: { data: { month: string; personalIncome: number; personalExpense: number; businessIncome: number; businessExpense: number }[] }) {
  const max = Math.max(1, ...data.flatMap(d => [d.personalIncome + d.businessIncome, d.personalExpense + d.businessExpense]));
  const w = 600, h = 200, pad = 30;
  const bw = (w - pad * 2) / data.length / 2.5;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-64">
      {data.map((d, i) => {
        const x = pad + i * ((w - pad * 2) / data.length);
        const incH = ((d.personalIncome + d.businessIncome) / max) * (h - pad * 2);
        const expH = ((d.personalExpense + d.businessExpense) / max) * (h - pad * 2);
        return (
          <g key={d.month}>
            <rect x={x} y={h - pad - incH} width={bw} height={incH} fill="#10b981" />
            <rect x={x + bw + 2} y={h - pad - expH} width={bw} height={expH} fill="#ef4444" />
            <text x={x + bw} y={h - pad + 14} fontSize="10" textAnchor="middle" fill="#64748b">{d.month.slice(5)}</text>
          </g>
        );
      })}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#cbd5e1" />
    </svg>
  );
}

export default async function Dashboard() {
  generateRecurring();
  const month = currentMonth();
  const t = monthlyTotals(month);
  const series = monthlySeries();
  const budgets = listBudgets(month);
  const recent = recentTransactions(10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{month} 대시보드</h1>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">개인 (personal)</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card title="수입"><span className="text-emerald-600">{formatWon(t.personal.income)}</span></Card>
          <Card title="지출"><span className="text-rose-600">{formatWon(t.personal.expense)}</span></Card>
          <Card title="순익"><span className={t.personal.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatWon(t.personal.net)}</span></Card>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-600 mb-2">사업자 (business)</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card title="수입"><span className="text-emerald-600">{formatWon(t.business.income)}</span></Card>
          <Card title="지출"><span className="text-rose-600">{formatWon(t.business.expense)}</span></Card>
          <Card title="순익"><span className={t.business.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatWon(t.business.net)}</span></Card>
        </div>
      </section>

      <section>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-sm text-slate-500">통합 순익</div>
          <div className={`text-3xl font-bold ${t.combinedNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatWon(t.combinedNet)}</div>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="font-semibold mb-2">최근 6개월 수입/지출</h2>
        <BarChart data={series} />
        <div className="flex gap-4 text-xs mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 inline-block" /> 수입</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-500 inline-block" /> 지출</span>
        </div>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="font-semibold mb-3">이번 달 예산</h2>
        {budgets.length === 0 ? (
          <p className="text-sm text-slate-500">설정된 예산이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {budgets.map(b => {
              const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
              const color = pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={b.id}>
                  <div className="flex justify-between text-sm">
                    <span>[{b.ledger === 'personal' ? '개인' : '사업자'}] {b.category_name}</span>
                    <span className={pct > 100 ? 'text-rose-600 font-semibold' : pct > 80 ? 'text-amber-600' : ''}>
                      {formatWon(b.spent)} / {formatWon(b.amount)} ({pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded mt-1 overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="font-semibold mb-3">최근 거래</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">거래 내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr><th className="py-2">날짜</th><th>구분</th><th>유형</th><th>카테고리</th><th>메모</th><th className="text-right">금액</th></tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.date}</td>
                  <td>{r.ledger === 'personal' ? '개인' : '사업자'}</td>
                  <td>{r.type === 'income' ? '수입' : r.type === 'expense' ? '지출' : `이체(${r.from_ledger === 'personal' ? '개인' : '사업자'}→${r.to_ledger === 'personal' ? '개인' : '사업자'})`}</td>
                  <td>{r.category_name || '-'}</td>
                  <td className="text-slate-600">{r.memo || ''}</td>
                  <td className={`text-right ${r.type === 'income' ? 'text-emerald-600' : r.type === 'expense' ? 'text-rose-600' : 'text-slate-700'}`}>{formatWon(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
