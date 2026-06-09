/**
 * LoanLens — Chart rendering (Chart.js v4).
 *
 * Renders the donut (Principal vs Interest) and yearly bar chart
 * (outstanding balance trajectory) on the Dashboard panel.
 *
 * Depends on the global `Chart` symbol loaded via CDN in index.html.
 *
 * @module charts
 */

import { fmtINR2 } from './utils.js';

/* Keep references so we can destroy() before re-creating. */
let donutInstance = null;
let barInstance = null;

/**
 * Render or re-render both Dashboard charts.
 * @param {{ principal: number }} loan
 * @param {import('./calculators.js').LoanSummary} sum
 */
export function renderCharts(loan, sum) {
  renderDonut(loan, sum);
  renderBars(sum);
}

/**
 * Doughnut chart: Principal vs Interest, with rich tooltips
 * (amount + percent + plain-language description).
 */
function renderDonut(loan, sum) {
  const el = document.getElementById('donutChart');
  if (!el) return;
  if (donutInstance) donutInstance.destroy();
  const total = loan.principal + sum.totalInterest;
  const descriptions = {
    'Principal': 'the money you actually borrowed',
    'Interest':  'the price the lender charges over the tenure',
  };
  donutInstance = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['Principal', 'Interest'],
      datasets: [{
        data: [loan.principal, sum.totalInterest],
        backgroundColor: ['#2f6f57', '#b45309'],
        borderWidth: 0,
      }],
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 12,
          callbacks: {
            title: (items) => items[0].label,
            label: (c) => {
              const pct = (c.parsed / total) * 100;
              return [
                fmtINR2(c.parsed),
                `${pct.toFixed(1)}% of total repayment`,
                descriptions[c.label] || '',
              ];
            },
          },
        },
      },
    },
  });
}

/**
 * Bar chart: outstanding balance at the end of each calendar year.
 */
function renderBars(sum) {
  const el = document.getElementById('barChart');
  if (!el) return;
  if (barInstance) barInstance.destroy();
  const years = [];
  const labels = [];
  for (let i = 0; i < sum.rows.length; i += 12) {
    const chunk = sum.rows.slice(i, i + 12);
    const last = chunk[chunk.length - 1];
    labels.push('Year ' + (Math.floor(i / 12) + 1));
    years.push(last.closingBalance);
  }
  barInstance = new Chart(el, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Outstanding balance',
        data: years,
        backgroundColor: '#2b5d8a',
        borderRadius: 6,
      }],
    },
    options: {
      scales: {
        y: { ticks: { callback: (v) => '₹' + (v / 100000).toFixed(1) + 'L' } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => fmtINR2(c.parsed.y) } },
      },
    },
  });
}
