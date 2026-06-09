/**
 * LoanLens — Comparison Tool panel.
 *
 * Renders side-by-side input forms for two loan offers (Loan A & B),
 * computes both, highlights wins, and shows an explicit cost breakdown
 * (Principal / Interest / Processing Fee / Final Cost) for each.
 *
 * @module comparison
 */

import { LOAN_TYPES, fmtINR2, fmtPct, state } from './utils.js';
import { loanSummary, compareLoans } from './calculators.js';

/**
 * @param {HTMLElement} panel
 */
export function renderCompare(panel) {
  const A = state.compare.a;
  const B = state.compare.b;
  const { a: sA, b: sB, cheaper, savings } = compareLoans(
    { ...A, startDate: '2026-01-01' },
    { ...B, startDate: '2026-01-01' },
  );

  /** Build one row of the comparison table, highlighting the winner. */
  const cmpRow = (label, a, b, fmt = fmtINR2, lowerWins = true) => {
    const winA = lowerWins ? a < b : a > b;
    const winB = lowerWins ? b < a : b > a;
    return `<tr>
      <td class="text-left">${label}</td>
      <td class="num ${winA ? 'winner' : ''}">${fmt(a)}</td>
      <td class="num ${winB ? 'winner' : ''}">${fmt(b)}</td>
    </tr>`;
  };

  const rec = cheaper === null
    ? 'Both loans cost the same overall.'
    : (cheaper === 'B'
        ? `Loan B saves you ${fmtINR2(savings)} overall.`
        : `Loan A saves you ${fmtINR2(savings)} overall.`);

  panel.innerHTML = `
    <div class="space-y-6">
      <div class="card p-5 sm:p-7">
        <h2 class="font-display text-2xl">Compare two loan offers</h2>
        <p class="text-[var(--ink-soft)] mt-1">Enter the details of two offers side by side. We'll do the math and tell you which is cheaper overall.</p>
        <div class="grid md:grid-cols-2 gap-5 mt-5">
          ${compareForm('a', A)}
          ${compareForm('b', B)}
        </div>
      </div>

      <div class="card p-5 sm:p-7">
        <h2 class="font-display text-xl">Side-by-side</h2>
        <div class="grid sm:grid-cols-2 gap-4 mt-4">
          ${costBreakdownCard('Loan A', A, sA, 'sky')}
          ${costBreakdownCard('Loan B', B, sB, 'moss')}
        </div>
        <div class="overflow-x-auto mt-5 rounded-lg border border-[var(--line)]">
          <table class="amort min-w-[480px]">
            <thead>
              <tr><th class="text-left">Metric</th><th>Loan A</th><th>Loan B</th></tr>
            </thead>
            <tbody>
              ${cmpRow('Monthly EMI', sA.emi, sB.emi)}
              ${cmpRow('Principal', A.principal, B.principal, fmtINR2, false)}
              ${cmpRow('Total interest', sA.totalInterest, sB.totalInterest)}
              ${cmpRow('Processing fee', sA.processingFee, sB.processingFee)}
              ${cmpRow('Total cost (P + I + Fee)', sA.totalCost, sB.totalCost)}
              ${cmpRow('Tenure (months)', A.tenureMonths, B.tenureMonths, (v) => v + '')}
              ${cmpRow('Interest rate', A.annualRate, B.annualRate, (v) => fmtPct(v, 2))}
            </tbody>
          </table>
        </div>
        <div class="alert alert-green mt-5">
          <strong>Our take:</strong> ${rec}
          Lower EMI: ${sA.emi < sB.emi ? 'Loan A' : (sA.emi > sB.emi ? 'Loan B' : 'tied')}.
          Lower total interest: ${sA.totalInterest < sB.totalInterest ? 'Loan A' : (sA.totalInterest > sB.totalInterest ? 'Loan B' : 'tied')}.
        </div>
        <p class="text-xs text-[var(--ink-soft)] mt-3">Total cost includes principal, every rupee of interest, and the one-time processing fee. A lower EMI isn't always cheaper — longer tenure usually means more interest overall.</p>
      </div>
    </div>
  `;

  /* Wire input changes — re-render on every keystroke for instant feedback. */
  panel.querySelectorAll('[data-cmp]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const [side, key] = inp.dataset.cmp.split('.');
      let val = inp.value;
      if (inp.type === 'number') val = parseFloat(val) || 0;
      state.compare[side][key] = val;
      renderCompare(panel);
      // Restore focus after re-render
      const next = panel.querySelector(`[data-cmp="${side}.${key}"]`);
      if (next) {
        next.focus();
        next.setSelectionRange?.(next.value.length, next.value.length);
      }
    });
  });
}

/**
 * Render the per-loan input form for the Comparison panel.
 */
function compareForm(side, L) {
  const title = side === 'a' ? 'Loan A' : 'Loan B';
  const color = side === 'a' ? 'var(--sky)' : 'var(--moss)';
  return `
    <div class="rounded-xl border border-[var(--line)] p-4">
      <div class="flex items-center gap-2 mb-3">
        <span class="w-2 h-2 rounded-full" style="background:${color}"></span>
        <h3 class="font-display text-lg">${title}</h3>
      </div>
      <div class="space-y-3">
        <div class="field"><label>Principal (₹)</label><input type="number" data-cmp="${side}.principal" value="${L.principal}" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div class="field"><label>Rate (%)</label><input type="number" step="0.05" data-cmp="${side}.annualRate" value="${L.annualRate}" /></div>
          <div class="field"><label>Tenure (months)</label><input type="number" data-cmp="${side}.tenureMonths" value="${L.tenureMonths}" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="field"><label>Fee (%)</label><input type="number" step="0.1" data-cmp="${side}.processingFeePct" value="${L.processingFeePct}" /></div>
          <div class="field"><label>Loan type</label>
            <select data-cmp="${side}.loanType">
              ${Object.entries(LOAN_TYPES).map(([k, v]) =>
                `<option value="${k}" ${L.loanType === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Side-by-side cost breakdown card: Principal / Interest / Fee / Final Cost.
 */
function costBreakdownCard(title, L, sum, accent) {
  const bg = accent === 'sky' ? 'var(--sky-soft)' : 'var(--moss-soft)';
  const fg = accent === 'sky' ? 'var(--sky)'      : 'var(--moss)';
  const row = (k, v, strong) => `
    <div class="flex justify-between py-1.5 ${strong ? 'border-t border-[var(--line)] mt-1 pt-2' : ''}">
      <span class="text-sm text-[var(--ink-soft)]">${k}</span>
      <span class="num ${strong ? 'font-display text-lg' : ''}">${v}</span>
    </div>`;
  return `
    <div class="rounded-xl p-4 border" style="background:${bg}; border-color:${fg}33;">
      <div class="flex items-center gap-2 mb-2">
        <span class="w-2 h-2 rounded-full" style="background:${fg}"></span>
        <h4 class="font-display text-base">${title} — cost breakdown</h4>
      </div>
      ${row('Principal', fmtINR2(L.principal))}
      ${row('Interest', fmtINR2(sum.totalInterest))}
      ${row('Processing fee', fmtINR2(sum.processingFee))}
      ${row('Final cost', fmtINR2(sum.totalCost), true)}
    </div>
  `;
}
