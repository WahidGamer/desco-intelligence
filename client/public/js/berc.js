// 11. BERC 2026 Official Tariff Engine & Bill Simulator
function calculateBercBill(category, units, load = 2) {
  units = Math.max(0, parseFloat(units) || 0);
  load = Math.max(0.5, parseFloat(load) || 1);

  let energyCharge = 0;
  let demandRate = 42;
  let activeSlab = 'N/A';
  let slabDetails = [];

  if (category === 'LT-A') {
    demandRate = 42;
    if (units <= 50) {
      energyCharge = units * 5.32;
      activeSlab = 'Lifeline (5.32 BDT)';
      slabDetails.push({ name: 'Lifeline (0-50)', units, rate: 5.32, total: energyCharge });
    } else {
      let u = units;
      const s1 = Math.min(u, 75);
      if (s1 > 0) {
        const cost = s1 * 6.18;
        energyCharge += cost;
        slabDetails.push({ name: 'Slab 1 (0-75)', units: s1, rate: 6.18, total: cost });
        u -= s1;
      }
      if (u > 0) {
        const s2 = Math.min(u, 125);
        const cost = s2 * 8.50;
        energyCharge += cost;
        slabDetails.push({ name: 'Slab 2 (76-200)', units: s2, rate: 8.50, total: cost });
        u -= s2;
      }
      if (u > 0) {
        const s3 = Math.min(u, 100);
        const cost = s3 * 9.10;
        energyCharge += cost;
        slabDetails.push({ name: 'Slab 3 (201-300)', units: s3, rate: 9.10, total: cost });
        u -= s3;
      }
      if (u > 0) {
        const s4 = Math.min(u, 100);
        const cost = s4 * 9.62;
        energyCharge += cost;
        slabDetails.push({ name: 'Slab 4 (301-400)', units: s4, rate: 9.62, total: cost });
        u -= s4;
      }
      if (u > 0) {
        const s5 = Math.min(u, 200);
        const cost = s5 * 15.01;
        energyCharge += cost;
        slabDetails.push({ name: 'Slab 5 (401-600)', units: s5, rate: 15.01, total: cost });
        u -= s5;
      }
      if (u > 0) {
        const cost = u * 17.35;
        energyCharge += cost;
        slabDetails.push({ name: 'Slab 6 (>600)', units: u, rate: 17.35, total: cost });
      }

      if (units <= 75) activeSlab = 'Slab 1 (6.18 BDT)';
      else if (units <= 200) activeSlab = 'Slab 2 (8.50 BDT)';
      else if (units <= 300) activeSlab = 'Slab 3 (9.10 BDT)';
      else if (units <= 400) activeSlab = 'Slab 4 (9.62 BDT)';
      else if (units <= 600) activeSlab = 'Slab 5 (15.01 BDT)';
      else activeSlab = 'Slab 6 (17.35 BDT)';
    }
  } else if (category === 'LT-E') {
    demandRate = 90;
    energyCharge = units * 15.36;
    activeSlab = 'Flat (15.36 BDT)';
    slabDetails.push({ name: 'Flat Commercial', units, rate: 15.36, total: energyCharge });
  } else if (category === 'LT-C1') {
    demandRate = 88;
    energyCharge = units * 12.73;
    activeSlab = 'Flat (12.73 BDT)';
    slabDetails.push({ name: 'Small Industry', units, rate: 12.73, total: energyCharge });
  }

  const demandCharge = load * demandRate;
  const grossSubTotal = energyCharge + demandCharge;
  const prepaidRebate = grossSubTotal * 0.005;
  const netBill = grossSubTotal - prepaidRebate;
  const vat = netBill * 0.05;
  const totalBill = netBill + vat;

  return {
    units,
    energyCharge,
    demandCharge,
    grossSubTotal,
    prepaidRebate,
    netBill,
    vat,
    totalBill,
    activeSlab,
    slabDetails
  };
}

function runBercSimulation() {
  if (!elements.simResultOutput) return;

  const cat = (elements.simCategory && elements.simCategory.value) ? elements.simCategory.value : 'LT-A';
  const units = parseFloat(elements.simUnits.value) || 0;
  const load = parseFloat(elements.simLoad.value) || 1;

  const res = calculateBercBill(cat, units, load);

  let slabsHTML = res.slabDetails.map(s => `
    <div style="font-size:0.8rem; display:flex; justify-content:space-between; margin-bottom:3px; color:var(--text-secondary);">
      <span>${s.name}: ${s.units.toFixed(1)} kWh @ ${s.rate.toFixed(2)} Tk</span>
      <span style="font-family:monospace;">${s.total.toFixed(2)} BDT</span>
    </div>
  `).join('');

  elements.simResultOutput.innerHTML = `
    <div class="sim-res-row"><label>Active Step Slab</label><val class="text-emerald">${res.activeSlab}</val></div>
    <div style="background:rgba(0,0,0,0.25); padding:0.6rem; border-radius:8px; margin: 0.6rem 0; border: 1px solid var(--border-glass);">
      <div style="font-size:0.75rem; color:var(--accent-cyan); margin-bottom:4px; font-weight:700;">SLAB STEP BREAKDOWN:</div>
      ${slabsHTML}
    </div>
    <div class="sim-res-row"><label>Energy Charge Subtotal</label><val>${res.energyCharge.toFixed(2)} BDT</val></div>
    <div class="sim-res-row"><label>Demand Charge (${load} kW @ ${res.demandCharge/load} Tk)</label><val>${res.demandCharge.toFixed(2)} BDT</val></div>
    <div class="sim-res-row"><label>Prepaid Meter Rebate (-0.5%)</label><val class="text-emerald">-${res.prepaidRebate.toFixed(2)} BDT</val></div>
    <div class="sim-res-row"><label>Government VAT (+5%)</label><val>${res.vat.toFixed(2)} BDT</val></div>
    <div class="sim-res-row" style="border-top: 2px solid var(--accent-blue); padding-top:0.6rem; margin-top:0.4rem;">
      <label style="color:var(--text-primary); font-weight:700;">Total Net Bill</label>
      <val class="text-emerald" style="font-size:1.25rem; font-weight:800;">${res.totalBill.toFixed(2)} BDT</val>
    </div>
  `;
}

function invertBercBill(totalNetBill, category = 'LT-A', load = 2) {
  totalNetBill = Math.max(0, parseFloat(totalNetBill) || 0);
  load = Math.max(0.5, parseFloat(load) || 1);

  let demandRate = 42;
  if (category === 'LT-E') demandRate = 90;
  if (category === 'LT-C1') demandRate = 88;

  const grossSubTotal = totalNetBill / 1.04475;
  const demandCharge = load * demandRate;
  let energyCharge = Math.max(0, grossSubTotal - demandCharge);

  if (category === 'LT-E') return energyCharge / 15.36;
  if (category === 'LT-C1') return energyCharge / 12.73;

  if (energyCharge <= 266) {
    return energyCharge / 5.32;
  } else if (energyCharge <= 463.5) {
    return energyCharge / 6.18;
  } else if (energyCharge <= 1526) {
    return 75 + (energyCharge - 463.5) / 8.50;
  } else if (energyCharge <= 2436) {
    return 200 + (energyCharge - 1526) / 9.10;
  } else if (energyCharge <= 3398) {
    return 300 + (energyCharge - 2436) / 9.62;
  } else if (energyCharge <= 6400) {
    return 400 + (energyCharge - 3398) / 15.01;
  } else {
    return 600 + (energyCharge - 6400) / 17.35;
  }
}

window.calculateBercBill = calculateBercBill;
window.invertBercBill = invertBercBill;
window.runBercSimulation = runBercSimulation;
