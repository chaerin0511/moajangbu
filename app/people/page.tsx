import { listPeople, personStats } from '@/lib/queries';
import { createPerson, deletePerson } from '@/lib/actions';
import { currentMonth, formatWon } from '@/lib/utils';
import { currentUserId } from '@/lib/auth-helper';
import MonthPicker from '@/components/MonthPicker';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const userId = await currentUserId();
  const month = searchParams.month || currentMonth();
  const people = await listPeople(userId);
  const stats = await personStats(userId, month);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1>가족 · 사람별 거래</h1>
        <form>
          <MonthPicker value={month} />
        </form>
      </div>

      <form action={createPerson} className="card p-4 flex gap-3 items-end">
        <label className="flex flex-col gap-1 flex-1"><span className="label">이름</span>
          <input name="name" required placeholder="예: 엄마, 동생" className="input" />
        </label>
        <label className="flex flex-col gap-1 w-48"><span className="label">관계 (선택)</span>
          <input name="relation" placeholder="예: 가족, 친구" className="input" />
        </label>
        <button className="btn-primary">추가</button>
      </form>

      <div className="card overflow-hidden">
        <table className="pretty">
          <thead>
            <tr>
              <th>이름</th>
              <th>관계</th>
              <th className="text-right">{month} 받음</th>
              <th className="text-right">{month} 보냄</th>
              <th className="text-right">올해 누적 받음</th>
              <th className="text-right">올해 누적 보냄</th>
              <th>마지막 거래</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-slate-400">등록된 사람이 없습니다.</td></tr>}
            {stats.map(s => (
              <tr key={s.person.id}>
                <td className="font-medium">{s.person.name}</td>
                <td className="text-slate-500">{s.person.relation || '-'}</td>
                <td className="text-right tabular-nums">{formatWon(s.monthIncome)}</td>
                <td className="text-right tabular-nums">{formatWon(s.monthExpense)}</td>
                <td className="text-right tabular-nums">{formatWon(s.ytdIncome)}</td>
                <td className="text-right tabular-nums">{formatWon(s.ytdExpense)}</td>
                <td className="text-slate-500 tabular-nums">{s.lastDate || '-'}</td>
                <td className="text-right">
                  <form action={deletePerson}>
                    <input type="hidden" name="id" value={s.person.id} />
                    <ConfirmButton message={`"${s.person.name}"을(를) 삭제할까요? 연결된 거래의 사람 정보가 비워집니다.`} className="btn-danger">삭제</ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        거래 추가 시 "사람" 칸을 선택하면 여기에 누적됩니다. 받음 = 그 사람으로부터 받은 수입, 보냄 = 그 사람에게 쓴 지출.
      </p>
    </div>
  );
}
