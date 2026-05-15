import { describe, it, expect, beforeEach } from 'vitest';
import {
  monthlyTotals, financialHealth, taxReserve, debtSummary,
  adjustedSavingsRate, ytdSavings,
} from '@/lib/queries';
import { wipeDb, seedUser, seedCategory, seedTx, setTaxRate, seedDebt } from './helpers';

const UID = 1;

beforeEach(async () => {
  await wipeDb();
  await seedUser(UID);
});

describe('monthlyTotals', () => {
  it('수입/지출/이체를 장부별로 집계한다', async () => {
    const food = await seedCategory(UID, 'personal', '식비');
    await seedTx(UID, { ledger: 'personal', type: 'income',  date: '2026-05-01', amount: 3_000_000 });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-02', amount: 500_000, category_id: food });
    await seedTx(UID, { ledger: 'business', type: 'income',  date: '2026-05-03', amount: 1_000_000 });
    await seedTx(UID, { ledger: 'personal', type: 'transfer', date: '2026-05-04', amount: 200_000, from_ledger: 'personal', to_ledger: 'business' });

    const r = await monthlyTotals(UID, '2026-05');
    expect(r.personal.income).toBe(3_000_000);
    expect(r.personal.expense).toBe(500_000 + 200_000);
    expect(r.business.income).toBe(1_000_000 + 200_000);
    expect(r.business.expense).toBe(0);
    expect(r.combinedNet).toBe(r.personal.net + r.business.net);
  });

  it('다른 달은 포함하지 않는다', async () => {
    await seedTx(UID, { ledger: 'personal', type: 'income', date: '2026-04-30', amount: 999 });
    const r = await monthlyTotals(UID, '2026-05');
    expect(r.personal.income).toBe(0);
  });

  it('타 user의 거래는 노출되지 않는다', async () => {
    await seedUser(2);
    await seedTx(2, { ledger: 'personal', type: 'income', date: '2026-05-01', amount: 999_999 });
    const r = await monthlyTotals(UID, '2026-05');
    expect(r.personal.income).toBe(0);
  });
});

describe('financialHealth', () => {
  it('저축률·고정비커버리지·전월대비 계산', async () => {
    // 이전 달
    await seedTx(UID, { ledger: 'personal', type: 'income',  date: '2026-04-01', amount: 2_000_000 });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-04-15', amount: 1_500_000 });
    // 이번 달
    await seedTx(UID, { ledger: 'personal', type: 'income',  date: '2026-05-01', amount: 3_000_000, recurring_id: 1 }); // 고정수입
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-05', amount:   600_000, recurring_id: 2 }); // 고정지출
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-10', amount:   400_000 });                    // 변동

    const h = await financialHealth(UID, '2026-05');
    expect(h.income).toBe(3_000_000);
    expect(h.expense).toBe(1_000_000);
    expect(h.net).toBe(2_000_000);
    expect(h.savingsRate).toBeCloseTo(2_000_000 / 3_000_000, 5);
    expect(h.fixedIncome).toBe(3_000_000);
    expect(h.fixedExpense).toBe(600_000);
    expect(h.fixedCoverage).toBeCloseTo(3_000_000 / 600_000, 5);
    expect(h.pureSpend).toBe(400_000); // 1,000,000 - 600,000
    expect(h.vsLastMonth.net).toBe(2_000_000 - 500_000);
  });

  it('수입 0이면 저축률 0', async () => {
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-01', amount: 1000 });
    const h = await financialHealth(UID, '2026-05');
    expect(h.savingsRate).toBe(0);
  });

  it('고정지출 0이면 커버리지 Infinity 또는 0', async () => {
    await seedTx(UID, { ledger: 'personal', type: 'income', date: '2026-05-01', amount: 1000, recurring_id: 1 });
    const h = await financialHealth(UID, '2026-05');
    expect(h.fixedCoverage).toBe(Infinity);
  });
});

describe('taxReserve', () => {
  it('충당 비율 × 사업 매출 - 세금 카테고리 지출', async () => {
    await setTaxRate(UID, 0.25);
    const taxCat = await seedCategory(UID, 'business', '세금');
    const salesCat = await seedCategory(UID, 'business', '매출');
    await seedTx(UID, { ledger: 'business', type: 'income',  date: '2026-03-01', amount: 10_000_000, category_id: salesCat });
    await seedTx(UID, { ledger: 'business', type: 'income',  date: '2026-05-01', amount:  6_000_000, category_id: salesCat });
    await seedTx(UID, { ledger: 'business', type: 'expense', date: '2026-04-25', amount:    500_000, category_id: taxCat });

    const r = await taxReserve(UID, '2026');
    expect(r.rate).toBe(0.25);
    expect(r.ytdBusinessIncome).toBe(16_000_000);
    expect(r.reservedRequired).toBe(4_000_000);
    expect(r.taxPaid).toBe(500_000);
    expect(r.reservedBalance).toBe(3_500_000);
  });

  it('rate=0이면 reservedRequired 0', async () => {
    const r = await taxReserve(UID, '2026');
    expect(r.rate).toBe(0);
    expect(r.reservedRequired).toBe(0);
  });
});

describe('debtSummary', () => {
  it('총 남은 원금 / 이번달 원금·이자 / 활성 건수', async () => {
    const d1 = await seedDebt(UID, { name: '학자금', initial_principal: 10_000_000, start_date: '2025-01-01' });
    const d2 = await seedDebt(UID, { name: '신용대출', initial_principal:  5_000_000, start_date: '2025-01-01' });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-10', amount: 350_000, debt_id: d1, principal_amount: 300_000, interest_amount: 50_000 });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-04-10', amount: 200_000, debt_id: d2, principal_amount: 180_000, interest_amount: 20_000 });

    const s = await debtSummary(UID, '2026-05');
    expect(s.activeCount).toBe(2);
    expect(s.totalRemaining).toBe(15_000_000 - 300_000 - 180_000);
    expect(s.monthPrincipal).toBe(300_000);
    expect(s.monthInterest).toBe(50_000);
    expect(s.ytdInterest).toBe(70_000);
  });

  it('대출 없으면 0', async () => {
    const s = await debtSummary(UID, '2026-05');
    expect(s.activeCount).toBe(0);
    expect(s.totalRemaining).toBe(0);
  });
});

describe('adjustedSavingsRate', () => {
  it('원금상환을 저축으로 간주하여 저축률 보정', async () => {
    const d1 = await seedDebt(UID, { name: '학자금', initial_principal: 10_000_000, start_date: '2025-01-01' });
    await seedTx(UID, { ledger: 'personal', type: 'income',  date: '2026-05-01', amount: 3_000_000 });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-10', amount: 2_500_000 });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-05-15', amount:   350_000, debt_id: d1, principal_amount: 300_000, interest_amount: 50_000 });

    const r = await adjustedSavingsRate(UID, '2026-05');
    // 총 지출 2,850,000 중 원금 300,000은 저축으로 간주 → 조정 지출 2,550,000
    expect(r.principalRepaid).toBe(300_000);
    expect(r.adjustedNet).toBe(3_000_000 - (2_850_000 - 300_000));
    expect(r.rate).toBeCloseTo(450_000 / 3_000_000, 5);
  });
});

describe('ytdSavings', () => {
  it('연 누적 수입·지출·순익', async () => {
    await seedTx(UID, { ledger: 'personal', type: 'income',  date: '2026-01-01', amount: 1_000_000 });
    await seedTx(UID, { ledger: 'business', type: 'income',  date: '2026-06-01', amount: 2_000_000 });
    await seedTx(UID, { ledger: 'personal', type: 'expense', date: '2026-03-01', amount:   500_000 });
    await seedTx(UID, { ledger: 'personal', type: 'income',  date: '2025-12-31', amount: 999_999 }); // 다른 해
    const r = await ytdSavings(UID, '2026');
    expect(r.income).toBe(3_000_000);
    expect(r.expense).toBe(500_000);
    expect(r.net).toBe(2_500_000);
  });
});
