import { describe, it, expect, beforeEach } from 'vitest';
import {
  listTransactions, recentTransactions, listBudgets, listCategories,
  listRecurring, listPeople, listDebts, debtSummary, balanceAt,
  taxReserve, fixedExpenseBreakdown, spendingAnomalies, salesSummary,
  investmentSummary, listInvestments,
} from '@/lib/queries';
import { wipeDb, seedUser, seedCategory, seedTx, setTaxRate, seedDebt } from './helpers';
import { ensureDb } from '@/lib/db';

const A = 1, B = 2;

beforeEach(async () => {
  await wipeDb();
  await seedUser(A);
  await seedUser(B);
});

describe('user 격리: 사용자 A 쿼리가 B 데이터를 절대 노출하지 않는다', () => {
  it('listTransactions / recentTransactions', async () => {
    await seedTx(B, { ledger: 'personal', type: 'income', date: '2026-05-01', amount: 9_999_999 });
    expect(await listTransactions(A)).toHaveLength(0);
    expect(await recentTransactions(A, 10)).toHaveLength(0);
  });

  it('listCategories', async () => {
    await seedCategory(B, 'personal', '비밀카테고리');
    expect(await listCategories(A)).toHaveLength(0);
  });

  it('listBudgets', async () => {
    const cat = await seedCategory(B, 'personal', 'X');
    const db = await ensureDb();
    await db.execute({ sql: 'INSERT INTO budgets (user_id, ledger, category_id, month, amount) VALUES (?, ?, ?, ?, ?)', args: [B, 'personal', cat, '2026-05', 100_000] });
    expect(await listBudgets(A, '2026-05')).toHaveLength(0);
  });

  it('listPeople', async () => {
    const db = await ensureDb();
    await db.execute({ sql: 'INSERT INTO people (user_id, name) VALUES (?, ?)', args: [B, '엄마'] });
    expect(await listPeople(A)).toHaveLength(0);
  });

  it('listDebts / debtSummary — debts 자체 + 합산 모두', async () => {
    const d = await seedDebt(B, { name: '비밀대출', initial_principal: 50_000_000, start_date: '2025-01-01' });
    await seedTx(B, { ledger: 'personal', type: 'expense', date: '2026-05-10', amount: 500_000, debt_id: d, principal_amount: 400_000, interest_amount: 100_000 });
    expect(await listDebts(A)).toHaveLength(0);
    const s = await debtSummary(A, '2026-05');
    expect(s.activeCount).toBe(0);
    expect(s.totalRemaining).toBe(0);
    expect(s.monthPrincipal).toBe(0);
  });

  it('balanceAt — B의 입금이 A 잔액에 영향 없음', async () => {
    await seedTx(B, { ledger: 'personal', type: 'income', date: '2025-06-01', amount: 5_000_000 });
    expect(await balanceAt(A, 'personal')).toBe(0);
  });

  it('taxReserve — B의 사업소득 누출 안 됨', async () => {
    await setTaxRate(A, 0.25);
    await seedTx(B, { ledger: 'business', type: 'income', date: '2026-03-01', amount: 10_000_000 });
    const r = await taxReserve(A, '2026');
    expect(r.ytdBusinessIncome).toBe(0);
    expect(r.reservedRequired).toBe(0);
  });

  it('fixedExpenseBreakdown / spendingAnomalies', async () => {
    const cat = await seedCategory(B, 'personal', '식비');
    for (const m of ['02','03','04']) {
      await seedTx(B, { ledger: 'personal', type: 'expense', date: `2026-${m}-15`, amount: 100_000, category_id: cat, recurring_id: 1 });
    }
    await seedTx(B, { ledger: 'personal', type: 'expense', date: '2026-05-15', amount: 500_000, category_id: cat, recurring_id: 1 });
    expect(await fixedExpenseBreakdown(A, '2026-05')).toHaveLength(0);
    expect(await spendingAnomalies(A, '2026-05')).toHaveLength(0);
  });

  it('salesSummary — B의 매출 노출 안 됨', async () => {
    await seedTx(B, { ledger: 'business', type: 'income', date: '2026-05-10', amount: 5_500_000, supply_amount: 5_000_000, vat_amount: 500_000 });
    const r = await salesSummary(A, '2026-05');
    expect(r.supply).toBe(0);
    expect(r.vat).toBe(0);
    expect(r.count).toBe(0);
  });

  it('investmentSummary / listInvestments', async () => {
    const db = await ensureDb();
    await db.execute({ sql: 'INSERT INTO investments (user_id, name, current_price) VALUES (?, ?, ?)', args: [B, '비밀주식', 10000] });
    expect(await listInvestments(A)).toHaveLength(0);
    const s = await investmentSummary(A);
    expect(s.activeCount).toBe(0);
  });

  it('listRecurring', async () => {
    const db = await ensureDb();
    await db.execute({ sql: 'INSERT INTO recurring (user_id, ledger, type, amount, day_of_month, start_date) VALUES (?, ?, ?, ?, ?, ?)', args: [B, 'personal', 'expense', 1000, 1, '2025-01-01'] });
    expect(await listRecurring(A)).toHaveLength(0);
  });
});
