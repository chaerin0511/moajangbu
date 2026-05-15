import { ensureDb } from '@/lib/db';

const TABLES = [
  'transactions', 'recurring', 'budgets', 'people', 'debts',
  'debt_rate_history', 'categories', 'user_account_settings',
  'account_settings', 'investments', 'investment_trades',
  'business_targets', 'users',
];

export async function wipeDb() {
  const db = await ensureDb();
  for (const t of TABLES) {
    await db.execute(`DELETE FROM ${t}`).catch(() => {});
  }
}

export async function seedUser(userId = 1) {
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO users (id, kakao_id, email, name) VALUES (?, ?, ?, ?)`,
    args: [userId, `kakao-${userId}`, `u${userId}@test`, `user${userId}`],
  });
  return userId;
}

export async function seedCategory(userId: number, ledger: 'personal' | 'business', name: string): Promise<number> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `INSERT INTO categories (user_id, ledger, name) VALUES (?, ?, ?)`,
    args: [userId, ledger, name],
  });
  return Number(r.lastInsertRowid);
}

export async function seedTx(userId: number, row: {
  ledger?: 'personal' | 'business';
  type: 'income' | 'expense' | 'transfer';
  date: string;
  amount: number;
  category_id?: number | null;
  from_ledger?: 'personal' | 'business' | null;
  to_ledger?: 'personal' | 'business' | null;
  recurring_id?: number | null;
  debt_id?: number | null;
  principal_amount?: number | null;
  interest_amount?: number | null;
  supply_amount?: number | null;
  vat_amount?: number | null;
  person_id?: number | null;
  memo?: string | null;
}) {
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO transactions
          (user_id, ledger, type, date, amount, category_id, from_ledger, to_ledger,
           recurring_id, debt_id, principal_amount, interest_amount, supply_amount, vat_amount, person_id, memo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      row.ledger ?? null,
      row.type,
      row.date,
      row.amount,
      row.category_id ?? null,
      row.from_ledger ?? null,
      row.to_ledger ?? null,
      row.recurring_id ?? null,
      row.debt_id ?? null,
      row.principal_amount ?? null,
      row.interest_amount ?? null,
      row.supply_amount ?? null,
      row.vat_amount ?? null,
      row.person_id ?? null,
      row.memo ?? null,
    ],
  });
}

export async function setTaxRate(userId: number, rate: number) {
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO user_account_settings (user_id, ledger, opening_balance, opening_date, tax_reserve_rate)
          VALUES (?, 'business', 0, '2025-01-01', ?)
          ON CONFLICT(user_id, ledger) DO UPDATE SET tax_reserve_rate=excluded.tax_reserve_rate`,
    args: [userId, rate],
  });
}

export async function seedDebt(userId: number, row: {
  name: string;
  initial_principal: number;
  interest_rate?: number;
  start_date: string;
  active?: number;
}): Promise<number> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `INSERT INTO debts (user_id, name, initial_principal, interest_rate, start_date, active)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [userId, row.name, row.initial_principal, row.interest_rate ?? 0, row.start_date, row.active ?? 1],
  });
  return Number(r.lastInsertRowid);
}
