import { salesSummary, salesByQuarter, salesByCategory, salesByMonthSeries, recentSales, listCategories } from '@/lib/queries';
import { addSale, deleteTransaction } from '@/lib/actions';
import { formatWon, currentMonth } from '@/lib/utils';
import { currentUserId } from '@/lib/auth-helper';
import { getViewMode } from '@/lib/view-mode';
import Link from 'next/link';
import MonthPicker from '@/components/MonthPicker';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: '사업자 매출' };

const FILING_DEADLINES: Record<number, string> = {
  1: '1기 예정신고 · 4월 25일',
  2: '1기 확정신고 · 7월 25일',
  3: '2기 예정신고 · 10월 25일',
  4: '2기 확정신고 · 다음해 1월 25일',
};

export default async function SalesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const month = searchParams.month || currentMonth();
  const year = searchParams.year || month.slice(0, 4);
  const userId = await currentUserId();
  const view = getViewMode();

  const [summary, quarters, byCategory, monthSeries, recent, categories] = await Promise.all([
    salesSummary(userId, month),
    salesByQuarter(userId, year),
    salesByCategory(userId, month),
    salesByMonthSeries(userId, year),
    recentSales(userId, 10),
    listCategories(userId, 'business'),
  ]);

  const maxMonth = Math.max(1, ...monthSeries.map(m => m.total));
  const yearTotalSupply = quarters.reduce((s, q) => s + q.supply, 0);
  const yearTotalVat = quarters.reduce((s, q) => s + q.vat, 0);

  return (
    <div className="space-y-6 pb-8">
      {view === 'personal' && (
        <div className="card p-3 text-sm text-slate-600 bg-amber-50">
          지금 개인 모드입니다 — 매출 페이지는 사업자 데이터입니다.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1>사업자 매출 · 부가세</h1>
        <form className="flex items-center gap-2 text-sm">
          <MonthPicker value={month} />
          <label className="flex items-center gap-1">
            <span className="text-slate-500">연도</span>
            <input type="number" name="year" defaultValue={year} min="2020" max="2100" className="input w-24" />
          </label>
          <button className="btn-primary">조회</button>
        </form>
      </div>

      {/* Top summary cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-xs text-slate-500">이번달 공급가액</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{formatWon(summary.supply)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">이번달 부가세</div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-rose-600">{formatWon(summary.vat)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">매출 합계</div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-emerald-700">{formatWon(summary.total)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">건수</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{summary.count}건</div>
        </div>
      </section>

      {/* Quarter table */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2>{year}년 분기별 부가세</h2>
          <div className="text-xs text-slate-500">연간 공급 {formatWon(yearTotalSupply)} · 부가세 {formatWon(yearTotalVat)}</div>
        </div>
        <div className="card overflow-hidden">
          <table className="pretty">
            <thead>
              <tr><th>분기</th><th>기간</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th><th className="text-right">납부예상</th><th>신고기한</th></tr>
            </thead>
            <tbody>
              {quarters.map(q => (
                <tr key={q.quarter}>
                  <td><span className="chip bg-indigo-100 text-indigo-700">{q.quarter}분기</span></td>
                  <td className="text-slate-600">{q.months}</td>
                  <td className="text-right tabular-nums">{formatWon(q.supply)}</td>
                  <td className="text-right tabular-nums text-rose-600">{formatWon(q.vat)}</td>
                  <td className="text-right tabular-nums font-medium">{formatWon(q.total)}</td>
                  <td className="text-right tabular-nums text-rose-700">{formatWon(q.vatDue)}</td>
                  <td className="text-xs text-slate-500">{FILING_DEADLINES[q.quarter]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monthly trend */}
      <section>
        <h2 className="mb-3">{year}년 12개월 매출 추이</h2>
        <div className="card p-4">
          <div className="space-y-1.5">
            {monthSeries.map(m => {
              const pct = maxMonth > 0 ? (m.total / maxMonth) * 100 : 0;
              return (
                <div key={m.month} className="flex items-center gap-2 text-xs">
                  <div className="w-16 text-slate-500 tabular-nums">{m.month.slice(5)}월</div>
                  <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden relative">
                    <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-32 text-right tabular-nums text-slate-700">{formatWon(m.total)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category breakdown */}
      <section>
        <h2 className="mb-3">{month} 카테고리별 매출 분해</h2>
        <div className="card overflow-hidden">
          <table className="pretty">
            <thead>
              <tr><th>카테고리</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th><th className="text-right">건수</th></tr>
            </thead>
            <tbody>
              {byCategory.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-400">매출 거래가 없습니다.</td></tr>}
              {byCategory.map(row => (
                <tr key={`${row.category_id}`}>
                  <td><span className="chip bg-amber-100 text-amber-700">{row.category_name || '(미지정)'}</span></td>
                  <td className="text-right tabular-nums">{formatWon(row.supply)}</td>
                  <td className="text-right tabular-nums text-rose-600">{formatWon(row.vat)}</td>
                  <td className="text-right tabular-nums font-medium">{formatWon(row.total)}</td>
                  <td className="text-right tabular-nums text-slate-500">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quick sale form */}
      <section>
        <h2 className="mb-3">빠른 매출 입력</h2>
        <form action={addSale} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">날짜</span>
              <input type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required className="input" />
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">금액 (원)</span>
              <input type="number" name="amount" min="0" step="100" required placeholder="0" className="input text-right text-lg font-semibold tabular-nums" />
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">부가세 처리</span>
              <select name="vat_mode" defaultValue="included" className="select">
                <option value="included">포함 (1.1로 분리)</option>
                <option value="separate">별도 입력</option>
                <option value="none">미적용</option>
              </select>
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">카테고리</span>
              <select name="category_id" className="select">
                <option value="">(선택)</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">공급가액 (별도 입력시)</span>
              <input type="number" name="supply_amount" min="0" step="100" placeholder="0" className="input text-right tabular-nums" />
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="label">부가세 (별도 입력시)</span>
              <input type="number" name="vat_amount" min="0" step="100" placeholder="0" className="input text-right tabular-nums" />
            </label>
            <label className="md:col-span-4 flex flex-col gap-1">
              <span className="label">메모</span>
              <input type="text" name="memo" className="input" placeholder="간단한 메모" />
            </label>
            <div className="md:col-span-2 flex items-end">
              <button type="submit" className="btn-primary w-full py-2.5">매출 추가</button>
            </div>
          </div>
        </form>
      </section>

      {/* Recent sales */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2>최근 매출 거래</h2>
          <Link href="/transactions" className="text-sm text-slate-500 hover:text-slate-900">거래 입력 →</Link>
        </div>
        <div className="card overflow-hidden">
          <table className="pretty">
            <thead>
              <tr><th>날짜</th><th>카테고리</th><th>사람</th><th>메모</th><th className="text-right">금액</th><th></th></tr>
            </thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400">매출 거래가 없습니다.</td></tr>}
              {recent.map(t => {
                const hasVat = (t.vat_amount || 0) > 0 && (t.supply_amount || 0) > 0;
                return (
                  <tr key={t.id}>
                    <td className="text-slate-600 tabular-nums">{t.date}</td>
                    <td>{t.category_name || '-'}</td>
                    <td className="text-slate-700">{t.person_name || '-'}</td>
                    <td className="text-slate-500">{t.memo || ''}</td>
                    <td className="text-right">
                      <div className="tabular-nums font-medium text-emerald-700">{formatWon(t.amount)}</div>
                      {hasVat && (
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          포함 {formatWon(t.amount)} = 공급 {formatWon(t.supply_amount!)} + 부가세 {formatWon(t.vat_amount!)}
                        </div>
                      )}
                    </td>
                    <td className="text-right">
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmButton message="이 매출을 삭제할까요?" className="btn-danger">삭제</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
