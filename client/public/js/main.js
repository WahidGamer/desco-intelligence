// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initDateDefaults();
  setupEventListeners();
  loadDashboardData();
});

// 1. Live Clock
function initClock() {
  const update = () => {
    const now = new Date();
    elements.liveClock.textContent = now.toLocaleTimeString();
  };
  update();
  setInterval(update, 1000);
}

// 2. Default Date Pickers
function initDateDefaults() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

  // Populate day selects (1-31)
  const days = Array.from({length: 31}, (_, i) => i + 1);
  populateSelect(elements.dailyFromDay, days);
  populateSelect(elements.dailyToDay, days);

  // Populate month selects
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  populateSelect(elements.dailyFromMonth, months);
  populateSelect(elements.dailyToMonth, months);
  populateSelect(elements.monthlyFromMonth, months);
  populateSelect(elements.monthlyToMonth, months);

  // Populate year selects (2020-2030)
  const years = Array.from({length: 11}, (_, i) => 2020 + i);
  populateSelect(elements.dailyFromYear, years);
  populateSelect(elements.dailyToYear, years);
  populateSelect(elements.monthlyFromYear, years);
  populateSelect(elements.monthlyToYear, years);

  // Set default values for daily
  elements.dailyToDay.value = now.getDate();
  elements.dailyToMonth.value = now.getMonth();
  elements.dailyToYear.value = now.getFullYear();
  elements.dailyFromDay.value = thirtyDaysAgo.getDate();
  elements.dailyFromMonth.value = thirtyDaysAgo.getMonth();
  elements.dailyFromYear.value = thirtyDaysAgo.getFullYear();

  // Set default values for monthly
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  elements.monthlyToMonth.value = currentMonth;
  elements.monthlyToYear.value = currentYear;
  elements.monthlyFromMonth.value = 0; // January
  elements.monthlyFromYear.value = currentYear - 1;
}

function populateSelect(selectElement, options) {
  if (!selectElement) return;
  selectElement.innerHTML = '';
  options.forEach((opt, index) => {
    const option = document.createElement('option');
    option.value = typeof opt === 'number' ? opt : index;
    option.textContent = opt;
    selectElement.appendChild(option);
  });
}

// 3. Setup Event Listeners
function setupEventListeners() {
  elements.globalSearch.addEventListener('input', renderAccountsGrid);
  elements.btnRefreshAll.addEventListener('click', loadDashboardData);

  // Filter Buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      activeFilter = target.dataset.filter;
      renderAccountsGrid();
    });
  });

  // Chart View Toggle
  elements.btnDailyView.addEventListener('click', () => {
    elements.btnDailyView.classList.add('active');
    elements.btnMonthlyView.classList.remove('active');
    elements.dailyPickerGroup.classList.remove('hidden');
    elements.monthlyPickerGroup.classList.add('hidden');
    currentChartType = 'daily';
    fetchAndRenderConsumption();
  });

  elements.btnMonthlyView.addEventListener('click', () => {
    elements.btnMonthlyView.classList.add('active');
    elements.btnDailyView.classList.remove('active');
    elements.monthlyPickerGroup.classList.remove('hidden');
    elements.dailyPickerGroup.classList.add('hidden');
    currentChartType = 'monthly';
    fetchAndRenderConsumption();
  });

  // Target Account Selector for Chart
  elements.chartAccountSelect.addEventListener('change', (e) => {
    currentChartAccountNo = e.target.value;
    fetchAndRenderConsumption();
  });

  // Daily Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');

      const days = parseInt(target.dataset.days);
      const now = new Date();
      const from = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

      elements.dailyToDay.value = now.getDate();
      elements.dailyToMonth.value = now.getMonth();
      elements.dailyToYear.value = now.getFullYear();
      elements.dailyFromDay.value = from.getDate();
      elements.dailyFromMonth.value = from.getMonth();
      elements.dailyFromYear.value = from.getFullYear();

      fetchAndRenderConsumption();
    });
  });

  [elements.dailyFromDay, elements.dailyFromMonth, elements.dailyFromYear,
   elements.dailyToDay, elements.dailyToMonth, elements.dailyToYear,
   elements.monthlyFromMonth, elements.monthlyFromYear,
   elements.monthlyToMonth, elements.monthlyToYear].forEach(el => {
    if (el) el.addEventListener('change', fetchAndRenderConsumption);
  });

  // Monthly Presets (3M, 6M, 12M)
  document.querySelectorAll('.monthly-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.monthly-preset-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');

      const months = parseInt(target.dataset.months);
      const now = new Date();
      let fromMonth = now.getMonth() - (months - 1);
      let fromYear = now.getFullYear();
      while (fromMonth < 0) {
        fromMonth += 12;
        fromYear -= 1;
      }

      if (elements.monthlyToMonth) elements.monthlyToMonth.value = now.getMonth();
      if (elements.monthlyToYear) elements.monthlyToYear.value = now.getFullYear();
      if (elements.monthlyFromMonth) elements.monthlyFromMonth.value = fromMonth;
      if (elements.monthlyFromYear) elements.monthlyFromYear.value = fromYear;

      fetchAndRenderConsumption();
    });
  });

  // Modal Closers
  elements.btnCloseHistoryModal.addEventListener('click', () => elements.historyModal.classList.add('hidden'));
  elements.btnCloseBercModal.addEventListener('click', () => elements.bercModal.classList.add('hidden'));
  
  if (elements.btnOpenBercCalc) {
    elements.btnOpenBercCalc.addEventListener('click', () => {
      elements.bercModal.classList.remove('hidden');
      runBercSimulation();
    });
  }

  if (elements.btnCalculateSim) {
    elements.btnCalculateSim.addEventListener('click', runBercSimulation);
  }

  window.addEventListener('click', (e) => {
    if (e.target === elements.historyModal) elements.historyModal.classList.add('hidden');
    if (e.target === elements.bercModal) elements.bercModal.classList.add('hidden');
    if (!e.target.closest('.days-badge-wrapper')) {
      document.querySelectorAll('.days-dropdown').forEach(dropdown => {
        dropdown.classList.add('hidden');
      });
    }
  });

  // History Search
  elements.historySearch.addEventListener('input', filterHistoryTable);
  elements.btnExportCSV.addEventListener('click', exportRechargeHistoryToCSV);
}


// Toggle Days Left Popover Dropdown
function toggleDaysLeftDropdown(event, accountNo) {
  if (event) event.stopPropagation();
  const targetDropdown = document.getElementById(`days-dropdown-${accountNo}`);
  if (!targetDropdown) return;

  document.querySelectorAll('.days-dropdown').forEach(dropdown => {
    if (dropdown !== targetDropdown) {
      dropdown.classList.add('hidden');
    }
  });

  targetDropdown.classList.toggle('hidden');
}

// Make toggle global
window.toggleDaysLeftDropdown = toggleDaysLeftDropdown;
window.openConsumptionFor = openConsumptionFor;
window.openHistoryModal = openHistoryModal;
