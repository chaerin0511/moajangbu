import { listCategories } from '@/lib/queries';
import { createCategory, deleteCategory } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const cats = listCategories();
  const personal = cats.filter(c => c.ledger === 'personal');
  const business = cats.filter(c => c.ledger === 'business');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">카테고리</h1>
      <form action={createCategory} className="flex gap-2 bg-white border border-slate-200 rounded p-3">
        <select name="ledger" className="border rounded p-1.5">
          <option value="personal">개인</option><option value="business">사업자</option>
        </select>
        <input name="name" required placeholder="카테고리명" className="border rounded p-1.5 flex-1" />
        <button className="bg-slate-900 text-white rounded px-3">추가</button>
      </form>
      <div className="grid grid-cols-2 gap-4">
        {[{ title: '개인', list: personal }, { title: '사업자', list: business }].map(g => (
          <div key={g.title} className="bg-white border border-slate-200 rounded p-3">
            <h2 className="font-semibold mb-2">{g.title}</h2>
            <ul className="space-y-1">
              {g.list.map(c => (
                <li key={c.id} className="flex justify-between border-b py-1 text-sm">
                  <span>{c.name}</span>
                  <form action={deleteCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-rose-600 text-xs hover:underline">삭제</button>
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
