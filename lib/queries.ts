import { getDb, Ledger, Transaction, Category, Recurring, Budget, Person, Debt } from './db';
import { clampDay, currentMonth, monthsBack } from './utils';

// node:sqlite returns rows with a null prototype; Next.js refuses to serialize
// those to Client Components. Convert to plain objects at the boundary.
const plain = <T>(rows: any[]): T[] => rows.map(r => ({ ...r })) as T[];

export function listCategories(ledger?: Ledger): Category[] {
  const db = getDb();
  if (ledger) return plain<Category>(db.prepare('SELECT * FROM categories WHERE ledger=? ORDER BY name').all(ledger) as any[]);
  return plain<Category>(db.prepare('SELECT * FROM categories ORDER BY ledger, name').all() as any[]);
}

export function listTransactions(filters: { ledger?: string; type?: string; month?: string; category_id?: string; fixed?: string } = {}): (Transaction & { category_name: string | null })[] {
  const db = getDb();
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
  return plain<any>(db.prepare(sql).all(...params) as any[]);
}

export function recentTransactions(limit = 10) {
  const db = getDb();
  return plain<any>(db.prepare(`SELECT t.*, c.name as category_name, p.name as person_name FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN people p ON p.id = t.person_id ORDER BY t.date DESC, t.id DESC LIMIT ?`).all(limit) as any[]);
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
  return plain<any>(db.prepare(`SELECT r.*, c.name as category_name FROM recurring r LEFT JOIN categories c ON c.id=r.category_id ORDER BY r.id DESC`).all() as any[]);
}

export interface OpeningBalance { ledger: Ledger; opening_balance: number; opening_date: string; tax_reserve_rate: number }

export function getOpeningBalances(): Record<Ledger, OpeningBalance> {
  const db = getDb();
  const rows = plain<OpeningBalance>(db.prepare('SELECT * FROM account_settings').all() as any[]);
  const out: any = {
    personal: { ledger: 'personal', opening_balance: 0, opening_date: '2025-01-01', tax_reserve_rate: 0 },
    business: { ledger: 'business', opening_balance: 0, opening_date: '2025-01-01', tax_reserve_rate: 0 },
  };
  for (const r of rows) out[r.ledger] = r;
  return out;
}

export function balanceAt(ledger: Ledger, dateISO?: string): number {
  const db = getDb();
  const ob = getOpeningBalances()[ledger];
  const dateClause = dateISO ? ' AND date <= ?' : '';
  const params: any[] = dateISO ? [ob.opening_date, dateISO] : [ob.opening_date];
  const incExp = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount WHEN type='expense' THEN -amount ELSE 0 END),0) AS s
     FROM transactions WHERE ledger=? AND date >= ?${dateClause}`
  ).get(ledger, ...params) as { s: number };
  const inTrans = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='transfer' AND to_ledger=? AND date >= ?${dateClause}`
  ).get(ledger, ...params) as { s: number };
  const outTrans = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE type='transfer' AND from_ledger=? AND date >= ?${dateClause}`
  ).get(ledger, ...params) as { s: number };
  return ob.opening_balance + incExp.s + inTrans.s - outTrans.s;
}

export function projectedMonthEndBalance(ledger: Ledger): number {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cur = balanceAt(ledger, todayStr);
  const db = getDb();
  // remaining days this month: project active recurring rules whose day_of_month > today's day
  const rules = plain<Recurring>(db.prepare('SELECT * FROM recurring WHERE active=1').all() as any[]);
  const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  let delta = 0;
  for (const r of rules) {
    if (r.day_of_month <= today.getDate()) continue;
    // skip if already materialized for this month
    const exists = db.prepare(`SELECT 1 AS x FROM transactions WHERE recurring_id=? AND substr(date,1,7)=?`).get(r.id, monthStr) as any;
    if (exists) continue;
    if (r.type === 'income' && r.ledger === ledger) delta += r.amount;
    else if (r.type === 'expense' && r.ledger === ledger) delta -= r.amount;
    else if (r.type === 'transfer') {
      if (r.to_ledger === ledger) delta += r.amount;
      if (r.from_ledger === ledger) delta -= r.amount;
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

function totalsFor(month: string): { income: number; expense: number; net: number; pIncome: number; pExpense: number; fIncome: number; fExpense: number } {
  const db = getDb();
  const r = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN type='income' AND ledger='personal' THEN amount ELSE 0 END),0) AS pIncome,
      COALESCE(SUM(CASE WHEN type='expense' AND ledger='personal' THEN amount ELSE 0 END),0) AS pExpense,
      COALESCE(SUM(CASE WHEN type='income' AND recurring_id IS NOT NULL THEN amount ELSE 0 END),0) AS fIncome,
      COALESCE(SUM(CASE WHEN type='expense' AND recurring_id IS NOT NULL AND ledger='personal' THEN amount ELSE 0 END),0) AS fExpense
    FROM transactions WHERE substr(date,1,7)=?
  `).get(month) as any;
  return { ...r, net: r.income - r.expense };
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function financialHealth(month: string): FinancialHealth {
  const cur = totalsFor(month);
  const prev = totalsFor(prevMonth(month));
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

export function savingsRateSeries(): { month: string; rate: number; net: number }[] {
  return monthsBack(6).map(m => {
    const t = totalsFor(m);
    return { month: m, rate: t.income > 0 ? t.net / t.income : 0, net: t.net };
  });
}

/* ─────────── People (family members) ─────────── */

export function listPeople(): Person[] {
  return plain<Person>(getDb().prepare('SELECT * FROM people ORDER BY name').all() as any[]);
}

export interface PersonStat {
  person: Person;
  monthIncome: number;
  monthExpense: number;
  ytdIncome: number;
  ytdExpense: number;
  lastDate: string | null;
}

export function personStats(month: string): PersonStat[] {
  const db = getDb();
  const year = month.slice(0, 4);
  const people = listPeople();
  return people.map(p => {
    const m = db.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
        MAX(date) AS lastDate
       FROM transactions WHERE person_id=? AND substr(date,1,7)=?`
    ).get(p.id, month) as any;
    const y = db.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
       FROM transactions WHERE person_id=? AND substr(date,1,4)=?`
    ).get(p.id, year) as any;
    return {
      person: p,
      monthIncome: m.income, monthExpense: m.expense,
      ytdIncome: y.income, ytdExpense: y.expense,
      lastDate: m.lastDate || null,
    };
  });
}

/* ─────────── Fixed expense breakdown ─────────── */

export interface FixedItem {
  category_id: number | null;
  category_name: string | null;
  ledger: Ledger;
  amount: number;
  count: number;
}

export function fixedExpenseBreakdown(month: string): FixedItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.ledger, t.category_id, c.name AS category_name,
           COALESCE(SUM(t.amount),0) AS amount, COUNT(*) AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type='expense' AND t.recurring_id IS NOT NULL AND substr(t.date,1,7)=?
    GROUP BY t.ledger, t.category_id, c.name
    ORDER BY amount DESC
  `).all(month) as any[];
  return plain<FixedItem>(rows);
}

/* ─────────── Emergency fund (months covered) ─────────── */

export function emergencyFund(): { balance: number; monthlyFixed: number; months: number } {
  const db = getDb();
  // average personal fixed expense over last 3 months
  const months = monthsBack(3);
  let total = 0;
  for (const m of months) {
    const r = db.prepare(
      `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
       WHERE ledger='personal' AND type='expense' AND recurring_id IS NOT NULL AND substr(date,1,7)=?`
    ).get(m) as any;
    total += r.s;
  }
  const monthlyFixed = total / Math.max(1, months.length);
  const balance = balanceAt('personal');
  return { balance, monthlyFixed, months: monthlyFixed > 0 ? balance / monthlyFixed : 0 };
}

/* ─────────── YTD savings ─────────── */

export function ytdSavings(year?: string): { income: number; expense: number; net: number } {
  const y = year || String(new Date().getFullYear());
  const db = getDb();
  const r = db.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense
     FROM transactions WHERE substr(date,1,4)=?`
  ).get(y) as any;
  return { income: r.income, expense: r.expense, net: r.income - r.expense };
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

export function spendingAnomalies(month: string, thresholdPct = 0.30): Anomaly[] {
  const db = getDb();
  const baselineMonths = monthsBack(4).filter(m => m !== month);
  if (baselineMonths.length === 0) return [];
  // current month spend by category
  const cur = db.prepare(`
    SELECT t.ledger, t.category_id, c.name AS category_name,
           COALESCE(SUM(t.amount),0) AS amount
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type='expense' AND substr(t.date,1,7)=? AND t.category_id IS NOT NULL
    GROUP BY t.ledger, t.category_id, c.name
  `).all(month) as any[];
  const out: Anomaly[] = [];
  for (const c of cur) {
    if (c.amount < 10000) continue; // ignore tiny
    const placeholders = baselineMonths.map(() => '?').join(',');
    const avgRow = db.prepare(
      `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
       WHERE type='expense' AND ledger=? AND category_id=? AND substr(date,1,7) IN (${placeholders})`
    ).get(c.ledger, c.category_id, ...baselineMonths) as any;
    const average = avgRow.s / baselineMonths.length;
    if (average < 10000) continue;
    const delta = (c.amount - average) / average;
    if (Math.abs(delta) >= thresholdPct) {
      out.push({
        ledger: c.ledger, category_id: c.category_id, category_name: c.category_name || '(미지정)',
        current: c.amount, average, deltaPct: delta,
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

export function taxReserve(year?: string): TaxReserve {
  const y = year || String(new Date().getFullYear());
  const db = getDb();
  const ob = getOpeningBalances().business;
  const rate = ob.tax_reserve_rate || 0;

  const inc = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS s FROM transactions
     WHERE ledger='business' AND type='income' AND substr(date,1,4)=?`
  ).get(y) as any;
  const tax = db.prepare(
    `SELECT COALESCE(SUM(t.amount),0) AS s FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.ledger='business' AND t.type='expense' AND c.name LIKE '%세금%' AND substr(t.date,1,4)=?`
  ).get(y) as any;

  const reservedRequired = Math.round(inc.s * rate);
  const reservedBalance = Math.max(0, reservedRequired - tax.s);
  const bizBal = balanceAt('business');
  return {
    rate,
    ytdBusinessIncome: inc.s,
    reservedRequired,
    taxPaid: tax.s,
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
  monthsToPayoff: number; // estimated
}

export function listDebts(): DebtRow[] {
  const db = getDb();
  const debts = plain<Debt>(db.prepare('SELECT * FROM debts ORDER BY active DESC, name').all() as any[]);
  return debts.map(d => {
    const paid = db.prepare(
      `SELECT
        COALESCE(SUM(principal_amount),0) AS p,
        COALESCE(SUM(interest_amount),0)  AS i,
        MAX(date) AS lastDate
       FROM transactions WHERE debt_id=?`
    ).get(d.id) as any;
    const remaining = Math.max(0, d.initial_principal - paid.p);

    // monthly average principal from last 3 months of payments on this debt
    const months = monthsBack(3);
    const placeholders = months.map(() => '?').join(',');
    const avgRow = db.prepare(
      `SELECT COALESCE(SUM(principal_amount),0) AS s FROM transactions
       WHERE debt_id=? AND substr(date,1,7) IN (${placeholders})`
    ).get(d.id, ...months) as any;
    const monthlyAvg = avgRow.s / months.length;
    const monthsToPayoff = monthlyAvg > 0 ? remaining / monthlyAvg : 0;

    return {
      ...d,
      paid_principal: paid.p,
      paid_interest: paid.i,
      remaining_principal: remaining,
      last_payment_date: paid.lastDate || null,
      monthly_avg_principal: monthlyAvg,
      monthsToPayoff,
    };
  });
}

export interface DebtSummary {
  totalRemaining: number;
  monthPrincipal: number;
  monthInterest: number;
  ytdInterest: number;
  activeCount: number;
}

export function debtSummary(month: string): DebtSummary {
  const db = getDb();
  const year = month.slice(0, 4);
  const totalRem = db.prepare(
    `SELECT COALESCE(SUM(d.initial_principal),0) - COALESCE(SUM(t.principal_amount),0) AS rem
     FROM debts d
     LEFT JOIN transactions t ON t.debt_id = d.id
     WHERE d.active = 1`
  ).get() as any;
  const m = db.prepare(
    `SELECT
      COALESCE(SUM(principal_amount),0) AS p,
      COALESCE(SUM(interest_amount),0)  AS i
     FROM transactions WHERE debt_id IS NOT NULL AND substr(date,1,7)=?`
  ).get(month) as any;
  const y = db.prepare(
    `SELECT COALESCE(SUM(interest_amount),0) AS i
     FROM transactions WHERE debt_id IS NOT NULL AND substr(date,1,4)=?`
  ).get(year) as any;
  const active = db.prepare(`SELECT COUNT(*) AS c FROM debts WHERE active=1`).get() as any;
  return {
    totalRemaining: Math.max(0, totalRem.rem || 0),
    monthPrincipal: m.p,
    monthInterest: m.i,
    ytdInterest: y.i,
    activeCount: active.c,
  };
}

/* principal-adjusted savings rate: count principal repayments as savings, not expense */
export function adjustedSavingsRate(month: string): { rate: number; adjustedNet: number; principalRepaid: number } {
  const db = getDb();
  const r = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income'  THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN debt_id IS NOT NULL THEN principal_amount ELSE 0 END),0) AS principal
    FROM transactions WHERE substr(date,1,7)=?
  `).get(month) as any;
  // adjusted: principal repayments are treated as savings, so subtract from expense
  const adjExpense = r.expense - r.principal;
  const adjNet = r.income - adjExpense;
  const rate = r.income > 0 ? adjNet / r.income : 0;
  return { rate, adjustedNet: adjNet, principalRepaid: r.principal };
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
