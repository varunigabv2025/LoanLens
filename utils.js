/**
 * LoanLens — Shared utilities, constants, formatters, and app state.
 *
 * @module utils
 */

/* ============================================================
 * CONSTANTS
 * ============================================================ */

/**
 * Loan-type metadata used by validation, alerts, and risk scoring.
 * Rate ranges and tenure ceilings reflect typical Indian market values.
 * @type {Record<string, { label: string, rateMin: number, rateMax: number, tenureMaxMonths: number }>}
 */
export const LOAN_TYPES = {
  home:      { label: 'Home Loan',      rateMin: 6,  rateMax: 9,  tenureMaxMonths: 360 },
  personal:  { label: 'Personal Loan',  rateMin: 9,  rateMax: 14, tenureMaxMonths: 84  },
  vehicle:   { label: 'Vehicle Loan',   rateMin: 8,  rateMax: 12, tenureMaxMonths: 96  },
  education: { label: 'Education Loan', rateMin: 6,  rateMax: 8,  tenureMaxMonths: 180 },
  gold:      { label: 'Gold Loan',      rateMin: 10, rateMax: 15, tenureMaxMonths: 36  },
};

/** Pre-loaded sample loan so first-time visitors see something interesting. */
export const SAMPLE_LOAN = {
  principal: 2500000,
  annualRate: 8.5,
  tenureMonths: 240,
  loanType: 'home',
  processingFeePct: 0.5,
  prepayment: true,
  startDate: '2026-07-01',
};

/* ============================================================
 * APP STATE  (small, deliberately mutable singleton)
 * ============================================================ */

export const state = {
  loan: { ...SAMPLE_LOAN },
  paidMonths: JSON.parse(localStorage.getItem('loanlens.paidMonths') || '[]'),
  compare: {
    a: { principal: 1000000, annualRate: 11,  tenureMonths: 60, processingFeePct: 1, loanType: 'personal' },
    b: { principal: 1000000, annualRate: 9.5, tenureMonths: 60, processingFeePct: 2, loanType: 'personal' },
  },
};

/** Persist tracker state to localStorage. */
export function savePaidMonths() {
  localStorage.setItem('loanlens.paidMonths', JSON.stringify(state.paidMonths));
}

/* ============================================================
 * FORMATTERS  (Indian numbering, en-IN locale)
 * ============================================================ */

const _inr0 = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const _inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** Whole-rupee Indian currency (e.g. ₹5,00,000). */
export const fmtINR  = (n) => isFinite(n) ? _inr0.format(n) : '₹0';
/** Two-decimal Indian currency (e.g. ₹12,150.42). */
export const fmtINR2 = (n) => isFinite(n) ? _inr2.format(n) : '₹0.00';
/** Backwards-compat alias used in some templates. */
export const fmtINRFull = fmtINR2;
/** Percent with N decimals (no rounding during computation, only display). */
export const fmtPct = (n, d = 2) => `${(Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d)}%`;

/* ============================================================
 * DOWNLOAD HELPERS  (CSV / PDF triggers)
 * ============================================================ */

/** YYYY-MM-DD stamp for filenames. */
export const todayStamp = () => new Date().toISOString().slice(0, 10);

/**
 * Cross-browser blob download. Falls back to `msSaveOrOpenBlob` on legacy IE/Edge.
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerDownload(blob, filename) {
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 200);
}
