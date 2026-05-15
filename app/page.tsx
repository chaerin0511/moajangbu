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
import SectionHeader, { Icon } from '@/components/SectionHeader';

export const dynamic = 'force-dynamic';

function pct(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return `${(n * 100).toFixed(0)}%`;
}

function StatCard({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub?: string; tone?: 'emerald' | 'rose' | 'amber' | 'slate' | 'indigo' }) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
    slate: 'text-slate-900',
    indigo: 'text-indigo-600',
  };
  return (
    <div className="card p-4">
      <div className="label">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tones[tone]} tabular-nums`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function HealthHero({ month, rate, net, vsLastMonth }: { month: string; rate: number; net: number; vsLastMonth: number }) {
  const tier =
    rate >= 0.2 ? { label: '건강', color: 'text-emerald-600', sub: '저축률이 안전 구간입니다.', stripe: 'from-emerald-400 to-emerald-600' } :
    rate >= 0.05 ? { label: '보통', color: 'text-amber-600', sub: '저축 여력은 있지만 빠듯합니다.', stripe: 'from-amber-400 to-amber-600' } :
    rate >= 0 ? { label: '주의', color: 'text-rose-500', sub: '거의 남지 않습니다. 변동 소비를 점검하세요.', stripe: 'from-rose-400 to-rose-500' } :
    { label: '위험', color: 'text-rose-600', sub: '이번 달 적자입니다.', stripe: 'from-rose-500 to-rose-700' };

  return (
    <section className="card relative overflow-hidden p-5 sm:p-6">
      <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${tier.stripe}`} />
      <div className="flex items-start justify-between gap-4 flex-col sm:flex-row">
        <div className="min-w-0">
          <div className="label">{month}</div>
          <div className="flex items-baseline gap-3 mt-2 flex-wrap">
            <span className={`text-2xl font-semibold ${tier.color}`}>{tier.label}</span>
            <span className="text-sm text-slate-500">저축률 <b className="text-slate-900 tabular-nums">{pct(rate)}</b></span>
          </div>
          <div className="text-sm text-slate-500 mt-1">{tier.sub}</div>
          <div className="text-sm text-slate-700 mt-3">
            남는 돈 <b className="tabular-nums">{formatWon(net)}</b>
            <span className="ml-3 text-slate-500">전월 대비 <span className={vsLastMonth >= 0 ? 'text-emerald-600' : 'text-rose-500'}>{vsLastMonth >= 0 ? '+' : ''}{formatWon(vsLastMonth)}</span></span>
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

      {/* 잔액 */}
      <section>
        <SectionHeader icon={Icon.wallet} tone="blue" title="계좌 잔액" />
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { key: 'personal', label: '개인', bal: balPersonal, proj: projPersonal, tone: 'bg-indigo-100 text-indigo-700', stripe: 'bg-indigo-500' },
            { key: 'business', label: '사업자', bal: balBusiness, proj: projBusiness, tone: 'bg-amber-100 text-amber-700', stripe: 'bg-amber-500' },
          ].filter(a => view === 'all' || a.key === view).map(a => {
            const diff = a.proj - a.bal;
            return (
              <div key={a.key} className="card relative overflow-hidden p-5">
                <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${a.stripe}`} />
                <div className="flex items-center justify-between mb-2">
                  <span className={`chip ${a.tone}`}>{a.label}</span>
                  <Link href="/settings" className="text-xs text-slate-400 hover:text-slate-700">시작잔액 설정</Link>
                </div>
                <div className={`text-3xl font-bold tabular-nums ${a.bal >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                  {formatWon(a.bal)}
                </div>
                <div className="text-xs text-slate-500 mt-2 tabular-nums">
                  월말 예상 <span className={a.proj < 0 ? 'text-rose-600 font-medium' : 'text-slate-700 font-medium'}>{formatWon(a.proj)}</span>
                  {diff !== 0 && <span className={`ml-2 ${diff < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>({diff > 0 ? '+' : ''}{formatWon(diff)})</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 사업자 세금 충당금 */}
      {tax.rate > 0 && view !== 'personal' && (
        <section>
          <SectionHeader icon={Icon.receipt} tone="amber" title="사업자 세금 충당금 (올해 누적)" />
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
          <SectionHeader
            icon={Icon.card}
            tone="rose"
            title="대출 현황"
            right={<Link href="/debts" className="text-xs text-slate-500 hover:text-slate-900">관리 →</Link>}
          />
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

      {/* 비상금 & 연간 누적 */}
      <section>
        <SectionHeader icon={Icon.shield} tone="emerald" title="비상금 · 연간 누적" />
        <div className="grid md:grid-cols-2 gap-3">
          {viewMode !== 'business' && (
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3>비상금</h3>
              <span className="text-xs text-slate-500">개인 고정지출 기준</span>
            </div>
            <div className="text-2xl font-bold tabular-nums mt-2">
              {ef.months.toFixed(1)}<span className="text-base text-slate-500 ml-1">개월치</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className={`h-full ${ef.months >= 6 ? 'bg-emerald-500' : ef.months >= 3 ? 'bg-amber-500' : 'bg-rose-500'}`}
                   style={{ width: `${Math.min(100, (ef.months / 6) * 100)}%` }} />
            </div>
            <div className="text-xs text-slate-500 mt-2">
              월평균 고정지출 {formatWon(Math.round(ef.monthlyFixed))} · 권장 6개월
            </div>
          </div>
          )}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3>{new Date().getFullYear()}년 누적 저축</h3>
              <span className="text-xs text-slate-500">YTD</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums mt-2 ${ytd.net < 0 ? 'text-rose-600' : ''}`}>
              {formatWon(ytd.net)}
            </div>
            <div className="text-xs text-slate-500 mt-2 tabular-nums">
              수입 {formatWon(ytd.income)} · 지출 {formatWon(ytd.expense)}
            </div>
          </div>
        </div>
      </section>

      {/* 이상 지출 감지 */}
      {(() => {
        const anomaliesView = view === 'all' ? anomalies : anomalies.filter(a => a.ledger === view);
        return anomaliesView.length > 0 && (
        <section className="card p-5">
          <SectionHeader icon={Icon.alert} tone="rose" title="이상 지출 감지" />
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

      {/* 고정지출 분해 */}
      {(() => {
        const fixedView = view === 'all' ? fixedBreakdown : fixedBreakdown.filter(x => x.ledger === view);
        return (
      <section className="card p-5">
        <SectionHeader icon={Icon.repeat} tone="violet" title={`${month} 고정지출 분해`} />
        {fixedView.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">고정지출이 없습니다.</p>
        ) : (() => {
          const total = fixedView.reduce((s, x) => s + x.amount, 0);
          return (
            <>
              {/* 모바일 카드 */}
              <div className="sm:hidden space-y-2">
                {fixedView.map((x, i) => {
                  const share = total > 0 ? (x.amount / total) * 100 : 0;
                  return (
                    <div key={i} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`chip shrink-0 ${x.ledger === 'personal' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                            {x.ledger === 'personal' ? '개인' : '사업자'}
                          </span>
                          <span className="truncate text-sm">{x.category_name || '(미지정)'}</span>
                        </div>
                        <span className="text-sm font-medium tabular-nums shrink-0">{formatWon(x.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5 tabular-nums">
                        <span>{x.count}건</span>
                        <span>{share.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 px-1 text-sm font-semibold">
                  <span>합계</span>
                  <span className="tabular-nums">{formatWon(total)}</span>
                </div>
              </div>
              {/* 데스크탑 테이블 */}
              <table className="pretty hidden sm:table">
                <thead>
                  <tr>
                    <th>장부</th><th>카테고리</th><th className="text-right">건수</th><th className="text-right">금액</th><th className="text-right">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedView.map((x, i) => (
                    <tr key={i}>
                      <td>
                        <span className={`chip ${x.ledger === 'personal' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                          {x.ledger === 'personal' ? '개인' : '사업자'}
                        </span>
                      </td>
                      <td>{x.category_name || '(미지정)'}</td>
                      <td className="text-right tabular-nums">{x.count}</td>
                      <td className="text-right tabular-nums font-medium">{formatWon(x.amount)}</td>
                      <td className="text-right tabular-nums text-slate-500">{total > 0 ? `${((x.amount / total) * 100).toFixed(0)}%` : '-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="text-right font-semibold">합계</td>
                    <td className="text-right tabular-nums font-semibold">{formatWon(total)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </>
          );
        })()}
      </section>
        );
      })()}

      {/* 4지표 */}
      <section>
        <SectionHeader icon={Icon.chart} tone="blue" title={`${month} 판단 지표`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="저축률"
            value={pct(h.savingsRate)}
            tone={h.savingsRate >= 0.2 ? 'emerald' : h.savingsRate >= 0.05 ? 'amber' : 'rose'}
            sub={`수입 ${formatWon(h.income)} · 지출 ${formatWon(h.expense)}`}
          />
          <StatCard
            label="고정비 커버리지"
            value={Number.isFinite(h.fixedCoverage) ? pct(h.fixedCoverage) : '—'}
            tone={h.fixedCoverage >= 1 ? 'emerald' : h.fixedCoverage >= 0.7 ? 'amber' : 'rose'}
            sub={`고정수입 ${formatWon(h.fixedIncome)} / 고정지출 ${formatWon(h.fixedExpense)}`}
          />
          <StatCard
            label="순수 소비 (변동)"
            value={formatWon(h.pureSpend)}
            tone="indigo"
            sub={`개인 수입의 ${pct(h.pureSpendShare)}`}
          />
          <StatCard
            label="전월 대비 순익"
            value={(h.vsLastMonth.net >= 0 ? '+' : '') + formatWon(h.vsLastMonth.net)}
            tone={h.vsLastMonth.net >= 0 ? 'emerald' : 'rose'}
            sub={`수입 ${h.vsLastMonth.income >= 0 ? '+' : ''}${formatWon(h.vsLastMonth.income)} · 지출 ${h.vsLastMonth.expense >= 0 ? '+' : ''}${formatWon(h.vsLastMonth.expense)}`}
          />
        </div>
      </section>

      {/* 저축률 추세 */}
      <section className="card p-5">
        <SectionHeader icon={Icon.trending} tone="emerald" title="저축률 추세 (최근 6개월)" />
        <SavingsRateChart data={series} />
      </section>

      {/* 장부 요약 */}
      <section>
        <SectionHeader icon={Icon.book} tone="indigo" title="장부별 요약" />
        <div className="grid md:grid-cols-2 gap-3">
          {viewMode !== 'business' && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><span className="chip bg-indigo-100 text-indigo-700">개인</span></div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="label">수입</div><div className="font-semibold tabular-nums text-slate-900">{formatWon(t.personal.income)}</div></div>
              <div><div className="label">지출</div><div className="font-semibold tabular-nums text-slate-900">{formatWon(t.personal.expense)}</div></div>
              <div><div className="label">순익</div><div className={`font-semibold tabular-nums ${t.personal.net < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatWon(t.personal.net)}</div></div>
            </div>
          </div>
          )}
          {view !== 'personal' && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><span className="chip bg-amber-100 text-amber-700">사업자</span></div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="label">수입</div><div className="font-semibold tabular-nums text-slate-900">{formatWon(t.business.income)}</div></div>
              <div><div className="label">지출</div><div className="font-semibold tabular-nums text-slate-900">{formatWon(t.business.expense)}</div></div>
              <div><div className="label">순익</div><div className={`font-semibold tabular-nums ${t.business.net < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatWon(t.business.net)}</div></div>
            </div>
          </div>
          )}
        </div>
      </section>

      {/* 예산 */}
      <section className="card p-5">
        <SectionHeader
          icon={Icon.target}
          tone="emerald"
          title="이번 달 예산"
          right={<Link href="/budgets" className="text-xs text-slate-500 hover:text-slate-900">관리 →</Link>}
        />
        {(() => {
          const budgetsView = view === 'all' ? budgets : budgets.filter(b => b.ledger === view);
          return budgetsView.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">설정된 예산이 없습니다.</p>
        ) : (
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
        );
        })()}
      </section>

      {/* 최근 거래 */}
      <section className="card p-5">
        <SectionHeader
          icon={Icon.list}
          tone="slate"
          title="최근 거래"
          right={<Link href="/transactions" className="text-xs text-slate-500 hover:text-slate-900">전체보기 →</Link>}
        />
        {(() => {
          const recentView = view === 'all'
            ? recent
            : recent.filter(r =>
                r.type === 'transfer'
                  ? (r.from_ledger === view || r.to_ledger === view)
                  : r.ledger === view
              );
          return recentView.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">거래 내역이 없습니다.</p>
        ) : (
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
        );
        })()}
      </section>
    </div>
  );
}
