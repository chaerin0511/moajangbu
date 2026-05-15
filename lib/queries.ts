import { ensureDb, Ledger, Transaction, Category, Recurring, Budget, Person, Debt } from './db';
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

export async function listCategories(ledger?: Ledger): Promise<Category[]> {
  const db = await ensureDb();
  if (ledger) {
    const r = await db.execute({ sql: 'SELECT * FROM categories WHERE ledger=? ORDER BY name', args: [ledger] });
    return plain<Category>(r.rows as any[]);
  }
  const r = await db.execute('SELECT * FROM categories ORDER BY ledger, name');
  return plain<Category>(r.rows as any[]);
}

export async function listTransactions(filters: { ledger?: string; type?: string; month?: string; category_id?: string; fixed?: string } = {}): Promise<(Transaction & { category_name: string | null })[]> {
  const db = await ensureDb();
  const where: string[] = [];
  const params: any[] = [];
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
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${orderBy} LIMIT 500`;
  const r = await db.execute({ sql, args: params });
  return plain<any>(r.rows as any[]);
}

export async function recentTransactions(limit = 10) {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT t.*, c.name as category_name, p.name as person_name FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN people p ON p.id = t.person_id ORDER BY t.date DESC, t.id DESC LIMIT ?`,
    args: [limit],
  });
  return plain<any>(r.rows as any[]);
}

export interface MonthlyTotals {
  personal: { income: number; expense: number; net: number };
  business: { income: number; expense: number; net: number };
  combinedNet: number;
}

export async function monthlyTotals(month: string): Promise<MonthlyTotals> {
  const db = await ensureDb();
  const r = await db.execute({ sql: `SELECT ledger, type, from_ledger, to_ledger, amount FROM transactions WHERE substr(date,1,7) = ?`, args: [month] });
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

export async function monthlySeries(): Promise<{ month: string; personalIncome: number; personalExpense: number; businessIncome: number; businessExpense: number }[]> {
  const months = monthsBack(6);
  const out = [];
  for (const m of months) {
    const t = await monthlyTotals(m);
    out.push({
      month: m,
      personalIncome: t.personal.income,
      personalExpense: t.personal.expense,
      businessIncome: t.business.income,
      businessExpense: t.business.expense,
    });
  }
  return out;
}

export async function spentForBudget(ledger: Ledger, category_id: number, month: string): Promise<number> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE ledger=? AND category_id=? AND type='expense' AND substr(date,1,7)=?`,
    args: [ledger, category_id, month],
  });
  return N((r.rows[0] as any).s);
}

export async function listBudgets(month?: string): Promise<(Budget & { category_name: string; spent: number })[]> {
  const db = await ensureDb();
  const m = month || currentMonth();
  const r = await db.execute({
    sql: `SELECT b.*, c.name as category_name FROM budgets b JOIN categories c ON c.id=b.category_id WHERE b.month=? ORDER BY b.ledger, c.name`,
    args: [m],
  });
  const rows = r.rows as unknown as any[];
  const out: (Budget & { category_name: string; spent: number })[] = [];
  for (const row of rows) {
    const spent = await spentForBudget(row.ledger, N(row.category_id), row.month);
    out.push({ ...row, spent });
  }
  return out;
}

export async function listRecurring(): Promise<(Recurring & { category_name: string | null })[]> {
  const db = await ensureDb();
  const r = await db.execute(`SELECT r.*, c.name as category_name FROM recurring r LEFT JOIN categories c ON c.id=r.category_id ORDER BY r.id DESC`);
  return plain<any>(r.rows as any[]);
}

export interface OpeningBalance { ledger: Ledger; opening_balance: number; opening_date: string; tax_reserve_rate: number }

export async function getOpeningBalances(): Promise<Record<Ledger, OpeningBalance>> {
  const db = await ensureDb();
  const r = await db.execute('SELECT * FROM account_settings');
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

export async function balanceAt(ledger: Ledger, dateISO?: string): Promise<number> {
  const db = await ensureDb();
  const ob = (await getOpeningBalances())[ledger];
  const dateClause = dateISO ? ' AND date <= ?' : '';
  const params: any[] = dateISO ? [ledger, ob.opening_date, dateISO] : [ledger, ob.opening_date];
  const incExpR = await db.execute({
    sql: `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END),0) AS s
          FROM transactions WHERE ledger=? AND date >= ?${dateClause}`,
    args: params,
  });
  const inTransR = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='transfer' AND to_ledger=? AND date >= ?${dateClause}`,
    args: params,
  });
  const outTransR = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='transfer' AND from_ledger=? AND date >= ?${dateClause}`,
    args: params,
  });
  return ob.opening_balance + N((incExpR.rows[0] as any).s) + N((inTransR.rows[0] as any).s) - N((outTransR.rows[0] as any).s);
}

export async function projectedMonthEndBalance(ledger: Ledger): Promise<number> {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cur = await balanceAt(ledger, todayStr);
  const db = await ensureDb();
  // remaining days this month: project active recurring rules whose day_of_month > today's day
  const rulesR = await db.execute('SELECT * FROM recurring WHERE active=1');
  const rules = plain<Recurring>(rulesR.rows as any[]);
  const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let delta = 0;
  for (const r of rules) {
    if (r.day_of_month <= today.getDate()) continue;
    // skip if already materialized for this month
    const existsR = await db.execute({
      sql: `SELECT 1 AS x FROM transactions WHERE recurring_id=? AND substr(date,1,7)=?`,
      args: [r.id, monthStr],
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

async function totalsFor(month: string): Promise<{ income: number; expense: number; net: number; pIncome: number; pExpense: number; fIncome: number; fExpense: number }> {
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
    FROM transactions WHERE substr(date,1,7)=?`,
    args: [month],
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

export async function financialHealth(month: string): Promise<FinancialHealth> {
  const cur = await totalsFor(month);
  const prev = await totalsFor(prevMonth(month));
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

export async function savingsRateSeries(): Promise<{ month: string; rate: number; net: number }[]> {
  const months = monthsBack(6);
  const out = [];
  for (const m of months) {
    const t = await totalsFor(m);
    out.push({ month: m, rate: t.income > 0 ? t.net / t.income : 0, net: t.net });
  }
  return out;
}

/* ─────────── People (family members) ─────────── */

export async function listPeople(): Promise<Person[]> {
  const db = await ensureDb();
  const r = await db.execute('SELECT * FROM people ORDER BY name');
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

export async function personStats(month: string): Promise<PersonStat[]> {
  const db = await ensureDb();
  const year = month.slice(0, 4);
  const people = await listPeople();
  const out: PersonStat[] = [];
  for (const p of people) {
    const mR = await db.execute({
      sql: `SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
        MAX(date) AS lastDate
       FROM transactions WHERE person_id=? AND substr(date,1,7)=?`,
      args: [p.id, month],
    });
    const m = mR.rows[0] as any;
    const yR = await db.execute({
      sql: `SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
       FROM transactions WHERE person_id=? AND substr(date,1,4)=?`,
      args: [p.id, year],
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

export async function fixedExpenseBreakdown(month: string): Promise<FixedItem[]> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `
    SELECT t.ledger, t.category_id, c.name AS category_name,
           COALESCE(SUM(t.amount),0) AS amount, COUNT(*) AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type='expense' AND t.recurring_id IS NOT NULL AND substr(t.date,1,7)=?
    GROUP BY t.ledger, t.category_id, c.name
    ORDER BY amount DESC`,
    args: [month],
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

export async function emergencyFund(): Promise<{ balance: number; monthlyFixed: number; months: number }> {
  const db = await ensureDb();
  // average personal fixed expense over last 3 months
  const months = monthsBack(3);
  let total = 0;
  for (const m of months) {
    const r = await db.execute({
      sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
       WHERE ledger='personal' AND type='expense' AND recurring_id IS NOT NULL AND substr(date,1,7)=?`,
      args: [m],
    });
    total += N((r.rows[0] as any).s);
  }
  const monthlyFixed = total / Math.max(1, months.length);
  const balance = await balanceAt('personal');
  return { balance, monthlyFixed, months: monthlyFixed > 0 ? balance / monthlyFixed : 0 };
}

/* ─────────── YTD savings ─────────── */

export async function ytdSavings(year?: string): Promise<{ income: number; expense: number; net: number }> {
  const y = year || String(new Date().getFullYear());
  const db = await ensureDb();
  const r = await db.execute({
    sql: `SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
     FROM transactions WHERE substr(date,1,4)=?`,
    args: [y],
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

export async function spendingAnomalies(month: string, thresholdPct = 0.30): Promise<Anomaly[]> {
  const db = await ensureDb();
  const baselineMonths = monthsBack(4).filter(m => m !== month);
  if (baselineMonths.length === 0) return [];
  // current month spend by category
  const curR = await db.execute({
    sql: `
    SELECT t.ledger, t.category_id, c.name AS category_name,
           COALESCE(SUM(t.amount),0) AS amount
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type='expense' AND substr(t.date,1,7)=? AND t.category_id IS NOT NULL
    GROUP BY t.ledger, t.category_id, c.name`,
    args: [month],
  });
  const cur = curR.rows as any[];
  const out: Anomaly[] = [];
  for (const c of cur) {
    const amount = N(c.amount);
    if (amount < 10000) continue; // ignore tiny
    const placeholders = baselineMonths.map(() => '?').join(',');
    const avgR = await db.execute({
      sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
       WHERE type='expense' AND ledger=? AND category_id=? AND substr(date,1,7) IN (${placeholders})`,
      args: [c.ledger, N(c.category_id), ...baselineMonths],
    });
    const average = N((avgR.rows[0] as any).s) / baselineMonths.length;
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

/* ─────────── Tax reserve (사업자 세금 충당금) ─────────── */

export interface TaxReserve {
  rate: number;
  ytdBusinessIncome: number;
  reservedRequired: number;   // ytd income × rate
  taxPaid: number;            // 카테고리 '세금' 지출 합계 (사업자)
  reservedBalance: number;    // required - paid (남겨둬야 할 금액)
  adjustedBusinessBalance: number; // 실제 사업자 잔액 - reservedBalance
}

export async function taxReserve(year?: string): Promise<TaxReserve> {
  const y = year || String(new Date().getFullYear());
  const db = await ensureDb();
  const ob = (await getOpeningBalances()).business;
  const rate = ob.tax_reserve_rate || 0;

  const incR = await db.execute({
    sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
     WHERE ledger='business' AND type='income' AND substr(date,1,4)=?`,
    args: [y],
  });
  const taxR = await db.execute({
    sql: `SELECT COALESCE(SUM(t.amount),0) AS s FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.ledger='business' AND t.type='expense' AND c.name LIKE '%세금%' AND substr(t.date,1,4)=?`,
    args: [y],
  });

  const incS = N((incR.rows[0] as any).s);
  const taxS = N((taxR.rows[0] as any).s);
  const reservedRequired = Math.round(incS * rate);
  const reservedBalance = Math.max(0, reservedRequired - taxS);
  const bizBal = await balanceAt('business');
  return {
    rate,
    ytdBusinessIncome: incS,
    reservedRequired,
    taxPaid: taxS,
    reservedBalance,
    adjustedBusinessBalance: bizBal - reservedBalance,
  };
}

/* ─────────── Debts (대출) ─────────── */

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

/**
 * 매월 1일 기준으로 남은원금 × (해당시점 연이자율 / 12)를 accrued_interest에 누적.
 * 거치기간 중에는 원금이 줄지 않으므로 동일한 원금에 이자만 쌓임.
 * last_accrual_date 이후의 모든 누락된 월을 한꺼번에 캐치업.
 */
export async function accrueDebtInterest(asOf?: string): Promise<number> {
  const db = await ensureDb();
  const today = asOf || new Date().toISOString().slice(0, 10);
  const debtsR = await db.execute('SELECT * FROM debts WHERE active=1');
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
      // first accrual month = month after start_date (or after last_accrual_date)
      const startFrom = d.last_accrual_date || d.start_date;
      // walk month-by-month: accrue on the 1st of each month strictly after startFrom up to today
      const startD = new Date(startFrom);
      const todayD = new Date(today);
      // first candidate = the 1st of the month following startFrom
      let cursor = new Date(startD.getFullYear(), startD.getMonth() + 1, 1);
      const paidPrincipalR = await tx.execute({ sql: `SELECT COALESCE(SUM(principal_amount),0) AS p FROM transactions WHERE debt_id=? AND date <= ?`, args: [d.id, today] });
      // accumulating: we step through months. Use a remaining principal that tracks principal payments up to each cursor date.
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

export async function listDebts(): Promise<DebtRow[]> {
  const db = await ensureDb();
  const today = new Date().toISOString().slice(0, 10);
  const debtsR = await db.execute('SELECT * FROM debts ORDER BY active DESC, name');
  const debts = plain<Debt>(debtsR.rows as any[]).map(d => ({
    ...d,
    initial_principal: N(d.initial_principal),
    interest_rate: typeof d.interest_rate === 'bigint' ? Number(d.interest_rate) : d.interest_rate,
    grace_period_months: N(d.grace_period_months),
    accrued_interest: N(d.accrued_interest),
    mandatory_repay_income: N(d.mandatory_repay_income),
    active: N(d.active),
  }));
  // YTD personal income → annualized projection (for mandatory-repay ETA)
  const year = today.slice(0, 4);
  const yIncR = await db.execute({ sql: `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE ledger='personal' AND type='income' AND substr(date,1,4)=?`, args: [year] });
  const yIncS = N((yIncR.rows[0] as any).s);
  const month1 = Number(today.slice(5, 7));
  const annualized = month1 > 0 ? Math.round((yIncS / month1) * 12) : 0;

  const out: DebtRow[] = [];
  for (const d of debts) {
    const paidR = await db.execute({
      sql: `SELECT
        COALESCE(SUM(principal_amount),0) AS p,
        COALESCE(SUM(interest_amount),0)  AS i,
        MAX(date) AS lastDate
       FROM transactions WHERE debt_id=?`,
      args: [d.id],
    });
    const paid = paidR.rows[0] as any;
    const paidP = N(paid.p);
    const paidI = N(paid.i);
    const remaining = Math.max(0, d.initial_principal - paidP);

    const months = monthsBack(3);
    const placeholders = months.map(() => '?').join(',');
    const avgR = await db.execute({
      sql: `SELECT COALESCE(SUM(principal_amount),0) AS s FROM transactions
       WHERE debt_id=? AND substr(date,1,7) IN (${placeholders})`,
      args: [d.id, ...months],
    });
    const monthlyAvg = N((avgR.rows[0] as any).s) / months.length;
    const monthsToPayoff = monthlyAvg > 0 ? remaining / monthlyAvg : 0;

    const histR = await db.execute({ sql: 'SELECT effective_date, rate FROM debt_rate_history WHERE debt_id=? ORDER BY effective_date', args: [d.id] });
    const history = (histR.rows as any[]).map(h => ({ effective_date: h.effective_date, rate: typeof h.rate === 'bigint' ? Number(h.rate) : h.rate }));
    const currentRate = rateAt(history, d.interest_rate, today);

    const grace_ends = d.grace_period_months > 0 ? addMonths(d.start_date, d.grace_period_months) : null;
    const in_grace = !!(grace_ends && grace_ends > today);

    // mandatory repay ETA: if annualized income < threshold, estimate months at recent income growth (we don't track growth, so simply mark "예상 도달 시점 미정"). Show ratio.
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

export async function debtSummary(month: string): Promise<DebtSummary> {
  const db = await ensureDb();
  const year = month.slice(0, 4);
  const totalRemR = await db.execute(
    `SELECT COALESCE(SUM(d.initial_principal),0) - COALESCE(SUM(t.principal_amount),0) AS rem
     FROM debts d
     LEFT JOIN transactions t ON t.debt_id = d.id
     WHERE d.active = 1`
  );
  const mR = await db.execute({
    sql: `SELECT
      COALESCE(SUM(principal_amount),0) AS p,
      COALESCE(SUM(interest_amount),0)  AS i
     FROM transactions WHERE debt_id IS NOT NULL AND substr(date,1,7)=?`,
    args: [month],
  });
  const yR = await db.execute({
    sql: `SELECT COALESCE(SUM(interest_amount),0) AS i
     FROM transactions WHERE debt_id IS NOT NULL AND substr(date,1,4)=?`,
    args: [year],
  });
  const activeR = await db.execute(`SELECT COUNT(*) AS c FROM debts WHERE active=1`);
  return {
    totalRemaining: Math.max(0, N((totalRemR.rows[0] as any).rem)),
    monthPrincipal: N((mR.rows[0] as any).p),
    monthInterest: N((mR.rows[0] as any).i),
    ytdInterest: N((yR.rows[0] as any).i),
    activeCount: N((activeR.rows[0] as any).c),
  };
}

/* principal-adjusted savings rate: count principal repayments as savings, not expense */
export async function adjustedSavingsRate(month: string): Promise<{ rate: number; adjustedNet: number; principalRepaid: number }> {
  const db = await ensureDb();
  const r = await db.execute({
    sql: `
    SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN debt_id IS NOT NULL THEN principal_amount ELSE 0 END),0) AS principal
    FROM transactions WHERE substr(date,1,7)=?`,
    args: [month],
  });
  const row = r.rows[0] as any;
  const income = N(row.income);
  const expense = N(row.expense);
  const principal = N(row.principal);
  // adjusted: principal repayments are treated as savings, so subtract from expense
  const adjExpense = expense - principal;
  const adjNet = income - adjExpense;
  const rate = income > 0 ? adjNet / income : 0;
  return { rate, adjustedNet: adjNet, principalRepaid: principal };
}

export async function generateRecurring(): Promise<number> {
  const db = await ensureDb();
  const rulesR = await db.execute('SELECT * FROM recurring WHERE active=1');
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
        const existsR = await tx.execute({ sql: `SELECT 1 as x FROM transactions WHERE recurring_id=? AND substr(date,1,7)=?`, args: [rule.id, monthStr] });
        if (existsR.rows.length === 0) {
          const day = clampDay(y, m, rule.day_of_month);
          const date = `${monthStr}-${String(day).padStart(2, '0')}`;
          await tx.execute({
            sql: `INSERT INTO transactions (ledger, type, date, amount, category_id, from_ledger, to_ledger, memo, recurring_id) VALUES (?,?,?,?,?,?,?,?,?)`,
            args: [rule.ledger, rule.type, date, rule.amount, rule.category_id as any, rule.from_ledger as any, rule.to_ledger as any, rule.memo as any, rule.id],
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

// keep helpers referenced
void monthDiff;
