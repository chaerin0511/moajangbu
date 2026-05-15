import { ensureDb, Ledger, Transaction, Category, Recurring, Budget, Person, Debt, Investment, InvestmentTrade } from './db';
import { clampDay, currentMonth, monthsBack } from './utils';

// libsql rows are plain objects, but spread for safety / consistent shape.
const plain = <T>(rows: any[]): T[] => rows.map(r => ({ ...r })) as T[];

// Coerce BigInt/number-ish to number (libsql returns BigInt for INTEGER sometimes).
const N = (v: any): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function listCategories(userId: number, ledger?: Ledger): Promise<Category[]> {
  const db = await ensureDb();
  if (ledger) {
    const r = await db.execute({ sql: 'SELECT * FROM categories WHERE ledger=? AND user_id=? ORDER BY name', args: [ledger, userId] });
    return plain<Category>(r.rows as any[]);
  }
  const r = await db.execute({ sql: 'SELECT * FROM categories WHERE user_id=? ORDER BY ledger, name', args: [userId] });
  return plain<Category>(r.rows as any[]);
}

export async function listTransactions(userId: number, filters: { ledger?: string; type?: string; month?: string; category_id?: string; fixed?: string } = {}): Promise<(Transaction & { category_name: string | null })[]> {
  const db = await ensureDb();
  const where: string[] = ['t.user_id = ?'];
  const params: any[] = [userId];
  if (filters.ledger) { where.push('(t.ledger = ? OR t.from_ledger = ? OR t.to_ledger = ?)'); params.push(filters.ledger, filters.ledger, filters.ledger); }
  if (filters.type) { where.push('t.type = ?'); params.push(filters.type); }
  if (filters.month) { where.push("substr(t.date,1,7) = ?"); params.push(filters.month); }
  if (filters.category_id) { where.push('t.category_id = ?'); params.push(Number(filters.category_id)); }
  if (filters.fixed === 'fixed') where.push('t.recurring_id IS NOT NULL');
  else if (filters.fixed === 'variable') where.push('t.recurring_id IS NULL');
  if ((filters as any).person_id) { where.push('t.person_id = ?'); params.push(Number((filters as any).person_id)); }
  const sortMap: Record<string, string> = {
    'date_desc':   't.date DESC, t.id DESC',
    'date_asc':    't.date ASC, t.id ASC',
    'amount_desc': 't.amount DESC, t.date DESC',
    'amount_asc':  't.amount ASC, t.date DESC',
  };
  const orderBy = sortMap[(filters as any).sort] || sortMap.date_desc;
  const sql = `SELECT t.*, c.name as category_name, p.name as person_name
               FROM transactions t
               LEFT JOIN categories c ON c.id = t.category_id
               LEFT JOIN people p ON p.id = t.person_id
               WHERE ${where.join(' AND ')}
               ORDER BY ${orderBy} LIMIT 500`;
  const r = await db.execute({ sql, args: params });
  return plain<any>(r.rows as any[]);
}

export async function recentTransactions(userId: number, limit = 10) {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT t.*, c.name as category_name, p.name as person_name FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN people p ON p.id = t.person_id WHERE t.user_id=? ORDER BY t.date DESC, t.id DESC LIMIT ?`,
    args: [userId, limit],
  });
  return plain<any>(r.rows as any[]);
}

export interface MonthlyTotals {
  personal: { income: number; expense: number; net: number };
  business: { income: number; expense: number; net: number };
  combinedNet: number;
}

export async function monthlyTotals(userId: number, month: string): Promise<MonthlyTotals> {
  const db = await ensureDb();
  const r = await db.execute({ sql: `SELECT ledger, type, from_ledger, to_ledger, amount FROM transactions WHERE user_id=? AND substr(date,1,7) = ?`, args: [userId, month] });
  const rows = r.rows as unknown as any[];
  const t = {
    personal: { income: 0, expense: 0, net: 0 },
    business: { income: 0, expense: 0, net: 0 }
  };
  for (const row of rows) {
    const amt = N(row.amount);
    if (row.type === 'income') {
      (t as any)[row.ledger].income += amt;
    } else if (row.type === 'expense') {
      (t as any)[row.ledger].expense += amt;
    } else if (row.type === 'transfer') {
      if (row.from_ledger && (t as any)[row.from_ledger]) (t as any)[row.from_ledger].expense += amt;
      if (row.to_ledger && (t as any)[row.to_ledger]) (t as any)[row.to_ledger].income += amt;
    }
  }
  t.personal.net = t.personal.income - t.personal.expense;
  t.business.net = t.business.income - t.business.expense;
  return { ...t, combinedNet: t.personal.net + t.business.net };
}

export async function monthlySeries(userId: number): Promise<{ month: string; personalIncome: number; personalExpense: number; businessIncome: number; businessExpense: number }[]> {
  const months = monthsBack(6);
  const db = await ensureDb();
  const placeholders = months.map(() => '?').join(',');
  const r = await db.execute({
    sql: `SELECT substr(date,1,7) AS m,
      SUM(CASE WHEN type='income'  AND ledger='personal' THEN amount ELSE 0 END) AS pIncome,
      SUM(CASE WHEN type='expense' AND ledger='personal' THEN amount ELSE 0 END) AS pExpense,
      SUM(CASE WHEN type='income'  AND ledger='business' THEN amount ELSE 0 END) AS bIncome,
      SUM(CASE WHEN type='expense' AND ledger='business' THEN amount ELSE 0 END) AS bExpense,
      SUM(CASE WHEN type='transfer' AND from_ledger='personal' THEN amount ELSE 0 END) AS pOut,
      SUM(CASE WHEN type='transfer' AND to_ledger='personal'   THEN amount ELSE 0 END) AS pIn,
      SUM(CASE WHEN type='transfer' AND from_ledger='business' THEN amount ELSE 0 END) AS bOut,
      SUM(CASE WHEN type='transfer' AND to_ledger='business'   THEN amount ELSE 0 END) AS bIn
     FROM transactions WHERE user_id=? AND substr(date,1,7) IN (${placeholders})
     GROUP BY substr(date,1,7)`,
    args: [userId, ...months],
  });
  const byMonth = new Map<string, any>();
  for (const row of r.rows as any[]) byMonth.set(row.m, row);
  return months.map(m => {
    const row = byMonth.get(m);
    if (!row) return { month: m, personalIncome: 0, personalExpense: 0, businessIncome: 0, businessExpense: 0 };
    return {
      month: m,
      personalIncome: N(row.pIncome) + N(row.pIn),
      personalExpense: N(row.pExpense) + N(row.pOut),
      businessIncome: N(row.bIncome) + N(row.bIn),
      businessExpense: N(row.bExpense) + N(row.bOut),
    };
  });
}

export async function spentForBudget(userId: number, ledger: Ledger, category_id: number, month: string): Promise<number> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE user_id=? AND ledger=? AND category_id=? AND type='expense' AND substr(date,1,7)=?`,
    args: [userId, ledger, category_id, month],
  });
  return N((r.rows[0] as any).s);
}

export async function listBudgets(userId: number, month?: string): Promise<(Budget & { category_name: string; spent: number })[]> {
  const db = await ensureDb();
  const m = month || currentMonth();
  const r = await db.execute({
    sql: `SELECT b.*, c.name as category_name,
            COALESCE((
              SELECT SUM(t.amount) FROM transactions t
              WHERE t.user_id = b.user_id AND t.ledger = b.ledger AND t.category_id = b.category_id
                AND t.type = 'expense' AND substr(t.date,1,7) = b.month
            ), 0) AS spent
          FROM budgets b
          JOIN categories c ON c.id = b.category_id
          WHERE b.user_id=? AND b.month=?
          ORDER BY b.ledger, c.name`,
    args: [userId, m],
  });
  const rows = r.rows as unknown as any[];
  return rows.map(row => ({ ...row, spent: N(row.spent) })) as any;
}

export async function listRecurring(userId: number): Promise<(Recurring & { category_name: string | null })[]> {
  const db = await ensureDb();
  const r = await db.execute({ sql: `SELECT r.*, c.name as category_name FROM recurring r LEFT JOIN categories c ON c.id=r.category_id WHERE r.user_id=? ORDER BY r.id DESC`, args: [userId] });
  return plain<any>(r.rows as any[]);
}

export interface OpeningBalance { ledger: Ledger; opening_balance: number; opening_date: string; tax_reserve_rate: number }

export async function getOpeningBalances(userId: number): Promise<Record<Ledger, OpeningBalance>> {
  const db = await ensureDb();
  const r = await db.execute({ sql: 'SELECT * FROM user_account_settings WHERE user_id=?', args: [userId] });
  const rows = plain<any>(r.rows as any[]);
  const out: any = {
    personal: { ledger: 'personal', opening_balance: 0, opening_date: '2025-01-01', tax_reserve_rate: 0 },
    business: { ledger: 'business', opening_balance: 0, opening_date: '2025-01-01', tax_reserve_rate: 0 },
  };
  for (const row of rows) {
    out[row.ledger] = {
      ledger: row.ledger,
      opening_balance: N(row.opening_balance),
      opening_date: row.opening_date,
      tax_reserve_rate: typeof row.tax_reserve_rate === 'bigint' ? Number(row.tax_reserve_rate) : (row.tax_reserve_rate ?? 0),
    };
  }
  return out;
}

export async function balanceAt(userId: number, ledger: Ledger, dateISO?: string): Promise<number> {
  const db = await ensureDb();
  const ob = (await getOpeningBalances(userId))[ledger];
  const dateClause = dateISO ? ' AND date <= ?' : '';
  const params: any[] = dateISO ? [userId, ledger, ob.opening_date, dateISO] : [userId, ledger, ob.opening_date];
  const incExpR = await db.execute({
    sql: `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END),0) AS s
          FROM transactions WHERE user_id=? AND ledger=? AND date >= ?${dateClause}`,
    args: params,
  });
  const inTransR = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND type='transfer' AND to_ledger=? AND date >= ?${dateClause}`,
    args: params,
  });
  const outTransR = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND type='transfer' AND from_ledger=? AND date >= ?${dateClause}`,
    args: params,
  });
  return ob.opening_balance + N((incExpR.rows[0] as any).s) + N((inTransR.rows[0] as any).s) - N((outTransR.rows[0] as any).s);
}

export async function projectedMonthEndBalance(userId: number, ledger: Ledger): Promise<number> {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cur = await balanceAt(userId, ledger, todayStr);
  const db = await ensureDb();
  const rulesR = await db.execute({ sql: 'SELECT * FROM recurring WHERE active=1 AND user_id=?', args: [userId] });
  const rules = plain<Recurring>(rulesR.rows as any[]);
  const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let delta = 0;
  for (const r of rules) {
    if (r.day_of_month <= today.getDate()) continue;
    const existsR = await db.execute({
      sql: `SELECT 1 AS x FROM transactions WHERE user_id=? AND recurring_id=? AND substr(date,1,7)=?`,
      args: [userId, r.id, monthStr],
    });
    if (existsR.rows.length > 0) continue;
    if (r.type === 'income' && r.ledger === ledger) delta += N(r.amount);
    else if (r.type === 'expense' && r.ledger === ledger) delta -= N(r.amount);
    else if (r.type === 'transfer') {
      if (r.to_ledger === ledger) delta += N(r.amount);
      if (r.from_ledger === ledger) delta -= N(r.amount);
    }
  }
  return cur + delta;
}

export interface FinancialHealth {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  fixedIncome: number;
  fixedExpense: number;
  fixedCoverage: number;
  pureSpend: number;
  pureSpendShare: number;
  vsLastMonth: { income: number; expense: number; net: number };
}

async function totalsFor(userId: number, month: string): Promise<{ income: number; expense: number; net: number; pIncome: number; pExpense: number; fIncome: number; fExpense: number }> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN type='income' AND ledger='personal' THEN amount ELSE 0 END),0) AS pIncome,
      COALESCE(SUM(CASE WHEN type='expense' AND ledger='personal' THEN amount ELSE 0 END),0) AS pExpense,
      COALESCE(SUM(CASE WHEN type='income' AND recurring_id IS NOT NULL THEN amount ELSE 0 END),0) AS fIncome,
      COALESCE(SUM(CASE WHEN type='expense' AND recurring_id IS NOT NULL AND ledger='personal' THEN amount ELSE 0 END),0) AS fExpense
    FROM transactions WHERE user_id=? AND substr(date,1,7)=?`,
    args: [userId, month],
  });
  const row = r.rows[0] as any;
  const income = N(row.income);
  const expense = N(row.expense);
  return {
    income,
    expense,
    net: income - expense,
    pIncome: N(row.pIncome),
    pExpense: N(row.pExpense),
    fIncome: N(row.fIncome),
    fExpense: N(row.fExpense),
  };
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function financialHealth(userId: number, month: string): Promise<FinancialHealth> {
  const cur = await totalsFor(userId, month);
  const prev = await totalsFor(userId, prevMonth(month));
  const savingsRate = cur.income > 0 ? cur.net / cur.income : 0;
  const fixedCoverage = cur.fExpense > 0 ? cur.fIncome / cur.fExpense : (cur.fIncome > 0 ? Infinity : 0);
  const pureSpend = Math.max(0, cur.pExpense - cur.fExpense);
  const pureSpendShare = cur.pIncome > 0 ? pureSpend / cur.pIncome : 0;
  return {
    income: cur.income,
    expense: cur.expense,
    net: cur.net,
    savingsRate,
    fixedIncome: cur.fIncome,
    fixedExpense: cur.fExpense,
    fixedCoverage,
    pureSpend,
    pureSpendShare,
    vsLastMonth: {
      income: cur.income - prev.income,
      expense: cur.expense - prev.expense,
      net: cur.net - prev.net,
    },
  };
}

export async function savingsRateSeries(userId: number): Promise<{ month: string; rate: number; net: number }[]> {
  const months = monthsBack(6);
  const db = await ensureDb();
  const placeholders = months.map(() => '?').join(',');
  const r = await db.execute({
    sql: `SELECT substr(date,1,7) AS m,
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
     FROM transactions WHERE user_id=? AND substr(date,1,7) IN (${placeholders})
     GROUP BY substr(date,1,7)`,
    args: [userId, ...months],
  });
  const byMonth = new Map<string, any>();
  for (const row of r.rows as any[]) byMonth.set(row.m, row);
  return months.map(m => {
    const row = byMonth.get(m);
    const income = row ? N(row.income) : 0;
    const expense = row ? N(row.expense) : 0;
    const net = income - expense;
    return { month: m, rate: income > 0 ? net / income : 0, net };
  });
}

/* ─────────── People (family members) ─────────── */

export async function listPeople(userId: number): Promise<Person[]> {
  const db = await ensureDb();
  const r = await db.execute({ sql: 'SELECT * FROM people WHERE user_id=? ORDER BY name', args: [userId] });
  return plain<Person>(r.rows as any[]);
}

export interface PersonStat {
  person: Person;
  monthIncome: number;
  monthExpense: number;
  ytdIncome: number;
  ytdExpense: number;
  lastDate: string | null;
}

export async function personStats(userId: number, month: string): Promise<PersonStat[]> {
  const db = await ensureDb();
  const year = month.slice(0, 4);
  const people = await listPeople(userId);
  const out: PersonStat[] = [];
  for (const p of people) {
    const mR = await db.execute({
      sql: `SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
        MAX(date) AS lastDate
       FROM transactions WHERE user_id=? AND person_id=? AND substr(date,1,7)=?`,
      args: [userId, p.id, month],
    });
    const m = mR.rows[0] as any;
    const yR = await db.execute({
      sql: `SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
       FROM transactions WHERE user_id=? AND person_id=? AND substr(date,1,4)=?`,
      args: [userId, p.id, year],
    });
    const y = yR.rows[0] as any;
    out.push({
      person: p,
      monthIncome: N(m.income), monthExpense: N(m.expense),
      ytdIncome: N(y.income), ytdExpense: N(y.expense),
      lastDate: m.lastDate || null,
    });
  }
  return out;
}

/* ─────────── Fixed expense breakdown ─────────── */

export interface FixedItem {
  category_id: number | null;
  category_name: string | null;
  ledger: Ledger;
  amount: number;
  count: number;
}

export async function fixedExpenseBreakdown(userId: number, month: string): Promise<FixedItem[]> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `
    SELECT t.ledger, t.category_id, c.name AS category_name,
           COALESCE(SUM(t.amount),0) AS amount, COUNT(*) AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id=? AND t.type='expense' AND t.recurring_id IS NOT NULL AND substr(t.date,1,7)=?
    GROUP BY t.ledger, t.category_id, c.name
    ORDER BY amount DESC`,
    args: [userId, month],
  });
  return (r.rows as any[]).map(row => ({
    category_id: row.category_id === null ? null : N(row.category_id),
    category_name: row.category_name,
    ledger: row.ledger,
    amount: N(row.amount),
    count: N(row.count),
  }));
}

/* ─────────── Emergency fund (months covered) ─────────── */

export async function emergencyFund(userId: number): Promise<{ balance: number; monthlyFixed: number; months: number }> {
  const db = await ensureDb();
  const months = monthsBack(3);
  const placeholders = months.map(() => '?').join(',');
  const r = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
     WHERE user_id=? AND ledger='personal' AND type='expense' AND recurring_id IS NOT NULL
       AND substr(date,1,7) IN (${placeholders})`,
    args: [userId, ...months],
  });
  const total = N((r.rows[0] as any).s);
  const monthlyFixed = total / Math.max(1, months.length);
  const balance = await balanceAt(userId, 'personal');
  return { balance, monthlyFixed, months: monthlyFixed > 0 ? balance / monthlyFixed : 0 };
}

/* ─────────── YTD savings ─────────── */

export async function ytdSavings(userId: number, year?: string): Promise<{ income: number; expense: number; net: number }> {
  const y = year || String(new Date().getFullYear());
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
     FROM transactions WHERE user_id=? AND substr(date,1,4)=?`,
    args: [userId, y],
  });
  const row = r.rows[0] as any;
  const income = N(row.income);
  const expense = N(row.expense);
  return { income, expense, net: income - expense };
}

/* ─────────── Spending anomalies (per category) ─────────── */

export interface Anomaly {
  ledger: Ledger;
  category_id: number;
  category_name: string;
  current: number;
  average: number;
  deltaPct: number;
}

export async function spendingAnomalies(userId: number, month: string, thresholdPct = 0.30): Promise<Anomaly[]> {
  const db = await ensureDb();
  const baselineMonths = monthsBack(4).filter(m => m !== month);
  if (baselineMonths.length === 0) return [];
  const curR = await db.execute({
    sql: `
    SELECT t.ledger, t.category_id, c.name AS category_name,
           COALESCE(SUM(t.amount),0) AS amount
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id=? AND t.type='expense' AND substr(t.date,1,7)=? AND t.category_id IS NOT NULL
    GROUP BY t.ledger, t.category_id, c.name`,
    args: [userId, month],
  });
  const cur = curR.rows as any[];
  const placeholders = baselineMonths.map(() => '?').join(',');
  const baseR = await db.execute({
    sql: `SELECT ledger, category_id, COALESCE(SUM(amount),0) AS s FROM transactions
     WHERE user_id=? AND type='expense' AND category_id IS NOT NULL AND substr(date,1,7) IN (${placeholders})
     GROUP BY ledger, category_id`,
    args: [userId, ...baselineMonths],
  });
  const baseMap = new Map<string, number>();
  for (const row of baseR.rows as any[]) {
    baseMap.set(`${row.ledger}:${N(row.category_id)}`, N(row.s));
  }
  const out: Anomaly[] = [];
  for (const c of cur) {
    const amount = N(c.amount);
    if (amount < 10000) continue;
    const baseSum = baseMap.get(`${c.ledger}:${N(c.category_id)}`) || 0;
    const average = baseSum / baselineMonths.length;
    if (average < 10000) continue;
    const delta = (amount - average) / average;
    if (Math.abs(delta) >= thresholdPct) {
      out.push({
        ledger: c.ledger, category_id: N(c.category_id), category_name: c.category_name || '(미지정)',
        current: amount, average, deltaPct: delta,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

/* ─────────── Tax reserve ─────────── */

export interface TaxReserve {
  rate: number;
  ytdBusinessIncome: number;
  reservedRequired: number;
  taxPaid: number;
  reservedBalance: number;
  adjustedBusinessBalance: number;
}

export async function taxReserve(userId: number, year?: string): Promise<TaxReserve> {
  const y = year || String(new Date().getFullYear());
  const db = await ensureDb();
  const ob = (await getOpeningBalances(userId)).business;
  const rate = ob.tax_reserve_rate || 0;

  const incR = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
     WHERE user_id=? AND ledger='business' AND type='income' AND substr(date,1,4)=?`,
    args: [userId, y],
  });
  const taxR = await db.execute({
    sql: `SELECT COALESCE(SUM(t.amount),0) AS s FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.user_id=? AND t.ledger='business' AND t.type='expense' AND c.name LIKE '%세금%' AND substr(t.date,1,4)=?`,
    args: [userId, y],
  });

  const incS = N((incR.rows[0] as any).s);
  const taxS = N((taxR.rows[0] as any).s);
  const reservedRequired = Math.round(incS * rate);
  const reservedBalance = Math.max(0, reservedRequired - taxS);
  const bizBal = await balanceAt(userId, 'business');
  return {
    rate,
    ytdBusinessIncome: incS,
    reservedRequired,
    taxPaid: taxS,
    reservedBalance,
    adjustedBusinessBalance: bizBal - reservedBalance,
  };
}

/* ─────────── Debts ─────────── */

export interface DebtRow extends Debt {
  paid_principal: number;
  paid_interest: number;
  remaining_principal: number;
  last_payment_date: string | null;
  monthly_avg_principal: number;
  monthsToPayoff: number;
  current_rate: number;
  in_grace: boolean;
  grace_ends: string | null;
  annualized_income: number;
  mandatory_repay_eta: string | null;
  rate_history: { effective_date: string; rate: number }[];
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const nd = new Date(y, (m - 1) + months, d);
  return `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`;
}

function monthDiff(fromISO: string, toISO: string): number {
  const [fy, fm] = fromISO.split('-').map(Number);
  const [ty, tm] = toISO.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function rateAt(history: { effective_date: string; rate: number }[], baseRate: number, dateISO: string): number {
  let r = baseRate;
  for (const h of history) {
    if (h.effective_date <= dateISO) r = h.rate;
    else break;
  }
  return r;
}

export async function accrueDebtInterest(userId: number, asOf?: string): Promise<number> {
  const db = await ensureDb();
  const today = asOf || new Date().toISOString().slice(0, 10);
  // Fast-path: if every active debt's last_accrual_date >= first-of-current-month, nothing to do.
  const monthStart = `${today.slice(0, 7)}-01`;
  const pendR = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM debts WHERE user_id=? AND active=1 AND (last_accrual_date IS NULL OR last_accrual_date < ?)`,
    args: [userId, monthStart],
  });
  if (N((pendR.rows[0] as any).c) === 0) return 0;
  const debtsR = await db.execute({ sql: 'SELECT * FROM debts WHERE active=1 AND user_id=?', args: [userId] });
  const debts = plain<Debt>(debtsR.rows as any[]).map(d => ({
    ...d,
    initial_principal: N(d.initial_principal),
    interest_rate: typeof d.interest_rate === 'bigint' ? Number(d.interest_rate) : d.interest_rate,
    grace_period_months: N(d.grace_period_months),
    accrued_interest: N(d.accrued_interest),
    mandatory_repay_income: N(d.mandatory_repay_income),
    active: N(d.active),
  }));
  let accruedTotal = 0;
  const tx = await db.transaction('write');
  try {
    for (const d of debts) {
      const histR = await tx.execute({ sql: 'SELECT effective_date, rate FROM debt_rate_history WHERE debt_id=? ORDER BY effective_date', args: [d.id] });
      const history = (histR.rows as any[]).map(h => ({ effective_date: h.effective_date, rate: typeof h.rate === 'bigint' ? Number(h.rate) : h.rate }));
      const startFrom = d.last_accrual_date || d.start_date;
      const startD = new Date(startFrom);
      const todayD = new Date(today);
      let cursor = new Date(startD.getFullYear(), startD.getMonth() + 1, 1);
      const paidPrincipalR = await tx.execute({ sql: `SELECT COALESCE(SUM(principal_amount),0) AS p FROM transactions WHERE debt_id=? AND date <= ?`, args: [d.id, today] });
      let monthly = 0;
      while (cursor <= todayD) {
        const cursorISO = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-01`;
        const paidByThenR = await tx.execute({ sql: `SELECT COALESCE(SUM(principal_amount),0) AS p FROM transactions WHERE debt_id=? AND date < ?`, args: [d.id, cursorISO] });
        const paidByThen = N((paidByThenR.rows[0] as any).p);
        const remaining = Math.max(0, d.initial_principal - paidByThen);
        if (remaining <= 0) break;
        const r = rateAt(history, d.interest_rate, cursorISO);
        const interest = Math.round(remaining * r / 12);
        monthly += interest;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      if (monthly > 0) {
        await tx.execute({ sql: 'UPDATE debts SET accrued_interest = accrued_interest + ?, last_accrual_date=? WHERE id=?', args: [monthly, today, d.id] });
        accruedTotal += monthly;
      } else if (!d.last_accrual_date) {
        await tx.execute({ sql: 'UPDATE debts SET last_accrual_date=? WHERE id=?', args: [today, d.id] });
      }
      void paidPrincipalR;
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  return accruedTotal;
}

export async function listDebts(userId: number): Promise<DebtRow[]> {
  const db = await ensureDb();
  const today = new Date().toISOString().slice(0, 10);
  const debtsR = await db.execute({ sql: 'SELECT * FROM debts WHERE user_id=? ORDER BY active DESC, name', args: [userId] });
  const debts = plain<Debt>(debtsR.rows as any[]).map(d => ({
    ...d,
    initial_principal: N(d.initial_principal),
    interest_rate: typeof d.interest_rate === 'bigint' ? Number(d.interest_rate) : d.interest_rate,
    grace_period_months: N(d.grace_period_months),
    accrued_interest: N(d.accrued_interest),
    mandatory_repay_income: N(d.mandatory_repay_income),
    active: N(d.active),
  }));
  const year = today.slice(0, 4);
  const yIncR = await db.execute({ sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND ledger='personal' AND type='income' AND substr(date,1,4)=?`, args: [userId, year] });
  const yIncS = N((yIncR.rows[0] as any).s);
  const month1 = Number(today.slice(5, 7));
  const annualized = month1 > 0 ? Math.round((yIncS / month1) * 12) : 0;

  // Batched per-debt aggregates: 3 queries total regardless of debt count.
  const months = monthsBack(3);
  const monthsPh = months.map(() => '?').join(',');
  const aggR = await db.execute({
    sql: `SELECT debt_id,
       COALESCE(SUM(principal_amount),0) AS p,
       COALESCE(SUM(interest_amount),0)  AS i,
       MAX(date) AS lastDate
      FROM transactions WHERE user_id=? AND debt_id IS NOT NULL
      GROUP BY debt_id`,
    args: [userId],
  });
  const aggMap = new Map<number, { p: number; i: number; lastDate: string | null }>();
  for (const row of aggR.rows as any[]) {
    aggMap.set(N(row.debt_id), { p: N(row.p), i: N(row.i), lastDate: row.lastDate || null });
  }
  const avgRowsR = await db.execute({
    sql: `SELECT debt_id, COALESCE(SUM(principal_amount),0) AS s FROM transactions
      WHERE user_id=? AND debt_id IS NOT NULL AND substr(date,1,7) IN (${monthsPh})
      GROUP BY debt_id`,
    args: [userId, ...months],
  });
  const avgMap = new Map<number, number>();
  for (const row of avgRowsR.rows as any[]) avgMap.set(N(row.debt_id), N(row.s));
  const histAllR = await db.execute({
    sql: `SELECT h.debt_id, h.effective_date, h.rate FROM debt_rate_history h
      JOIN debts d ON d.id = h.debt_id WHERE d.user_id=? ORDER BY h.debt_id, h.effective_date`,
    args: [userId],
  });
  const histMap = new Map<number, { effective_date: string; rate: number }[]>();
  for (const row of histAllR.rows as any[]) {
    const id = N(row.debt_id);
    const arr = histMap.get(id) || [];
    arr.push({ effective_date: row.effective_date, rate: typeof row.rate === 'bigint' ? Number(row.rate) : row.rate });
    histMap.set(id, arr);
  }

  const out: DebtRow[] = [];
  for (const d of debts) {
    const paid = aggMap.get(d.id) || { p: 0, i: 0, lastDate: null };
    const paidP = paid.p;
    const paidI = paid.i;
    const remaining = Math.max(0, d.initial_principal - paidP);

    const monthlyAvg = (avgMap.get(d.id) || 0) / months.length;
    const monthsToPayoff = monthlyAvg > 0 ? remaining / monthlyAvg : 0;

    const history = histMap.get(d.id) || [];
    const currentRate = rateAt(history, d.interest_rate, today);

    const grace_ends = d.grace_period_months > 0 ? addMonths(d.start_date, d.grace_period_months) : null;
    const in_grace = !!(grace_ends && grace_ends > today);

    let mandatory_repay_eta: string | null = null;
    if (d.mandatory_repay_income > 0) {
      if (annualized >= d.mandatory_repay_income) {
        mandatory_repay_eta = '의무상환 도달';
      } else if (annualized > 0) {
        const ratio = annualized / d.mandatory_repay_income;
        mandatory_repay_eta = `현재 소득은 기준의 ${(ratio * 100).toFixed(0)}%`;
      } else {
        mandatory_repay_eta = '소득 데이터 없음';
      }
    }

    out.push({
      ...d,
      paid_principal: paidP,
      paid_interest: paidI,
      remaining_principal: remaining,
      last_payment_date: paid.lastDate || null,
      monthly_avg_principal: monthlyAvg,
      monthsToPayoff,
      current_rate: currentRate,
      in_grace,
      grace_ends,
      annualized_income: annualized,
      mandatory_repay_eta,
      rate_history: history,
    });
  }
  return out;
}


export interface DebtSummary {
  totalRemaining: number;
  monthPrincipal: number;
  monthInterest: number;
  ytdInterest: number;
  activeCount: number;
}

export async function debtSummary(userId: number, month: string): Promise<DebtSummary> {
  const db = await ensureDb();
  const year = month.slice(0, 4);
  const totalRemR = await db.execute({
    sql: `SELECT COALESCE(SUM(d.initial_principal),0) - COALESCE(SUM(t.principal_amount),0) AS rem
     FROM debts d
     LEFT JOIN transactions t ON t.debt_id = d.id
     WHERE d.active = 1 AND d.user_id = ?`,
    args: [userId],
  });
  const mR = await db.execute({
    sql: `SELECT
      COALESCE(SUM(principal_amount),0) AS p,
      COALESCE(SUM(interest_amount),0)  AS i
     FROM transactions WHERE user_id=? AND debt_id IS NOT NULL AND substr(date,1,7)=?`,
    args: [userId, month],
  });
  const yR = await db.execute({
    sql: `SELECT COALESCE(SUM(interest_amount),0) AS i
     FROM transactions WHERE user_id=? AND debt_id IS NOT NULL AND substr(date,1,4)=?`,
    args: [userId, year],
  });
  const activeR = await db.execute({ sql: `SELECT COUNT(*) AS c FROM debts WHERE active=1 AND user_id=?`, args: [userId] });
  return {
    totalRemaining: Math.max(0, N((totalRemR.rows[0] as any).rem)),
    monthPrincipal: N((mR.rows[0] as any).p),
    monthInterest: N((mR.rows[0] as any).i),
    ytdInterest: N((yR.rows[0] as any).i),
    activeCount: N((activeR.rows[0] as any).c),
  };
}

export async function adjustedSavingsRate(userId: number, month: string): Promise<{ rate: number; adjustedNet: number; principalRepaid: number }> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `
    SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN debt_id IS NOT NULL THEN principal_amount ELSE 0 END),0) AS principal
    FROM transactions WHERE user_id=? AND substr(date,1,7)=?`,
    args: [userId, month],
  });
  const row = r.rows[0] as any;
  const income = N(row.income);
  const expense = N(row.expense);
  const principal = N(row.principal);
  const adjExpense = expense - principal;
  const adjNet = income - adjExpense;
  const rate = income > 0 ? adjNet / income : 0;
  return { rate, adjustedNet: adjNet, principalRepaid: principal };
}

export async function generateRecurring(userId: number): Promise<number> {
  const db = await ensureDb();
  const curMonth = currentMonth();
  const pendR = await db.execute({
    sql: `SELECT COUNT(*) AS c FROM recurring r
     WHERE r.user_id=? AND r.active=1
       AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.recurring_id=r.id AND substr(t.date,1,7)=?)`,
    args: [userId, curMonth],
  });
  if (N((pendR.rows[0] as any).c) === 0) return 0;
  const rulesR = await db.execute({ sql: 'SELECT * FROM recurring WHERE active=1 AND user_id=?', args: [userId] });
  const rules = plain<Recurring>(rulesR.rows as any[]).map(r => ({
    ...r,
    amount: N(r.amount),
    day_of_month: N(r.day_of_month),
    active: N(r.active),
    category_id: r.category_id === null ? null : N(r.category_id),
  }));
  const now = new Date();
  let created = 0;
  const tx = await db.transaction('write');
  try {
    for (const rule of rules) {
      const start = new Date(rule.start_date);
      let y = start.getFullYear();
      let m = start.getMonth() + 1;
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
        const monthStr = `${y}-${String(m).padStart(2, '0')}`;
        const existsR = await tx.execute({ sql: `SELECT 1 as x FROM transactions WHERE user_id=? AND recurring_id=? AND substr(date,1,7)=?`, args: [userId, rule.id, monthStr] });
        if (existsR.rows.length === 0) {
          const day = clampDay(y, m, rule.day_of_month);
          const date = `${monthStr}-${String(day).padStart(2, '0')}`;
          await tx.execute({
            sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, recurring_id, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            args: [rule.ledger, rule.type, date, rule.amount, rule.category_id as any, rule.from_ledger as any, rule.to_ledger as any, rule.memo as any, rule.id, userId],
          });
          created++;
        }
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  return created;
}

void monthDiff;

/* ─────────── Investments ─────────── */

export interface InvestmentRow extends Investment {
  total_quantity: number;
  total_invested: number;
  avg_cost: number;
  realized_pnl: number;
  current_value: number;
  unrealized_pnl: number;
  return_pct: number;
  last_trade_date: string | null;
}

interface TradeAgg {
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  divAmt: number;
  feeAmt: number;
  lastDate: string | null;
}

async function aggregateTrades(userId: number): Promise<Map<number, TradeAgg>> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT investment_id, type,
            COALESCE(SUM(quantity),0) AS q,
            COALESCE(SUM(amount),0) AS a,
            MAX(date) AS lastDate
          FROM investment_trades WHERE user_id=?
          GROUP BY investment_id, type`,
    args: [userId],
  });
  const map = new Map<number, TradeAgg>();
  for (const row of r.rows as any[]) {
    const id = N(row.investment_id);
    const cur = map.get(id) || { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, divAmt: 0, feeAmt: 0, lastDate: null };
    const q = Number(row.q) || 0;
    const a = N(row.a);
    if (row.type === 'buy') { cur.buyQty += q; cur.buyAmt += a; }
    else if (row.type === 'sell') { cur.sellQty += q; cur.sellAmt += a; }
    else if (row.type === 'dividend') { cur.divAmt += a; }
    else if (row.type === 'fee') { cur.feeAmt += a; }
    if (row.lastDate && (!cur.lastDate || row.lastDate > cur.lastDate)) cur.lastDate = row.lastDate;
    map.set(id, cur);
  }
  return map;
}

function computeMetrics(inv: Investment, agg: TradeAgg | undefined): InvestmentRow {
  const a = agg || { buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, divAmt: 0, feeAmt: 0, lastDate: null };
  const avg_cost = a.buyQty > 0 ? a.buyAmt / a.buyQty : 0;
  const total_quantity = Math.max(0, a.buyQty - a.sellQty);
  // realized pnl: sell amount - (sold qty * avg cost) + dividends - fees
  const realized_pnl = a.sellAmt - (a.sellQty * avg_cost) + a.divAmt - a.feeAmt;
  // cost basis of currently held shares
  const remaining_cost = total_quantity * avg_cost;
  const current_value = total_quantity * Number(inv.current_price || 0);
  const unrealized_pnl = current_value - remaining_cost;
  // total_invested = cumulative cost basis tracking (buy - sell + fee - dividend)
  const total_invested = a.buyAmt - a.sellAmt + a.feeAmt - a.divAmt;
  const return_pct = remaining_cost > 0 ? unrealized_pnl / remaining_cost : 0;
  return {
    ...inv,
    current_price: Number(inv.current_price) || 0,
    active: N(inv.active),
    total_quantity,
    total_invested,
    avg_cost,
    realized_pnl,
    current_value,
    unrealized_pnl,
    return_pct,
    last_trade_date: a.lastDate,
  };
}

/* ─────────── Business sales (매출) ─────────── */

export interface SalesSummary { supply: number; vat: number; total: number; count: number; cashCollected: number }

export async function salesSummary(userId: number, month: string): Promise<SalesSummary> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT
      COALESCE(SUM(COALESCE(supply_amount, amount)),0) AS supply,
      COALESCE(SUM(COALESCE(vat_amount, 0)),0) AS vat,
      COALESCE(SUM(amount),0) AS total,
      COUNT(*) AS cnt
      FROM transactions
      WHERE user_id=? AND ledger='business' AND type='income' AND substr(date,1,7)=?`,
    args: [userId, month],
  });
  const row = r.rows[0] as any;
  const supply = N(row.supply);
  const vat = N(row.vat);
  const total = supply + vat;
  return { supply, vat, total, count: N(row.cnt), cashCollected: N(row.total) };
}

export interface SalesQuarter { quarter: 1 | 2 | 3 | 4; months: string; supply: number; vat: number; total: number; vatDue: number }

export async function salesByQuarter(userId: number, year: string): Promise<SalesQuarter[]> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT
      CASE
        WHEN substr(date,6,2) IN ('01','02','03') THEN 1
        WHEN substr(date,6,2) IN ('04','05','06') THEN 2
        WHEN substr(date,6,2) IN ('07','08','09') THEN 3
        ELSE 4
      END AS q,
      COALESCE(SUM(COALESCE(supply_amount, amount)),0) AS supply,
      COALESCE(SUM(COALESCE(vat_amount, 0)),0) AS vat
      FROM transactions
      WHERE user_id=? AND ledger='business' AND type='income' AND substr(date,1,4)=?
      GROUP BY q`,
    args: [userId, year],
  });
  const byQ = new Map<number, { supply: number; vat: number }>();
  for (const row of r.rows as any[]) byQ.set(N(row.q), { supply: N(row.supply), vat: N(row.vat) });
  const labels: Record<number, string> = { 1: '1~3월', 2: '4~6월', 3: '7~9월', 4: '10~12월' };
  const out: SalesQuarter[] = [];
  for (const q of [1, 2, 3, 4] as const) {
    const v = byQ.get(q) || { supply: 0, vat: 0 };
    out.push({ quarter: q, months: labels[q], supply: v.supply, vat: v.vat, total: v.supply + v.vat, vatDue: v.vat });
  }
  return out;
}

export interface SalesCategoryRow { category_id: number | null; category_name: string | null; supply: number; vat: number; total: number; count: number }

export async function salesByCategory(userId: number, month: string): Promise<SalesCategoryRow[]> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT t.category_id, c.name AS category_name,
      COALESCE(SUM(COALESCE(t.supply_amount, t.amount)),0) AS supply,
      COALESCE(SUM(COALESCE(t.vat_amount, 0)),0) AS vat,
      COUNT(*) AS cnt
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id=? AND t.ledger='business' AND t.type='income' AND substr(t.date,1,7)=?
      GROUP BY t.category_id, c.name
      ORDER BY supply + vat DESC`,
    args: [userId, month],
  });
  return (r.rows as any[]).map(row => {
    const supply = N(row.supply);
    const vat = N(row.vat);
    return {
      category_id: row.category_id === null ? null : N(row.category_id),
      category_name: row.category_name,
      supply, vat, total: supply + vat, count: N(row.cnt),
    };
  });
}

export interface SalesMonthPoint { month: string; supply: number; vat: number; total: number }

export async function salesByMonthSeries(userId: number, year: string): Promise<SalesMonthPoint[]> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT substr(date,1,7) AS m,
      COALESCE(SUM(COALESCE(supply_amount, amount)),0) AS supply,
      COALESCE(SUM(COALESCE(vat_amount, 0)),0) AS vat
      FROM transactions
      WHERE user_id=? AND ledger='business' AND type='income' AND substr(date,1,4)=?
      GROUP BY m`,
    args: [userId, year],
  });
  const byM = new Map<string, { supply: number; vat: number }>();
  for (const row of r.rows as any[]) byM.set(row.m, { supply: N(row.supply), vat: N(row.vat) });
  const out: SalesMonthPoint[] = [];
  for (let i = 1; i <= 12; i++) {
    const key = `${year}-${String(i).padStart(2, '0')}`;
    const v = byM.get(key) || { supply: 0, vat: 0 };
    out.push({ month: key, supply: v.supply, vat: v.vat, total: v.supply + v.vat });
  }
  return out;
}

export async function recentSales(userId: number, limit = 10) {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT t.id, t.date, t.amount, t.supply_amount, t.vat_amount, t.memo,
                 c.name AS category_name, p.name AS person_name
          FROM transactions t
          LEFT JOIN categories c ON c.id = t.category_id
          LEFT JOIN people p ON p.id = t.person_id
          WHERE t.user_id=? AND t.ledger='business' AND t.type='income'
          ORDER BY t.date DESC, t.id DESC LIMIT ?`,
    args: [userId, limit],
  });
  return (r.rows as any[]).map(row => ({
    id: N(row.id),
    date: row.date,
    amount: N(row.amount),
    supply_amount: row.supply_amount === null ? null : N(row.supply_amount),
    vat_amount: row.vat_amount === null ? null : N(row.vat_amount),
    category_name: row.category_name,
    memo: row.memo,
    person_name: row.person_name,
  }));
}

export async function listInvestments(userId: number): Promise<InvestmentRow[]> {
  const db = await ensureDb();
  const r = await db.execute({ sql: 'SELECT * FROM investments WHERE user_id=? ORDER BY active DESC, name', args: [userId] });
  const invs = plain<Investment>(r.rows as any[]);
  const agg = await aggregateTrades(userId);
  return invs.map(inv => computeMetrics(inv, agg.get(inv.id)));
}

export async function getInvestment(userId: number, id: number): Promise<InvestmentRow | null> {
  const db = await ensureDb();
  const r = await db.execute({ sql: 'SELECT * FROM investments WHERE id=? AND user_id=?', args: [id, userId] });
  if (r.rows.length === 0) return null;
  const inv = { ...(r.rows[0] as any) } as Investment;
  const agg = await aggregateTrades(userId);
  return computeMetrics(inv, agg.get(inv.id));
}

export async function listInvestmentTrades(userId: number, investmentId: number): Promise<InvestmentTrade[]> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT * FROM investment_trades WHERE user_id=? AND investment_id=? ORDER BY date DESC, id DESC`,
    args: [userId, investmentId],
  });
  return (r.rows as any[]).map(row => ({
    ...row,
    investment_id: N(row.investment_id),
    quantity: Number(row.quantity) || 0,
    price: Number(row.price) || 0,
    amount: N(row.amount),
  })) as InvestmentTrade[];
}

export interface InvestmentSummary {
  totalInvested: number;
  totalCurrent: number;
  totalRealized: number;
  totalUnrealized: number;
  totalReturnPct: number;
  activeCount: number;
}

export async function investmentSummary(userId: number): Promise<InvestmentSummary> {
  const rows = await listInvestments(userId);
  let totalInvested = 0, totalCurrent = 0, totalRealized = 0, totalUnrealized = 0, activeCount = 0, costBasisRemaining = 0;
  for (const r of rows) {
    if (r.active) activeCount++;
    totalCurrent += r.current_value;
    totalRealized += r.realized_pnl;
    totalUnrealized += r.unrealized_pnl;
    totalInvested += r.total_invested;
    costBasisRemaining += r.total_quantity * r.avg_cost;
  }
  const totalReturnPct = costBasisRemaining > 0 ? totalUnrealized / costBasisRemaining : 0;
  return { totalInvested, totalCurrent, totalRealized, totalUnrealized, totalReturnPct, activeCount };
}
