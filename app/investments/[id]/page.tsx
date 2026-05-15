import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInvestment, listInvestmentTrades } from '@/lib/queries';
import { addInvestmentTrade, deleteInvestmentTrade } from '@/lib/actions';
import { formatWon, todayISO } from '@/lib/utils';
import { currentUserId } from '@/lib/auth-helper';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

function fmtNum(n: number, frac = 2): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: frac }).format(n);
}
function fmtPct(n: number): string {
  return (n * 100).toFixed(2) + '%';
}

const TRADE_LABEL: Record<string, string> = {
  buy: '매수', sell: '매도', dividend: '배당', fee: '수수료',
};

export default async function Page({ params }: { params: { id: string } }) {
  const userId = await currentUserId();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const inv = await getInvestment(userId, id);
  if (!inv) notFound();
  const trades = await listInvestmentTrades(userId, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/investments" className="text-sm text-slate-500 hover:text-slate-700">← 목록</Link>
        <h1 className="!m-0">{inv.name} {inv.ticker && <span className="text-base text-slate-500">{inv.ticker}</span>}</h1>
        <span className="chip">{inv.type}</span>
        <span className="chip">{inv.currency}</span>
      </div>

      <section className="grid md:grid-cols-5 gap-3">
        <div className="card p-4">
          <div className="label">보유수량</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{fmtNum(inv.total_quantity, 4)}</div>
        </div>
        <div className="card p-4">
          <div className="label">평균단가</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{fmtNum(inv.avg_cost, 2)}</div>
        </div>
        <div className="card p-4">
          <div className="label">현재가</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{fmtNum(inv.current_price, 2)}</div>
          <div className="text-xs text-slate-500 mt-1">{inv.current_price_at || '-'}</div>
        </div>
        <div className="card p-4">
          <div className="label">평가금액</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(Math.round(inv.current_value))}</div>
        </div>
        <div className="card p-4">
          <div className="label">수익률</div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${inv.return_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {fmtPct(inv.return_pct)}
          </div>
          <div className="text-xs text-slate-500 mt-1">실현 {formatWon(Math.round(inv.realized_pnl))}</div>
        </div>
      </section>

      <form action={addInvestmentTrade} className="card p-5 grid md:grid-cols-12 gap-3 items-end">
        <input type="hidden" name="investment_id" value={inv.id} />
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">날짜</span>
          <input type="date" name="date" defaultValue={todayISO()} required className="input" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">유형</span>
          <select name="type" defaultValue="buy" className="select">
            <option value="buy">매수</option>
            <option value="sell">매도</option>
            <option value="dividend">배당</option>
            <option value="fee">수수료</option>
          </select>
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">수량</span>
          <input type="number" name="quantity" step="0.0001" min="0" defaultValue="0" className="input text-right tabular-nums" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">단가</span>
          <input type="number" name="price" step="0.01" min="0" defaultValue="0" className="input text-right tabular-nums" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">금액 (비우면 자동)</span>
          <input type="number" name="amount" step="1" min="0" className="input text-right tabular-nums" />
        </label>
        <label className="md:col-span-1 flex flex-col gap-1"><span className="label">메모</span>
          <input name="memo" className="input" />
        </label>
        <button className="btn-primary md:col-span-1">기록</button>
      </form>

      <section className="card overflow-hidden">
        {trades.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">거래내역이 없어요.</div>
        ) : (
          <table className="pretty">
            <thead>
              <tr>
                <th>날짜</th><th>유형</th>
                <th className="text-right">수량</th>
                <th className="text-right">단가</th>
                <th className="text-right">금액</th>
                <th>메모</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td><span className="chip">{TRADE_LABEL[t.type] || t.type}</span></td>
                  <td className="text-right tabular-nums">{fmtNum(t.quantity, 4)}</td>
                  <td className="text-right tabular-nums">{fmtNum(t.price, 2)}</td>
                  <td className="text-right tabular-nums">{formatWon(t.amount)}</td>
                  <td className="text-xs text-slate-500">{t.memo || ''}</td>
                  <td className="text-right">
                    <form action={deleteInvestmentTrade} className="inline">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="investment_id" value={inv.id} />
                      <ConfirmButton message="이 거래를 삭제할까요?" className="text-xs text-rose-600">삭제</ConfirmButton>
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
