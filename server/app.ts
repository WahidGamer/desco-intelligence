import express from 'express';
import cors from 'cors';
import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';

const app = express();
const CONFIG_FILE = path.join(process.cwd(), 'config.ini');

app.use(cors());
app.use(express.json());

// DESCO Base API URL
const DESCO_API_BASE = 'https://prepaid.desco.org.bd/api/tkdes/customer';

// Helper to parse config.ini
function parseConfig(): Record<string, string> {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.warn('[Config] config.ini not found. No accounts configured.');
    return {};
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const accounts: Record<string, string> = {};
    let inAccountSection = false;

    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inAccountSection = trimmed.toUpperCase() === '[ACCOUNT]';
        return;
      }
      if (inAccountSection && trimmed && !trimmed.startsWith(';')) {
        const parts = trimmed.split('=');
        if (parts.length === 2) {
          const name = parts[0].trim();
          const number = parts[1].trim();
          if (name && number) {
            accounts[name] = number;
          }
        }
      }
    });

    return accounts;
  } catch (err) {
    console.error('[Config] Failed to read config.ini:', err);
    return {};
  }
}

// Helper for HTTP requests with SSL agent
const descoClient = axios.create({
  baseURL: DESCO_API_BASE,
  timeout: 15000,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  }
});

// 1. Get Configured Accounts
app.get('/api/accounts', (_req, res) => {
  try {
    const accounts = parseConfig();
    res.json({ success: true, accounts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Fetch Instant Summary (Balance & Basic Info) for all configured accounts
app.get('/api/desco/summary', async (_req, res) => {
  try {
    const accountsMap = parseConfig();
    const accountEntries = Object.entries(accountsMap);

    const results = await Promise.all(
      accountEntries.map(async ([name, accountNo]) => {
        try {
          const [balanceRes, infoRes] = await Promise.allSettled([
            descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`),
            descoClient.get(`/getCustomerInfo?accountNo=${accountNo}&meterNo=`)
          ]);

          let balanceData: any = null;
          if (balanceRes.status === 'fulfilled' && balanceRes.value.data) {
            balanceData = balanceRes.value.data.data || balanceRes.value.data;
          }

          let infoData: any = null;
          if (infoRes.status === 'fulfilled' && infoRes.value.data) {
            infoData = infoRes.value.data.data || infoRes.value.data;
          }

          let remainingBalance: number | null = null;
          let readingTime: string | null = null;

          if (balanceData && (balanceData.balance !== undefined || balanceData.remainingBalance !== undefined)) {
            const rawBal = balanceData.balance !== undefined ? balanceData.balance : balanceData.remainingBalance;
            remainingBalance = parseFloat(rawBal);
            readingTime = balanceData.readingTime || balanceData.lastReadingDate || null;
          }

          return {
            name,
            accountNo,
            meterNo: balanceData?.meterNo || infoData?.meterNo || 'N/A',
            customerName: infoData?.customerName || infoData?.name || balanceData?.customerName || name.toUpperCase(),
            remainingBalance,
            readingTime,
            tariffName: infoData?.tariffSolution || infoData?.tariffName || infoData?.tariff || 'A-Residential',
            sanctionLoad: infoData?.sanctionLoad || infoData?.sanctionedLoad || 'N/A',
            address: infoData?.installationAddress || infoData?.address || 'N/A',
            isCritical: remainingBalance !== null && remainingBalance < 100,
            status: 'success'
          };
        } catch (err: any) {
          return {
            name,
            accountNo,
            meterNo: 'N/A',
            customerName: name.toUpperCase(),
            remainingBalance: null,
            readingTime: null,
            tariffName: 'A-Residential',
            sanctionLoad: 'N/A',
            address: 'N/A',
            isCritical: false,
            status: 'error',
            error: err.message
          };
        }
      })
    );

    res.json({ success: true, timestamp: new Date().toISOString(), data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function computeLast5DaysAvgCost(items: any[]): number | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const rawUnits = items.map(i => parseFloat(i.unit || i.consumedUnit || i.consumptionUnit || i.totalUnit || 0));
  const rawTaka = items.map(i => parseFloat(i.consumedTaka || i.taka || i.amount || 0));

  const isUnitsCumulative = rawUnits.length > 1 && rawUnits[rawUnits.length - 1] > rawUnits[0] && rawUnits[0] > 1000;
  const isTakaCumulative = rawTaka.length > 1 && rawTaka[rawTaka.length - 1] > rawTaka[0];

  const dailyCosts: number[] = [];

  for (let i = 0; i < items.length; i++) {
    if (i === 0) {
      if (!isUnitsCumulative && rawTaka[0] > 0) {
        dailyCosts.push(rawTaka[0]);
      }
      continue;
    }

    const prevItem = items[i - 1];
    const prevDate = new Date(prevItem.date || prevItem.consumptionDate || prevItem.readingDate || 0);
    const currDate = new Date(items[i].date || items[i].consumptionDate || items[i].readingDate || 0);
    let diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
    if (isNaN(diffDays) || diffDays <= 0) diffDays = 1;

    let deltaU = isUnitsCumulative ? (rawUnits[i] - rawUnits[i - 1]) : rawUnits[i];
    if (deltaU < 0) deltaU = rawUnits[i];

    let deltaT = isTakaCumulative ? (rawTaka[i] - rawTaka[i - 1]) : rawTaka[i];
    if (deltaT <= 0 && deltaU > 0) {
      deltaT = deltaU * 8.8;
    }

    const dailyCostBDT = deltaT / diffDays;
    if (dailyCostBDT > 0 && dailyCostBDT < 5000) {
      dailyCosts.push(dailyCostBDT);
    }
  }

  const last5 = dailyCosts.slice(-5);
  if (last5.length > 0) {
    const sum = last5.reduce((a, b) => a + b, 0);
    return parseFloat((sum / last5.length).toFixed(2));
  }
  return null;
}

// 3. Asynchronous Lazy Loading for "Recharged This Month", "Recharged This Year", and 5-Day Daily Cost
app.get('/api/desco/recharge-summary/:accountNo', async (req, res) => {
  const { accountNo } = req.params;
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYearMonthPrefix = `${currentYear}-${currentMonth}`;

    let meterNo = '';
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || '';
      }
    } catch (_e) {}

    const yearStart = `${currentYear}-01-01`;
    const todayStr = now.toISOString().split('T')[0];
    const tenDaysAgo = new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const [historyRes, dailyRes] = await Promise.allSettled([
      descoClient.get(`/getRechargeHistory?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${yearStart}&dateTo=${todayStr}`),
      descoClient.get(`/getCustomerDailyConsumption?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${tenDaysAgo}&dateTo=${todayStr}`)
    ]);

    let records: any[] = [];
    if (historyRes.status === 'fulfilled' && historyRes.value?.data) {
      const data = historyRes.value.data;
      if (Array.isArray(data.data)) {
        records = data.data;
      } else if (Array.isArray(data)) {
        records = data;
      }
    }

    let last5DaysAvgCost: number | null = null;
    if (dailyRes.status === 'fulfilled' && dailyRes.value?.data) {
      const rawDaily = dailyRes.value.data.data || dailyRes.value.data || [];
      last5DaysAvgCost = computeLast5DaysAvgCost(rawDaily);
    }

    let rechargedThisMonth = 0;
    let rechargedThisYear = 0;
    let monthTxCount = 0;
    let yearTxCount = 0;

    records.forEach(item => {
      const amount = parseFloat(item.totalAmount || item.amount || item.rechargeAmount || 0);
      const dateStr = item.payDate || item.rechargeDate || item.date || '';

      if (dateStr.startsWith(String(currentYear))) {
        rechargedThisYear += amount;
        yearTxCount++;
      }
      if (dateStr.startsWith(currentYearMonthPrefix)) {
        rechargedThisMonth += amount;
        monthTxCount++;
      }
    });

    res.json({
      success: true,
      accountNo,
      rechargedThisMonth,
      rechargedThisYear,
      last5DaysAvgCost,
      monthTxCount,
      yearTxCount,
      recordCount: records.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      accountNo,
      rechargedThisMonth: 0,
      rechargedThisYear: 0,
      last5DaysAvgCost: null,
      error: error.message
    });
  }
});

// 4. Detailed Customer Info
app.get('/api/desco/customer-info/:accountNo', async (req, res) => {
  const { accountNo } = req.params;
  try {
    const response = await descoClient.get(`/getCustomerInfo?accountNo=${accountNo}&meterNo=`);
    res.json({ success: true, data: response.data?.data || response.data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Full Recharge History with Date Filters
app.get('/api/desco/recharge-history/:accountNo', async (req, res) => {
  const { accountNo } = req.params;
  const { dateFrom, dateTo } = req.query;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - (364 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  const defaultTo = now.toISOString().split('T')[0];

  const from = (dateFrom as string) || defaultFrom;
  const to = (dateTo as string) || defaultTo;

  try {
    let meterNo = '';
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || '';
      }
    } catch (_e) {}

    const response = await descoClient.get(
      `/getRechargeHistory?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${from}&dateTo=${to}`
    );
    res.json({ success: true, data: response.data?.data || response.data || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Daily Consumption Units
app.get('/api/desco/consumption/daily/:accountNo', async (req, res) => {
  const { accountNo } = req.params;
  const { dateFrom, dateTo } = req.query;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  const defaultTo = now.toISOString().split('T')[0];

  const from = (dateFrom as string) || defaultFrom;
  const to = (dateTo as string) || defaultTo;

  try {
    let meterNo = '';
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || '';
      }
    } catch (_e) {}

    const response = await descoClient.get(
      `/getCustomerDailyConsumption?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${from}&dateTo=${to}`
    );
    res.json({ success: true, data: response.data?.data || response.data || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Monthly Consumption Units
app.get('/api/desco/consumption/monthly/:accountNo', async (req, res) => {
  const { accountNo } = req.params;
  const { monthFrom, monthTo } = req.query;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

  const to = (monthTo as string) || `${currentYear}-${currentMonth}`;

  let from = monthFrom as string;
  if (!from) {
    const toDate = new Date(`${to}-01`);
    const fromDate = new Date(toDate.getFullYear() - 1, toDate.getMonth() + 1, 1);
    const fYear = fromDate.getFullYear();
    const fMonth = String(fromDate.getMonth() + 1).padStart(2, '0');
    from = `${fYear}-${fMonth}`;
  } else {
    const [tY, tM] = to.split('-').map(Number);
    const [fY, fM] = from.split('-').map(Number);
    const diffMonths = (tY - fY) * 12 + (tM - fM);
    if (diffMonths >= 12) {
      const toDate = new Date(tY, tM - 1, 1);
      const clampFrom = new Date(toDate.getFullYear() - 1, toDate.getMonth() + 1, 1);
      from = `${clampFrom.getFullYear()}-${String(clampFrom.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  try {
    let meterNo = '';
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || '';
      }
    } catch (_e) {}

    const response = await descoClient.get(
      `/getCustomerMonthlyConsumption?accountNo=${accountNo}&meterNo=${meterNo}&monthFrom=${from}&monthTo=${to}`
    );

    let rawData = response.data?.data || response.data || [];
    if (Array.isArray(rawData)) {
      rawData.sort((a: any, b: any) => (a.month || '').localeCompare(b.month || ''));
    }

    res.json({ success: true, data: rawData });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;
