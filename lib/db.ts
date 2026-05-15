import { createClient, Client } from '@libsql/client';
import { runMigrations } from './migrations';

declare global {
  // eslint-disable-next-line no-var
  var __ledgerDb: Client | undefined;
  // eslint-disable-next-line no-var
  var __ledgerInit: Promise<void> | undefined;
}

async function init(db: Client) {
  await runMigrations(db);
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
