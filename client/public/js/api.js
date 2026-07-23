const METRICS_CACHE_KEY = 'desco_metrics_cache_v1';

function loadCachedMetrics() {
  try {
    const raw = localStorage.getItem(METRICS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveCachedMetric(acc) {
  try {
    const cache = loadCachedMetrics();
    cache[acc.accountNo] = {
      rechargedThisMonth: acc.rechargedThisMonth,
      rechargedThisYear: acc.rechargedThisYear,
      last5DaysAvgCost: acc.last5DaysAvgCost,
      updatedAt: Date.now()
    };
    localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

// Fetch & Load Primary Dashboard Data
async function loadDashboardData() {
  elements.refreshSpin.classList.add('fa-spin');
  showShimmerGrid();

  try {
    const response = await fetch('/api/desco/summary');
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let errMsg = `Server returned HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) errMsg = parsed.error;
      } catch (e) {}
      throw new Error(errMsg);
    }
    const json = await response.json();

    if (!json.success || !json.data) {
      showToast('Failed to connect to DESCO servers', 'danger');
      return;
    }

    accountsSummaryData = json.data;
    accountsSummaryData.sort((a, b) => getSerialOrder(a.name) - getSerialOrder(b.name));

    // Hydrate from localStorage cache to prevent initial calculation jump/flicker
    const cache = loadCachedMetrics();
    accountsSummaryData.forEach(acc => {
      if (cache[acc.accountNo]) {
        if (cache[acc.accountNo].rechargedThisMonth !== undefined) acc.rechargedThisMonth = cache[acc.accountNo].rechargedThisMonth;
        if (cache[acc.accountNo].rechargedThisYear !== undefined) acc.rechargedThisYear = cache[acc.accountNo].rechargedThisYear;
        if (cache[acc.accountNo].last5DaysAvgCost) acc.last5DaysAvgCost = cache[acc.accountNo].last5DaysAvgCost;
      }
    });

    renderAccountsGrid();
    updatePortfolioSummary();
    populateChartAccountDropdown();

    fetchRechargeSummariesAsync();

    showToast('Meter balances updated cleanly', 'success');
  } catch (error) {
    showToast(`Error: ${error.message}`, 'danger');
  } finally {
    elements.refreshSpin.classList.remove('fa-spin');
  }
}

// Render Shimmer Skeletons while fetching
function showShimmerGrid() {
  elements.accountsGrid.innerHTML = Array(5).fill(0).map(() => `
    <div class="account-card glass-card">
      <div class="shimmer-box" style="width: 60%; height: 24px;"></div>
      <div class="shimmer-box" style="width: 100%; height: 60px; margin: 10px 0;"></div>
      <div class="shimmer-box" style="width: 80%; height: 20px;"></div>
    </div>
  `).join('');
}


// Asynchronous Parallel Fetching for "Recharged This Month / Year" and 5-Day Daily Cost
async function fetchRechargeSummariesAsync() {
  for (const acc of accountsSummaryData) {
    fetch(`/api/desco/recharge-summary/${acc.accountNo}`)
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          acc.rechargedThisMonth = res.rechargedThisMonth || 0;
          acc.rechargedThisYear = res.rechargedThisYear || 0;
          if (res.last5DaysAvgCost && res.last5DaysAvgCost > 0) {
            acc.last5DaysAvgCost = res.last5DaysAvgCost;
          }
          saveCachedMetric(acc);
          updateAccountDaysLeft(acc.accountNo);
          updatePortfolioSummary();
          if (acc.accountNo === currentChartAccountNo) {
            updateMeterProjections(currentChartAccountNo);
          }
        }
      })
      .catch(() => {});
  }
}



// Fetch & Render Consumption Chart
async function fetchAndRenderConsumption() {
  if (!currentChartAccountNo) return;

  let url = '';
  if (currentChartType === 'daily') {
    const fromDay = parseInt(elements.dailyFromDay.value);
    const fromMonth = parseInt(elements.dailyFromMonth.value);
    const fromYear = parseInt(elements.dailyFromYear.value);
    const toDay = parseInt(elements.dailyToDay.value);
    const toMonth = parseInt(elements.dailyToMonth.value);
    const toYear = parseInt(elements.dailyToYear.value);

    const from = `${fromYear}-${String(fromMonth + 1).padStart(2, '0')}-${String(fromDay).padStart(2, '0')}`;
    const to = `${toYear}-${String(toMonth + 1).padStart(2, '0')}-${String(toDay).padStart(2, '0')}`;
    url = `/api/desco/consumption/daily/${currentChartAccountNo}?dateFrom=${from}&dateTo=${to}`;
  } else {
    const fromMonth = parseInt(elements.monthlyFromMonth.value);
    const fromYear = parseInt(elements.monthlyFromYear.value);
    const toMonth = parseInt(elements.monthlyToMonth.value);
    const toYear = parseInt(elements.monthlyToYear.value);

    const from = `${fromYear}-${String(fromMonth + 1).padStart(2, '0')}`;
    const to = `${toYear}-${String(toMonth + 1).padStart(2, '0')}`;
    url = `/api/desco/consumption/monthly/${currentChartAccountNo}?monthFrom=${from}&monthTo=${to}`;
  }

  updateMeterProjections(currentChartAccountNo);

  try {
    const res = await fetch(url);
    const json = await res.json();

    let dataItems = [];
    if (json.success && Array.isArray(json.data)) {
      dataItems = json.data;
    }

    renderConsumptionChart(dataItems);
  } catch (err) {
    showToast(`Error loading consumption graph: ${err.message}`, 'danger');
  }
}

