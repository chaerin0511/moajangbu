import type { Client } from '@libsql/client';

export interface Migration {
  id: string;          // sortable id, e.g. '0001_initial'
  up: (db: Client) => Promise<void>;
}

/**
 * 마이그레이션 목록 — 순서대로 한 번씩만 실행됨.
 * 새 스키마 변경은 새 항목을 **끝에** 추가만 한다. 이미 배포된 것은 절대 수정 금지.
 */
export const migrations: Migration[] = [
  {
    id: '0001_baseline',
    // 기존 db.ts init을 그대로 흡수. 모두 IF NOT EXISTS / ON CONFLICT-safe 라서
    // 이미 운영 중인 DB에서 재실행되어도 안전 (베이스라인 일치).
    async up(db) {
      const exec = (sql: string) => db.execute(sql);
      const safeAlter = async (sql: string) => {
        try { await db.execute(sql); } catch (e: any) {
          // libsql: duplicate column → 무시. 그 외는 throw.
          const msg = String(e?.message || e);
          if (!/duplicate column|already exists/i.test(msg)) throw e;
        }
      };

      await exec(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
        name TEXT NOT NULL,
        UNIQUE(ledger, name)
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS transactions (
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
      await exec(`CREATE TABLE IF NOT EXISTS recurring (
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
      await exec(`CREATE TABLE IF NOT EXISTS account_settings (
        ledger TEXT PRIMARY KEY CHECK(ledger IN ('personal','business')),
        opening_balance INTEGER NOT NULL DEFAULT 0,
        opening_date TEXT NOT NULL DEFAULT '2025-01-01',
        tax_reserve_rate REAL NOT NULL DEFAULT 0
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS people (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        relation TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS debts (
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
      await exec(`CREATE TABLE IF NOT EXISTS debt_rate_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debt_id INTEGER NOT NULL,
        effective_date TEXT NOT NULL,
        rate REAL NOT NULL,
        FOREIGN KEY(debt_id) REFERENCES debts(id) ON DELETE CASCADE
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ledger TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        amount INTEGER NOT NULL,
        UNIQUE(ledger, category_id, month)
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS user_account_settings (
        user_id INTEGER NOT NULL,
        ledger TEXT NOT NULL CHECK(ledger IN ('personal','business')),
        opening_balance INTEGER NOT NULL DEFAULT 0,
        opening_date TEXT NOT NULL DEFAULT '2025-01-01',
        tax_reserve_rate REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, ledger)
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kakao_id TEXT NOT NULL UNIQUE,
        email TEXT,
        name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS investments (
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
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS investment_trades (
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
      )`);
      await exec(`CREATE TABLE IF NOT EXISTS business_targets (
        user_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        target_revenue INTEGER NOT NULL DEFAULT 0,
        target_profit INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, month)
      )`);

      // 컬럼 추가 (운영 DB에 이미 있을 수 있어 duplicate column 무시)
      for (const sql of [
        "ALTER TABLE categories ADD COLUMN user_id INTEGER",
        "ALTER TABLE transactions ADD COLUMN user_id INTEGER",
        "ALTER TABLE recurring ADD COLUMN user_id INTEGER",
        "ALTER TABLE budgets ADD COLUMN user_id INTEGER",
        "ALTER TABLE account_settings ADD COLUMN user_id INTEGER",
        "ALTER TABLE people ADD COLUMN user_id INTEGER",
        "ALTER TABLE debts ADD COLUMN user_id INTEGER",
        "ALTER TABLE debt_rate_history ADD COLUMN user_id INTEGER",
        "ALTER TABLE transactions ADD COLUMN person_id INTEGER",
        "ALTER TABLE transactions ADD COLUMN debt_id INTEGER",
        "ALTER TABLE transactions ADD COLUMN principal_amount INTEGER",
        "ALTER TABLE transactions ADD COLUMN interest_amount INTEGER",
        "ALTER TABLE users ADD COLUMN image TEXT",
        "ALTER TABLE users ADD COLUMN nav_order TEXT",
        "ALTER TABLE transactions ADD COLUMN supply_amount INTEGER",
        "ALTER TABLE transactions ADD COLUMN vat_amount INTEGER",
      ]) await safeAlter(sql);

      // 인덱스
      for (const sql of [
        `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_ledger ON transactions(ledger)`,
        `CREATE INDEX IF NOT EXISTS idx_rate_history_debt ON debt_rate_history(debt_id, effective_date)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_user_type_date ON transactions(user_id, type, date)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_user_cat ON transactions(user_id, category_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_user_debt ON transactions(user_id, debt_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tx_recurring ON transactions(recurring_id)`,
        `CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id, active)`,
        `CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, month)`,
        `CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id, active)`,
        `CREATE INDEX IF NOT EXISTS idx_inv_user ON investments(user_id, active)`,
        `CREATE INDEX IF NOT EXISTS idx_inv_trades_user ON investment_trades(user_id, date)`,
        `CREATE INDEX IF NOT EXISTS idx_inv_trades_inv ON investment_trades(investment_id)`,
      ]) await exec(sql);

      // legacy → user_account_settings 동기화 (한 번)
      try {
        await db.execute(`INSERT OR IGNORE INTO user_account_settings (user_id, ledger, opening_balance, opening_date, tax_reserve_rate)
          SELECT user_id, ledger, opening_balance, opening_date, tax_reserve_rate FROM account_settings WHERE user_id IS NOT NULL`);
      } catch { /* ignore */ }
    },
  },
];

const DEFAULT_CATEGORIES: [string, string][] = [
  ['personal', '식비'], ['personal', '교통'], ['personal', '공과금'],
  ['personal', '문화/여가'], ['personal', '의료'], ['personal', '쇼핑'],
  ['personal', '급여'], ['personal', '기타수입'], ['personal', '기타'],
  ['business', '매출'], ['business', '매입'], ['business', '임대료'],
  ['business', '인건비'], ['business', '공과금'], ['business', '세금'],
  ['business', '소모품'], ['business', '접대비'], ['business', '기타'],
];

async function seedDefaultCategories(db: Client) {
  const r = await db.execute('SELECT COUNT(*) AS c FROM categories');
  if (Number((r.rows[0] as any).c) > 0) return;
  const tx = await db.transaction('write');
  try {
    for (const [l, n] of DEFAULT_CATEGORIES) {
      await tx.execute({ sql: 'INSERT INTO categories (ledger, name) VALUES (?, ?)', args: [l, n] });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
}

export async function runMigrations(db: Client): Promise<{ applied: string[] }> {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const r = await db.execute('SELECT id FROM schema_migrations');
  const done = new Set((r.rows as any[]).map(row => String(row.id)));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await m.up(db);
    await db.execute({ sql: 'INSERT INTO schema_migrations (id) VALUES (?)', args: [m.id] });
    applied.push(m.id);
  }
  await seedDefaultCategories(db);
  return { applied };
}
