import { listDebts, debtSummary } from '@/lib/queries';
import { createDebt, deleteDebt, toggleDebt, recordDebtPayment } from '@/lib/actions';
import { DEBT_KINDS } from '@/lib/db';
import { currentMonth, formatWon, todayISO } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const debts = listDebts();
  const summary = debtSummary(currentMonth());

  // group by kind
  const grouped: Record<string, typeof debts> = {};
  for (const d of debts) {
    const k = d.kind || '기타';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(d);
  }
  const groupOrder = DEBT_KINDS.filter(k => grouped[k]);

  return (
    <div className="space-y-6">
      <h1>대출 · 부채</h1>

      <section className="grid md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="label">총 남은 원금</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(summary.totalRemaining)}</div>
          <div className="text-xs text-slate-500 mt-1">활성 대출 {summary.activeCount}건</div>
        </div>
        <div className="card p-4">
          <div className="label">이번달 원금 상환</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(summary.monthPrincipal)}</div>
          <div className="text-xs text-slate-500 mt-1">자산 증가분</div>
        </div>
        <div className="card p-4">
          <div className="label">이번달 이자</div>
          <div className="text-xl font-semibold mt-1 tabular-nums text-rose-600">{formatWon(summary.monthInterest)}</div>
          <div className="text-xs text-slate-500 mt-1">진짜 비용</div>
        </div>
        <div className="card p-4">
          <div className="label">올해 누적 이자</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(summary.ytdInterest)}</div>
        </div>
      </section>

      <form action={createDebt} className="card p-5 grid md:grid-cols-12 gap-3 items-end">
        <label className="md:col-span-3 flex flex-col gap-1"><span className="label">종류</span>
          <select name="kind" defaultValue="학자금(취업후상환)" className="select">
            {DEBT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="md:col-span-3 flex flex-col gap-1"><span className="label">대출 이름</span>
          <input name="name" required placeholder="예: 장학재단 1차" className="input" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">초기 원금 (원)</span>
          <input type="number" name="initial_principal" min="0" step="10000" required className="input text-right tabular-nums" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">연이자율</span>
          <input type="number" name="interest_rate" step="0.001" min="0" defaultValue="0" placeholder="0.04 = 4%" className="input text-right tabular-nums" />
        </label>
        <label className="md:col-span-2 flex flex-col gap-1"><span className="label">시작일</span>
          <input type="date" name="start_date" defaultValue={todayISO()} required className="input" />
        </label>
        <button className="btn-primary md:col-span-12">대출 등록</button>
      </form>

      {debts.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">등록된 대출이 없습니다.</div>
      ) : (
        groupOrder.map(kind => {
          const items = grouped[kind];
          const subtotal = items.reduce((s, d) => s + d.remaining_principal, 0);
          return (
            <section key={kind} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2>{kind}</h2>
                <span className="text-sm text-slate-500 tabular-nums">남은 원금 합계 {formatWon(subtotal)}</span>
              </div>
              <div className="card overflow-hidden">
                <table className="pretty">
                  <thead>
                    <tr>
                      <th>상태</th>
                      <th>이름</th>
                      <th className="text-right">초기 원금</th>
                      <th className="text-right">남은 원금</th>
                      <th className="text-right">누적 이자</th>
                      <th className="text-right">월평균 상환</th>
                      <th className="text-right">완납 예상</th>
                      <th>마지막 납부</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(d => {
                      const progress = d.initial_principal > 0 ? (d.paid_principal / d.initial_principal) : 0;
                      return (
                        <tr key={d.id}>
                          <td>
                            <form action={toggleDebt}>
                              <input type="hidden" name="id" value={d.id} />
                              <button className={`chip ${d.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'} hover:opacity-80`}>
                                {d.active ? '활성' : '완료'}
                              </button>
                            </form>
                          </td>
                          <td>
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-slate-500">시작 {d.start_date} · 연 {(d.interest_rate * 100).toFixed(2)}%</div>
                          </td>
                          <td className="text-right tabular-nums">{formatWon(d.initial_principal)}</td>
                          <td className="text-right tabular-nums">
                            {formatWon(d.remaining_principal)}
                            <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-1 ml-auto overflow-hidden">
                              <div className="h-full bg-[#3182f6]" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                            </div>
                            <div className="text-xs text-slate-500 tabular-nums">{(progress * 100).toFixed(0)}% 갚음</div>
                          </td>
                          <td className="text-right tabular-nums text-slate-600">{formatWon(d.paid_interest)}</td>
                          <td className="text-right tabular-nums">{formatWon(Math.round(d.monthly_avg_principal))}</td>
                          <td className="text-right tabular-nums">
                            {d.monthly_avg_principal > 0 && d.remaining_principal > 0
                              ? `${d.monthsToPayoff.toFixed(0)}개월`
                              : d.remaining_principal === 0 ? '완납' : '-'}
                          </td>
                          <td className="text-slate-500 tabular-nums">{d.last_payment_date || '-'}</td>
                          <td className="text-right">
                            <form action={deleteDebt}>
                              <input type="hidden" name="id" value={d.id} />
                              <button className="btn-danger">삭제</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {debts.filter(d => d.active).length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3">상환 기록</h2>
          <p className="text-xs text-slate-500 mb-3">월 상환액을 원금/이자로 나눠 입력하세요. 취업후상환 학자금은 소득 발생 시점 전엔 이자만 발생할 수도 있어요.</p>
          <form action={recordDebtPayment} className="grid md:grid-cols-6 gap-3 items-end">
            <label className="md:col-span-2 flex flex-col gap-1"><span className="label">대출</span>
              <select name="debt_id" required className="select">
                {debts.filter(d => d.active).map(d => (
                  <option key={d.id} value={d.id}>[{d.kind}] {d.name} (남은 {formatWon(d.remaining_principal)})</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="label">날짜</span>
              <input type="date" name="date" defaultValue={todayISO()} required className="input" />
            </label>
            <label className="flex flex-col gap-1"><span className="label">장부</span>
              <select name="ledger" defaultValue="personal" className="select">
                <option value="personal">개인</option><option value="business">사업자</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="label">원금 (원)</span>
              <input type="number" name="principal_amount" min="0" step="1000" defaultValue="0" className="input text-right tabular-nums" />
            </label>
            <label className="flex flex-col gap-1"><span className="label">이자 (원)</span>
              <input type="number" name="interest_amount" min="0" step="1000" defaultValue="0" className="input text-right tabular-nums" />
            </label>
            <label className="md:col-span-5 flex flex-col gap-1"><span className="label">메모</span>
              <input type="text" name="memo" className="input" placeholder="자동 이체 등" />
            </label>
            <button className="btn-primary">상환 기록</button>
          </form>
        </section>
      )}

      <p className="text-xs text-slate-500">
        원금 상환은 자산이 늘어나는 것과 같아서 저축률 계산 시 "지출"에서 제외됩니다. 이자만 진짜 비용으로 잡혀요.
        취업후상환 학자금은 의무 상환 전까진 이자만 발생하니, 이자 칸만 입력하면 됩니다.
      </p>
    </div>
  );
}
