'use server';
import { getDb } from './db';
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

export async function createTransaction(fd: FormData) {
  const db = getDb();
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
  db.prepare(`INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, person_id);
  revalidatePath('/transactions'); revalidatePath('/'); revalidatePath('/people');
}

export async function updateTransaction(fd: FormData) {
  const db = getDb();
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
  db.prepare(`UPDATE transactions SET ledger=?, type=?, date=?, amount=?, category_id=?, from_ledger=?, to_ledger=?, memo=? WHERE id=?`)
    .run(ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, id);
  revalidatePath('/transactions'); revalidatePath('/');
}

export async function deleteTransaction(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  getDb().prepare('DELETE FROM transactions WHERE id=?').run(id);
  revalidatePath('/transactions'); revalidatePath('/');
}

export async function createCategory(fd: FormData) {
  const ledger = String(fd.get('ledger'));
  const name = String(fd.get('name')).trim();
  if (!name) return;
  try {
    getDb().prepare('INSERT INTO categories (ledger, name) VALUES (?,?)').run(ledger, name);
  } catch {}
  revalidatePath('/categories');
}

export async function deleteCategory(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  getDb().prepare('DELETE FROM categories WHERE id=?').run(id);
  revalidatePath('/categories');
}

export async function createRecurring(fd: FormData) {
  const db = getDb();
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
  db.prepare(`INSERT INTO recurring (ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(ledger, type, category_id, amount, day_of_month, memo, from_ledger, to_ledger, start_date);
  revalidatePath('/recurring');
}

export async function deleteRecurring(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  getDb().prepare('DELETE FROM recurring WHERE id=?').run(id);
  revalidatePath('/recurring');
}

export async function toggleRecurring(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  getDb().prepare('UPDATE recurring SET active = 1 - active WHERE id=?').run(id);
  revalidatePath('/recurring');
}

export async function upsertBudget(fd: FormData) {
  const ledger = String(fd.get('ledger'));
  const category_id = num(fd.get('category_id'));
  const month = String(fd.get('month'));
  const amount = num(fd.get('amount')) || 0;
  if (!category_id) return;
  getDb().prepare(`INSERT INTO budgets (ledger, category_id, month, amount) VALUES (?,?,?,?)
    ON CONFLICT(ledger, category_id, month) DO UPDATE SET amount=excluded.amount`)
    .run(ledger, category_id, month, amount);
  revalidatePath('/budgets'); revalidatePath('/');
}

export async function setOpeningBalance(fd: FormData) {
  const ledger = String(fd.get('ledger'));
  if (ledger !== 'personal' && ledger !== 'business') return;
  const opening_balance = num(fd.get('opening_balance')) || 0;
  const opening_date = String(fd.get('opening_date')) || '2025-01-01';
  getDb().prepare(`INSERT INTO account_settings (ledger, opening_balance, opening_date) VALUES (?,?,?)
    ON CONFLICT(ledger) DO UPDATE SET opening_balance=excluded.opening_balance, opening_date=excluded.opening_date`)
    .run(ledger, opening_balance, opening_date);
  revalidatePath('/settings'); revalidatePath('/');
}

export async function setTaxReserveRate(fd: FormData) {
  // store on business ledger row
  const rate = num(fd.get('tax_reserve_rate'));
  if (rate === null) return;
  const clamped = Math.max(0, Math.min(1, rate));
  getDb().prepare(`INSERT INTO account_settings (ledger, opening_balance, opening_date, tax_reserve_rate)
    VALUES ('business', 0, '2025-01-01', ?)
    ON CONFLICT(ledger) DO UPDATE SET tax_reserve_rate=excluded.tax_reserve_rate`)
    .run(clamped);
  revalidatePath('/settings'); revalidatePath('/');
}

export async function createPerson(fd: FormData) {
  const name = String(fd.get('name')).trim();
  if (!name) return;
  const relation = str(fd.get('relation'));
  try {
    getDb().prepare('INSERT INTO people (name, relation) VALUES (?,?)').run(name, relation);
  } catch {}
  revalidatePath('/people');
}

export async function deletePerson(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  const db = getDb();
  db.prepare('UPDATE transactions SET person_id=NULL WHERE person_id=?').run(id);
  db.prepare('DELETE FROM people WHERE id=?').run(id);
  revalidatePath('/people'); revalidatePath('/transactions');
}

export async function deleteBudget(fd: FormData) {
  const id = num(fd.get('id'));
  if (!id) return;
  getDb().prepare('DELETE FROM budgets WHERE id=?').run(id);
  revalidatePath('/budgets'); revalidatePath('/');
}
