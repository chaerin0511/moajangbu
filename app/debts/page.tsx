import { listDebts, debtSummary, accrueDebtInterest } from '@/lib/queries';
import { createDebt, deleteDebt, toggleDebt, recordDebtPayment, addDebtRate } from '@/lib/actions';
import { DEBT_KINDS } from '@/lib/db';
import { currentMonth, formatWon, todayISO } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await accrueDebtInterest();
  const debts = await listDebts();
  const summary = await debtSummary(currentMonth());
  const totalAccrued = debts.reduce((s, d) => s + (d.accrued_interest || 0), 0);

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
          <div className="label">올해 누적 이자 (납부)</div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{formatWon(summary.ytdInterest)}</div>
          <div className="text-xs text-rose-600 mt-1">미납 이자 잔액 {formatWon(totalAccrued)}</div>
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
        <label className="md:col-span-3 flex flex-col gap-1"><span className="label">거치기간 (개월)</span>
          <input type="number" name="grace_period_months" min="0" step="1" defaultValue="0" className="input text-right tabular-nums" placeholder="거치 중엔 원금 안 줄고 이자만 누적" />
        </label>
        <label className="md:col-span-3 flex flex-col gap-1"><span className="label">의무상환 시작 소득 (원/년)</span>
          <input type="number" name="mandatory_repay_income" min="0" step="100000" defaultValue="0" className="input text-right tabular-nums" placeholder="취업후상환 학자금만 입력" />
        </label>
        <button className="btn-primary md:col-span-6">대출 등록</button>
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
                            <div className="font-medium">
                              {d.name}
                              {d.in_grace && <span className="ml-2 chip bg-amber-100 text-amber-700">거치중</span>}
                              {d.mandatory_repay_income > 0 && <span className="ml-2 chip bg-indigo-100 text-indigo-700">취업후상환</span>}
                            </div>
                            <div className="text-xs text-slate-500">
                              시작 {d.start_date} · 현재 연 {(d.current_rate * 100).toFixed(2)}%
                              {d.grace_ends && <> · 거치 종료 {d.grace_ends}</>}
                            </div>
                            {d.mandatory_repay_eta && (
                              <div className="text-xs text-indigo-600 mt-0.5">
                                기준 소득 {formatWon(d.mandatory_repay_income)} · {d.mandatory_repay_eta}
                                {d.annualized_income > 0 && <> · 현재 연환산 {formatWon(d.annualized_income)}</>}
                              </div>
                            )}
                            {d.accrued_interest > 0 && (
                              <div className="text-xs text-rose-600 mt-0.5">미납 이자 잔액 {formatWon(d.accrued_interest)}</div>
                            )}
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

      {debts.filter(d => d.active).length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3">금리 변경 기록</h2>
          <p className="text-xs text-slate-500 mb-3">변동금리 대출의 금리가 바뀌었을 때 입력하세요. 이후 월별 이자 누적에 자동 반영됩니다.</p>
          <form action={addDebtRate} className="grid md:grid-cols-6 gap-3 items-end">
            <label className="md:col-span-2 flex flex-col gap-1"><span className="label">대출</span>
              <select name="debt_id" required className="select">
                {debts.filter(d => d.active).map(d => (
                  <option key={d.id} value={d.id}>{d.name} (현재 {(d.current_rate * 100).toFixed(2)}%)</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="label">적용일</span>
              <input type="date" name="effective_date" defaultValue={todayISO()} required className="input" />
            </label>
            <label className="flex flex-col gap-1"><span className="label">새 연이자율</span>
              <input type="number" name="rate" step="0.001" min="0" required className="input text-right tabular-nums" placeholder="0.045 = 4.5%" />
            </label>
            <button className="btn-primary">금리 변경 추가</button>
          </form>
        </section>
      )}

      <p className="text-xs text-slate-500">
        매월 1일 기준으로 남은 원금 × 연이자율 / 12가 자동 누적됩니다 (거치 중엔 원금이 줄지 않아 이자만 쌓여요).
        상환 시 입력한 이자 금액은 미납 이자 잔액에서 먼저 차감됩니다. 원금 상환은 자산 증가로 보아 저축률 계산 시 지출에서 제외됩니다.
      </p>
    </div>
  );
}
