import { listCategories } from '@/lib/queries';
import { createCategory, deleteCategory } from '@/lib/actions';
import { currentUserId } from '@/lib/auth-helper';
import { getViewMode } from '@/lib/view-mode';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const userId = await currentUserId();
  const view = getViewMode();
  const cats = await listCategories(userId, view !== 'all' ? view : undefined);
  const personal = cats.filter(c => c.ledger === 'personal');
  const business = cats.filter(c => c.ledger === 'business');
  const groups = [
    { key: 'personal', title: '개인', list: personal, tone: 'bg-indigo-100 text-indigo-700' },
    { key: 'business', title: '사업자', list: business, tone: 'bg-amber-100 text-amber-700' },
  ].filter(g => view === 'all' || g.key === view);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">카테고리</h1>
      <form action={createCategory} className="card p-4 flex gap-2 items-end">
        <label className="flex flex-col gap-1"><span className="label">장부</span>
          <select name="ledger" className="select" defaultValue={view !== 'all' ? view : 'personal'}>
            {(view === 'all' || view === 'personal') && <option value="personal">개인</option>}
            {(view === 'all' || view === 'business') && <option value="business">사업자</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1"><span className="label">카테고리명</span>
          <input name="name" required placeholder="예: 식비, 통신비" className="input" />
        </label>
        <button className="btn-primary">추가</button>
      </form>
      <div className="grid md:grid-cols-2 gap-4">
        {groups.map(g => (
          <div key={g.title} className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className={`chip ${g.tone}`}>{g.title}</span>
              <h2 className="font-semibold">{g.list.length}개</h2>
            </div>
            <ul className="space-y-1">
              {g.list.map(c => (
                <li key={c.id} className="flex justify-between items-center py-2 px-2 rounded-lg hover:bg-slate-50 text-sm">
                  <span>{c.name}</span>
                  <form action={deleteCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton message={`카테고리 "${c.name}"을(를) 삭제할까요? 연결된 거래의 카테고리는 비워집니다.`} className="btn-danger px-2 py-1 text-xs">삭제</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
