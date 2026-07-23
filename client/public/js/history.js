// 9. Recharge History Modal & Export CSV
let currentHistoryRecords = [];

/**
 * Parses a raw recharge record into its financial components.
 * @param {object} r - Raw recharge record from API
 * @returns {{ total: number, vat: number, rent: number, demandCharge: number, net: number }}
 */
function parseChargeRecord(r) {
  const total = parseFloat(r.totalAmount || r.amount || 0);
  const vat = parseFloat(r.VAT || r.vat || r.tax || r.vatAmount || r.vat_amount || 0);

  let rent = 0;
  let demandCharge = 0;
  if (Array.isArray(r.chargeItems)) {
    r.chargeItems.forEach(item => {
      const name = (item.chargeItemName || item.name || '').toLowerCase();
      const amount = parseFloat(item.chargeAmount || item.amount || 0);
      if (name.includes('meter rent') || name.includes('meter-rent')) {
        rent = amount;
      } else if (name.includes('demand charge') || name.includes('demand-charge')) {
        demandCharge = amount;
      }
    });
  }

  const revenue = parseFloat(r.revenue || r.netAmount || r.net_amount || r.net || 0);
  const net = revenue > 0 ? revenue : (total - vat - rent - demandCharge);

  return { total, vat, rent, demandCharge, net };
}

async function openHistoryModal(accountNo, name) {
  elements.historyModal.classList.remove('hidden');
  document.getElementById('modalAccountName').textContent = `Recharge History: ${name.toUpperCase()}`;
  document.getElementById('modalAccountSub').textContent = `Account #: ${accountNo}`;

  elements.historyModal.dataset.accountNo = accountNo;
  elements.historyModal.dataset.accountName = name;

  await fetchAccountRechargeHistory();
}

async function fetchAccountRechargeHistory() {
  const accountNo = elements.historyModal.dataset.accountNo;

  elements.historyTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading recharge history (Last 1 Year)...</td></tr>`;

  try {
    const res = await fetch(`/api/desco/recharge-history/${accountNo}`);
    const json = await res.json();

    if (json.success && Array.isArray(json.data)) {
      currentHistoryRecords = json.data;
    } else {
      currentHistoryRecords = [];
    }
    renderHistoryTable();
  } catch (err) {
    showToast(`Error fetching history: ${err.message}`, 'danger');
  }
}

function renderHistoryTable() {
  const query = elements.historySearch.value.toLowerCase().trim();

  const filtered = currentHistoryRecords.filter(r => {
    const token = (r.tokenNo || r.token || '').toLowerCase();
    const amount = (r.totalAmount || r.amount || '').toString();
    return token.includes(query) || amount.includes(query);
  });

  if (filtered.length === 0) {
    elements.historyTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted);">No recharge records found for selected period.</td></tr>`;
    return;
  }

  elements.historyTableBody.innerHTML = filtered.map(r => {
    const { total, vat, rent, net } = parseChargeRecord(r);
    return `
    <tr>
      <td><strong>${r.rechargeDate || r.payDate || r.date || 'N/A'}</strong></td>
      <td class="text-emerald"><strong>${total.toFixed(2)} BDT</strong></td>
      <td>${net > 0 ? net.toFixed(2) : 'N/A'}</td>
      <td>${vat > 0 ? vat.toFixed(2) : '0.00'}</td>
      <td>${rent > 0 ? rent.toFixed(2) : '0.00'}</td>
      <td style="font-family:monospace; color:var(--accent-cyan);">${r.tokenNo || r.token || r.tokenNumber || 'N/A'}</td>
    </tr>
    `;
  }).join('');
}

function filterHistoryTable() {
  renderHistoryTable();
}

function exportRechargeHistoryToCSV() {
  if (!currentHistoryRecords || currentHistoryRecords.length === 0) {
    showToast('No recharge records to export', 'danger');
    return;
  }

  const accountNo = elements.historyModal.dataset.accountNo;
  const name = elements.historyModal.dataset.accountName;

  const headers = ['Pay Date', 'Total Amount (BDT)', 'Net Amount', 'VAT', 'Meter Rent', 'Token Number'];
  const rows = currentHistoryRecords.map(r => {
    const { total, vat, rent, net } = parseChargeRecord(r);
    return [
      `"${r.rechargeDate || r.payDate || r.date || ''}"`,
      `"${total.toFixed(2)}"`,
      `"${net > 0 ? net.toFixed(2) : ''}"`,
      `"${vat > 0 ? vat.toFixed(2) : ''}"`,
      `"${rent > 0 ? rent.toFixed(2) : ''}"`,
      `"${r.tokenNo || r.token || r.tokenNumber || ''}"`
    ];
  });

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);

  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `DESCO_Recharge_History_${name}_${accountNo}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Recharge history CSV exported!', 'success');
}

