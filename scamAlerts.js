/**
 * LoanLens — Scam Alerts module.
 *
 * Builds personalised red/yellow/green/blue alerts for a given loan,
 * and renders the dedicated "Scam Alerts" panel.
 *
 * @module scamAlerts
 */

import { LOAN_TYPES, fmtINR2, fmtPct, state } from './utils.js';
import { loanSummary } from './calculators.js';

/* ============================================================
 * Build alerts (pure logic — testable, no DOM)
 * ============================================================ */

/**
 * @param {import('./calculators.js').LoanInput} loan
 * @returns {Array<{ level: 'red'|'yellow'|'green'|'blue', title: string, body: string }>}
 */
export function buildAlerts(loan) {
  const t = LOAN_TYPES[loan.loanType];
  const sum = loanSummary(loan);
  const alerts = [];

  /* ----- Interest rate ----- */
  if (loan.annualRate > t.rateMax + 4) {
    alerts.push({
      level: 'red', title: 'Interest rate above market norms',
      body: `Your rate of ${fmtPct(loan.annualRate, 2)} is well above the typical range for ${t.label.toLowerCase()}s (${t.rateMin}–${t.rateMax}%). This is a serious red flag — compare with at least two other lenders before signing.`,
    });
  } else if (loan.annualRate > t.rateMax) {
    alerts.push({
      level: 'yellow', title: 'Interest rate above typical range',
      body: `${fmtPct(loan.annualRate, 2)} is above the usual ${t.rateMin}–${t.rateMax}% range for ${t.label.toLowerCase()}s. Ask the lender to justify it, and shop around.`,
    });
  } else if (loan.annualRate < t.rateMin * 0.6) {
    alerts.push({
      level: 'yellow', title: 'Interest rate looks too good',
      body: `${fmtPct(loan.annualRate, 2)} is far below the typical ${t.rateMin}–${t.rateMax}% range. Double-check it's a genuine offer — scammers often use unrealistic rates as bait.`,
    });
  } else {
    alerts.push({
      level: 'green', title: 'Interest rate is in a normal range',
      body: `${fmtPct(loan.annualRate, 2)} fits within the usual ${t.rateMin}–${t.rateMax}% band for ${t.label.toLowerCase()}s.`,
    });
  }

  /* ----- Processing fee — absolute percentage ----- */
  if (loan.processingFeePct > 3) {
    alerts.push({
      level: 'red', title: 'Processing fee greater than 3%',
      body: `${fmtPct(loan.processingFeePct, 2)} (${fmtINR2(loan.principal * loan.processingFeePct / 100)}) is steep. Most legitimate lenders charge 0.5–2%. Demand a written breakdown of every charge.`,
    });
  } else if (loan.processingFeePct > 2) {
    alerts.push({
      level: 'yellow', title: 'Processing fee is on the higher side',
      body: `${fmtPct(loan.processingFeePct, 2)} is above the typical 0.5–2% range. Worth negotiating or comparing with another lender.`,
    });
  }

  /* ----- Processing fee — absolute rupee amount ----- */
  if (sum.processingFee > 25000 && (sum.processingFee / loan.principal) > 0.015) {
    alerts.push({
      level: 'yellow', title: 'Large fee relative to loan amount',
      body: `The ${fmtINR2(sum.processingFee)} processing fee is a sizeable chunk taken upfront. It reduces what actually reaches your account.`,
    });
  }

  /* ----- Total interest > principal ----- */
  if (sum.totalInterest > loan.principal) {
    alerts.push({
      level: 'red', title: 'Total interest exceeds principal',
      body: `Over the life of this loan you will pay ${fmtINR2(sum.totalInterest)} in interest — more than the ${fmtINR2(loan.principal)} you originally borrowed.`,
    });
  }

  /* ----- Tenure ----- */
  if (loan.tenureMonths > t.tenureMaxMonths) {
    alerts.push({
      level: 'yellow', title: 'Very long tenure',
      body: `${loan.tenureMonths} months is longer than typical for a ${t.label.toLowerCase()} (usually up to ${t.tenureMaxMonths} months). Longer tenure means a smaller EMI but dramatically more total interest.`,
    });
  }

  /* ----- High overall borrowing cost ----- */
  const costPct = ((sum.totalCost - loan.principal) / loan.principal) * 100;
  if (costPct > 75) {
    alerts.push({
      level: 'yellow', title: 'High overall borrowing cost',
      body: `Your total interest + fees come to ${costPct.toFixed(0)}% of what you borrow. Most healthy loans stay under 40–60% extra.`,
    });
  }

  /* ----- Always-on educational reminders ----- */
  alerts.push({
    level: 'blue', title: 'Always verify the lender with RBI',
    body: `Before signing anything, check that the lender is registered with the Reserve Bank of India. Search the RBI website for the company's name. If they can't show proper registration documents, walk away.`,
  });
  alerts.push({
    level: 'blue', title: 'Common scam patterns to avoid',
    body: `Never pay an "advance fee" to receive a loan. Real lenders deduct fees from the disbursed amount or charge them later. Never share OTPs. Watch out for pressure to sign immediately.`,
  });

  return alerts;
}

/* ============================================================
 * Render the Scam Alerts panel
 * ============================================================ */

const iconFor  = (l) => l === 'red' ? '🔴' : l === 'yellow' ? '🟡' : l === 'green' ? '🟢' : '🔵';
const classFor = (l) => `alert alert-${l}`;

/**
 * @param {HTMLElement} panel
 */
export function renderAlerts(panel) {
  const alerts = buildAlerts(state.loan);
  panel.innerHTML = `
    <div class="space-y-5">
      <div class="card p-5 sm:p-7">
        <h2 class="font-display text-2xl">Red-flag check for your loan</h2>
        <p class="text-[var(--ink-soft)] mt-1">Based on the numbers you entered, here's what stands out. We err on the side of warning you.</p>
        <div class="mt-5 grid gap-3">
          ${alerts.map(a => `
            <div class="${classFor(a.level)}">
              <div class="flex gap-3 items-start">
                <span aria-hidden="true" class="text-lg leading-none">${iconFor(a.level)}</span>
                <div>
                  <div class="font-semibold">${a.title}</div>
                  <p class="mt-1 text-sm">${a.body}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card p-5 sm:p-6 text-sm text-[var(--ink-soft)]">
        <strong class="text-[var(--ink)]">A note on these alerts:</strong> Ranges are based on typical published Indian market rates and may shift over time. They are a starting point for caution, not legal or financial advice.
      </div>
    </div>
  `;
}
