import { getDb, Ledger, Transaction, Category, Recurring, Budget } from './db';
import { clampDay, currentMonth, monthsBack } from './utils';

export function listCategories(ledger?: Ledger): Category[] {
  const db = getDb();
  if (ledger) return db.prepare('SELECT * FROM categories WHERE ledger=? ORDER BY name').all(ledger) as unknown as Category[];
  return db.prepare('SELECT * FROM categories ORDER BY ledger, name').all() as unknown as Category[];
}

export function listTransactions(filters: { ledger?: string; type?: string; month?: string; category_id?: string } = {}): (Transaction & { category_name: string | null })[] {
  const db = getDb();
  const where: string[] = [];
  const params: any[] = [];
  if (filters.ledger) { where.push('(t.ledger = ? OR t.from_ledger = ? OR t.to_ledger = ?)'); params.push(filters.ledger, filters.ledger, filters.ledger); }
  if (filters.type) { where.push('t.type = ?'); params.push(filters.type); }
  if (filters.month) { where.push("substr(t.date,1,7) = ?"); params.push(filters.month); }
  if (filters.category_id) { where.push('t.category_id = ?'); params.push(Number(filters.category_id)); }
  const sql = `SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON c.id = t.category_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.date DESC, t.id DESC LIMIT 500`;
  return db.prepare(sql).all(...params) as unknown as any[];
}

export function recentTransactions(limit = 10) {
  const db = getDb();
  return db.prepare(`SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON c.id = t.category_id ORDER BY t.date DESC, t.id DESC LIMIT ?`).all(limit) as unknown as any[];
}

export interface MonthlyTotals {
  personal: { income: number; expense: number; net: number };
  business: { income: number; expense: number; net: number };
  combinedNet: number;
}

export function monthlyTotals(month: string): MonthlyTotals {
  const db = getDb();
  const rows = db.prepare(`SELECT ledger, type, from_ledger, to_ledger, amount FROM transactions WHERE substr(date,1,7) = ?`).all(month) as unknown as any[];
  const t = {
    personal: { income: 0, expense: 0, net: 0 },
    business: { income: 0, expense: 0, net: 0 }
  };
  for (const r of rows) {
    if (r.type === 'income') {
      (t as any)[r.ledger].income += r.amount;
    } else if (r.type === 'expense') {
      (t as any)[r.ledger].expense += r.amount;
    } else if (r.type === 'transfer') {
      if (r.from_ledger && (t as any)[r.from_ledger]) (t as any)[r.from_ledger].expense += r.amount;
      if (r.to_ledger && (t as any)[r.to_ledger]) (t as any)[r.to_ledger].income += r.amount;
    }
  }
  t.personal.net = t.personal.income - t.personal.expense;
  t.business.net = t.business.income - t.business.expense;
  return { ...t, combinedNet: t.personal.net + t.business.net };
}

export function monthlySeries(): { month: string; personalIncome: number; personalExpense: number; businessIncome: number; businessExpense: number }[] {
  const months = monthsBack(6);
  return months.map(m => {
    const t = monthlyTotals(m);
    return {
      month: m,
      personalIncome: t.personal.income,
      personalExpense: t.personal.expense,
      businessIncome: t.business.income,
      businessExpense: t.business.expense
    };
  });
}

export function spentForBudget(ledger: Ledger, category_id: number, month: string): number {
  const db = getDb();
  const r = db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE ledger=? AND category_id=? AND type='expense' AND substr(date,1,7)=?`).get(ledger, category_id, month) as { s: number };
  return r.s || 0;
}

export function listBudgets(month?: string): (Budget & { category_name: string; spent: number })[] {
  const db = getDb();
  const m = month || currentMonth();
  const rows = db.prepare(`SELECT b.*, c.name as category_name FROM budgets b JOIN categories c ON c.id=b.category_id WHERE b.month=? ORDER BY b.ledger, c.name`).all(m) as unknown as any[];
  return rows.map(r => ({ ...r, spent: spentForBudget(r.ledger, r.category_id, r.month) }));
}

export function listRecurring(): (Recurring & { category_name: string | null })[] {
  const db = getDb();
  return db.prepare(`SELECT r.*, c.name as category_name FROM recurring r LEFT JOIN categories c ON c.id=r.category_id ORDER BY r.id DESC`).all() as unknown as any[];
}

export function generateRecurring(): number {
  const db = getDb();
  const rules = db.prepare('SELECT * FROM recurring WHERE active=1').all() as unknown as Recurring[];
  const now = new Date();
  let created = 0;
  const ins = db.prepare(`INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, recurring_id) VALUES (?,?,?,?,?,?,?,?,?)`);
  const exists = db.prepare(`SELECT 1 as x FROM transactions WHERE recurring_id=? AND substr(date,1,7)=?`);
  db.exec('BEGIN');
  try {
    for (const rule of rules) {
      const start = new Date(rule.start_date);
      let y = start.getFullYear();
      let m = start.getMonth() + 1;
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
        const monthStr = `${y}-${String(m).padStart(2, '0')}`;
        if (!exists.get(rule.id, monthStr)) {
          const day = clampDay(y, m, rule.day_of_month);
          const date = `${monthStr}-${String(day).padStart(2, '0')}`;
          ins.run(rule.ledger, rule.type, date, rule.amount, rule.category_id as any, rule.from_ledger as any, rule.to_ledger as any, rule.memo as any, rule.id);
          created++;
        }
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return created;
}
