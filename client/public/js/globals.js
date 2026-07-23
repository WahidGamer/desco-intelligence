/* ==========================================================================
   DESCO PREPAID INTELLIGENCE DASHBOARD - FRONTEND APP LOGIC
   ========================================================================== */

let accountsSummaryData = [];
let activeFilter = 'all';
let consumptionChart = null;
let currentChartType = 'daily'; // 'daily' or 'monthly'
let currentChartAccountNo = null;

// DOM Elements
const elements = {
  liveClock: document.getElementById('liveClock'),
  globalSearch: document.getElementById('globalSearch'),
  btnRefreshAll: document.getElementById('btnRefreshAll'),
  refreshSpin: document.getElementById('refreshSpin'),
  accountsGrid: document.getElementById('accountsGrid'),
  totalBalanceVal: document.getElementById('totalBalanceVal'),
  totalAccountCount: document.getElementById('totalAccountCount'),
  criticalCountVal: document.getElementById('criticalCountVal'),
  criticalSubText: document.getElementById('criticalSubText'),
  totalMonthRechargeVal: document.getElementById('totalMonthRechargeVal'),
  highestConsumerName: document.getElementById('highestConsumerName'),
  highestConsumerVal: document.getElementById('highestConsumerVal'),
  avgDailyUsageVal: document.getElementById('avgDailyUsageVal'),
  visibleCardCount: document.getElementById('visibleCardCount'),
  criticalFilterBadge: document.getElementById('criticalFilterBadge'),
  chartAccountSelect: document.getElementById('chartAccountSelect'),
  btnDailyView: document.getElementById('btnDailyView'),
  btnMonthlyView: document.getElementById('btnMonthlyView'),
  dailyPickerGroup: document.getElementById('dailyPickerGroup'),
  monthlyPickerGroup: document.getElementById('monthlyPickerGroup'),
  dailyFromDay: document.getElementById('dailyFromDay'),
  dailyFromMonth: document.getElementById('dailyFromMonth'),
  dailyFromYear: document.getElementById('dailyFromYear'),
  dailyToDay: document.getElementById('dailyToDay'),
  dailyToMonth: document.getElementById('dailyToMonth'),
  dailyToYear: document.getElementById('dailyToYear'),
  monthlyFromMonth: document.getElementById('monthlyFromMonth'),
  monthlyFromYear: document.getElementById('monthlyFromYear'),
  monthlyToMonth: document.getElementById('monthlyToMonth'),
  monthlyToYear: document.getElementById('monthlyToYear'),
  historyModal: document.getElementById('historyModal'),
  btnCloseHistoryModal: document.getElementById('btnCloseHistoryModal'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  historyTableBody: document.getElementById('historyTableBody'),
  historySearch: document.getElementById('historySearch'),
  toastContainer: document.getElementById('toastContainer'),
  metricRechargedMonth: document.getElementById('metricRechargedMonth'),
  metricRechargedYear: document.getElementById('metricRechargedYear'),
  metricTotalCost: document.getElementById('metricTotalCost'),
  metricAvgCost: document.getElementById('metricAvgCost'),
  metricAvgMonthlyCost: document.getElementById('metricAvgMonthlyCost'),
  metricProjectedMonthlyCost: document.getElementById('metricProjectedMonthlyCost'),
  metricAvgYearlyCost: document.getElementById('metricAvgYearlyCost'),
  metricProjectedYearlyCost: document.getElementById('metricProjectedYearlyCost'),
  totalAvgMonthlyCostVal: document.getElementById('totalAvgMonthlyCostVal'),
  totalProjMonthlyCostVal: document.getElementById('totalProjMonthlyCostVal'),
  totalAvgYearlyCostVal: document.getElementById('totalAvgYearlyCostVal'),
  totalProjYearlyCostVal: document.getElementById('totalProjYearlyCostVal'),
  btnOpenBercCalc: document.getElementById('btnOpenBercCalc'),
  bercModal: document.getElementById('bercModal'),
  btnCloseBercModal: document.getElementById('btnCloseBercModal'),
  simCategory: document.getElementById('simCategory'),
  simUnits: document.getElementById('simUnits'),
  simLoad: document.getElementById('simLoad'),
  btnCalculateSim: document.getElementById('btnCalculateSim'),
  simResultOutput: document.getElementById('simResultOutput')
};

