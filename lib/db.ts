import { createClient, Client } from '@libsql/client';

declare global {
  // eslint-disable-next-line no-var
  var __ledgerDb: Client | undefined;
  // eslint-disable-next-line no-var
  var __ledgerInit: Promise<void> | undefined;
}

async function init(db: Client) {
  // run each CREATE TABLE / CREATE INDEX as separate db.execute calls
  // (libsql doesn't accept multi-statement strings via execute)
  await db.execute(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
    name TEXT NOT NULL,
    UNIQUE(ledger, name)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS transactions (
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
  )`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS recurring (
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
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS account_settings (
    ledger TEXT PRIMARY KEY CHECK(ledger IN ('personal','business')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    opening_date TEXT NOT NULL DEFAULT '2025-01-01',
    tax_reserve_rate REAL NOT NULL DEFAULT 0
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    relation TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS debts (
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
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS debt_rate_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL,
    effective_date TEXT NOT NULL,
    rate REAL NOT NULL,
    FOREIGN KEY(debt_id) REFERENCES debts(id) ON DELETE CASCADE
  )`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_rate_history_debt ON debt_rate_history(debt_id, effective_date)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    amount INTEGER NOT NULL,
    UNIQUE(ledger, category_id, month)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS user_account_settings (
    user_id INTEGER NOT NULL,
    ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    opening_date TEXT NOT NULL DEFAULT '2025-01-01',
    tax_reserve_rate REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, ledger)
  )`);
  // migrate any per-user rows from legacy account_settings into the new per-user table
  try {
    await db.execute(`INSERT OR IGNORE INTO user_account_settings (user_id, ledger, opening_balance, opening_date, tax_reserve_rate)
      SELECT user_id, ledger, opening_balance, opening_date, tax_reserve_rate FROM account_settings WHERE user_id IS NOT NULL`);
  } catch { /* ignore */ }
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kakao_id TEXT NOT NULL UNIQUE,
    email TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // migrations for existing databases (ALTER ignores duplicate-column errors)
  const tryAlter = async (sql: string) => { try { await db.execute(sql); } catch { /* column already exists */ } };
  // multi-tenant: every data table gets user_id
  await tryAlter("ALTER TABLE categories ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE transactions ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE recurring ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE budgets ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE account_settings ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE people ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE debts ADD COLUMN user_id INTEGER");
  await tryAlter("ALTER TABLE debt_rate_history ADD COLUMN user_id INTEGER");
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_user_type_date ON transactions(user_id, type, date)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_id)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_user_debt ON transactions(user_id, debt_id)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tx_recurring ON transactions(recurring_id)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id, active)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, month)`).catch(() => {});
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id, active)`).catch(() => {});
  await tryAlter("ALTER TABLE account_settings ADD COLUMN tax_reserve_rate REAL NOT NULL DEFAULT 0");
  await tryAlter("ALTER TABLE transactions ADD COLUMN person_id INTEGER");
  await tryAlter("ALTER TABLE transactions ADD COLUMN debt_id INTEGER");
  await tryAlter("ALTER TABLE debts ADD COLUMN kind TEXT NOT NULL DEFAULT '기타'");
  await tryAlter("ALTER TABLE debts ADD COLUMN grace_period_months INTEGER NOT NULL DEFAULT 0");
  await tryAlter("ALTER TABLE debts ADD COLUMN accrued_interest INTEGER NOT NULL DEFAULT 0");
  await tryAlter("ALTER TABLE debts ADD COLUMN last_accrual_date TEXT");
  await tryAlter("ALTER TABLE debts ADD COLUMN mandatory_repay_income INTEGER NOT NULL DEFAULT 0");
  await tryAlter("ALTER TABLE transactions ADD COLUMN principal_amount INTEGER");
  await tryAlter("ALTER TABLE transactions ADD COLUMN interest_amount INTEGER");
  await tryAlter("ALTER TABLE users ADD COLUMN image TEXT");

  const countR = await db.execute('SELECT COUNT(*) as c FROM categories');
  const count = Number((countR.rows[0] as any).c);
  if (count === 0) {
    const seed: [string, string][] = [
      ['personal', '식비'], ['personal', '교통'], ['personal', '공과금'],
      ['personal', '문화/여가'], ['personal', '의료'], ['personal', '쇼핑'],
      ['personal', '급여'], ['personal', '기타수입'], ['personal', '기타'],
      ['business', '매출'], ['business', '매입'], ['business', '임대료'],
      ['business', '인건비'], ['business', '공과금'], ['business', '세금'],
      ['business', '소모품'], ['business', '접대비'], ['business', '기타']
    ];
    const tx = await db.transaction('write');
    try {
      for (const [l, n] of seed) {
        await tx.execute({ sql: 'INSERT INTO categories (ledger, name) VALUES (?, ?)', args: [l, n] });
      }
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
  }
}

export function getDb(): Client {
  if (!global.__ledgerDb) {
    const url = process.env.TURSO_DATABASE_URL || 'file:./data/ledger.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;
    global.__ledgerDb = createClient({ url, authToken });
    global.__ledgerInit = init(global.__ledgerDb);
  }
  return global.__ledgerDb;
}

export async function ensureDb(): Promise<Client> {
  const db = getDb();
  if (global.__ledgerInit) await global.__ledgerInit;
  return db;
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
  grace_period_months: number;
  accrued_interest: number;
  last_accrual_date: string | null;
  mandatory_repay_income: number;
  active: number;
}
export interface DebtRateHistory { id: number; debt_id: number; effective_date: string; rate: number }

export const DEBT_KINDS = [
  '학자금(취업후상환)',
  '학자금(일반)',
  '신용대출',
  '주택담보대출',
  '전세자금대출',
  '사적대출',
  '기타',
] as const;
