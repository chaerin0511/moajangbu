import {
  salesSummary, salesByMonthSeries, businessExpenseBreakdown,
  businessOperatingProfit, businessCashFlow, businessYtd, businessVatNext,
  getBusinessTarget, taxReserve, balanceAt, recentSales,
} from '@/lib/queries';
import { formatWon } from '@/lib/utils';
import { setBusinessTarget } from '@/lib/actions';
import Link from 'next/link';

function pct(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return `${(n * 100).toFixed(0)}%`;
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function diffPct(cur: number, prev: number): { text: string; positive: boolean } | null {
  if (prev <= 0) return null;
  const r = (cur - prev) / prev;
  return { text: `${r >= 0 ? '+' : ''}${(r * 100).toFixed(0)}%`, positive: r >= 0 };
}

function daysUntil(deadlineISO: string): number {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = deadlineISO.split('-').map(Number);
  const t1 = new Date(y, m - 1, d).getTime();
  return Math.round((t1 - t0) / (1000 * 60 * 60 * 24));
}

function RevenueBars({ data, target }: { data: { month: string; supply: number }[]; target: number }) {
  const w = 720, h = 200, pad = 40;
  const max = Math.max(target, ...data.map(d => d.supply), 1);
  const barW = (w - pad * 2) / data.length * 0.7;
  const slot = (w - pad * 2) / data.length;
  const yFor = (v: number) => h - pad - (v / max) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52">
      {data.map((d, i) => {
        const x = pad + i * slot + (slot - barW) / 2;
        const y = yFor(d.supply);
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={barW} height={h - pad - y} fill="#f59e0b" rx="3" />
            <text x={x + barW / 2} y={h - pad + 14} fontSize="10" textAnchor="middle" fill="#64748b">
              {Number(d.month.slice(5))}월
            </text>
          </g>
        );
      })}
      {target > 0 && (
        <>
          <line x1={pad} x2={w - pad} y1={yFor(target)} y2={yFor(target)} stroke="#10b981" strokeDasharray="4 3" strokeWidth="1.5" />
          <text x={w - pad} y={yFor(target) - 4} fontSize="10" textAnchor="end" fill="#10b981">목표 {formatWon(target)}</text>
        </>
      )}
    </svg>
  );
}

function CashFlowBars({ data }: { data: { month: string; net: number }[] }) {
  const w = 720, h = 200, pad = 40;
  const abs = Math.max(1, ...data.map(d => Math.abs(d.net)));
  const slot = (w - pad * 2) / data.length;
  const barW = slot * 0.7;
  const zero = h / 2;
  const yFor = (v: number) => zero - (v / abs) * (zero - pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52">
      <line x1={pad} x2={w - pad} y1={zero} y2={zero} stroke="#94a3b8" />
      {data.map((d, i) => {
        const x = pad + i * slot + (slot - barW) / 2;
        const y = d.net >= 0 ? yFor(d.net) : zero;
        const bh = Math.abs(yFor(d.net) - zero);
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={barW} height={bh} fill={d.net >= 0 ? '#10b981' : '#f43f5e'} rx="3" />
            <text x={x + barW / 2} y={h - 6} fontSize="10" textAnchor="middle" fill="#64748b">
              {Number(d.month.slice(5))}월
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function BusinessDashboard({ userId, month }: { userId: number; month: string }) {
  const year = month.slice(0, 4);
  const prev = prevMonth(month);
  const [
    sales, prevSales, op, prevOp, expBreakdown,
    cashFlow, ytd, vatNext, target, tax, bizBal, recent, salesSeries,
  ] = await Promise.all([
    salesSummary(userId, month),
    salesSummary(userId, prev),
    businessOperatingProfit(userId, month),
    businessOperatingProfit(userId, prev),
    businessExpenseBreakdown(userId, month),
    businessCashFlow(userId, year),
    businessYtd(userId, year),
    businessVatNext(userId),
    getBusinessTarget(userId, month),
    taxReserve(userId, year),
    balanceAt(userId, 'business'),
    recentSales(userId, 6),
    salesByMonthSeries(userId, year),
  ]);

  const revDiff = diffPct(sales.supply, prevSales.supply);
  const profitDiff = diffPct(op.profit, prevOp.profit);
  const dDay = daysUntil(vatNext.deadline);
  const reserveRatio = tax.reservedRequired > 0 ? bizBal / tax.reservedRequired : (bizBal > 0 ? Infinity : 0);
  const reserveOk = bizBal >= tax.reservedBalance;

  const nonZeroCash = cashFlow.filter(c => c.income !== 0 || c.expense !== 0);
  const avgMonthlyNet = nonZeroCash.length > 0
    ? Math.round(nonZeroCash.reduce((s, c) => s + c.net, 0) / nonZeroCash.length)
    : 0;

  const revProgress = target && target.target_revenue > 0 ? sales.supply / target.target_revenue : 0;
  const profitProgress = target && target.target_profit > 0 ? op.profit / target.target_profit : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="label">사업자 대시보드 · {month}</div>
          <h1 className="text-xl font-semibold mt-1">사업 성과 한눈에 보기</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/sales" className="btn-primary">매출 추가</Link>
          <Link href="/transactions" className="btn-ghost">거래 입력</Link>
        </div>
      </div>

      {/* 종합 카드 — 이번달 핵심 4지표 + 올해 누적 */}
      <section className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        {/* 매출/이익 — 메인 2개 그린 테두리 */}
        <div className="grid sm:grid-cols-2 gap-2 p-2">
          {[
            { key: 'rev',
              label: '이번달 매출 (공급가액)',
              value: sales.supply,
              valueColor: 'text-slate-900',
              sub: `부가세 ${formatWon(sales.vat)} · 합계 ${formatWon(sales.total)}`,
              diff: revDiff },
            { key: 'profit',
              label: '영업이익',
              value: op.profit,
              valueColor: op.profit < 0 ? 'text-rose-600' : 'text-slate-900',
              sub: `매출 대비 ${pct(op.profitMargin)}`,
              diff: profitDiff },
          ].map(c => (
            <div key={c.key} className="rounded-xl bg-white px-4 py-3.5" style={{ border: '1.5px solid var(--primary)' }}>
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">{c.label}</span>
              <div className={`mt-2 text-[24px] font-bold tabular-nums leading-none tracking-tight ${c.valueColor}`}>
                {formatWon(c.value)}
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-slate-500">{c.sub}</span>
                {c.diff && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${c.diff.positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                    {c.diff.text}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 세금/VAT — 보조 2열 */}
        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/50">
          <div className="px-4 py-3 border-r border-slate-100">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">다음 부가세</span>
              <span className={`text-[10px] tabular-nums font-medium ${dDay <= 7 ? 'text-rose-600' : dDay <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                {dDay >= 0 ? `D-${dDay}` : `D+${-dDay}`}
              </span>
            </div>
            <div className="mt-1 text-[17px] font-bold tabular-nums leading-none">{formatWon(vatNext.due)}</div>
            <div className="mt-1 text-[10px] text-slate-400 tabular-nums">{vatNext.period} · 마감 {vatNext.deadline.slice(5).replace('-', '/')}</div>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">세금 충당금</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${reserveOk ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                {reserveOk ? '충분' : '부족'}
              </span>
            </div>
            <div className="mt-1 text-[17px] font-bold tabular-nums leading-none">{formatWon(tax.reservedBalance)}</div>
            <div className="mt-1 text-[10px] text-slate-400 tabular-nums">
              잔액 {formatWon(bizBal)}{Number.isFinite(reserveRatio) ? ` (${pct(reserveRatio)})` : ''}
            </div>
          </div>
        </div>

        {/* YTD 누적 — 4열 압축 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-slate-100 divide-x divide-slate-100">
          {[
            { l: `${year} 누적 매출`, v: ytd.revenue, t: '' },
            { l: '누적 지출', v: ytd.totalExpense, t: '' },
            { l: '누적 영업이익', v: ytd.profit, t: ytd.profit < 0 ? 'text-rose-600' : '' },
            { l: '누적 부가세', v: ytd.vatTotal, t: '' },
          ].map((c, i) => (
            <div key={i} className="px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-400">{c.l}</div>
              <div className={`mt-1 text-[15px] font-bold tabular-nums leading-none ${c.t}`}>{formatWon(c.v)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 매출 추이 */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{year} 매출 추이 (공급가액 · 12개월)</h2>
          {target && <span className="text-xs text-slate-500">목표 {formatWon(target.target_revenue)}</span>}
        </div>
        <RevenueBars data={salesSeries.map(s => ({ month: s.month, supply: s.supply }))} target={target?.target_revenue || 0} />
      </section>

      {/* 지출 구조 */}
      {expBreakdown.length > 0 && (
      <section className="card p-5">
        <h2 className="font-semibold mb-3">{month} 지출 구조</h2>
        {(
          <div className="space-y-2.5">
            {expBreakdown.map((x, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm">
                  <span>{x.category_name || '(미지정)'}</span>
                  <span className="tabular-nums text-slate-600">
                    {formatWon(x.amount)} <span className="text-slate-400">({(x.share * 100).toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, x.share * 100)}%` }} />
                </div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t flex justify-between text-sm font-semibold">
              <span>총 지출</span>
              <span className="tabular-nums">{formatWon(op.totalExpense)}</span>
            </div>
          </div>
        )}
      </section>
      )}

      {/* 현금 흐름 */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{year} 월별 순현금흐름 (사업)</h2>
          <span className="text-xs text-slate-500 tabular-nums">월평균 순익 {formatWon(avgMonthlyNet)}</span>
        </div>
        <CashFlowBars data={cashFlow} />
      </section>

      {/* 목표 대비 */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{month} 목표 대비 달성률</h2>
        </div>
        {!target ? (
          <form action={setBusinessTarget} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <input type="hidden" name="month" value={month} />
            <div>
              <label className="label">목표 매출 (공급가액)</label>
              <input name="target_revenue" type="number" min="0" step="10000" defaultValue="0" className="input w-full" />
            </div>
            <div>
              <label className="label">목표 영업이익</label>
              <input name="target_profit" type="number" min="0" step="10000" defaultValue="0" className="input w-full" />
            </div>
            <button type="submit" className="btn-primary">목표 설정</button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>매출 진행률</span>
                <span className="tabular-nums text-slate-600">
                  {formatWon(sales.supply)} / {formatWon(target.target_revenue)} ({(revProgress * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div className={`h-full ${revProgress >= 1 ? 'bg-emerald-500' : revProgress >= 0.7 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, revProgress * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>영업이익 진행률</span>
                <span className="tabular-nums text-slate-600">
                  {formatWon(op.profit)} / {formatWon(target.target_profit)} ({(profitProgress * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div className={`h-full ${profitProgress >= 1 ? 'bg-emerald-500' : profitProgress >= 0.7 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, profitProgress * 100)}%` }} />
              </div>
            </div>
            <details className="mt-2">
              <summary className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer">목표 수정</summary>
              <form action={setBusinessTarget} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mt-3">
                <input type="hidden" name="month" value={month} />
                <div>
                  <label className="label">목표 매출</label>
                  <input name="target_revenue" type="number" min="0" step="10000" defaultValue={target.target_revenue} className="input w-full" />
                </div>
                <div>
                  <label className="label">목표 영업이익</label>
                  <input name="target_profit" type="number" min="0" step="10000" defaultValue={target.target_profit} className="input w-full" />
                </div>
                <button type="submit" className="btn-primary">저장</button>
              </form>
            </details>
          </div>
        )}
      </section>

      {/* 최근 매출 */}
      {recent.length > 0 && (
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">최근 매출</h2>
          <Link href="/sales" className="text-xs text-slate-500 hover:text-slate-900">전체보기 →</Link>
        </div>
        {(
          <table className="pretty">
            <thead>
              <tr><th>날짜</th><th>카테고리</th><th>거래처</th><th>메모</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th></tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id}>
                  <td className="text-slate-600 tabular-nums">{r.date}</td>
                  <td>{r.category_name || '-'}</td>
                  <td>{r.person_name || '-'}</td>
                  <td className="text-slate-500">{r.memo || ''}</td>
                  <td className="text-right tabular-nums">{formatWon(r.supply_amount ?? r.amount)}</td>
                  <td className="text-right tabular-nums text-slate-500">{formatWon(r.vat_amount ?? 0)}</td>
                  <td className="text-right tabular-nums font-medium">{formatWon(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      )}
    </div>
  );
}
