// Serial Order Mapping & Helper
const SERIAL_ORDER = {
  '1st': 1,
  '2nd': 2,
  '3rd-1': 3,
  '3rd-2': 4,
  '4th': 5
};

function getSerialOrder(name) {
  if (!name) return 99;
  const cleanName = String(name).replace(/\s*tola/gi, '').trim();
  if (SERIAL_ORDER[cleanName]) return SERIAL_ORDER[cleanName];
  const n = cleanName.toLowerCase();
  if (n.includes('3rd-1') || n.includes('3-1')) return 3;
  if (n.includes('3rd-2') || n.includes('3-2')) return 4;
  if (n.includes('1st')) return 1;
  if (n.includes('2nd')) return 2;
  if (n.includes('3rd')) return 3;
  if (n.includes('4th')) return 5;
  return 99;
}


function getAccountSlabInfo(acc) {
  if (!acc) return { activeSlab: 'LT-A', units: 0 };
  const currentDay = new Date().getDate();
  const isComm = (acc.tariffName || '').toLowerCase().includes('comm') || 
                 (acc.tariffName || '').startsWith('E') ||
                 (acc.tariffName || '').toLowerCase().includes('lt-e');
  const category = isComm ? 'LT-E' : 'LT-A';
  const load = parseFloat(acc.sanctionLoad) || 2;

  const dailyCost = (acc.last5DaysAvgCost && acc.last5DaysAvgCost > 0)
    ? acc.last5DaysAvgCost
    : (acc.rechargedThisMonth ? (acc.rechargedThisMonth / currentDay) : 40);

  const monthBDT = (acc.rechargedThisMonth && acc.rechargedThisMonth > 0)
    ? acc.rechargedThisMonth
    : (dailyCost * currentDay);

  let estUnits = 0;
  if (typeof invertBercBill === 'function') {
    estUnits = invertBercBill(monthBDT, category, load);
  } else {
    estUnits = monthBDT / 8.5;
  }

  if (typeof calculateBercBill === 'function') {
    return calculateBercBill(category, estUnits, load);
  }
  return { activeSlab: category, units: estUnits };
}

// 5. Render Accounts Grid
function renderAccountsGrid() {
  const searchTerm = (elements.globalSearch.value || '').toLowerCase().trim();

  const filtered = accountsSummaryData.filter(acc => {
    const nameStr = (acc.name || '').toLowerCase();
    const accNoStr = (acc.accountNo || '').toLowerCase();
    const meterStr = (acc.meterNo || '').toLowerCase();
    const custStr = (acc.customerName || '').toLowerCase();

    const matchesSearch = nameStr.includes(searchTerm) ||
                          accNoStr.includes(searchTerm) ||
                          meterStr.includes(searchTerm) ||
                          custStr.includes(searchTerm);
    
    if (!matchesSearch) return false;

    if (activeFilter === 'critical') return acc.isCritical;
    if (activeFilter === 'safe') return !acc.isCritical;
    return true;
  });

  if (elements.visibleCardCount) elements.visibleCardCount.textContent = filtered.length;

  if (filtered.length === 0) {
    elements.accountsGrid.innerHTML = `
      <div class="glass-card" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem;"></i>
        <p>No account matches your search query or filter.</p>
      </div>
    `;
    return;
  }

  elements.accountsGrid.innerHTML = filtered.map((acc, index) => {
    const hasBalance = (acc.remainingBalance !== null && acc.remainingBalance !== undefined && !isNaN(acc.remainingBalance));
    const balanceText = hasBalance ? acc.remainingBalance.toFixed(2) : 'N/A';
    const isCritical = acc.isCritical;
    const balanceClass = isCritical ? 'critical-text' : 'safe-text';
    const cardClass = isCritical ? 'account-card glass-card critical' : 'account-card glass-card';
    const cleanName = (acc.name || 'Account').replace(/\s*tola/gi, '').trim();

    let estDaysBadge = '';
    if (hasBalance) {
      const dayOfMonth = new Date().getDate();
      const monthBurnRate = acc.rechargedThisMonth ? (acc.rechargedThisMonth / dayOfMonth) : 40;
      const realDailyCost = (acc.last5DaysAvgCost && acc.last5DaysAvgCost > 0) ? acc.last5DaysAvgCost : monthBurnRate;
      const estDays = Math.max(0, Math.ceil(acc.remainingBalance / (realDailyCost > 0 ? realDailyCost : 40)));
      const badgeClass = estDays < 3 ? 'red' : estDays < 7 ? 'yellow' : 'green';
      estDaysBadge = `
        <div class="days-badge-wrapper">
          <span class="days-badge ${badgeClass}" id="days-badge-${acc.accountNo}" onclick="toggleDaysLeftDropdown(event, '${acc.accountNo}')" title="Click to view calculation details">
            <i class="fa-solid fa-hourglass-half"></i> ~${estDays}d left <i class="fa-solid fa-chevron-down" style="font-size:0.6rem; opacity:0.8;"></i>
          </span>
          <div class="days-dropdown glass-card hidden" id="days-dropdown-${acc.accountNo}" onclick="event.stopPropagation()">
            <div class="days-dropdown-header">
              <span><i class="fa-solid fa-calculator"></i> Runout Estimation</span>
              <button class="close-btn" onclick="toggleDaysLeftDropdown(event, '${acc.accountNo}')">&times;</button>
            </div>
            <div class="days-dropdown-body" id="days-dropdown-body-${acc.accountNo}">
              <div class="days-row"><span>Remaining Balance:</span><strong>${acc.remainingBalance.toFixed(2)} BDT</strong></div>
              <div class="days-row"><span>Avg Daily Cost (Last 5 Days):</span><strong>${realDailyCost.toFixed(2)} BDT/day</strong></div>
              <div class="days-row highlight"><span>Estimated Runout:</span><strong>${estDays} Days</strong></div>
            </div>
          </div>
        </div>
      `;
    }

    const slabInfo = getAccountSlabInfo(acc);
    const currentRateLabel = slabInfo ? slabInfo.activeSlab : 'LT-A';


    return `
      <div class="${cardClass}" id="card-${acc.accountNo}">
        <div class="card-top">
          <div class="account-identity" style="width:100%;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem;">
              <h3 style="font-size:1.3rem; font-weight:800; color:var(--text-primary); font-family:var(--font-heading);">${cleanName}</h3>
              <div style="display:flex; align-items:center; gap:0.4rem;">
                ${estDaysBadge}
                <span class="pulse-dot ${isCritical ? 'red' : 'green'}" title="${isCritical ? 'Critical Low Balance' : 'Normal'}"></span>
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.35rem;">
              <span class="tariff-pill">${(acc.tariffName || 'A-Residential').replace('Category-A: ', '')}</span>
              <span class="slab-step-pill" id="slab-pill-${acc.accountNo}" title="Current BERC 2026 Rate Step"><i class="fa-solid fa-bolt"></i> ${currentRateLabel}</span>
            </div>

            <div class="meter-num">Account: <strong>${acc.accountNo}</strong></div>
          </div>
        </div>

        <div class="card-balance-box">
          <span class="balance-label">Remaining Balance</span>
          <div class="balance-main">
            <div class="balance-amount ${balanceClass}">
              ${balanceText} <span style="font-size: 0.95rem; font-weight:600; color: var(--text-secondary);">BDT</span>
            </div>
          </div>
          <div class="reading-time">
            <i class="fa-regular fa-clock"></i> Reading: ${(acc.readingTime || 'Just Now').split(' ')[0]}
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openConsumptionFor('${acc.accountNo}')">
            <i class="fa-solid fa-chart-line"></i> Usage
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openHistoryModal('${acc.accountNo}', '${cleanName.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-clock-rotate-left"></i> History
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateAccountDaysLeft(accountNo) {
  const acc = accountsSummaryData.find(a => a.accountNo === accountNo);
  if (!acc || acc.remainingBalance === null || acc.remainingBalance === undefined) return;

  const dayOfMonth = new Date().getDate();
  const monthBurnRate = acc.rechargedThisMonth ? (acc.rechargedThisMonth / dayOfMonth) : 40;
  const realDailyCost = (acc.last5DaysAvgCost && acc.last5DaysAvgCost > 0) ? acc.last5DaysAvgCost : monthBurnRate;
  const estDays = Math.max(0, Math.ceil(acc.remainingBalance / (realDailyCost > 0 ? realDailyCost : 40)));
  const badgeClass = estDays < 3 ? 'red' : estDays < 7 ? 'yellow' : 'green';

  const badgeEl = document.getElementById(`days-badge-${acc.accountNo}`);
  if (badgeEl) {
    badgeEl.className = `days-badge ${badgeClass}`;
    badgeEl.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> ~${estDays}d left <i class="fa-solid fa-chevron-down" style="font-size:0.6rem; opacity:0.8;"></i>`;
  }

  const slabPillEl = document.getElementById(`slab-pill-${acc.accountNo}`);
  if (slabPillEl) {
    const slabInfo = getAccountSlabInfo(acc);
    slabPillEl.innerHTML = `<i class="fa-solid fa-bolt"></i> ${slabInfo.activeSlab}`;
  }

  const dropdownBodyEl = document.getElementById(`days-dropdown-body-${acc.accountNo}`);

  if (dropdownBodyEl) {
    dropdownBodyEl.innerHTML = `
      <div class="days-row"><span>Remaining Balance:</span><strong>${acc.remainingBalance.toFixed(2)} BDT</strong></div>
      <div class="days-row"><span>Avg Daily Cost (Last 5 Days):</span><strong>${realDailyCost.toFixed(2)} BDT/day</strong></div>
      <div class="days-row highlight"><span>Estimated Runout:</span><strong>${estDays} Days</strong></div>
    `;
  }
}


// Update Highest Consumer Summary Card
function updateHighestConsumer() {
  if (!accountsSummaryData || accountsSummaryData.length === 0) return;

  let highestAcc = null;
  let maxVal = -1;

  accountsSummaryData.forEach(acc => {
    const val = acc.rechargedThisMonth || 0;
    if (val > maxVal) {
      maxVal = val;
      highestAcc = acc;
    }
  });

  if (highestAcc) {
    const cleanName = (highestAcc.name || 'Account').replace(/\s*tola/gi, '').trim().toUpperCase();
    if (elements.highestConsumerName) elements.highestConsumerName.textContent = cleanName;
    if (elements.highestConsumerVal) elements.highestConsumerVal.textContent = '';
  } else {
    if (elements.highestConsumerName) elements.highestConsumerName.textContent = '--';
    if (elements.highestConsumerVal) elements.highestConsumerVal.textContent = '';
  }
}

/**
 * Computes the statistical median of a numeric array.
 * Available for future chart outlier-filtering use.
 * @param {number[]} arr
 * @returns {number}
 */
function computeMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Default Seasonal Ratios for Bangladesh DESCO Residential Load Profile (Summer AC peak vs Winter low)
const DEFAULT_COHORT_SEASONAL = {
  0: 0.75, // Jan (Cool)
  1: 0.80, // Feb
  2: 0.95, // Mar (Spring)
  3: 1.15, // Apr (Summer Starts)
  4: 1.30, // May (Peak AC)
  5: 1.35, // Jun (Peak AC)
  6: 1.30, // Jul (Peak AC)
  7: 1.25, // Aug (Summer)
  8: 1.15, // Sep (Warm)
  9: 1.00, // Oct (Autumn)
  10: 0.85, // Nov
  11: 0.75  // Dec (Winter)
};

// Calculate Advanced Financial Metrics for an Account
function calculateAccountFinancials(acc) {
  const now = new Date();
  const currentDay = now.getDate() || 1;
  const currentMonthIdx = now.getMonth();
  const daysInCurrentMonth = new Date(now.getFullYear(), currentMonthIdx + 1, 0).getDate() || 30;
  const daysRemainingInMonth = Math.max(0, daysInCurrentMonth - currentDay);

  const isComm = (acc.tariffName || '').toLowerCase().includes('comm') || (acc.tariffName || '').startsWith('E');
  const cat = isComm ? 'LT-E' : 'LT-A';
  const load = parseFloat(acc.sanctionLoad) || 2;

  const rechargedThisMonth = acc.rechargedThisMonth || 0;

  let dailyCostBDT = (acc.last5DaysAvgCost && acc.last5DaysAvgCost > 0)
    ? acc.last5DaysAvgCost
    : (rechargedThisMonth > 0 ? (rechargedThisMonth / currentDay) : 40);

  let medianDailykWh = window.invertBercBill ? window.invertBercBill(dailyCostBDT, cat, load) / 30 : (dailyCostBDT / 8.5);
  if (medianDailykWh <= 0) medianDailykWh = 4;

  const currentMonthRunrateBDT = (rechargedThisMonth > 0) ? rechargedThisMonth : (dailyCostBDT * currentDay);
  const remainingMonthForecastBDT = (dailyCostBDT * daysRemainingInMonth);
  const projMonthlyCostBDT = currentMonthRunrateBDT + remainingMonthForecastBDT;
  const avgMonthlyCostBDT = dailyCostBDT * 30;

  const historyRecords = acc.monthlyHistory || [];
  const monthsCount = historyRecords.length;

  let seasonalIndex = { ...DEFAULT_COHORT_SEASONAL };
  let baselineMonthlykWh = medianDailykWh * 30;
  let growthFactor = 0.005;

  if (monthsCount >= 3) {
    const observedSum = historyRecords.reduce((s, r) => s + (r.kWh || (window.invertBercBill ? window.invertBercBill(r.cost || 0, cat, load) : (r.cost / 8.5))), 0);
    const observedAvgkWh = observedSum / monthsCount;
    if (observedAvgkWh > 0) baselineMonthlykWh = observedAvgkWh;

    const weight = Math.min(1, monthsCount / 12);
    const monthCounts = {};
    const monthSums = {};

    historyRecords.forEach(r => {
      if (!r.month) return;
      const mIdx = parseInt(r.month.split('-')[1], 10) - 1;
      const kwh = r.kWh || (window.invertBercBill ? window.invertBercBill(r.cost || 0, cat, load) : (r.cost / 8.5));
      monthSums[mIdx] = (monthSums[mIdx] || 0) + kwh;
      monthCounts[mIdx] = (monthCounts[mIdx] || 0) + 1;
    });

    for (let m = 0; m < 12; m++) {
      if (monthCounts[m] > 0) {
        const obsRatio = (monthSums[m] / monthCounts[m]) / (baselineMonthlykWh || 1);
        seasonalIndex[m] = (weight * obsRatio) + ((1 - weight) * DEFAULT_COHORT_SEASONAL[m]);
      }
    }
  }

  let avgYearlyCostBDT = 0;
  for (let m = 0; m < 12; m++) {
    const m_kWh = baselineMonthlykWh * seasonalIndex[m];
    const m_bill = window.calculateBercBill ? window.calculateBercBill(cat, m_kWh, load).totalBill : (m_kWh * 8.5);
    avgYearlyCostBDT += m_bill;
  }

  let projYearlyCostBDT = 0;
  for (let m = 0; m < 12; m++) {
    if (m < currentMonthIdx) {
      const pastRecord = historyRecords.find(r => r.month === `${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`);
      if (pastRecord && pastRecord.cost > 0) {
        projYearlyCostBDT += pastRecord.cost;
      } else {
        const m_kWh = baselineMonthlykWh * seasonalIndex[m];
        const m_bill = window.calculateBercBill ? window.calculateBercBill(cat, m_kWh, load).totalBill : (m_kWh * 8.5);
        projYearlyCostBDT += m_bill;
      }
    } else if (m === currentMonthIdx) {
      projYearlyCostBDT += projMonthlyCostBDT;
    } else {
      const t = m - currentMonthIdx;
      const m_kWh = baselineMonthlykWh * seasonalIndex[m] * Math.pow(1 + growthFactor, t);
      const m_bill = window.calculateBercBill ? window.calculateBercBill(cat, m_kWh, load).totalBill : (m_kWh * 8.5);
      projYearlyCostBDT += m_bill;
    }
  }

  const confidence = monthsCount >= 12 ? 'High' : monthsCount >= 3 ? 'Medium' : 'Low Baseline';

  return {
    dailyCostBDT,
    medianDailykWh,
    avgMonthlyCostBDT,
    projMonthlyCostBDT,
    avgYearlyCostBDT,
    projYearlyCostBDT,
    confidence
  };
}

// 7. Update Portfolio Executive Summary & Financial Projections
function updatePortfolioSummary() {
  let totalBalance = 0;
  let criticalCount = 0;
  let totalRechargedThisMonth = 0;
  let totalAvgMonthlyCost = 0;
  let totalProjMonthlyCost = 0;
  let totalAvgYearlyCost = 0;
  let totalProjYearlyCost = 0;

  accountsSummaryData.forEach(acc => {
    if (acc.remainingBalance !== null) {
      totalBalance += acc.remainingBalance;
    }
    if (acc.isCritical) {
      criticalCount++;
    }
    if (acc.rechargedThisMonth) {
      totalRechargedThisMonth += acc.rechargedThisMonth;
    }

    const fin = calculateAccountFinancials(acc);
    totalAvgMonthlyCost += fin.avgMonthlyCostBDT;
    totalProjMonthlyCost += fin.projMonthlyCostBDT;
    totalAvgYearlyCost += fin.avgYearlyCostBDT;
    totalProjYearlyCost += fin.projYearlyCostBDT;
  });

  if (elements.totalBalanceVal) {
    elements.totalBalanceVal.innerHTML = `${totalBalance.toFixed(2)} <span class="currency">BDT</span>`;
  }
  if (elements.totalMonthRechargeVal) {
    elements.totalMonthRechargeVal.innerHTML = `${totalRechargedThisMonth.toFixed(2)} <span class="currency">BDT</span>`;
  }

  if (elements.totalAvgMonthlyCostVal) {
    elements.totalAvgMonthlyCostVal.innerHTML = `${totalAvgMonthlyCost.toFixed(2)} <span class="currency">BDT</span>`;
  }
  if (elements.totalProjMonthlyCostVal) {
    elements.totalProjMonthlyCostVal.innerHTML = `${totalProjMonthlyCost.toFixed(2)} <span class="currency">BDT</span>`;
  }
  if (elements.totalAvgYearlyCostVal) {
    elements.totalAvgYearlyCostVal.innerHTML = `${totalAvgYearlyCost.toFixed(2)} <span class="currency">BDT</span>`;
  }
  if (elements.totalProjYearlyCostVal) {
    elements.totalProjYearlyCostVal.innerHTML = `${totalProjYearlyCost.toFixed(2)} <span class="currency">BDT</span>`;
  }

  updateHighestConsumer();
}

function updateMeterProjections(accountNo) {
  const acc = accountsSummaryData.find(a => a.accountNo === accountNo);
  if (!acc) return;
  
  const rechargedThisMonth = acc.rechargedThisMonth || 0;
  const rechargedThisYear = acc.rechargedThisYear || 0;

  const fin = calculateAccountFinancials(acc);

  if (elements.metricRechargedMonth) {
    elements.metricRechargedMonth.textContent = `${rechargedThisMonth.toFixed(2)} BDT`;
  }
  if (elements.metricRechargedYear) {
    elements.metricRechargedYear.textContent = `${rechargedThisYear.toFixed(2)} BDT`;
  }
  if (elements.metricAvgMonthlyCost) {
    elements.metricAvgMonthlyCost.textContent = `${fin.avgMonthlyCostBDT.toFixed(2)} BDT/mo`;
  }
  if (elements.metricProjectedMonthlyCost) {
    elements.metricProjectedMonthlyCost.textContent = `${fin.projMonthlyCostBDT.toFixed(2)} BDT`;
  }
  if (elements.metricAvgYearlyCost) {
    elements.metricAvgYearlyCost.textContent = `${fin.avgYearlyCostBDT.toFixed(2)} BDT/yr`;
  }
  if (elements.metricProjectedYearlyCost) {
    elements.metricProjectedYearlyCost.textContent = `${fin.projYearlyCostBDT.toFixed(2)} BDT (${fin.confidence})`;
  }
}

// Populate Target Account dropdown for chart
function populateChartAccountDropdown() {
  elements.chartAccountSelect.innerHTML = accountsSummaryData.map((acc, index) => {
    const accName = (acc.name || 'Account').replace(/\s*tola/gi, '').trim().toUpperCase();
    return `<option value="${acc.accountNo}">${accName} (${acc.accountNo})</option>`;
  }).join('');

  if (accountsSummaryData.length > 0 && !currentChartAccountNo) {
    currentChartAccountNo = accountsSummaryData[0].accountNo;
    elements.chartAccountSelect.value = currentChartAccountNo;
    fetchAndRenderConsumption();
  }
}

function openConsumptionFor(accountNo) {
  currentChartAccountNo = accountNo;
  elements.chartAccountSelect.value = accountNo;
  document.querySelector('.analytics-section').scrollIntoView({ behavior: 'smooth' });
  fetchAndRenderConsumption();
}


// Toast System
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
    <span>${message}</span>
  `;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

