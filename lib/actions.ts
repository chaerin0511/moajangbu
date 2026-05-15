'use server';
import { ensureDb } from './db';
import { revalidatePath } from 'next/cache';

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
  const db = await ensureDb();
  const types     = fd.getAll('type').map(String);
  const ledgers   = fd.getAll('ledger').map(String);
  const dates     = fd.getAll('date').map(String);
  const amounts   = fd.getAll('amount').map(v => Number(v) || 0);
  const catNames  = fd.getAll('category_name').map(v => String(v).trim());
  const memos     = fd.getAll('memo').map(v => { const s = String(v).trim(); return s === '' ? null : s; });
  const personNames = fd.getAll('person_name').map(v => String(v).trim());

  // resolve category name → id (create if missing)
  const findOrCreateCategory = async (ledger: string, name: string): Promise<number | null> => {
    if (!name) return null;
    let r = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name=?`, args: [ledger, name] });
    if (r.rows.length === 0) {
      await db.execute({ sql: `INSERT INTO categories (ledger, name) VALUES (?,?)`, args: [ledger, name] });
      r = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name=?`, args: [ledger, name] });
    }
    const row = r.rows[0] as any;
    return row ? Number(row.id) : null;
  };
  const findOrCreatePerson = async (name: string): Promise<number | null> => {
    if (!name) return null;
    let r = await db.execute({ sql: `SELECT id FROM people WHERE name=?`, args: [name] });
    if (r.rows.length === 0) {
      await db.execute({ sql: `INSERT INTO people (name) VALUES (?)`, args: [name] });
      r = await db.execute({ sql: `SELECT id FROM people WHERE name=?`, args: [name] });
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
      // resolve outside the tx (libsql tx is on same connection; reuse db for resolves is fine, but we use tx to keep inserts atomic)
      const cid = await findOrCreateCategory(ledgers[i], catNames[i] || '');
      const pid = await findOrCreatePerson(personNames[i] || '');
      await tx.execute({
        sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, memo, person_id) VALUES (?,?,?,?,?,?,?)`,
        args: [ledgers[i], types[i], dates[i], amounts[i], cid as any, memos[i] as any, pid as any],
      });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }

  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/people'); revalidatePath('/categories');
}

export async function createTransaction(fd: FormData) {
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
    sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id],
  });
  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/people');
}

export async function updateTransaction(fd: FormData) {
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
    sql: `UPDATE transactions SET ledger=?, type=?, date=?, amount=?, category_id=?, from_ledger=?, to_ledger=?, memo=? WHERE id=?`,
    args: [ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, id],
  });
  revalidatePath('/transactions'); revalidatePath('/');
}

export async function deleteTransaction(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM transactions WHERE id=?', args: [id] });
  revalidatePath('/transactions'); revalidatePath('/');
}

export async function createCategory(fd: FormData) {
  const ledger = String(fd.get('ledger'));
  const name = String(fd.get('name')).trim();
  if (!name) return;
  const db = await ensureDb();
  try {
    await db.execute({ sql: 'INSERT INTO categories (ledger, name) VALUES (?,?)', args: [ledger, name] });
  } catch {}
  revalidatePath('/categories');
}

export async function deleteCategory(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM categories WHERE id=?', args: [id] });
  revalidatePath('/categories');
}

export async function createRecurring(fd: FormData) {
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
    sql: `INSERT INTO recurring (ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date],
  });
  revalidatePath('/recurring');
}

export async function deleteRecurring(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM recurring WHERE id=?', args: [id] });
  revalidatePath('/recurring');
}

export async function toggleRecurring(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE recurring SET active = 1 - active WHERE id=?', args: [id] });
  revalidatePath('/recurring');
}

export async function upsertBudget(fd: FormData) {
  const ledger = String(fd.get('ledger'));
  const category_id = num(fd.get('category_id'));
  const month = String(fd.get('month'));
  const amount = num(fd.get('amount')) || 0;
  if (!category_id) return;
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO budgets (ledger, category_id, month, amount) VALUES (?,?,?,?)
    ON CONFLICT(ledger, category_id, month) DO UPDATE SET amount=excluded.amount`,
    args: [ledger, category_id, month, amount],
  });
  revalidatePath('/budgets'); revalidatePath('/');
}

export async function setOpeningBalance(fd: FormData) {
  const ledger = String(fd.get('ledger'));
  if (ledger !== 'personal' && ledger !== 'business') return;
  const opening_balance = num(fd.get('opening_balance')) || 0;
  const opening_date = String(fd.get('opening_date')) || '2025-01-01';
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO account_settings (ledger, opening_balance, opening_date) VALUES (?,?,?)
    ON CONFLICT(ledger) DO UPDATE SET opening_balance=excluded.opening_balance, opening_date=excluded.opening_date`,
    args: [ledger, opening_balance, opening_date],
  });
  revalidatePath('/settings'); revalidatePath('/');
}

export async function setTaxReserveRate(fd: FormData) {
  // store on business ledger row
  const rate = num(fd.get('tax_reserve_rate'));
  if (rate === null) return;
  const clamped = Math.max(0, Math.min(1, rate));
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO account_settings (ledger, opening_balance, opening_date, tax_reserve_rate)
    VALUES ('business', 0, '2025-01-01', ?)
    ON CONFLICT(ledger) DO UPDATE SET tax_reserve_rate=excluded.tax_reserve_rate`,
    args: [clamped],
  });
  revalidatePath('/settings'); revalidatePath('/');
}

export async function createPerson(fd: FormData) {
  const name = String(fd.get('name')).trim();
  if (!name) return;
  const relation = str(fd.get('relation'));
  const db = await ensureDb();
  try {
    await db.execute({ sql: 'INSERT INTO people (name, relation) VALUES (?,?)', args: [name, relation] });
  } catch {}
  revalidatePath('/people');
}

export async function deletePerson(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE transactions SET person_id=NULL WHERE person_id=?', args: [id] });
  await db.execute({ sql: 'DELETE FROM people WHERE id=?', args: [id] });
  revalidatePath('/people'); revalidatePath('/transactions');
}

export async function createDebt(fd: FormData) {
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
    sql: `INSERT INTO debts (name, kind, initial_principal, interest_rate, start_date, target_end_date, grace_period_months, mandatory_repay_income, last_accrual_date)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [name, kind, initial_principal, interest_rate, start_date, target_end_date, grace_period_months, mandatory_repay_income, start_date],
  });
  const id = Number(r.lastInsertRowid);
  if (interest_rate > 0) {
    await db.execute({
      sql: `INSERT INTO debt_rate_history (debt_id, effective_date, rate) VALUES (?,?,?)`,
      args: [id, start_date, interest_rate],
    });
  }
  revalidatePath('/debts'); revalidatePath('/');
}

export async function addDebtRate(fd: FormData) {
  const debt_id = num(fd.get('debt_id'));
  const effective_date = String(fd.get('effective_date'));
  const rate = num(fd.get('rate'));
  if (!debt_id || !effective_date || rate === null) return;
  const db = await ensureDb();
  await db.execute({ sql: `INSERT INTO debt_rate_history (debt_id, effective_date, rate) VALUES (?,?,?)`, args: [debt_id, effective_date, rate] });
  // base rate on debts row reflects "current" rate too
  await db.execute({ sql: `UPDATE debts SET interest_rate=? WHERE id=?`, args: [rate, debt_id] });
  revalidatePath('/debts');
}

export async function runDebtAccrual() {
  const { accrueDebtInterest } = await import('./queries');
  await accrueDebtInterest();
  revalidatePath('/debts'); revalidatePath('/');
}

export async function deleteDebt(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE transactions SET debt_id=NULL, principal_amount=NULL, interest_amount=NULL WHERE debt_id=?', args: [id] });
  await db.execute({ sql: 'DELETE FROM debts WHERE id=?', args: [id] });
  revalidatePath('/debts'); revalidatePath('/transactions'); revalidatePath('/');
}

export async function toggleDebt(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'UPDATE debts SET active = 1 - active WHERE id=?', args: [id] });
  revalidatePath('/debts');
}

export async function recordDebtPayment(fd: FormData) {
  const debt_id = num(fd.get('debt_id'));
  const principal = num(fd.get('principal_amount')) || 0;
  const interest  = num(fd.get('interest_amount')) || 0;
  const date = String(fd.get('date')) || new Date().toISOString().slice(0, 10);
  const ledger = String(fd.get('ledger') || 'personal');
  const memo = str(fd.get('memo'));
  if (!debt_id || (principal + interest) <= 0) return;
  const total = principal + interest;
  // find or create "대출 상환" category for that ledger
  const db = await ensureDb();
  let catR = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name='대출 상환'`, args: [ledger] });
  if (catR.rows.length === 0) {
    await db.execute({ sql: `INSERT INTO categories (ledger, name) VALUES (?, '대출 상환')`, args: [ledger] });
    catR = await db.execute({ sql: `SELECT id FROM categories WHERE ledger=? AND name='대출 상환'`, args: [ledger] });
  }
  const catId = Number((catR.rows[0] as any).id);
  await db.execute({
    sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, memo, debt_id, principal_amount, interest_amount)
     VALUES (?,'expense',?,?,?,?,?,?,?)`,
    args: [ledger, date, total, catId, memo, debt_id, principal, interest],
  });
  // 취업후상환 등: 누적 미납이자에서 먼저 차감 (이자 → 원금 순)
  if (interest > 0) {
    const curR = await db.execute({ sql: `SELECT accrued_interest FROM debts WHERE id=?`, args: [debt_id] });
    const cur = curR.rows[0] as any;
    const accrued = cur ? Number(cur.accrued_interest || 0) : 0;
    const consume = Math.min(accrued, interest);
    if (consume > 0) {
      await db.execute({ sql: `UPDATE debts SET accrued_interest = accrued_interest - ? WHERE id=?`, args: [consume, debt_id] });
    }
  }
  revalidatePath('/debts'); revalidatePath('/transactions'); revalidatePath('/');
}

export async function deleteBudget(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = await ensureDb();
  await db.execute({ sql: 'DELETE FROM budgets WHERE id=?', args: [id] });
  revalidatePath('/budgets'); revalidatePath('/');
}
