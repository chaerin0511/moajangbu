import { createClient, Client } from '@libsql/client';

declare global {
  // eslint-disable-next-line no-var
  var __ledgerDb: Client | undefined;
  // eslint-disable-next-line no-var
  var __ledgerInit: Promise<void> | undefined;
}

async function init(db: Client) {
  // 콜드 스타트 최적화: 독립적인 CREATE/ALTER/INDEX를 단계별로 병렬 실행
  // (libsql doesn't accept multi-statement strings via execute)
  const exec = (sql: string) => db.execute(sql).catch(() => {});
  const tryAlter = (sql: string) => db.execute(sql).catch(() => {});

  // Phase 1: CREATE TABLE 전부 병렬
  await Promise.all([
    exec(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
    name TEXT NOT NULL,
    UNIQUE(ledger, name)
  )`),
    exec(`CREATE TABLE IF NOT EXISTS transactions (
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
  )`),
    exec(`CREATE TABLE IF NOT EXISTS recurring (
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
  )`),
    exec(`CREATE TABLE IF NOT EXISTS account_settings (
    ledger TEXT PRIMARY KEY CHECK(ledger IN ('personal','business')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    opening_date TEXT NOT NULL DEFAULT '2025-01-01',
    tax_reserve_rate REAL NOT NULL DEFAULT 0
  )`),
    exec(`CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    relation TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`),
    exec(`CREATE TABLE IF NOT EXISTS debts (
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
  )`),
    exec(`CREATE TABLE IF NOT EXISTS debt_rate_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL,
    effective_date TEXT NOT NULL,
    rate REAL NOT NULL,
    FOREIGN KEY(debt_id) REFERENCES debts(id) ON DELETE CASCADE
  )`),
    exec(`CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    amount INTEGER NOT NULL,
    UNIQUE(ledger, category_id, month)
  )`),
    exec(`CREATE TABLE IF NOT EXISTS user_account_settings (
    user_id INTEGER NOT NULL,
    ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
    opening_balance INTEGER NOT NULL DEFAULT 0,
    opening_date TEXT NOT NULL DEFAULT '2025-01-01',
    tax_reserve_rate REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, ledger)
  )`),
    exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kakao_id TEXT NOT NULL UNIQUE,
    email TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`),
    exec(`CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    ticker TEXT,
    type TEXT NOT NULL DEFAULT '주식',
    currency TEXT NOT NULL DEFAULT 'KRW',
    current_price REAL NOT NULL DEFAULT 0,
    current_price_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`),
    exec(`CREATE TABLE IF NOT EXISTS investment_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL,
    user_id INTEGER,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('buy','sell','dividend','fee')),
    quantity REAL NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL,
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(investment_id) REFERENCES investments(id) ON DELETE CASCADE
  )`),
    exec(`CREATE TABLE IF NOT EXISTS business_targets (
    user_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    target_revenue INTEGER NOT NULL DEFAULT 0,
    target_profit INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, month)
  )`),
  ]);

  // Phase 2: ALTER TABLE (테이블 생성 후) — 병렬, 중복 컬럼 에러는 무시
  await Promise.all([
    tryAlter("ALTER TABLE categories ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE transactions ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE recurring ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE budgets ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE account_settings ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE people ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE debts ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE debt_rate_history ADD COLUMN user_id INTEGER"),
    tryAlter("ALTER TABLE account_settings ADD COLUMN tax_reserve_rate REAL NOT NULL DEFAULT 0"),
    tryAlter("ALTER TABLE transactions ADD COLUMN person_id INTEGER"),
    tryAlter("ALTER TABLE transactions ADD COLUMN debt_id INTEGER"),
    tryAlter("ALTER TABLE debts ADD COLUMN kind TEXT NOT NULL DEFAULT '기타'"),
    tryAlter("ALTER TABLE debts ADD COLUMN grace_period_months INTEGER NOT NULL DEFAULT 0"),
    tryAlter("ALTER TABLE debts ADD COLUMN accrued_interest INTEGER NOT NULL DEFAULT 0"),
    tryAlter("ALTER TABLE debts ADD COLUMN last_accrual_date TEXT"),
    tryAlter("ALTER TABLE debts ADD COLUMN mandatory_repay_income INTEGER NOT NULL DEFAULT 0"),
    tryAlter("ALTER TABLE transactions ADD COLUMN principal_amount INTEGER"),
    tryAlter("ALTER TABLE transactions ADD COLUMN interest_amount INTEGER"),
    tryAlter("ALTER TABLE users ADD COLUMN image TEXT"),
    tryAlter("ALTER TABLE users ADD COLUMN nav_order TEXT"),
    tryAlter("ALTER TABLE transactions ADD COLUMN supply_amount INTEGER"),
    tryAlter("ALTER TABLE transactions ADD COLUMN vat_amount INTEGER"),
  ]);

  // Phase 3: CREATE INDEX (ALTER 이후) — 병렬
  await Promise.all([
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_rate_history_debt ON debt_rate_history(debt_id, effective_date)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_user_type_date ON transactions(user_id, type, date)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_id)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_user_debt ON transactions(user_id, debt_id)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_tx_recurring ON transactions(recurring_id)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id, active)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, month)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id, active)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_inv_user ON investments(user_id, active)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_inv_trades_user ON investment_trades(user_id, date)`),
    exec(`CREATE INDEX IF NOT EXISTS idx_inv_trades_inv ON investment_trades(investment_id)`),
  ]);

  // legacy migration (한 번만)
  try {
    await db.execute(`INSERT OR IGNORE INTO user_account_settings (user_id, ledger, opening_balance, opening_date, tax_reserve_rate)
      SELECT user_id, ledger, opening_balance, opening_date, tax_reserve_rate FROM account_settings WHERE user_id IS NOT NULL`);
  } catch { /* ignore */ }

  // seed: 카테고리가 비어있으면 채움
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
    // 프로덕션에서 SKIP_DB_INIT=1이면 스키마 초기화 30+ 쿼리 스킵 (콜드스타트 1~2초 절감)
    if (process.env.SKIP_DB_INIT === '1') {
      global.__ledgerInit = Promise.resolve();
    } else {
      global.__ledgerInit = init(global.__ledgerDb);
    }
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

export interface Investment {
  id: number;
  name: string;
  ticker: string | null;
  type: string;
  currency: string;
  current_price: number;
  current_price_at: string | null;
  active: number;
  created_at: string;
}

export interface InvestmentTrade {
  id: number;
  investment_id: number;
  date: string;
  type: 'buy' | 'sell' | 'dividend' | 'fee';
  quantity: number;
  price: number;
  amount: number;
  memo: string | null;
  created_at: string;
}

export const INVESTMENT_TYPES = ['주식','ETF','펀드','채권','암호화폐','부동산','기타'] as const;

export const DEBT_KINDS = [
  '학자금(취업후상환)',
  '학자금(일반)',
  '신용대출',
  '주택담보대출',
  '전세자금대출',
  '사적대출',
  '기타',
] as const;
