/**
 * LoanLens — EMI Due Date Tracker panel.
 *
 * Shows the next 6 EMI dates with Upcoming/Paid/Overdue badges,
 * lets the user mark payments as paid (persisted to localStorage),
 * displays a progress bar and estimated-remaining figure, and
 * provides an optional browser-notification toggle.
 *
 * @module tracker
 */

import { fmtINR2, state, savePaidMonths } from './utils.js';
import { loanSummary } from './calculators.js';

/**
 * @param {HTMLElement} panel
 */
export function renderTracker(panel) {
  const L = state.loan;
  const sum = loanSummary(L);
  const today = new Date();

  /* Show the 6 EMIs starting from "today or later"; fall back to last 6. */
  let startIdx = sum.rows.findIndex((r) => r.dueDate >= today);
  if (startIdx < 0) startIdx = Math.max(0, sum.rows.length - 6);
  const visible = sum.rows.slice(startIdx, startIdx + 6);

  /** Determine status for a row at "today". */
  const statusOf = (row) => {
    if (state.paidMonths.includes(row.month)) return 'paid';
    if (row.dueDate < today) return 'overdue';
    return 'upcoming';
  };

  const totalPaid = state.paidMonths.length;
  const remaining = Math.max(0, L.tenureMonths - totalPaid);

  panel.innerHTML = `
    <div class="grid lg:grid-cols-3 gap-6">
      <div class="card p-5 sm:p-6 lg:col-span-2">
        <h2 class="font-display text-2xl">Next 6 EMI dates</h2>
        <p class="text-[var(--ink-soft)] mt-1">Mark each one paid as you go. We'll track your progress.</p>
        <ul class="mt-5 divide-y divide-[var(--line)] border border-[var(--line)] rounded-xl overflow-hidden">
          ${visible.map((row) => {
            const s = statusOf(row);
            const isPaid = s === 'paid';
            return `
            <li class="flex items-center justify-between gap-3 p-3 sm:p-4">
              <div>
                <div class="font-medium">Month ${row.month}</div>
                <div class="text-sm text-[var(--ink-soft)]">${row.dueDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
              <div class="text-right flex items-center gap-3">
                <div>
                  <div class="num font-medium">${fmtINR2(row.emi)}</div>
                  <div><span class="badge-status badge-${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</span></div>
                </div>
                <button data-month="${row.month}" class="mark-paid text-sm px-3 py-1.5 rounded-lg border border-[var(--line)] hover:bg-[var(--paper)]">
                  ${isPaid ? 'Undo' : 'Mark paid'}
                </button>
              </div>
            </li>`;
          }).join('')}
        </ul>
        <div class="mt-4">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" id="notifToggle" class="w-4 h-4" />
            Show browser reminders for upcoming EMIs (asks permission)
          </label>
        </div>
      </div>
      <aside class="card p-5 sm:p-6 space-y-4">
        <h2 class="font-display text-xl">Your progress</h2>
        <div class="stat">
          <div class="label">EMIs marked paid</div>
          <div class="value">${totalPaid} / ${L.tenureMonths}</div>
        </div>
        <div class="w-full bg-[var(--paper)] rounded-full h-2.5 border border-[var(--line)]">
          <div class="h-full rounded-full" style="background: var(--moss); width: ${Math.min(100, (totalPaid / L.tenureMonths) * 100)}%"></div>
        </div>
        <div class="stat">
          <div class="label">Estimated remaining</div>
          <div class="value num">${fmtINR2(remaining * sum.emi)}</div>
        </div>
        <p class="text-xs text-[var(--ink-soft)]">Reminders are local to your browser. If you clear site data, your paid history is reset.</p>
      </aside>
    </div>
  `;

  /* Mark / undo handlers */
  panel.querySelectorAll('.mark-paid').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = parseInt(btn.dataset.month, 10);
      const idx = state.paidMonths.indexOf(m);
      if (idx >= 0) state.paidMonths.splice(idx, 1);
      else state.paidMonths.push(m);
      savePaidMonths();
      renderTracker(panel);
    });
  });

  /* Browser-notification toggle (educational — fires sample after grant). */
  const tog = panel.querySelector('#notifToggle');
  tog.addEventListener('change', async () => {
    if (tog.checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification('Reminders enabled', {
          body: 'We will remind you about your next EMI date when you visit LoanLens.',
        });
        const next = sum.rows.find((r) => !state.paidMonths.includes(r.month) && r.dueDate >= new Date());
        if (next) {
          setTimeout(() => {
            new Notification('Upcoming EMI', {
              body: `${fmtINR2(next.emi)} due on ${next.dueDate.toLocaleDateString('en-IN')}`,
            });
          }, 1500);
        }
      } else {
        tog.checked = false;
      }
    }
  });
}
