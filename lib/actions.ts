'use server';
import { ensureDb } from './db';
import { revalidatePath } from 'next/cache';
import { currentUserId } from './auth-helper';
import { signOut } from '@/auth';
import { redirect } from 'next/navigation';

export async function updateProfileName(fd: FormData) {
  const userId = await currentUserId();
  const name = String(fd.get('name') || '').trim();
  if (!name) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE users SET name=? WHERE id=?', args: [name, userId] });
  revalidatePath('/profile'); revalidatePath('/');
}

export async function deleteAccount() {
  const userId = await currentUserId();
  const db = await ensureDb();
  for (const tbl of ['transactions','recurring','budgets','categories','people','debts','debt_rate_history','account_settings','user_account_settings']) {
    try { await db.execute({ sql: `DELETE FROM ${tbl} WHERE user_id=?`, args: [userId] }); } catch {}
  }
  await db.execute({ sql: 'DELETE FROM users WHERE id=?', args: [userId] });
  await signOut({ redirect: false });
  redirect('/login');
}

function num(v: FormDataEntryValue | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export async function createTransaction(fd: FormData) {
  const userId = await currentUserId();
  const db = await ensureDb();
  const type = String(fd.get('type'));
  const ledger = String(fd.get('ledger'));
  const date = String(fd.get('date'));
  const amount = num(fd.get('amount')) || 0;
  const category_id = num(fd.get('category_id'));
  const memo = str(fd.get('memo'));
  const person_id = num(fd.get('person_id'));
  let from_ledger: string | null = null, to_ledger: string | null = null;
  if (type === 'transfer') {
    from_ledger = String(fd.get('from_ledger'));
    to_ledger = String(fd.get('to_ledger'));
  }
  await db.execute({
    sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id, userId],
  });
  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/people');
}

export async function updateTransaction(fd: FormData) {
  const userId = await currentUserId();
  const db = await ensureDb();
  const id = num(fd.get('id'));
  if (!id) return;
  const type = String(fd.get('type'));
  const ledger = String(fd.get('ledger'));
  const date = String(fd.get('date'));
  const amount = num(fd.get('amount')) || 0;
  const category_id = num(fd.get('category_id'));
  const memo = str(fd.get('memo'));
  let from_ledger: string | null = null, to_ledger: string | null = null;
  if (type === 'transfer') {
    from_ledger = String(fd.get('from_ledger'));
    to_ledger = String(fd.get('to_ledger'));
  }
  await db.execute({
    sql: `UPDATE transactions SET ledger=?, type=?, date=?, amount=?, category_id=?, from_ledger=?, to_ledger=?, memo=? WHERE id=? AND user_id=?`,
    args: [ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, id, userId],
  });
  revalidatePath('/transactions'); revalidatePath('/');
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
  await db.execute({
    sql: `INSERT INTO recurring (ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date, userId],
  });
  revalidatePath('/recurring');
}

export async function deleteRecurring(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM recurring WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/recurring');
}

export async function toggleRecurring(fd: FormData) {
  const userId = await currentUserId();
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
  const db = await ensureDb();
  // existing UNIQUE(ledger, category_id, month) is now cross-user; we lookup by user
  const existing = await db.execute({
    sql: `SELECT id FROM budgets WHERE ledger=? AND category_id=? AND month=? AND user_id=?`,
    args: [ledger, category_id, month, userId],
  });
  if (existing.rows.length > 0) {
    const bid = Number((existing.rows[0] as any).id);
    await db.execute({ sql: `UPDATE budgets SET amount=? WHERE id=? AND user_id=?`, args: [amount, bid, userId] });
  } else {
    await db.execute({
      sql: `INSERT INTO budgets (ledger, category_id, month, amount, user_id) VALUES (?,?,?,?,?)`,
      args: [ledger, category_id, month, amount, userId],
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

export async function deleteBudget(fd: FormData) {
  const userId = await currentUserId();
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM budgets WHERE id=? AND user_id=?', args: [id, userId] });
  revalidatePath('/budgets'); revalidatePath('/');
}
