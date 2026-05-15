import { listCategories } from '@/lib/queries';
import { createCategory, deleteCategory } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const cats = await listCategories();
  const personal = cats.filter(c => c.ledger === 'personal');
  const business = cats.filter(c => c.ledger === 'business');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">카테고리</h1>
      <form action={createCategory} className="card p-4 flex gap-2 items-end">
        <label className="flex flex-col gap-1"><span className="label">장부</span>
          <select name="ledger" className="select">
            <option value="personal">개인</option><option value="business">사업자</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1"><span className="label">카테고리명</span>
          <input name="name" required placeholder="예: 식비, 통신비" className="input" />
        </label>
        <button className="btn-primary">추가</button>
      </form>
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { title: '개인', list: personal, tone: 'bg-indigo-100 text-indigo-700' },
          { title: '사업자', list: business, tone: 'bg-amber-100 text-amber-700' },
        ].map(g => (
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
                    <button className="btn-danger px-2 py-1 text-xs">삭제</button>
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
