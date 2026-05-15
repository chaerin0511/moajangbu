import Link from 'next/link';
import { listInvestments, investmentSummary } from '@/lib/queries';
import { createInvestment, updateInvestmentPrice, deleteInvestment, toggleInvestment } from '@/lib/actions';
import { INVESTMENT_TYPES } from '@/lib/db';
import { formatWon } from '@/lib/utils';
import { currentUserId } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const metadata = { title: '투자' };

function fmtNum(n: number, frac = 2): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: frac }).format(n);
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(2) + '%';
}

export default async function Page() {
  const userId = await currentUserId();
  const [rows, summary] = await Promise.all([listInvestments(userId), investmentSummary(userId)]);

  return (
    <div className="space-y-6">
      <h1>투자</h1>

      <section className="grid md:grid-cols-5 gap-3">
        <div className="card p-4">
          <div className="label">총 투자(누적)</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(Math.round(summary.totalInvested))}</div>
        </div>
        <div className="card p-4">
          <div className="label">평가금액</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(Math.round(summary.totalCurrent))}</div>
        </div>
        <div className="card p-4">
          <div className="label">평가손익</div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${summary.totalUnrealized >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatWon(Math.round(summary.totalUnrealized))}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">수익률</div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${summary.totalReturnPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmtPct(summary.totalReturnPct)}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">실현손익</div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${summary.totalRealized >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatWon(Math.round(summary.totalRealized))}
          </div>
          <div className="text-xs text-slate-500 mt-1">활성 {summary.activeCount}개</div>
        </div>
      </section>

      <form action={createInvestment} className="card p-5 grid md:grid-cols-12 gap-3 items-end">
        <label className="md:col-span-3 flex flex-col gap-1"><span className="label">종목 이름</span>
          <input name="name" required placeholder="예: 삼성전자" className="input" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">티커</span>
          <input name="ticker" placeholder="005930" className="input" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">종류</span>
          <select name="type" defaultValue="주식" className="select">
            {INVESTMENT_TYPES.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">통화</span>
          <select name="currency" defaultValue="KRW" className="select">
            <option value="KRW">KRW</option><option value="USD">USD</option><option value="JPY">JPY</option>
          </select>
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">현재가</span>
          <input type="number" name="current_price" step="0.01" min="0" defaultValue="0" className="input text-right tabular-nums" />
        </label>
        <button className="btn-primary md:col-span-1">추가</button>
      </form>

      <section className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">아직 등록한 투자 종목이 없어요.</div>
        ) : (
          <table className="pretty">
            <thead>
              <tr>
                <th>종목</th>
                <th className="text-right">보유수량</th>
                <th className="text-right">평균단가</th>
                <th className="text-right">현재가</th>
                <th className="text-right">평가금액</th>
                <th className="text-right">수익률</th>
                <th>최근 거래</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={r.active ? '' : 'opacity-50'}>
                  <td>
                    <Link href={`/investments/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    {r.ticker && <span className="ml-2 text-xs text-slate-500">{r.ticker}</span>}
                    <span className="chip ml-2">{r.type}</span>
                  </td>
                  <td className="text-right tabular-nums">{fmtNum(r.total_quantity, 4)}</td>
                  <td className="text-right tabular-nums">{fmtNum(r.avg_cost, 2)}</td>
                  <td className="text-right tabular-nums">
                    <form action={updateInvestmentPrice} className="inline-flex gap-1 items-center">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="number" name="current_price" defaultValue={r.current_price} step="0.01" min="0"
                             className="input text-right tabular-nums w-24 py-1 text-xs" />
                      <button className="text-xs text-[#3182f6]">저장</button>
                    </form>
                  </td>
                  <td className="text-right tabular-nums">{formatWon(Math.round(r.current_value))}</td>
                  <td className={`text-right tabular-nums ${r.return_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {fmtPct(r.return_pct)}
                  </td>
                  <td className="text-xs text-slate-500">{r.last_trade_date || '-'}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/investments/${r.id}`} className="text-xs text-[#3182f6] mr-2">상세</Link>
                    <form action={toggleInvestment} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-slate-500 mr-2">{r.active ? '비활성' : '활성'}</button>
                    </form>
                    <form action={deleteInvestment} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-rose-600">삭제</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
