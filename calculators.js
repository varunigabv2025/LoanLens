/**
 * LoanLens — Pure financial calculation engine.
 *
 * Framework-free, DOM-free. The single source of truth for every number
 * the app displays. All math is full floating-point precision; values
 * are only rounded when displayed.
 *
 * @module calculators
 */

import { LOAN_TYPES, fmtINR2 } from './utils.js';

/* ============================================================
 * TYPES  (JSDoc — TypeScript-grade editor checking, no build step)
 * ============================================================ */

/**
 * @typedef {'home'|'personal'|'vehicle'|'education'|'gold'} LoanType
 *
 * @typedef {Object} LoanInput
 * @property {number} principal         Rupees borrowed.
 * @property {number} annualRate        Annual interest rate, percent.
 * @property {number} tenureMonths      Whole number of months.
 * @property {LoanType} loanType
 * @property {number} processingFeePct  One-time fee as % of principal.
 * @property {boolean} [prepayment]
 * @property {string} [startDate]       ISO date YYYY-MM-DD.
 *
 * @typedef {Object} AmortRow
 * @property {number} month
 * @property {number} openingBalance
 * @property {number} emi
 * @property {number} principal
 * @property {number} interest
 * @property {number} closingBalance
 * @property {Date}   dueDate
 *
 * @typedef {Object} LoanSummary
 * @property {number} emi
 * @property {AmortRow[]} rows
 * @property {number} totalPayment       Σ EMI.
 * @property {number} totalInterest      Σ interest components.
 * @property {number} totalPrincipal     Σ principal components.
 * @property {number} processingFee      principal × fee%.
 * @property {number} totalCost          principal + totalInterest + processingFee.
 */

/* ============================================================
 * EMI FORMULA
 *
 *      EMI = P × r × (1 + r)^n
 *            ─────────────────
 *               (1 + r)^n − 1
 *
 *  P = principal,  r = monthly rate (annual/12/100),  n = months
 * ============================================================ */

/**
 * Compute the equated monthly instalment for a reducing-balance loan.
 * @param {number} principal
 * @param {number} annualRate Percent, e.g. 8.5.
 * @param {number} months
 * @returns {number} Unrounded EMI in rupees.
 */
export function computeEMI(principal, annualRate, months) {
  const r = (annualRate / 100) / 12;
  if (r === 0) return principal / months;
  const pow = Math.pow(1 + r, months);
  return principal * r * pow / (pow - 1);
}

/**
 * Build a full month-by-month amortization at full precision.
 * The final month's principal is auto-adjusted so the closing balance
 * settles to exactly 0 — eliminating accumulated floating-point drift.
 *
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} months
 * @param {string} [startDate]
 * @returns {{ emi: number, rows: AmortRow[] }}
 */
export function buildAmortization(principal, annualRate, months, startDate) {
  const r = (annualRate / 100) / 12;
  const emi = computeEMI(principal, annualRate, months);
  const start = new Date(startDate || new Date().toISOString().slice(0, 10));
  let balance = principal;
  /** @type {AmortRow[]} */
  const rows = [];
  for (let m = 1; m <= months; m++) {
    const opening = balance;
    const interest = opening * r;            // accrues on exact opening balance
    let principalPaid = emi - interest;
    let emiThisMonth  = emi;
    let closing = opening - principalPaid;
    // Last-month settlement
    if (m === months) {
      principalPaid = opening;
      emiThisMonth  = principalPaid + interest;
      closing = 0;
    }
    const due = new Date(start);
    due.setMonth(due.getMonth() + (m - 1));
    rows.push({
      month: m,
      openingBalance: opening,
      emi: emiThisMonth,
      principal: principalPaid,
      interest,
      closingBalance: closing,
      dueDate: due,
    });
    balance = closing;
  }
  return { emi, rows };
}

/**
 * Aggregate everything the UI needs from a loan input.
 * @param {LoanInput} loan
 * @returns {LoanSummary}
 */
export function loanSummary(loan) {
  const { emi, rows } = buildAmortization(
    loan.principal, loan.annualRate, loan.tenureMonths,
    loan.startDate || new Date().toISOString().slice(0, 10),
  );
  const totalPayment   = rows.reduce((s, r) => s + r.emi, 0);
  const totalInterest  = rows.reduce((s, r) => s + r.interest, 0);
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  const processingFee  = loan.principal * (loan.processingFeePct || 0) / 100;
  // Total cost = Principal + Total Interest + Processing Fee
  const totalCost = loan.principal + totalInterest + processingFee;
  verifyAmortization(loan.principal, rows, totalPrincipal, totalInterest);
  return { emi, rows, totalPayment, totalInterest, totalPrincipal, processingFee, totalCost };
}

/* ============================================================
 * EFFECTIVE COST  (what you actually receive vs. what you pay)
 * ============================================================ */

/**
 * @param {LoanInput} loan
 * @param {LoanSummary} sum
 */
export function computeEffectiveCost(loan, sum) {
  return {
    approved:       loan.principal,
    processingFee:  sum.processingFee,
    netReceived:    loan.principal - sum.processingFee,
    totalEmi:       sum.totalPayment,
    overallCost:    sum.totalCost,
  };
}

/* ============================================================
 * RISK SCORE  (0–100, higher = healthier)
 * Deterministic — same inputs always produce the same score.
 * ============================================================ */

/**
 * @param {LoanInput} loan
 * @param {LoanSummary} sum
 */
export function computeRiskScore(loan, sum) {
  const t = LOAN_TYPES[loan.loanType];
  let score = 100;
  const reasons = [];

  // Interest rate
  if (loan.annualRate > t.rateMax * 1.5)        { score -= 35; reasons.push('Interest rate is far above typical market range.'); }
  else if (loan.annualRate > t.rateMax)         { score -= 18; reasons.push('Interest rate is above typical market range.'); }
  else if (loan.annualRate < t.rateMin * 0.85)  { score -= 5;  reasons.push('Interest rate is unusually low — double-check it is genuine.'); }

  // Processing fee
  if (loan.processingFeePct > 3)      { score -= 20; reasons.push('Processing fee exceeds 3% of principal.'); }
  else if (loan.processingFeePct > 2) { score -= 10; reasons.push('Processing fee is higher than common (>2%).'); }
  else if (loan.processingFeePct > 1) { score -= 3; }

  // Tenure
  if (loan.tenureMonths > t.tenureMaxMonths)              { score -= 15; reasons.push('Tenure is longer than typical for this loan type.'); }
  else if (loan.tenureMonths > t.tenureMaxMonths * 0.85)  { score -= 5; }

  // Lifetime interest burden
  const burden = sum.totalInterest / loan.principal;
  if (burden >= 1.0)      { score -= 25; reasons.push('Total interest will exceed the amount borrowed.'); }
  else if (burden >= 0.6) { score -= 12; reasons.push('Interest will be more than 60% of the principal.'); }
  else if (burden >= 0.3) { score -= 4; }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let band, color, label;
  if (score >= 80)      { band = 'healthy'; color = 'green';  label = '🟢 Healthy Loan'; }
  else if (score >= 50) { band = 'caution'; color = 'yellow'; label = '🟡 Review Carefully'; }
  else                  { band = 'risky';   color = 'red';    label = '🔴 High Risk'; }

  const explanation = band === 'healthy'
    ? 'Your loan has a reasonable interest rate and fee structure. The overall borrowing cost is moderate for this loan type.'
    : band === 'caution'
      ? 'This loan has one or two terms worth re-examining. Compare with another lender before signing.'
      : 'Several terms in this loan look unusually expensive. Strongly consider negotiating, or shopping for alternative offers.';

  return { score, band, color, label, explanation, reasons };
}

/* ============================================================
 * LOAN HEALTH INSIGHTS  (3–5 plain-language observations)
 * ============================================================ */

/**
 * @param {LoanInput} loan
 * @param {LoanSummary} sum
 */
export function buildInsights(loan, sum) {
  const out = [];

  // Insight 1: interest dominates repayment
  const interestShare = sum.totalInterest / sum.totalPayment;
  if (interestShare > 0.5) {
    out.push({
      tone: 'warn',
      title: 'Interest dominates your repayment',
      body: `More than half (${(interestShare * 100).toFixed(0)}%) of your total repayment goes toward interest, not the amount you borrowed.`,
    });
  }

  // Insight 2: total interest > principal
  if (sum.totalInterest > loan.principal) {
    out.push({
      tone: 'warn',
      title: 'Total interest exceeds principal',
      body: `Over the life of this loan you will pay ${fmtINR2(sum.totalInterest)} in interest — more than the ${fmtINR2(loan.principal)} you originally borrowed.`,
    });
  }

  // Insight 3: shorter-tenure savings (only for tenures >72 months)
  if (loan.tenureMonths > 72) {
    const shorter = Math.max(12, loan.tenureMonths - 60);
    const altEmi = computeEMI(loan.principal, loan.annualRate, shorter);
    const altInterest = altEmi * shorter - loan.principal;
    const saving = sum.totalInterest - altInterest;
    if (saving > 0) {
      out.push({
        tone: 'info',
        title: 'Shorter tenure saves a lot',
        body: `If you shortened the tenure by 5 years (to ${shorter} months), your EMI would rise to ${fmtINR2(altEmi)} but you'd save roughly ${fmtINR2(saving)} in total interest.`,
      });
    }
  }

  // Insight 4: prepayment savings simulation
  if (loan.prepayment && loan.tenureMonths >= 24) {
    const yearsToSim = Math.min(5, Math.floor(loan.tenureMonths / 12));
    const r = (loan.annualRate / 100) / 12;
    let bal = loan.principal, paidI = 0;
    const emi = sum.emi;
    for (let m = 1; m <= loan.tenureMonths && bal > 0.01; m++) {
      const i = bal * r;
      const p = Math.min(emi - i, bal);
      paidI += i;
      bal -= p;
      if (m <= yearsToSim * 12 && m % 12 === 0) {
        const extra = Math.min(emi, bal);
        bal -= extra;
      }
    }
    const saving = sum.totalInterest - paidI;
    if (saving > 1000) {
      out.push({
        tone: 'positive',
        title: 'Prepayments could save you money',
        body: `Paying one extra EMI per year for the first ${yearsToSim} years could save you roughly ${fmtINR2(saving)} in interest and finish the loan earlier.`,
      });
    }
  }

  // Insight 5: fee impact on effective rate
  if (sum.processingFee > 0) {
    const net = loan.principal - sum.processingFee;
    const effRateApprox = ((sum.totalPayment / Math.max(net, 1)) - 1) / (loan.tenureMonths / 12) * 100;
    if (effRateApprox > loan.annualRate + 0.5) {
      out.push({
        tone: 'info',
        title: 'Fees push your real cost higher',
        body: `Because the processing fee of ${fmtINR2(sum.processingFee)} reduces what you actually receive, your effective borrowing cost is closer to ${effRateApprox.toFixed(2)}% per year (vs. the quoted ${loan.annualRate}%).`,
      });
    }
  }

  // Fallback insight
  if (out.length < 3) {
    out.push({
      tone: 'info',
      title: 'The headline rate is not the whole story',
      body: `Lenders quote an interest rate, but the real cost is total interest plus fees: ${fmtINR2(sum.totalCost - loan.principal)} on top of your ${fmtINR2(loan.principal)} borrowing.`,
    });
  }

  return out.slice(0, 5);
}

/**
 * Plain-language narrative used in the Total Cost card.
 * @param {LoanInput} loan
 * @param {LoanSummary} sum
 */
export function buildNarrative(loan, sum) {
  const extra = sum.totalPayment - loan.principal;
  return {
    l1: `You borrow ${fmtINR2(loan.principal)}.`,
    l2: `You will pay ${fmtINR2(sum.emi)} every month for ${loan.tenureMonths} months.`,
    l3: `By the end of the loan you will have paid ${fmtINR2(sum.totalPayment)} in total.`,
    l4: `That means you pay ${fmtINR2(extra)} more than the amount you originally borrowed.`,
  };
}

/* ============================================================
 * COMPARISON HELPER
 * ============================================================ */

/**
 * Side-by-side comparison of two loan offers.
 * @param {LoanInput} a
 * @param {LoanInput} b
 */
export function compareLoans(a, b) {
  const sA = loanSummary(a);
  const sB = loanSummary(b);
  const diff = sA.totalCost - sB.totalCost;
  const cheaper = diff === 0 ? null : (diff > 0 ? 'B' : 'A');
  return {
    a: sA, b: sB,
    cheaper,
    savings: Math.abs(diff),
    lowerEMI:      sA.emi < sB.emi ? 'A' : sA.emi > sB.emi ? 'B' : 'tied',
    lowerInterest: sA.totalInterest < sB.totalInterest ? 'A' : sA.totalInterest > sB.totalInterest ? 'B' : 'tied',
  };
}

/* ============================================================
 * VERIFICATION  (hidden — warns to console only)
 *
 * Invariants:
 *   • For every row: opening − principal == closing
 *   • Σ principal components == original principal
 *   • Σ interest components == reported totalInterest
 * ============================================================ */

/**
 * @param {number} principal
 * @param {AmortRow[]} rows
 * @param {number} totalPrincipal
 * @param {number} totalInterest
 */
export function verifyAmortization(principal, rows, totalPrincipal, totalInterest) {
  const EPS = 0.01; // one paisa tolerance
  let ok = true;
  for (const r of rows) {
    const expected = r.openingBalance - r.principal;
    if (Math.abs(expected - r.closingBalance) > EPS) {
      console.warn(`[LoanLens] Row ${r.month}: opening - principal != closing`, r);
      ok = false;
    }
  }
  if (Math.abs(totalPrincipal - principal) > EPS) {
    console.warn(`[LoanLens] Σ principal (${totalPrincipal}) != original principal (${principal})`);
    ok = false;
  }
  const recomputedInterest = rows.reduce((s, r) => s + r.interest, 0);
  if (Math.abs(recomputedInterest - totalInterest) > EPS) {
    console.warn('[LoanLens] Interest mismatch', { recomputedInterest, totalInterest });
    ok = false;
  }
  if (ok) console.debug('[LoanLens] Amortization verified ✓');
  return ok;
}
