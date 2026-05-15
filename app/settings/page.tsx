import { getOpeningBalances, balanceAt } from '@/lib/queries';
import { setOpeningBalance, setTaxReserveRate } from '@/lib/actions';
import { formatWon } from '@/lib/utils';
import { currentUserId } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const userId = await currentUserId();
  const ob = await getOpeningBalances(userId);
  const cur = {
    personal: await balanceAt(userId, 'personal'),
    business: await balanceAt(userId, 'business'),
  };
  const ledgers: Array<{ key: 'personal' | 'business'; label: string; tone: string }> = [
    { key: 'personal', label: '개인', tone: 'bg-indigo-100 text-indigo-700' },
    { key: 'business', label: '사업자', tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">설정</h1>
      <p className="text-sm text-slate-500">
        각 장부의 <b>시작 잔액</b>과 <b>시작일</b>을 입력하면 이후 거래가 누적되어 <b>현재 잔액</b>이 계산됩니다.
        시작일 이전 거래는 잔액 계산에서 제외됩니다.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {ledgers.map(l => (
          <form key={l.key} action={setOpeningBalance} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`chip ${l.tone}`}>{l.label}</span>
              <span className="text-xs text-slate-500">현재 잔액</span>
            </div>
            <div className={`text-2xl font-semibold ${cur[l.key] >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {formatWon(cur[l.key])}
            </div>
            <input type="hidden" name="ledger" value={l.key} />
            <label className="flex flex-col gap-1"><span className="label">시작 잔액 (원)</span>
              <input type="number" name="opening_balance" step="1000" defaultValue={ob[l.key].opening_balance}
                     className="input text-right tabular-nums" required />
            </label>
            <label className="flex flex-col gap-1"><span className="label">시작일</span>
              <input type="date" name="opening_date" defaultValue={ob[l.key].opening_date} className="input" required />
            </label>
            <button className="btn-primary w-full">저장</button>
          </form>
        ))}
      </div>

      <div className="card p-5 space-y-3">
        <div>
          <h2>사업자 세금 충당금</h2>
          <p className="text-sm text-slate-500 mt-1">
            사업자 수입의 일정 비율을 "세금용"으로 따로 떼어둡니다. 부가세(10%) + 종소세·4대보험 추정을 합쳐 보통 20~28% 사이.
            대시보드에서 충당금 잔액과 "실제 가용 사업자 잔액"이 자동 계산됩니다.
          </p>
        </div>
        <form action={setTaxReserveRate} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="label">세금 충당 비율 (0.00 ~ 1.00)</span>
            <input type="number" name="tax_reserve_rate" step="0.01" min="0" max="1"
                   defaultValue={ob.business.tax_reserve_rate || 0}
                   className="input text-right tabular-nums w-40" required />
          </label>
          <span className="text-sm text-slate-500">예: 0.25 = 매출의 25%</span>
          <button className="btn-primary">저장</button>
        </form>
      </div>
    </div>
  );
}
