import { currentUserId } from '@/lib/auth-helper';
import { ensureDb } from '@/lib/db';
import { ALL_NAV_ITEMS, parseNavOrder, navLabel } from '@/lib/nav-items';
import { moveNavItemUp, moveNavItemDown, toggleNavItem } from '@/lib/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: '메뉴 순서 편집' };

export default async function Page() {
  const userId = await currentUserId();
  const db = await ensureDb();
  const r = await db.execute({ sql: 'SELECT nav_order FROM users WHERE id=?', args: [userId] });
  const raw = (r.rows[0] as any)?.nav_order || null;
  const order = parseNavOrder(raw);
  const set = new Set(order);
  const hidden = ALL_NAV_ITEMS.filter(i => !set.has(i.href));

  return (
    <div className="space-y-6 max-w-2xl">
      <h1>메뉴 순서 편집</h1>
      <p className="text-sm text-slate-500">
        메인 네비에 표시할 메뉴와 순서를 정해보세요. 모바일에서는 앞에서부터 4개가 하단 탭에 표시돼요.
        나머지는 ‘더보기’에서 볼 수 있어요.
      </p>

      <section className="card divide-y divide-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 text-sm font-semibold bg-slate-50">메인 네비에 표시</div>
        {order.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">표시할 메뉴가 없어요.</div>
        )}
        {order.map((href, idx) => (
          <div key={href} className="flex items-center px-4 py-3">
            <div className="flex-1">
              <span className="text-[15px] font-medium">{navLabel(href)}</span>
              <span className="text-xs text-slate-400 ml-2">{href}</span>
            </div>
            <form action={moveNavItemUp} className="inline">
              <input type="hidden" name="slug" value={href} />
              <button disabled={idx === 0} className="text-sm px-2 py-1 text-slate-600 disabled:text-slate-300">▲</button>
            </form>
            <form action={moveNavItemDown} className="inline">
              <input type="hidden" name="slug" value={href} />
              <button disabled={idx === order.length - 1} className="text-sm px-2 py-1 text-slate-600 disabled:text-slate-300">▼</button>
            </form>
            <form action={toggleNavItem} className="inline">
              <input type="hidden" name="slug" value={href} />
              <button className="text-xs text-rose-600 px-2 py-1">삭제</button>
            </form>
          </div>
        ))}
      </section>

      <section className="card divide-y divide-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 text-sm font-semibold bg-slate-50">더보기에 있음</div>
        {hidden.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">모든 메뉴가 메인에 있어요.</div>
        )}
        {hidden.map(it => (
          <div key={it.href} className="flex items-center px-4 py-3">
            <div className="flex-1">
              <span className="text-[15px] font-medium">{it.label}</span>
              <span className="text-xs text-slate-400 ml-2">{it.href}</span>
            </div>
            <form action={toggleNavItem} className="inline">
              <input type="hidden" name="slug" value={it.href} />
              <button className="text-xs text-[#3182f6] px-2 py-1">+ 추가</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
