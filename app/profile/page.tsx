import { ensureDb } from '@/lib/db';
import { currentUserId } from '@/lib/auth-helper';
import { updateProfileName, deleteAccount } from '@/lib/actions';
import { formatWon } from '@/lib/utils';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: '프로필' };

export default async function ProfilePage() {
  const userId = await currentUserId();
  const db = await ensureDb();
  const u = (await db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [userId] })).rows[0] as any;
  if (!u) return <div>사용자 정보를 찾을 수 없습니다.</div>;

  const tx = (await db.execute({ sql: 'SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=?', args: [userId] })).rows[0] as any;
  const debts = (await db.execute({ sql: 'SELECT COUNT(*) AS c FROM debts WHERE user_id=?', args: [userId] })).rows[0] as any;
  const people = (await db.execute({ sql: 'SELECT COUNT(*) AS c FROM people WHERE user_id=?', args: [userId] })).rows[0] as any;

  const joined = u.created_at ? String(u.created_at).slice(0, 10) : '-';

  return (
    <div className="space-y-6 max-w-2xl">
      <h1>프로필</h1>

      <section className="card p-6 flex items-center gap-5">
        {u.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.image} alt="" className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-2xl text-slate-500">
            {String(u.name || '?').charAt(0)}
          </div>
        )}
        <div>
          <div className="text-lg font-semibold">{u.name}</div>
          <div className="text-sm text-slate-500">{u.email || '이메일 미동의'}</div>
          <div className="text-xs text-slate-400 mt-1">가입일 {joined}</div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3">이름 변경</h2>
        <form action={updateProfileName} className="flex gap-2">
          <input name="name" defaultValue={u.name} required className="input flex-1" placeholder="표시할 이름" />
          <button className="btn-primary">저장</button>
        </form>
        <p className="text-xs text-slate-500 mt-2">카카오 닉네임 대신 다른 이름으로 표시할 수 있어요. 다시 로그인해도 유지됩니다.</p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3">요약</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-500">총 거래 건수</div>
            <div className="text-lg font-semibold tabular-nums mt-1">{Number(tx.c)}건</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">총 거래 금액</div>
            <div className="text-lg font-semibold tabular-nums mt-1">{formatWon(Number(tx.s))}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">대출 건수</div>
            <div className="text-lg font-semibold tabular-nums mt-1">{Number(debts.c)}건</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">가족·관계인</div>
            <div className="text-lg font-semibold tabular-nums mt-1">{Number(people.c)}명</div>
          </div>
        </div>
      </section>

      <section className="card p-5 border border-rose-200">
        <h2 className="mb-2 text-rose-600">회원 탈퇴</h2>
        <p className="text-sm text-slate-600 mb-3">
          탈퇴하면 모아장부에 저장된 <b>내 모든 데이터(거래·대출·가족·예산·카테고리 등)가 즉시 삭제</b>됩니다.
          카카오와의 연결도 끊깁니다(다시 로그인하면 새 계정처럼 시작).
        </p>
        <form action={deleteAccount}>
          <ConfirmButton
            message="정말 회원 탈퇴하시겠습니까? 모든 거래·대출·예산·카테고리 데이터가 즉시 삭제되며 복구할 수 없습니다."
            className="btn-danger"
          >
            회원 탈퇴 (모든 데이터 삭제)
          </ConfirmButton>
        </form>
        <p className="text-xs text-rose-500 mt-2">이 버튼은 누르면 즉시 실행됩니다. 신중히.</p>
      </section>
    </div>
  );
}
