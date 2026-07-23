function renderConsumptionChart(items) {
  const ctx = document.getElementById('consumptionChart').getContext('2d');

  if (consumptionChart) {
    consumptionChart.destroy();
  }

  const isDailyMode = currentChartType === 'daily';
  const unitSuffix = isDailyMode ? 'kWh/d' : 'kWh/mo';

  if (!items || items.length === 0) {
    if (elements.metricTotalCost) elements.metricTotalCost.textContent = '0.00 BDT';
    if (elements.metricAvgCost) elements.metricAvgCost.textContent = `0.00 ${isDailyMode ? 'BDT/day' : 'BDT/month'}`;
    if (elements.metricAvgMonthlyCost) elements.metricAvgMonthlyCost.textContent = '0.00 BDT/mo';
    return;
  }

  const rawUnits = items.map(i => parseFloat(i.unit || i.consumedUnit || i.consumptionUnit || i.totalUnit || 0));
  const rawTaka = items.map(i => parseFloat(i.consumedTaka || i.taka || i.amount || 0));

  const isUnitsCumulative = isDailyMode && rawUnits.length > 1 && rawUnits[rawUnits.length - 1] > rawUnits[0] && rawUnits[0] > 1000;
  const isTakaCumulative = isDailyMode && rawTaka.length > 1 && rawTaka[rawTaka.length - 1] > rawTaka[0];

  const chartLabels = [];
  const validValues = [];
  const validTakaValues = [];

  if (!isDailyMode) {
    // Monthly View: Each item is a per-month total
    items.forEach(i => {
      chartLabels.push(i.month || i.date || 'Month');
      validValues.push(parseFloat(i.consumedUnit || i.unit || 0));
      validTakaValues.push(parseFloat(i.consumedTaka || i.taka || 0));
    });
  } else {
    // Daily View: Calculate per-day price changes and per-day kWh consumption
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const dateLabel = item.date || item.consumptionDate || 'Date';

      if (i === 0) {
        if (!isUnitsCumulative) {
          chartLabels.push(dateLabel);
          validValues.push(rawUnits[0] > 1000 ? 0 : rawUnits[0]);
          validTakaValues.push(rawTaka[0]);
        }
        continue;
      }

      const prevItem = items[i - 1];
      const prevDate = new Date(prevItem.date || prevItem.consumptionDate);
      const currDate = new Date(item.date || item.consumptionDate);
      let diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
      if (isNaN(diffDays) || diffDays <= 0) diffDays = 1;

      let deltaU = isUnitsCumulative ? (rawUnits[i] - rawUnits[i - 1]) : rawUnits[i];
      if (deltaU < 0) deltaU = rawUnits[i];

      let deltaT = isTakaCumulative ? (rawTaka[i] - rawTaka[i - 1]) : rawTaka[i];
      if (deltaT <= 0 && deltaU > 0) {
        deltaT = deltaU * 8.8;
      }

      const dailyKWh = parseFloat((deltaU / diffDays).toFixed(2));
      const dailyCostBDT = parseFloat((deltaT / diffDays).toFixed(2));

      chartLabels.push(dateLabel);
      validValues.push(dailyKWh);
      validTakaValues.push(dailyCostBDT);
    }
  }

  const totalUnits = validValues.reduce((a, b) => a + b, 0);
  const totalTaka = validTakaValues.reduce((a, b) => a + b, 0);
  const avgUnits = validValues.length > 0 ? (totalUnits / validValues.length) : 0;
  const avgTaka = validTakaValues.length > 0 ? (totalTaka / validTakaValues.length) : 0;
  const monthlyEquivAvgTaka = isDailyMode ? (avgTaka * 30) : avgTaka;

  if (isDailyMode && validTakaValues.length > 0) {
    const last5 = validTakaValues.slice(-5);
    const last5Avg = last5.reduce((a, b) => a + b, 0) / last5.length;
    const currentAcc = accountsSummaryData.find(a => a.accountNo === currentChartAccountNo);
    if (currentAcc && last5Avg > 0) {
      currentAcc.last5DaysAvgCost = parseFloat(last5Avg.toFixed(2));
      updateAccountDaysLeft(currentChartAccountNo);
      updateMeterProjections(currentChartAccountNo);
    }
  }

  if (elements.metricTotalCost) elements.metricTotalCost.textContent = `${totalTaka.toFixed(2)} BDT`;
  if (elements.metricAvgCost) elements.metricAvgCost.textContent = `${avgTaka.toFixed(2)} ${isDailyMode ? 'BDT/day' : 'BDT/month'}`;
  if (elements.metricAvgMonthlyCost) elements.metricAvgMonthlyCost.textContent = `${monthlyEquivAvgTaka.toFixed(2)} BDT/mo`;

  // Determine monthly equivalent consumption baseline for slab lookup
  const currentMonthVal = validValues.length > 0 ? validValues[validValues.length - 1] : 0;
  const monthlyEquivAvg = isDailyMode ? (avgUnits * 30) : currentMonthVal;

  let activeSlabName = 'Lifeline (5.32 BDT)';
  let prevSlabVal = 0;
  let prevSlabRate = '0 kWh Baseline';
  let currSlabVal = 50;
  let currSlabRate = 'Lifeline: 5.32 Tk';
  let nextSlabVal = 75;
  let nextSlabRate = 'Slab 1: 6.18 Tk';

  if (monthlyEquivAvg <= 50) {
    activeSlabName = 'Lifeline (5.32 BDT)';
    prevSlabVal = 0;
    prevSlabRate = '0 kWh Baseline';
    currSlabVal = 50;
    currSlabRate = 'Lifeline: 5.32 Tk';
    nextSlabVal = 75;
    nextSlabRate = 'Slab 1: 6.18 Tk';
  } else if (monthlyEquivAvg <= 75) {
    activeSlabName = 'Slab 1 (6.18 BDT)';
    prevSlabVal = 50;
    prevSlabRate = 'Lifeline: 5.32 Tk';
    currSlabVal = 75;
    currSlabRate = 'Slab 1: 6.18 Tk';
    nextSlabVal = 200;
    nextSlabRate = 'Slab 2: 8.50 Tk';
  } else if (monthlyEquivAvg <= 200) {
    activeSlabName = 'Slab 2 (8.50 BDT)';
    prevSlabVal = 75;
    prevSlabRate = 'Slab 1: 6.18 Tk';
    currSlabVal = 200;
    currSlabRate = 'Slab 2: 8.50 Tk';
    nextSlabVal = 300;
    nextSlabRate = 'Slab 3: 9.10 Tk';
  } else if (monthlyEquivAvg <= 300) {
    activeSlabName = 'Slab 3 (9.10 BDT)';
    prevSlabVal = 200;
    prevSlabRate = 'Slab 2: 8.50 Tk';
    currSlabVal = 300;
    currSlabRate = 'Slab 3: 9.10 Tk';
    nextSlabVal = 400;
    nextSlabRate = 'Slab 4: 9.62 Tk';
  } else if (monthlyEquivAvg <= 400) {
    activeSlabName = 'Slab 4 (9.62 BDT)';
    prevSlabVal = 300;
    prevSlabRate = 'Slab 3: 9.10 Tk';
    currSlabVal = 400;
    currSlabRate = 'Slab 4: 9.62 Tk';
    nextSlabVal = 600;
    nextSlabRate = 'Slab 5: 15.01 Tk';
  } else if (monthlyEquivAvg <= 600) {
    activeSlabName = 'Slab 5 (15.01 BDT)';
    prevSlabVal = 400;
    prevSlabRate = 'Slab 4: 9.62 Tk';
    currSlabVal = 600;
    currSlabRate = 'Slab 5: 15.01 Tk';
    nextSlabVal = 800;
    nextSlabRate = 'Slab 6: 17.35 Tk';
  } else {
    activeSlabName = 'Slab 6 (17.35 BDT)';
    prevSlabVal = 600;
    prevSlabRate = 'Slab 5: 15.01 Tk';
    currSlabVal = 1000;
    currSlabRate = 'Slab 6: 17.35 Tk';
    nextSlabVal = null;
    nextSlabRate = 'Max Step Active';
  }

  // Scale limits: divide by 30 for Daily Mode
  const slabScale = isDailyMode ? (1 / 30) : 1;
  const prevSlabLimit = prevSlabVal * slabScale;
  const currSlabLimit = currSlabVal * slabScale;
  const nextSlabLimit = nextSlabVal !== null ? (nextSlabVal * slabScale) : null;
  const currentValDisplay = isDailyMode ? avgUnits : currentMonthVal;

  const marginToCurr = Math.max(0, currSlabLimit - currentValDisplay);
  const percentUsed = currSlabLimit > 0 ? Math.min(100, Math.max(0, (currentValDisplay / currSlabLimit) * 100)) : 100;
  const distanceToNext = nextSlabLimit !== null ? Math.max(0, nextSlabLimit - currentValDisplay) : 0;

  // Calculate percentage positions across the range [prevSlabLimit -> nextSlabLimit]
  const minLimit = prevSlabLimit;
  const maxLimit = (nextSlabLimit !== null && isFinite(nextSlabLimit)) ? nextSlabLimit : Math.max(currSlabLimit * 1.25, currentValDisplay * 1.1);
  const totalSpan = Math.max(0.001, maxLimit - minLimit);

  const currLimitPct = Math.min(100, Math.max(0, ((currSlabLimit - minLimit) / totalSpan) * 100));
  const userPct = Math.min(100, Math.max(0, ((currentValDisplay - minLimit) / totalSpan) * 100));

  // Update Proximity Tracker UI Elements
  const activeSlabBadgeEl = document.getElementById('activeSlabBadge');
  const slabViewModeTagEl = document.getElementById('slabViewModeTag');

  const prevSlabRateLabelEl = document.getElementById('prevSlabRateLabel');
  const prevSlabValDisplayEl = document.getElementById('prevSlabValDisplay');
  const prevSlabSubTextEl = document.getElementById('prevSlabSubText');

  const currSlabRateLabelEl = document.getElementById('currSlabRateLabel');
  const currSlabValDisplayEl = document.getElementById('currSlabValDisplay');
  const currSlabSubTextEl = document.getElementById('currSlabSubText');

  const nextSlabRateLabelEl = document.getElementById('nextSlabRateLabel');
  const nextSlabValDisplayEl = document.getElementById('nextSlabValDisplay');
  const nextSlabSubTextEl = document.getElementById('nextSlabSubText');

  const slabProgressFillEl = document.getElementById('slabProgressFill');
  const slabProgressStartEl = document.getElementById('slabProgressStart');
  const slabProgressCenterStatusEl = document.getElementById('slabProgressCenterStatus');
  const slabProgressEndEl = document.getElementById('slabProgressEnd');

  const linePrevEl = document.getElementById('linePrev');
  const lineCurrEl = document.getElementById('lineCurr');
  const lineUserEl = document.getElementById('lineUser');
  const lineNextEl = document.getElementById('lineNext');
  const userPinTagEl = document.getElementById('userPinTag');

  if (activeSlabBadgeEl) activeSlabBadgeEl.innerHTML = `<i class="fa-solid fa-bolt"></i> Active: ${activeSlabName}`;
  if (slabViewModeTagEl) slabViewModeTagEl.textContent = isDailyMode ? 'Daily View' : 'Monthly View';

  if (prevSlabRateLabelEl) prevSlabRateLabelEl.textContent = prevSlabRate;
  if (prevSlabValDisplayEl) prevSlabValDisplayEl.innerHTML = `${prevSlabLimit.toFixed(1)} <span class="unit">${unitSuffix}</span>`;
  if (prevSlabSubTextEl) prevSlabSubTextEl.textContent = prevSlabVal > 0 ? `Passed (-${(currentValDisplay - prevSlabLimit).toFixed(1)} ${unitSuffix})` : 'Baseline Start';

  if (currSlabRateLabelEl) currSlabRateLabelEl.textContent = currSlabRate;
  if (currSlabValDisplayEl) currSlabValDisplayEl.innerHTML = `${currSlabLimit.toFixed(1)} <span class="unit">${unitSuffix}</span>`;
  if (currSlabSubTextEl) currSlabSubTextEl.textContent = `${marginToCurr.toFixed(1)} ${unitSuffix} Buffer Left (${percentUsed.toFixed(1)}% Used)`;

  if (nextSlabRateLabelEl) nextSlabRateLabelEl.textContent = nextSlabRate;
  if (nextSlabValDisplayEl) nextSlabValDisplayEl.innerHTML = nextSlabLimit !== null ? `${nextSlabLimit.toFixed(1)} <span class="unit">${unitSuffix}</span>` : 'Max Slab';
  if (nextSlabSubTextEl) nextSlabSubTextEl.textContent = nextSlabLimit !== null ? `${distanceToNext.toFixed(1)} ${unitSuffix} to Next Step` : 'Highest Rate Step';

  // Position indicator lines & user fill
  if (linePrevEl) linePrevEl.style.left = '0%';
  if (lineCurrEl) lineCurrEl.style.left = `${currLimitPct.toFixed(1)}%`;
  if (lineUserEl) lineUserEl.style.left = `${userPct.toFixed(1)}%`;
  if (lineNextEl) lineNextEl.style.left = '100%';
  if (userPinTagEl) userPinTagEl.textContent = `You (${currentValDisplay.toFixed(1)})`;

  if (slabProgressFillEl) slabProgressFillEl.style.width = `${userPct.toFixed(1)}%`;
  if (slabProgressStartEl) slabProgressStartEl.textContent = `${prevSlabLimit.toFixed(1)} ${unitSuffix} (Prev)`;
  if (slabProgressCenterStatusEl) slabProgressCenterStatusEl.textContent = `${currentValDisplay.toFixed(1)} / ${currSlabLimit.toFixed(1)} ${unitSuffix} (${marginToCurr.toFixed(1)} ${unitSuffix} buffer left)`;
  if (slabProgressEndEl) slabProgressEndEl.textContent = nextSlabLimit !== null ? `${nextSlabLimit.toFixed(1)} ${unitSuffix} (Next)` : 'Max';

  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.6)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

  const takaGradient = ctx.createLinearGradient(0, 0, 0, 300);
  takaGradient.addColorStop(0, 'rgba(245, 158, 11, 0.7)');
  takaGradient.addColorStop(1, 'rgba(245, 158, 11, 0.1)');

  const annotations = {};

  if (prevSlabLimit > 0) {
    annotations.prevSlabLine = {
      type: 'line',
      scaleID: 'y',
      value: prevSlabLimit,
      yMin: prevSlabLimit,
      yMax: prevSlabLimit,
      borderColor: 'rgba(139, 92, 246, 0.85)',
      borderWidth: 2,
      borderDash: [5, 4]
    };
  }

  if (currSlabLimit > 0 && isFinite(currSlabLimit)) {
    annotations.currSlabLine = {
      type: 'line',
      scaleID: 'y',
      value: currSlabLimit,
      yMin: currSlabLimit,
      yMax: currSlabLimit,
      borderColor: 'rgba(16, 185, 129, 0.95)',
      borderWidth: 2,
      borderDash: [6, 4]
    };
  }

  if (nextSlabLimit !== null && isFinite(nextSlabLimit) && nextSlabLimit > 0) {
    annotations.nextSlabLine = {
      type: 'line',
      scaleID: 'y',
      value: nextSlabLimit,
      yMin: nextSlabLimit,
      yMax: nextSlabLimit,
      borderColor: 'rgba(245, 158, 11, 0.85)',
      borderWidth: 2,
      borderDash: [4, 4]
    };
  }

  const maxUnitVal = Math.max(...validValues, 0);
  const targetNextVal = (nextSlabLimit !== null && isFinite(nextSlabLimit)) ? nextSlabLimit : currSlabLimit;
  const suggestedYMax = Math.max(maxUnitVal * 1.15, targetNextVal * 1.15);

  consumptionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        {
          type: 'bar',
          label: isDailyMode ? 'Daily Consumed Energy (kWh)' : 'Monthly Consumed Energy (kWh)',
          data: validValues,
          backgroundColor: gradient,
          borderColor: '#3b82f6',
          borderWidth: 2,
          borderRadius: 6,
          hoverBackgroundColor: '#06b6d4',
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: isDailyMode ? 'Daily Cost / Price (BDT)' : 'Monthly Cost (BDT)',
          data: validTakaValues,
          backgroundColor: takaGradient,
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderRadius: 6,
          hoverBackgroundColor: '#fbbf24',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: true, labels: { color: '#9ca3af' } },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#f3f4f6',
          bodyColor: '#9ca3af',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.type === 'bar' && ctx.datasetIndex === 0) {
                return ` Energy: ${ctx.raw.toFixed(2)} kWh`;
              } else {
                return ` ${isDailyMode ? 'Daily Cost' : 'Monthly Cost'}: ${ctx.raw.toFixed(2)} BDT`;
              }
            }
          }
        },
        annotation: {
          annotations: annotations
        }
      },
      scales: {
        x: {
          ticks: { color: '#6b7280', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          suggestedMax: suggestedYMax,
          ticks: { color: '#6b7280', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.06)' },
          title: { display: true, text: 'Energy (kWh)', color: '#9ca3af' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          ticks: { color: '#f59e0b', font: { size: 11 } },
          grid: {
            drawOnChartArea: true,
            color: 'rgba(245, 158, 11, 0.15)',
            lineWidth: 1,
            borderDash: [3, 3]
          },
          title: { display: true, text: isDailyMode ? 'Daily Cost (BDT)' : 'Monthly Cost (BDT)', color: '#f59e0b' }
        }
      }
    }
  });
}


