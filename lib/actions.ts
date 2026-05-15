'use server';
import { ensureDb } from './db';
import { invalidateRecurringCache } from './queries';
import { revalidatePath } from 'next/cache';
import { currentUserId } from './auth-helper';
import { signOut, updateSession } from '@/auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function setViewMode(fd: FormData) {
  const v = String(fd.get('mode') || 'all');
  if (v !== 'all' && v !== 'personal' && v !== 'business') return;
  cookies().set('ledger_view', v, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  // 쿠키만 갱신, 페이지는 사용자가 이동할 때 자연스럽게 새 모드로 렌더됨.
  // (이전: revalidatePath('/', 'layout') — 모든 페이지 캐시까지 무효화돼 전 페이지 SSR 재실행)
  revalidatePath('/');
}

export async function setBusinessTarget(fd: FormData) {
  const userId = await currentUserId();
  const month = String(fd.get('month') || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const target_revenue = Math.max(0, Math.round(Number(fd.get('target_revenue')) || 0));
  const target_profit = Math.max(0, Math.round(Number(fd.get('target_profit')) || 0));
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO business_targets (user_id, month, target_revenue, target_profit)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, month) DO UPDATE SET target_revenue=excluded.target_revenue, target_profit=excluded.target_profit`,
    args: [userId, month, target_revenue, target_profit],
  });
  revalidatePath('/');
}

export async function updateProfileName(fd: FormData) {
  const userId = await currentUserId();
  const name = String(fd.get('name') || '').trim();
  if (!name) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE users SET name=? WHERE id=?', args: [name, userId] });
  try { await updateSession({}); } catch {}
  revalidatePath('/profile'); revalidatePath('/');
}

export async function deleteAccount() {
  const userId = await currentUserId();
  const db = await ensureDb();
  // 부분 삭제 방지: 단일 트랜잭션으로 묶음. 한 테이블이라도 실패하면 전체 롤백.
  const tx = await db.transaction('write');
  try {
    for (const tbl of ['transactions','recurring','budgets','categories','people','debts','debt_rate_history','account_settings','user_account_settings','investment_trades','investments','business_targets']) {
      try { await tx.execute({ sql: `DELETE FROM ${tbl} WHERE user_id=?`, args: [userId] }); } catch {}
    }
    await tx.execute({ sql: 'DELETE FROM users WHERE id=?', args: [userId] });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  await signOut({ redirect: false });
  redirect('/login');
}

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 외래키가 본인 소유인지 확인. 아니면 null 반환 → 무효 처리.
async function ownedId(table: 'categories' | 'people' | 'debts' | 'investments', id: number | null, userId: number): Promise<number | null> {
  if (!id) return null;
  const db = await ensureDb();
  const r = await db.execute({ sql: `SELECT 1 AS x FROM ${table} WHERE id=? AND user_id=?`, args: [id, userId] });
  return r.rows.length > 0 ? id : null;
}
function str(v: FormDataEntryValue | null): string | null {
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export async function createTransactionsBulk(fd: FormData) {
  const userId = await currentUserId();
  const db = await ensureDb();
  const types     = fd.getAll('type').map(String);
  const ledgers   = fd.getAll('ledger').map(String);
  const dates     = fd.getAll('date').map(String);
  const amounts   = fd.getAll('amount').map(v => Number(v) || 0);
  const catNames  = fd.getAll('category_name').map(v => String(v).trim());
  const memos     = fd.getAll('memo').map(v => { const s = String(v).trim(); return s === '' ? null : s; });
  const personNames = fd.getAll('person_name').map(v => String(v).trim());

  const findOrCreateCategory = async (ledger: string, name: string): Promise<number | null> => {
    if (!name) return null;
    let r = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name=? AND user_id=?`, args: [ledger, name, userId] });
    if (r.rows.length === 0) {
      await db.execute({ sql: `INSERT INTO categories (ledger, name, user_id) VALUES (?,?,?)`, args: [ledger, name, userId] });
      r = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name=? AND user_id=?`, args: [ledger, name, userId] });
    }
    const row = r.rows[0] as any;
    return row ? Number(row.id) : null;
  };
  const findOrCreatePerson = async (name: string): Promise<number | null> => {
    if (!name) return null;
    let r = await db.execute({ sql: `SELECT id FROM people WHERE name=? AND user_id=?`, args: [name, userId] });
    if (r.rows.length === 0) {
      await db.execute({ sql: `INSERT INTO people (name, user_id) VALUES (?,?)`, args: [name, userId] });
      r = await db.execute({ sql: `SELECT id FROM people WHERE name=? AND user_id=?`, args: [name, userId] });
    }
    const row = r.rows[0] as any;
    return row ? Number(row.id) : null;
  };

  const n = types.length;
  const tx = await db.transaction('write');
  try {
    for (let i = 0; i < n; i++) {
      if (!amounts[i] || amounts[i] <= 0) continue;
      if (types[i] === 'transfer') continue;
      if (!dates[i]) continue;
      const cid = await findOrCreateCategory(ledgers[i], catNames[i] || '');
      const pid = await findOrCreatePerson(personNames[i] || '');
      await tx.execute({
        sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, memo, person_id, user_id) VALUES (?,?,?,?,?,?,?,?)`,
        args: [ledgers[i], types[i], dates[i], amounts[i], cid as any, memos[i] as any, pid as any, userId],
      });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }

  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/people'); revalidatePath('/categories');
}

/**
 * Compute supply_amount/vat_amount/amount based on vat_mode.
 * Returns null/null for non business-income (we don't persist VAT for those).
 */
function computeVatSplit(
  ledger: string,
  type: string,
  rawAmount: number,
  vat_mode: string | null,
  rawSupply: number | null,
  rawVat: number | null,
): { amount: number; supply: number | null; vat: number | null } {
  const isBizIncome = ledger === 'business' && type === 'income';
  if (!isBizIncome) return { amount: rawAmount, supply: null, vat: null };
  const mode = vat_mode || 'none';
  if (mode === 'included') {
    const supply = Math.round(rawAmount / 1.1);
    const vat = rawAmount - supply;
    return { amount: rawAmount, supply, vat };
  }
  if (mode === 'separate') {
    const supply = Math.max(0, rawSupply || 0);
    const vat = Math.max(0, rawVat || 0);
    return { amount: supply + vat, supply, vat };
  }
  // none: amount is supply, vat = 0 (so reports still work)
  return { amount: rawAmount, supply: rawAmount, vat: 0 };
}

export async function createTransaction(fd: FormData) {
  const userId = await currentUserId();
  const db = await ensureDb();
  const type = String(fd.get('type'));
  const ledger = String(fd.get('ledger'));
  const date = String(fd.get('date'));
  const rawAmount = num(fd.get('amount')) || 0;
  const category_id = num(fd.get('category_id'));
  const memo = str(fd.get('memo'));
  const person_id = num(fd.get('person_id'));
  const vat_mode = str(fd.get('vat_mode'));
  const rawSupply = num(fd.get('supply_amount'));
  const rawVat = num(fd.get('vat_amount'));
  let from_ledger: string | null = null, to_ledger: string | null = null;
  if (type === 'transfer') {
    from_ledger = String(fd.get('from_ledger'));
    to_ledger = String(fd.get('to_ledger'));
  }
  const { amount, supply, vat } = computeVatSplit(ledger, type, rawAmount, vat_mode, rawSupply, rawVat);
  const safeCat = await ownedId('categories', category_id, userId);
  const safePerson = await ownedId('people', person_id, userId);
  await db.execute({
    sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id, user_id, supply_amount, vat_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [ledger, type, date, amount, safeCat, from_ledger, to_ledger, memo, safePerson, userId, supply, vat],
  });
  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/people'); revalidatePath('/sales');
}

export async function addSale(fd: FormData) {
  const userId = await currentUserId();
  const db = await ensureDb();
  const date = String(fd.get('date'));
  const rawAmount = num(fd.get('amount')) || 0;
  const category_id = num(fd.get('category_id'));
  const memo = str(fd.get('memo'));
  const person_id = num(fd.get('person_id'));
  const vat_mode = str(fd.get('vat_mode')) || 'included';
  const rawSupply = num(fd.get('supply_amount'));
  const rawVat = num(fd.get('vat_amount'));
  if (rawAmount <= 0 && !(rawSupply && rawSupply > 0)) return;
  const { amount, supply, vat } = computeVatSplit('business', 'income', rawAmount, vat_mode, rawSupply, rawVat);
  if (amount <= 0) return;
  const safeCat = await ownedId('categories', category_id, userId);
  const safePerson = await ownedId('people', person_id, userId);
  await db.execute({
    sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, memo, person_id, user_id, supply_amount, vat_amount) VALUES ('business','income',?,?,?,?,?,?,?,?)`,
    args: [date, amount, safeCat, memo, safePerson, userId, supply, vat],
  });
  revalidatePath('/sales'); revalidatePath('/transactions'); revalidatePath('/');
}

export async function updateTransaction(fd: FormData) {
  const userId = await currentUserId();
  const db = await ensureDb();
  const id = num(fd.get('id'));
  if (!id) return;
  const type = String(fd.get('type'));
  const ledger = String(fd.get('ledger'));
  const date = String(fd.get('date'));
  const rawAmount = num(fd.get('amount')) || 0;
  const category_id = num(fd.get('category_id'));
  const memo = str(fd.get('memo'));
  const vat_mode = str(fd.get('vat_mode'));
  const rawSupply = num(fd.get('supply_amount'));
  const rawVat = num(fd.get('vat_amount'));
  let from_ledger: string | null = null, to_ledger: string | null = null;
  if (type === 'transfer') {
    from_ledger = String(fd.get('from_ledger'));
    to_ledger = String(fd.get('to_ledger'));
  }
  const { amount, supply, vat } = computeVatSplit(ledger, type, rawAmount, vat_mode, rawSupply, rawVat);
  const safeCat = await ownedId('categories', category_id, userId);
  await db.execute({
    sql: `UPDATE transactions SET ledger=?, type=?, date=?, amount=?, category_id=?, from_ledger=?, to_ledger=?, memo=?, supply_amount=?, vat_amount=? WHERE id=? AND user_id=?`,
    args: [ledger, type, date, amount, safeCat, from_ledger, to_ledger, memo, supply, vat, id, userId],
  });
  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/sales');
}

export async function deleteTransaction(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM transactions WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/transactions'); revalidatePath('/');
}

export async function createCategory(fd: FormData) {
  const userId = await currentUserId();
  const ledger = String(fd.get('ledger'));
  const name = String(fd.get('name')).trim();
  if (!name) return;
  const db = await ensureDb();
  try {
    await db.execute({ sql: 'INSERT INTO categories (ledger, name, user_id) VALUES (?,?,?)', args: [ledger, name, userId] });
  } catch {}
  revalidatePath('/categories');
}

export async function deleteCategory(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM categories WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/categories');
}

export async function createRecurring(fd: FormData) {
  const userId = await currentUserId();
  invalidateRecurringCache(userId);
  const db = await ensureDb();
  const type = String(fd.get('type'));
  const ledger = String(fd.get('ledger'));
  const category_id = num(fd.get('category_id'));
  const amount = num(fd.get('amount')) || 0;
  const day_of_month = num(fd.get('day_of_month')) || 1;
  const memo = str(fd.get('memo'));
  const start_date = String(fd.get('start_date'));
  let from_ledger: string | null = null, to_ledger: string | null = null;
  if (type === 'transfer') {
    from_ledger = String(fd.get('from_ledger'));
    to_ledger = String(fd.get('to_ledger'));
  }
  const safeCat = await ownedId('categories', category_id, userId);
  await db.execute({
    sql: `INSERT INTO recurring (ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [ledger, type, safeCat, amount, day_of_month, memo, from_ledger, to_ledger, start_date, userId],
  });
  revalidatePath('/recurring');
}

export async function deleteRecurring(fd: FormData) {
  const userId = await currentUserId();
  invalidateRecurringCache(userId);
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM recurring WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/recurring');
}

export async function toggleRecurring(fd: FormData) {
  const userId = await currentUserId();
  invalidateRecurringCache(userId);
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE recurring SET active = 1 - active WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/recurring');
}

export async function upsertBudget(fd: FormData) {
  const userId = await currentUserId();
  const ledger = String(fd.get('ledger'));
  const category_id = num(fd.get('category_id'));
  const month = String(fd.get('month'));
  const amount = num(fd.get('amount')) || 0;
  if (!category_id) return;
  const safeCat = await ownedId('categories', category_id, userId);
  if (!safeCat) return;
  const db = await ensureDb();
  // existing UNIQUE(ledger, category_id, month) is now cross-user; we lookup by user
  const existing = await db.execute({
    sql: `SELECT id FROM budgets WHERE ledger=? AND category_id=? AND month=? AND user_id=?`,
    args: [ledger, safeCat, month, userId],
  });
  if (existing.rows.length > 0) {
    const bid = Number((existing.rows[0] as any).id);
    await db.execute({ sql: `UPDATE budgets SET amount=? WHERE id=? AND user_id=?`, args: [amount, bid, userId] });
  } else {
    await db.execute({
      sql: `INSERT INTO budgets (ledger, category_id, month, amount, user_id) VALUES (?,?,?,?,?)`,
      args: [ledger, safeCat, month, amount, userId],
    });
  }
  revalidatePath('/budgets'); revalidatePath('/');
}

export async function setOpeningBalance(fd: FormData) {
  const userId = await currentUserId();
  const ledger = String(fd.get('ledger'));
  if (ledger !== 'personal' && ledger !== 'business') return;
  const opening_balance = num(fd.get('opening_balance')) || 0;
  const opening_date = String(fd.get('opening_date')) || '2025-01-01';
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO user_account_settings (user_id, ledger, opening_balance, opening_date) VALUES (?,?,?,?)
    ON CONFLICT(user_id, ledger) DO UPDATE SET opening_balance=excluded.opening_balance, opening_date=excluded.opening_date`,
    args: [userId, ledger, opening_balance, opening_date],
  });
  revalidatePath('/settings'); revalidatePath('/');
}

export async function setTaxReserveRate(fd: FormData) {
  const userId = await currentUserId();
  const rate = num(fd.get('tax_reserve_rate'));
  if (rate === null) return;
  const clamped = Math.max(0, Math.min(1, rate));
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO user_account_settings (user_id, ledger, opening_balance, opening_date, tax_reserve_rate)
    VALUES (?, 'business', 0, '2025-01-01', ?)
    ON CONFLICT(user_id, ledger) DO UPDATE SET tax_reserve_rate=excluded.tax_reserve_rate`,
    args: [userId, clamped],
  });
  revalidatePath('/settings'); revalidatePath('/');
}

export async function createPerson(fd: FormData) {
  const userId = await currentUserId();
  const name = String(fd.get('name')).trim();
  if (!name) return;
  const relation = str(fd.get('relation'));
  const db = await ensureDb();
  try {
    await db.execute({ sql: 'INSERT INTO people (name, relation, user_id) VALUES (?,?,?)', args: [name, relation, userId] });
  } catch {}
  revalidatePath('/people');
}

export async function deletePerson(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE transactions SET person_id=NULL WHERE person_id=? AND user_id=?', args: [id, userId] });
  await db.execute({ sql: 'DELETE FROM people WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/people'); revalidatePath('/transactions');
}

export async function createDebt(fd: FormData) {
  const userId = await currentUserId();
  const name = String(fd.get('name')).trim();
  const kind = String(fd.get('kind') || '기타').trim();
  const initial_principal = num(fd.get('initial_principal')) || 0;
  const interest_rate = num(fd.get('interest_rate')) || 0;
  const start_date = String(fd.get('start_date')) || new Date().toISOString().slice(0, 10);
  const target_end_date = str(fd.get('target_end_date'));
  const grace_period_months = num(fd.get('grace_period_months')) || 0;
  const mandatory_repay_income = num(fd.get('mandatory_repay_income')) || 0;
  if (!name || initial_principal <= 0) return;
  const db = await ensureDb();
  const r = await db.execute({
    sql: `INSERT INTO debts (name, kind, initial_principal, interest_rate, start_date, target_end_date, grace_period_months, mandatory_repay_income, last_accrual_date, user_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [name, kind, initial_principal, interest_rate, start_date, target_end_date, grace_period_months, mandatory_repay_income, start_date, userId],
  });
  const id = Number(r.lastInsertRowid);
  if (interest_rate > 0) {
    await db.execute({
      sql: `INSERT INTO debt_rate_history (debt_id, effective_date, rate, user_id) VALUES (?,?,?,?)`,
      args: [id, start_date, interest_rate, userId],
    });
  }
  revalidatePath('/debts'); revalidatePath('/');
}

export async function addDebtRate(fd: FormData) {
  const userId = await currentUserId();
  const debt_id = num(fd.get('debt_id'));
  const effective_date = String(fd.get('effective_date'));
  const rate = num(fd.get('rate'));
  if (!debt_id || !effective_date || rate === null) return;
  const db = await ensureDb();
  // verify debt belongs to user
  const owner = await db.execute({ sql: 'SELECT 1 AS x FROM debts WHERE id=? AND user_id=?', args: [debt_id, userId] });
  if (owner.rows.length === 0) return;
  await db.execute({ sql: `INSERT INTO debt_rate_history (debt_id, effective_date, rate, user_id) VALUES (?,?,?,?)`, args: [debt_id, effective_date, rate, userId] });
  await db.execute({ sql: `UPDATE debts SET interest_rate=? WHERE id=? AND user_id=?`, args: [rate, debt_id, userId] });
  revalidatePath('/debts');
}

export async function runDebtAccrual() {
  const userId = await currentUserId();
  const { accrueDebtInterest } = await import('./queries');
  await accrueDebtInterest(userId);
  revalidatePath('/debts'); revalidatePath('/');
}

export async function deleteDebt(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE transactions SET debt_id=NULL, principal_amount=NULL, interest_amount=NULL WHERE debt_id=? AND user_id=?', args: [id, userId] });
  await db.execute({ sql: 'DELETE FROM debts WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/debts'); revalidatePath('/transactions'); revalidatePath('/');
}

export async function toggleDebt(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE debts SET active = 1 - active WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/debts');
}

export async function recordDebtPayment(fd: FormData) {
  const userId = await currentUserId();
  const debt_id = num(fd.get('debt_id'));
  const principal = num(fd.get('principal_amount')) || 0;
  const interest  = num(fd.get('interest_amount')) || 0;
  const date = String(fd.get('date')) || new Date().toISOString().slice(0, 10);
  const ledger = String(fd.get('ledger') || 'personal');
  const memo = str(fd.get('memo'));
  if (!debt_id || (principal + interest) <= 0) return;
  const total = principal + interest;
  const db = await ensureDb();
  // verify debt ownership
  const owner = await db.execute({ sql: 'SELECT 1 AS x FROM debts WHERE id=? AND user_id=?', args: [debt_id, userId] });
  if (owner.rows.length === 0) return;
  let catR = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name='대출 상환' AND user_id=?`, args: [ledger, userId] });
  if (catR.rows.length === 0) {
    await db.execute({ sql: `INSERT INTO categories (ledger, name, user_id) VALUES (?, '대출 상환', ?)`, args: [ledger, userId] });
    catR = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name='대출 상환' AND user_id=?`, args: [ledger, userId] });
  }
  const catId = Number((catR.rows[0] as any).id);
  await db.execute({
    sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, memo, debt_id, principal_amount, interest_amount, user_id)
     VALUES (?,'expense',?,?,?,?,?,?,?,?)`,
    args: [ledger, date, total, catId, memo, debt_id, principal, interest, userId],
  });
  if (interest > 0) {
    const curR = await db.execute({ sql: `SELECT accrued_interest FROM debts WHERE id=? AND user_id=?`, args: [debt_id, userId] });
    const cur = curR.rows[0] as any;
    const accrued = cur ? Number(cur.accrued_interest || 0) : 0;
    const consume = Math.min(accrued, interest);
    if (consume > 0) {
      await db.execute({ sql: `UPDATE debts SET accrued_interest = accrued_interest - ? WHERE id=? AND user_id=?`, args: [consume, debt_id, userId] });
    }
  }
  revalidatePath('/debts'); revalidatePath('/transactions'); revalidatePath('/');
}

/* ─────────── Investments ─────────── */

export async function createInvestment(fd: FormData) {
  const userId = await currentUserId();
  const name = String(fd.get('name') || '').trim();
  if (!name) return;
  const ticker = str(fd.get('ticker'));
  const type = String(fd.get('type') || '주식').trim();
  const currency = String(fd.get('currency') || 'KRW').trim();
  const current_price = num(fd.get('current_price')) || 0;
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO investments (user_id, name, ticker, type, currency, current_price, current_price_at)
          VALUES (?,?,?,?,?,?,?)`,
    args: [userId, name, ticker, type, currency, current_price, new Date().toISOString().slice(0, 10)],
  });
  revalidatePath('/investments');
}

export async function updateInvestmentPrice(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  const current_price = num(fd.get('current_price'));
  if (!id || current_price === null) return;
  const db = await ensureDb();
  const owner = await db.execute({ sql: 'SELECT 1 AS x FROM investments WHERE id=? AND user_id=?', args: [id, userId] });
  if (owner.rows.length === 0) return;
  await db.execute({
    sql: `UPDATE investments SET current_price=?, current_price_at=? WHERE id=? AND user_id=?`,
    args: [current_price, new Date().toISOString().slice(0, 10), id, userId],
  });
  revalidatePath('/investments'); revalidatePath(`/investments/${id}`);
}

export async function deleteInvestment(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  // delete trades first (defensive — FK CASCADE may not trigger without PRAGMA)
  await db.execute({ sql: 'DELETE FROM investment_trades WHERE investment_id=? AND user_id=?', args: [id, userId] });
  await db.execute({ sql: 'DELETE FROM investments WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/investments');
}

export async function toggleInvestment(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE investments SET active = 1 - active WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/investments');
}

export async function addInvestmentTrade(fd: FormData) {
  const userId = await currentUserId();
  const investment_id = num(fd.get('investment_id'));
  if (!investment_id) return;
  const date = String(fd.get('date') || '').trim();
  const type = String(fd.get('type') || '').trim();
  if (!date || !['buy','sell','dividend','fee'].includes(type)) return;
  const quantity = num(fd.get('quantity')) || 0;
  const price = num(fd.get('price')) || 0;
  let amount = num(fd.get('amount'));
  if (amount === null || amount === 0) amount = Math.round(quantity * price);
  const memo = str(fd.get('memo'));
  const db = await ensureDb();
  const owner = await db.execute({ sql: 'SELECT 1 AS x FROM investments WHERE id=? AND user_id=?', args: [investment_id, userId] });
  if (owner.rows.length === 0) return;
  await db.execute({
    sql: `INSERT INTO investment_trades (investment_id, user_id, date, type, quantity, price, amount, memo)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [investment_id, userId, date, type, quantity, price, amount, memo],
  });
  revalidatePath('/investments'); revalidatePath(`/investments/${investment_id}`);
}

export async function deleteInvestmentTrade(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  const investment_id = num(fd.get('investment_id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM investment_trades WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/investments');
  if (investment_id) revalidatePath(`/investments/${investment_id}`);
}

/* ─────────── Nav order ─────────── */

import { ALL_NAV_ITEMS, DEFAULT_NAV_ORDER } from './nav-items';

async function readNavOrder(userId: number): Promise<string[]> {
  const db = await ensureDb();
  const r = await db.execute({ sql: 'SELECT nav_order FROM users WHERE id=?', args: [userId] });
  const row = r.rows[0] as any;
  const raw = row?.nav_order;
  if (!raw) return [...DEFAULT_NAV_ORDER];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_NAV_ORDER];
    const allowed = new Set(ALL_NAV_ITEMS.map(i => i.href));
    return parsed.filter((s: any) => typeof s === 'string' && allowed.has(s));
  } catch { return [...DEFAULT_NAV_ORDER]; }
}

async function writeNavOrder(userId: number, order: string[]) {
  const db = await ensureDb();
  const allowed = new Set(ALL_NAV_ITEMS.map(i => i.href));
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const s of order) {
    if (allowed.has(s) && !seen.has(s)) { cleaned.push(s); seen.add(s); }
  }
  await db.execute({ sql: 'UPDATE users SET nav_order=? WHERE id=?', args: [JSON.stringify(cleaned), userId] });
}

export async function setNavOrder(fd: FormData) {
  const userId = await currentUserId();
  let items: string[] = [];
  const orderStr = fd.get('order');
  if (orderStr) {
    items = String(orderStr).split(',').map(s => s.trim()).filter(Boolean);
  } else {
    items = fd.getAll('slug').map(String).map(s => s.trim()).filter(Boolean);
  }
  await writeNavOrder(userId, items);
  try { await updateSession({}); } catch {}
  revalidatePath('/'); revalidatePath('/settings/nav'); revalidatePath('/more');
}

export async function moveNavItemUp(fd: FormData) {
  const userId = await currentUserId();
  const slug = String(fd.get('slug') || '');
  if (!slug) return;
  const cur = await readNavOrder(userId);
  const idx = cur.indexOf(slug);
  if (idx > 0) {
    [cur[idx - 1], cur[idx]] = [cur[idx], cur[idx - 1]];
    await writeNavOrder(userId, cur);
  }
  try { await updateSession({}); } catch {}
  revalidatePath('/'); revalidatePath('/settings/nav'); revalidatePath('/more');
}

export async function moveNavItemDown(fd: FormData) {
  const userId = await currentUserId();
  const slug = String(fd.get('slug') || '');
  if (!slug) return;
  const cur = await readNavOrder(userId);
  const idx = cur.indexOf(slug);
  if (idx >= 0 && idx < cur.length - 1) {
    [cur[idx + 1], cur[idx]] = [cur[idx], cur[idx + 1]];
    await writeNavOrder(userId, cur);
  }
  try { await updateSession({}); } catch {}
  revalidatePath('/'); revalidatePath('/settings/nav'); revalidatePath('/more');
}

export async function toggleNavItem(fd: FormData) {
  const userId = await currentUserId();
  const slug = String(fd.get('slug') || '');
  if (!slug) return;
  const cur = await readNavOrder(userId);
  const idx = cur.indexOf(slug);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(slug);
  await writeNavOrder(userId, cur);
  try { await updateSession({}); } catch {}
  revalidatePath('/'); revalidatePath('/settings/nav'); revalidatePath('/more');
}

export async function deleteBudget(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM budgets WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/budgets'); revalidatePath('/');
}
