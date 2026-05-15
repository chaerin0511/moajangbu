import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-var
  var __ledgerDb: DatabaseSync | undefined;
}

function init(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
      name TEXT NOT NULL,
      UNIQUE(ledger, name)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category_id INTEGER,
      from_ledger TEXT,
      to_ledger TEXT,
      memo TEXT,
      recurring_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger);
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      category_id INTEGER,
      amount INTEGER NOT NULL,
      day_of_month INTEGER NOT NULL,
      memo TEXT,
      from_ledger TEXT,
      to_ledger TEXT,
      start_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS account_settings (
      ledger TEXT PRIMARY KEY CHECK(ledger IN ('personal','business')),
      opening_balance INTEGER NOT NULL DEFAULT 0,
      opening_date TEXT NOT NULL DEFAULT '2025-01-01',
      tax_reserve_rate REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      relation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT '기타',
      initial_principal INTEGER NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      target_end_date TEXT,
      grace_period_months INTEGER NOT NULL DEFAULT 0,
      accrued_interest INTEGER NOT NULL DEFAULT 0,
      last_accrual_date TEXT,
      mandatory_repay_income INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS debt_rate_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL,
      effective_date TEXT NOT NULL,
      rate REAL NOT NULL,
      FOREIGN KEY(debt_id) REFERENCES debts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rate_history_debt ON debt_rate_history(debt_id, effective_date);
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      amount INTEGER NOT NULL,
      UNIQUE(ledger, category_id, month)
    );
  `);

  // migrations for existing databases (ALTER ignores duplicate-column errors)
  const tryAlter = (sql: string) => { try { db.exec(sql); } catch { /* column already exists */ } };
  tryAlter("ALTER TABLE account_settings ADD COLUMN tax_reserve_rate REAL NOT NULL DEFAULT 0");
  tryAlter("ALTER TABLE transactions ADD COLUMN person_id INTEGER");
  tryAlter("ALTER TABLE transactions ADD COLUMN debt_id INTEGER");
  tryAlter("ALTER TABLE debts ADD COLUMN kind TEXT NOT NULL DEFAULT '기타'");
  tryAlter("ALTER TABLE debts ADD COLUMN grace_period_months INTEGER NOT NULL DEFAULT 0");
  tryAlter("ALTER TABLE debts ADD COLUMN accrued_interest INTEGER NOT NULL DEFAULT 0");
  tryAlter("ALTER TABLE debts ADD COLUMN last_accrual_date TEXT");
  tryAlter("ALTER TABLE debts ADD COLUMN mandatory_repay_income INTEGER NOT NULL DEFAULT 0");
  tryAlter("ALTER TABLE transactions ADD COLUMN principal_amount INTEGER");
  tryAlter("ALTER TABLE transactions ADD COLUMN interest_amount INTEGER");

  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number };
  if (count.c === 0) {
    const ins = db.prepare('INSERT INTO categories (ledger, name) VALUES (?, ?)');
    const seed: [string, string][] = [
      ['personal', '식비'], ['personal', '교통'], ['personal', '공과금'],
      ['personal', '문화/여가'], ['personal', '의료'], ['personal', '쇼핑'],
      ['personal', '급여'], ['personal', '기타수입'], ['personal', '기타'],
      ['business', '매출'], ['business', '매입'], ['business', '임대료'],
      ['business', '인건비'], ['business', '공과금'], ['business', '세금'],
      ['business', '소모품'], ['business', '접대비'], ['business', '기타']
    ];
    db.exec('BEGIN');
    try {
      for (const [l, n] of seed) ins.run(l, n);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

export function getDb(): DatabaseSync {
  if (!global.__ledgerDb) {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, 'ledger.db'));
    init(db);
    global.__ledgerDb = db;
  }
  return global.__ledgerDb;
}

export type Ledger = 'personal' | 'business';
export type TxType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: number;
  ledger: Ledger;
  type: TxType;
  date: string;
  amount: number;
  category_id: number | null;
  from_ledger: Ledger | null;
  to_ledger: Ledger | null;
  memo: string | null;
  recurring_id: number | null;
  person_id: number | null;
}

export interface Category { id: number; ledger: Ledger; name: string }
export interface Recurring {
  id: number; ledger: Ledger; type: TxType; category_id: number | null;
  amount: number; day_of_month: number; memo: string | null;
  from_ledger: Ledger | null; to_ledger: Ledger | null;
  start_date: string; active: number;
}
export interface Budget { id: number; ledger: Ledger; category_id: number; month: string; amount: number }
export interface Person { id: number; name: string; relation: string | null }
export interface Debt {
  id: number;
  name: string;
  kind: string;
  initial_principal: number;
  interest_rate: number;
  start_date: string;
  target_end_date: string | null;
  active: number;
}

export const DEBT_KINDS = [
  '학자금(취업후상환)',
  '학자금(일반)',
  '신용대출',
  '주택담보대출',
  '전세자금대출',
  '사적대출',
  '기타',
] as const;
