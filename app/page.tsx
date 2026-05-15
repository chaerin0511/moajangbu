import {
  monthlyTotals, listBudgets, recentTransactions, generateRecurring,
  balanceAt, projectedMonthEndBalance, financialHealth, savingsRateSeries,
  fixedExpenseBreakdown, emergencyFund, ytdSavings, spendingAnomalies, taxReserve,
  debtSummary, adjustedSavingsRate,
} from '@/lib/queries';
import { currentMonth, formatWon } from '@/lib/utils';
import { currentUserId } from '@/lib/auth-helper';
import { getViewMode, type ViewMode } from '@/lib/view-mode';
import Link from 'next/link';
import BusinessDashboard from './_business-dashboard';
import MonthPicker from '@/components/MonthPicker';

export const dynamic = 'force-dynamic';

function pct(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return `${(n * 100).toFixed(0)}%`;
}

function HealthHero({ month, rate, net, vsLastMonth }: { month: string; rate: number; net: number; vsLastMonth: number }) {
  const tier =
    rate >= 0.2 ? { label: '건강', chip: 'bg-emerald-50 text-emerald-700' } :
    rate >= 0.05 ? { label: '보통', chip: 'bg-amber-50 text-amber-700' } :
    rate >= 0 ? { label: '주의', chip: 'bg-rose-50 text-rose-600' } :
    { label: '위험', chip: 'bg-rose-100 text-rose-700' };

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="label">{month} 남는 돈</span>
            <span className={`chip ${tier.chip}`}>{tier.label}</span>
          </div>
          <div className={`mt-2 text-[34px] sm:text-[40px] font-bold tabular-nums leading-none ${net >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
            {formatWon(net)}
          </div>
          <div className="text-sm text-slate-500 mt-3">
            저축률 <b className="text-slate-700 tabular-nums">{pct(rate)}</b>
            <span className="ml-3">전월 대비 <span className={vsLastMonth >= 0 ? 'text-emerald-600' : 'text-rose-500'}>{vsLastMonth >= 0 ? '+' : ''}{formatWon(vsLastMonth)}</span></span>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <Link href="/transactions" className="btn-primary flex-1 sm:flex-initial">거래 추가</Link>
          <Link href="/settings" className="btn-ghost flex-1 sm:flex-initial">잔액 설정</Link>
        </div>
      </div>
    </section>
  );
}

function SavingsRateChart({ data }: { data: { month: string; rate: number }[] }) {
  const w = 640, h = 180, pad = 36;
  const slot = (w - pad * 2) / Math.max(1, data.length - 1);
  const yFor = (r: number) => {
    const clamped = Math.max(-0.5, Math.min(0.5, r));
    return h - pad - ((clamped + 0.5) / 1.0) * (h - pad * 2);
  };
  const pts = data.map((d, i) => [pad + i * slot, yFor(d.rate)] as const);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
      <line x1={pad} x2={w - pad} y1={yFor(0)} y2={yFor(0)} stroke="#94a3b8" strokeDasharray="3 3" />
      <line x1={pad} x2={w - pad} y1={yFor(0.2)} y2={yFor(0.2)} stroke="#a7f3d0" strokeDasharray="3 3" />
      <text x={w - pad} y={yFor(0.2) - 4} fontSize="10" textAnchor="end" fill="#10b981">건강선 20%</text>
      <path d={path} fill="none" stroke="#6366f1" strokeWidth="2.5" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4" fill="#6366f1" />
          <text x={p[0]} y={h - pad + 14} fontSize="10" textAnchor="middle" fill="#64748b">{data[i].month.slice(5)}월</text>
          <text x={p[0]} y={p[1] - 8} fontSize="10" textAnchor="middle" fill="#475569">{pct(data[i].rate)}</text>
        </g>
      ))}
    </svg>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const userId = await currentUserId();
  const view: ViewMode = getViewMode();
  const month = searchParams.month || currentMonth();

  if (view === 'business') {
    return (
      <div className="space-y-8">
        <form className="flex items-center justify-end">
          <MonthPicker value={month} />
        </form>
        <BusinessDashboard userId={userId} month={month} />
      </div>
    );
  }
  const viewMode = view as ViewMode;

  // 모든 집계 쿼리를 병렬 실행 (이전 17번 순차 → 1라운드 병렬)
  const [
    _genResult,
    t, h, series, budgets, recent,
    balPersonal, balBusiness, projPersonal, projBusiness,
    fixedBreakdown, ef, ytd, anomalies, tax, dbt, adj,
  ] = await Promise.all([
    generateRecurring(userId),
    monthlyTotals(userId, month),
    financialHealth(userId, month),
    savingsRateSeries(userId),
    listBudgets(userId, month),
    recentTransactions(userId, 8),
    balanceAt(userId, 'personal'),
    balanceAt(userId, 'business'),
    projectedMonthEndBalance(userId, 'personal'),
    projectedMonthEndBalance(userId, 'business'),
    fixedExpenseBreakdown(userId, month),
    emergencyFund(userId),
    ytdSavings(userId),
    spendingAnomalies(userId, month),
    taxReserve(userId),
    debtSummary(userId, month),
    adjustedSavingsRate(userId, month),
  ]);
  void _genResult;

  return (
    <div className="space-y-8">
      <form className="flex items-center justify-end">
        <MonthPicker value={month} />
      </form>

      {viewMode !== 'business' && (
        <HealthHero month={month} rate={h.savingsRate} net={h.net} vsLastMonth={h.vsLastMonth.net} />
      )}

      {/* 종합 카드 — 세련 버전 */}
      <section className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        {/* 잔액 — 카드 2개 분리, 각자 그린 테두리 */}
        <div className="grid sm:grid-cols-2 gap-2 p-2">
          {[
            { key: 'personal', label: '개인',  bal: balPersonal, proj: projPersonal, accent: '#6366f1' },
            { key: 'business', label: '사업자', bal: balBusiness, proj: projBusiness, accent: '#f59e0b' },
          ].filter(a => view === 'all' || a.key === view).map(a => {
            const diff = a.proj - a.bal;
            return (
              <div
                key={a.key}
                className="rounded-xl bg-white px-4 py-3.5"
                style={{ border: '1.5px solid var(--primary)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block w-1 h-3 rounded-sm" style={{ background: a.accent }} />
                  <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">{a.label}</span>
                </div>
                <div className={`mt-2 text-[24px] font-bold tabular-nums leading-none tracking-tight ${a.bal >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                  {formatWon(a.bal)}
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="text-slate-400">월말</span>
                  <span className={a.proj < 0 ? 'text-rose-600 font-medium' : 'text-slate-700 font-medium'}>{formatWon(a.proj)}</span>
                  {diff !== 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                      diff < 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {diff > 0 ? '+' : ''}{formatWon(diff)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 보조 지표 띠 */}
        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/50">
          {viewMode !== 'business' ? (
            <div className="px-5 py-3.5 border-r border-slate-100">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">비상금</span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  <b className="text-slate-800 font-bold">{ef.months.toFixed(1)}</b>
                  <span className="text-slate-400"> / 6달</span>
                </span>
              </div>
              <div className="w-full h-1 bg-white rounded-full mt-2.5 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (ef.months / 6) * 100)}%`,
                    background: ef.months >= 6 ? 'var(--primary)' : ef.months >= 3 ? '#f59e0b' : '#f43f5e',
                  }} />
              </div>
            </div>
          ) : <div className="border-r border-slate-100" />}
          <div className="px-5 py-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">{new Date().getFullYear()} 누적 저축</span>
              <span className={`text-[11px] tabular-nums font-medium ${ytd.net < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                {ytd.net >= 0 ? '+' : ''}{formatWon(ytd.net)}
              </span>
            </div>
            <div className="mt-1.5 text-[10px] text-slate-400 tabular-nums">
              수입 {formatWon(ytd.income)} · 지출 {formatWon(ytd.expense)}
            </div>
          </div>
        </div>

        {/* 고정지출 */}
        {(() => {
          const fixedView = view === 'all' ? fixedBreakdown : fixedBreakdown.filter(x => x.ledger === view);
          const total = fixedView.reduce((s, x) => s + x.amount, 0);
          return (
            <div className="px-5 py-3.5 border-t border-slate-100">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">{month} 고정지출</span>
                {fixedView.length > 0
                  ? <span className="text-[12px] tabular-nums font-semibold text-slate-800">{formatWon(total)}</span>
                  : <span className="text-[11px] text-slate-400">없음</span>}
              </div>
              {fixedView.length > 0 && (
                <div className="space-y-1.5">
                  {fixedView.map((x, i) => {
                    const share = total > 0 ? (x.amount / total) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-2.5 text-[12px]">
                        <span className="w-1 h-1 rounded-full shrink-0" style={{ background: x.ledger === 'personal' ? '#6366f1' : '#f59e0b' }} />
                        <span className="truncate text-slate-700">{x.category_name || '(미지정)'}</span>
                        <div className="flex-1 h-[2px] bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-slate-300" style={{ width: `${share}%` }} />
                        </div>
                        <span className="tabular-nums text-slate-700 font-medium shrink-0">{formatWon(x.amount)}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0 w-8 text-right">{share.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* 사업자 세금 충당금 */}
      {tax.rate > 0 && view !== 'personal' && (
        <section>
          <h2 className="font-semibold mb-3">사업자 세금 충당금 (올해 누적)</h2>
          <div className="grid md:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="label">올해 사업 매출</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(tax.ytdBusinessIncome)}</div>
              <div className="text-xs text-slate-500 mt-1">충당 비율 {(tax.rate * 100).toFixed(0)}%</div>
            </div>
            <div className="card p-4">
              <div className="label">세금용 적립 필요</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(tax.reservedRequired)}</div>
              <div className="text-xs text-slate-500 mt-1">납부 {formatWon(tax.taxPaid)}</div>
            </div>
            <div className="card p-4">
              <div className="label">남겨둬야 할 금액</div>
              <div className="text-xl font-semibold mt-1 tabular-nums text-rose-600">{formatWon(tax.reservedBalance)}</div>
              <div className="text-xs text-slate-500 mt-1">아직 안 낸 추정 세금</div>
            </div>
            <div className="card p-4">
              <div className="label">실제 가용 사업 잔액</div>
              <div className={`text-xl font-semibold mt-1 tabular-nums ${tax.adjustedBusinessBalance < 0 ? 'text-rose-600' : ''}`}>
                {formatWon(tax.adjustedBusinessBalance)}
              </div>
              <div className="text-xs text-slate-500 mt-1">잔액 - 세금 충당</div>
            </div>
          </div>
        </section>
      )}

      {/* 대출 요약 */}
      {dbt.activeCount > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">대출 현황</h2>
            <Link href="/debts" className="text-xs text-slate-500 hover:text-slate-900">관리 →</Link>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="label">총 남은 원금</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(dbt.totalRemaining)}</div>
              <div className="text-xs text-slate-500 mt-1">활성 {dbt.activeCount}건</div>
            </div>
            <div className="card p-4">
              <div className="label">이번달 원금 상환</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(dbt.monthPrincipal)}</div>
              <div className="text-xs text-slate-500 mt-1">저축으로 간주</div>
            </div>
            <div className="card p-4">
              <div className="label">이번달 이자</div>
              <div className="text-xl font-semibold mt-1 tabular-nums text-rose-600">{formatWon(dbt.monthInterest)}</div>
            </div>
            <div className="card p-4">
              <div className="label">조정 저축률</div>
              <div className="text-xl font-semibold mt-1 tabular-nums">{pct(adj.rate)}</div>
              <div className="text-xs text-slate-500 mt-1">원금 상환 포함</div>
            </div>
          </div>
        </section>
      )}

      {/* 이상 지출 감지 */}
      {(() => {
        const anomaliesView = view === 'all' ? anomalies : anomalies.filter(a => a.ledger === view);
        return anomaliesView.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold mb-3">이상 지출 감지</h2>
          <p className="text-xs text-slate-500 mb-3">최근 3개월 평균 대비 30% 이상 차이 나는 카테고리</p>
          <div className="space-y-2">
            {anomaliesView.slice(0, 6).map(a => (
              <div key={`${a.ledger}-${a.category_id}`} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`chip shrink-0 ${a.ledger === 'personal' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.ledger === 'personal' ? '개인' : '사업자'}
                  </span>
                  <span className="truncate">{a.category_name}</span>
                </span>
                <span className="tabular-nums text-slate-700 text-right shrink-0">
                  <span className="block sm:inline">{formatWon(a.current)} <span className="text-slate-400 hidden sm:inline">vs 평균 {formatWon(Math.round(a.average))}</span></span>
                  <span className={`block sm:inline sm:ml-2 font-semibold ${a.deltaPct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {a.deltaPct >= 0 ? '+' : ''}{(a.deltaPct * 100).toFixed(0)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
        );
      })()}

      {/* 판단 지표 — 압축 + 시각화 */}
      {(() => {
        const savColor = h.savingsRate >= 0.2 ? 'var(--primary)' : h.savingsRate >= 0.05 ? '#f59e0b' : '#f43f5e';
        const covColor = h.fixedCoverage >= 1 ? 'var(--primary)' : h.fixedCoverage >= 0.7 ? '#f59e0b' : '#f43f5e';
        const savPct = Math.max(0, Math.min(100, h.savingsRate * 100));
        const covPct = Math.max(0, Math.min(100, (Number.isFinite(h.fixedCoverage) ? h.fixedCoverage : 0) * 100));
        const upNet = h.vsLastMonth.net >= 0;
        return (
        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden text-[12px]">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">{month} 판단 지표</h2>
            <span className="text-[10px] text-slate-400">한 달 요약</span>
          </div>

          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {/* 저축률 */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">저축률</span>
                <span className="text-[10px] text-slate-400 tabular-nums">목표 20%</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: savColor }}>{pct(h.savingsRate)}</span>
                <span className="text-[10px] text-slate-400 tabular-nums">+{formatWon(h.income)} / -{formatWon(h.expense)}</span>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${savPct}%`, background: savColor }} />
              </div>
            </div>

            {/* 고정비 커버리지 */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">고정비 커버리지</span>
                <span className="text-[10px] text-slate-400 tabular-nums">목표 100%</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: covColor }}>
                  {Number.isFinite(h.fixedCoverage) ? pct(h.fixedCoverage) : '—'}
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">{formatWon(h.fixedIncome)} / {formatWon(h.fixedExpense)}</span>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, covPct)}%`, background: covColor }} />
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 border-t border-slate-100">
            {/* 순수 소비 */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">순수 소비 (변동)</span>
                <span className="text-[10px] text-slate-400 tabular-nums">개인 수입의 {pct(h.pureSpendShare)}</span>
              </div>
              <div className="mt-1 text-[20px] font-bold tabular-nums leading-none">{formatWon(h.pureSpend)}</div>
            </div>

            {/* 전월 대비 */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">전월 대비 순익</span>
                <span className={`text-[10px] tabular-nums ${upNet ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {upNet ? '▲' : '▼'}
                </span>
              </div>
              <div className={`mt-1 text-[20px] font-bold tabular-nums leading-none ${upNet ? 'text-emerald-600' : 'text-rose-600'}`}>
                {upNet ? '+' : ''}{formatWon(h.vsLastMonth.net)}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400 tabular-nums">
                수입 {h.vsLastMonth.income >= 0 ? '+' : ''}{formatWon(h.vsLastMonth.income)} · 지출 {h.vsLastMonth.expense >= 0 ? '+' : ''}{formatWon(h.vsLastMonth.expense)}
              </div>
            </div>
          </div>
        </section>
        );
      })()}

      {/* 저축률 추세 */}
      <section className="card p-5">
        <h2 className="font-semibold mb-3">저축률 추세 (최근 6개월)</h2>
        <SavingsRateChart data={series} />
      </section>

      {/* 장부 요약 — 압축 */}
      <section>
        <h2 className="text-[13px] font-semibold text-slate-700 mb-2">장부별 요약</h2>
        <div className="grid md:grid-cols-2 gap-2">
          {([
            viewMode !== 'business' && { key: 'personal' as const, label: '개인',  data: t.personal, accent: '#6366f1' },
            view !== 'personal'     && { key: 'business' as const, label: '사업자', data: t.business, accent: '#f59e0b' },
          ].filter(Boolean) as { key: string; label: string; data: { income: number; expense: number; net: number }; accent: string }[]).map(a => {
            const total = a.data.income + a.data.expense;
            const incPct = total > 0 ? (a.data.income / total) * 100 : 0;
            const expPct = total > 0 ? (a.data.expense / total) * 100 : 0;
            const isProfit = a.data.net >= 0;
            return (
              <div key={a.key} className="rounded-xl bg-white border border-slate-100 px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-1 h-3 rounded-sm" style={{ background: a.accent }} />
                    <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-slate-400">{a.label}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isProfit ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                    {isProfit ? '흑자' : '적자'}
                  </span>
                </div>

                <div className={`mt-1.5 text-[18px] font-bold tabular-nums leading-none ${isProfit ? 'text-slate-900' : 'text-rose-600'}`}>
                  {isProfit ? '+' : ''}{formatWon(a.data.net)}
                </div>

                <div className="mt-2.5 flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                  {total > 0 ? (
                    <>
                      <div className="h-full bg-emerald-500" style={{ width: `${incPct}%` }} />
                      <div className="h-full bg-rose-400" style={{ width: `${expPct}%` }} />
                    </>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums">
                  <span className="text-slate-500">수입 <b className="text-slate-800 font-semibold">{formatWon(a.data.income)}</b></span>
                  <span className="text-slate-500">지출 <b className="text-slate-800 font-semibold">{formatWon(a.data.expense)}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 예산 */}
      {(() => {
        const budgetsView = view === 'all' ? budgets : budgets.filter(b => b.ledger === view);
        if (budgetsView.length === 0) return null;
        return (
          <section className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">이번 달 예산</h2>
              <Link href="/budgets" className="text-xs text-slate-500 hover:text-slate-900">관리 →</Link>
            </div>
            <div className="space-y-3">
              {budgetsView.map(b => {
                const p = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
                const color = p > 100 ? 'bg-rose-500' : p > 80 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={b.id}>
                    <div className="flex justify-between text-sm">
                      <span>
                        <span className={`chip mr-2 ${b.ledger === 'personal' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                          {b.ledger === 'personal' ? '개인' : '사업자'}
                        </span>
                        {b.category_name}
                      </span>
                      <span className={p > 100 ? 'text-rose-600 font-semibold tabular-nums' : 'text-slate-600 tabular-nums'}>
                        {formatWon(b.spent)} / {formatWon(b.amount)} ({p.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, p)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* 최근 거래 */}
      {(() => {
        const recentView = view === 'all'
          ? recent
          : recent.filter(r =>
              r.type === 'transfer'
                ? (r.from_ledger === view || r.to_ledger === view)
                : r.ledger === view
            );
        if (recentView.length === 0) return null;
        return (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">최근 거래</h2>
            <Link href="/transactions" className="text-xs text-slate-500 hover:text-slate-900">전체보기 →</Link>
          </div>
          <>
            {/* 모바일 카드 */}
            <ul className="sm:hidden divide-y divide-slate-100 -mx-1">
              {recentView.map(r => {
                const ledgerLabel = r.type === 'transfer'
                  ? `${r.from_ledger === 'personal' ? '개인' : '사업자'} → ${r.to_ledger === 'personal' ? '개인' : '사업자'}`
                  : (r.ledger === 'personal' ? '개인' : '사업자');
                const ledgerTone = (r.ledger === 'personal' || r.from_ledger === 'personal') ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700';
                const typeTone = r.type === 'income' ? 'bg-emerald-100 text-emerald-700' : r.type === 'expense' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700';
                const amountTone = r.type === 'income' ? 'text-emerald-600' : r.type === 'expense' ? 'text-rose-600' : 'text-slate-700';
                return (
                  <li key={r.id} className="py-3 px-1 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`chip ${ledgerTone}`}>{ledgerLabel}</span>
                        <span className={`chip ${typeTone}`}>{r.type === 'income' ? '수입' : r.type === 'expense' ? '지출' : '이체'}</span>
                        {r.recurring_id && <span className="chip bg-slate-100 text-slate-600">고정</span>}
                      </div>
                      <div className="mt-1.5 text-sm text-slate-900 truncate">{r.category_name || '-'}</div>
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums truncate">
                        {r.date}{r.memo ? ` · ${r.memo}` : ''}
                      </div>
                    </div>
                    <span className={`font-semibold tabular-nums shrink-0 ${amountTone}`}>{formatWon(r.amount)}</span>
                  </li>
                );
              })}
            </ul>
            {/* 데스크탑 테이블 */}
            <table className="pretty hidden sm:table">
              <thead>
                <tr><th>날짜</th><th>장부</th><th>유형</th><th>카테고리</th><th>메모</th><th className="text-right">금액</th></tr>
              </thead>
              <tbody>
                {recentView.map(r => (
                  <tr key={r.id}>
                    <td className="text-slate-600 tabular-nums">{r.date}</td>
                    <td>
                      <span className={`chip ${(r.ledger === 'personal' || r.from_ledger === 'personal') ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.type === 'transfer'
                          ? `${r.from_ledger === 'personal' ? '개인' : '사업자'} → ${r.to_ledger === 'personal' ? '개인' : '사업자'}`
                          : (r.ledger === 'personal' ? '개인' : '사업자')}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${r.type === 'income' ? 'bg-emerald-100 text-emerald-700' : r.type === 'expense' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}`}>
                        {r.type === 'income' ? '수입' : r.type === 'expense' ? '지출' : '이체'}
                      </span>
                      {r.recurring_id && <span className="chip ml-1 bg-slate-100 text-slate-600">고정</span>}
                    </td>
                    <td>{r.category_name || '-'}</td>
                    <td className="text-slate-500">{r.memo || ''}</td>
                    <td className={`text-right font-medium tabular-nums ${r.type === 'income' ? 'text-emerald-600' : r.type === 'expense' ? 'text-rose-600' : 'text-slate-700'}`}>
                      {formatWon(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        </section>
        );
      })()}
    </div>
  );
}
