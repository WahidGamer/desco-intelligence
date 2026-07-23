// server/app.ts
import express from "express";
import cors from "cors";
import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";
var app = express();
var CONFIG_FILE = path.join(process.cwd(), "config.ini");
app.use(cors());
app.use(express.json());
var DESCO_API_BASE = "https://prepaid.desco.org.bd/api/tkdes/customer";
function parseConfig() {
  const DEFAULT_ACCOUNTS = {
    "1st": "21007757",
    "2nd": "34113471",
    "3rd-1": "21007685",
    "3rd-2": "34113481",
    "4th": "34113501"
  };
  if (process.env.DESCO_ACCOUNTS) {
    try {
      const parsed = JSON.parse(process.env.DESCO_ACCOUNTS);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_e) {
    }
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    return DEFAULT_ACCOUNTS;
  }
  try {
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    const accounts = {};
    let inAccountSection = false;
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inAccountSection = trimmed.toUpperCase() === "[ACCOUNT]";
        return;
      }
      if (inAccountSection && trimmed && !trimmed.startsWith(";")) {
        const parts = trimmed.split("=");
        if (parts.length === 2) {
          const name = parts[0].trim();
          const number = parts[1].trim();
          if (name && number) {
            accounts[name] = number;
          }
        }
      }
    });
    return Object.keys(accounts).length > 0 ? accounts : DEFAULT_ACCOUNTS;
  } catch (err) {
    console.error("[Config] Failed to read config.ini:", err);
    return DEFAULT_ACCOUNTS;
  }
}
var descoClient = axios.create({
  baseURL: DESCO_API_BASE,
  timeout: 15e3,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*"
  }
});
app.get("/api/accounts", (_req, res) => {
  try {
    const accounts = parseConfig();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/desco/summary", async (_req, res) => {
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
          let balanceData = null;
          if (balanceRes.status === "fulfilled" && balanceRes.value.data) {
            balanceData = balanceRes.value.data.data || balanceRes.value.data;
          }
          let infoData = null;
          if (infoRes.status === "fulfilled" && infoRes.value.data) {
            infoData = infoRes.value.data.data || infoRes.value.data;
          }
          let remainingBalance = null;
          let readingTime = null;
          if (balanceData && (balanceData.balance !== void 0 || balanceData.remainingBalance !== void 0)) {
            const rawBal = balanceData.balance !== void 0 ? balanceData.balance : balanceData.remainingBalance;
            remainingBalance = parseFloat(rawBal);
            readingTime = balanceData.readingTime || balanceData.lastReadingDate || null;
          }
          return {
            name,
            accountNo,
            meterNo: balanceData?.meterNo || infoData?.meterNo || "N/A",
            customerName: infoData?.customerName || infoData?.name || balanceData?.customerName || name.toUpperCase(),
            remainingBalance,
            readingTime,
            tariffName: infoData?.tariffSolution || infoData?.tariffName || infoData?.tariff || "A-Residential",
            sanctionLoad: infoData?.sanctionLoad || infoData?.sanctionedLoad || "N/A",
            address: infoData?.installationAddress || infoData?.address || "N/A",
            isCritical: remainingBalance !== null && remainingBalance < 100,
            status: "success"
          };
        } catch (err) {
          return {
            name,
            accountNo,
            meterNo: "N/A",
            customerName: name.toUpperCase(),
            remainingBalance: null,
            readingTime: null,
            tariffName: "A-Residential",
            sanctionLoad: "N/A",
            address: "N/A",
            isCritical: false,
            status: "error",
            error: err.message
          };
        }
      })
    );
    res.json({ success: true, timestamp: (/* @__PURE__ */ new Date()).toISOString(), data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
function computeLast5DaysAvgCost(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const rawUnits = items.map((i) => parseFloat(i.unit || i.consumedUnit || i.consumptionUnit || i.totalUnit || 0));
  const rawTaka = items.map((i) => parseFloat(i.consumedTaka || i.taka || i.amount || 0));
  const isUnitsCumulative = rawUnits.length > 1 && rawUnits[rawUnits.length - 1] > rawUnits[0] && rawUnits[0] > 1e3;
  const isTakaCumulative = rawTaka.length > 1 && rawTaka[rawTaka.length - 1] > rawTaka[0];
  const dailyCosts = [];
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
    let diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1e3 * 60 * 60 * 24));
    if (isNaN(diffDays) || diffDays <= 0) diffDays = 1;
    let deltaU = isUnitsCumulative ? rawUnits[i] - rawUnits[i - 1] : rawUnits[i];
    if (deltaU < 0) deltaU = rawUnits[i];
    let deltaT = isTakaCumulative ? rawTaka[i] - rawTaka[i - 1] : rawTaka[i];
    if (deltaT <= 0 && deltaU > 0) {
      deltaT = deltaU * 8.8;
    }
    const dailyCostBDT = deltaT / diffDays;
    if (dailyCostBDT > 0 && dailyCostBDT < 5e3) {
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
app.get("/api/desco/recharge-summary/:accountNo", async (req, res) => {
  const { accountNo } = req.params;
  try {
    const now = /* @__PURE__ */ new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const currentYearMonthPrefix = `${currentYear}-${currentMonth}`;
    let meterNo = "";
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || "";
      }
    } catch (_e) {
    }
    const yearStart = `${currentYear}-01-01`;
    const todayStr = now.toISOString().split("T")[0];
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
    const [historyRes, dailyRes] = await Promise.allSettled([
      descoClient.get(`/getRechargeHistory?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${yearStart}&dateTo=${todayStr}`),
      descoClient.get(`/getCustomerDailyConsumption?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${tenDaysAgo}&dateTo=${todayStr}`)
    ]);
    let records = [];
    if (historyRes.status === "fulfilled" && historyRes.value?.data) {
      const data = historyRes.value.data;
      if (Array.isArray(data.data)) {
        records = data.data;
      } else if (Array.isArray(data)) {
        records = data;
      }
    }
    let last5DaysAvgCost = null;
    if (dailyRes.status === "fulfilled" && dailyRes.value?.data) {
      const rawDaily = dailyRes.value.data.data || dailyRes.value.data || [];
      last5DaysAvgCost = computeLast5DaysAvgCost(rawDaily);
    }
    let rechargedThisMonth = 0;
    let rechargedThisYear = 0;
    let monthTxCount = 0;
    let yearTxCount = 0;
    records.forEach((item) => {
      const amount = parseFloat(item.totalAmount || item.amount || item.rechargeAmount || 0);
      const dateStr = item.payDate || item.rechargeDate || item.date || "";
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
  } catch (error) {
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
app.get("/api/desco/customer-info/:accountNo", async (req, res) => {
  const { accountNo } = req.params;
  try {
    const response = await descoClient.get(`/getCustomerInfo?accountNo=${accountNo}&meterNo=`);
    res.json({ success: true, data: response.data?.data || response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/desco/recharge-history/:accountNo", async (req, res) => {
  const { accountNo } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = /* @__PURE__ */ new Date();
  const defaultFrom = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const defaultTo = now.toISOString().split("T")[0];
  const from = dateFrom || defaultFrom;
  const to = dateTo || defaultTo;
  try {
    let meterNo = "";
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || "";
      }
    } catch (_e) {
    }
    const response = await descoClient.get(
      `/getRechargeHistory?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${from}&dateTo=${to}`
    );
    res.json({ success: true, data: response.data?.data || response.data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/desco/consumption/daily/:accountNo", async (req, res) => {
  const { accountNo } = req.params;
  const { dateFrom, dateTo } = req.query;
  const now = /* @__PURE__ */ new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
  const defaultTo = now.toISOString().split("T")[0];
  const from = dateFrom || defaultFrom;
  const to = dateTo || defaultTo;
  try {
    let meterNo = "";
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || "";
      }
    } catch (_e) {
    }
    const response = await descoClient.get(
      `/getCustomerDailyConsumption?accountNo=${accountNo}&meterNo=${meterNo}&dateFrom=${from}&dateTo=${to}`
    );
    res.json({ success: true, data: response.data?.data || response.data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.get("/api/desco/consumption/monthly/:accountNo", async (req, res) => {
  const { accountNo } = req.params;
  const { monthFrom, monthTo } = req.query;
  const now = /* @__PURE__ */ new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const to = monthTo || `${currentYear}-${currentMonth}`;
  let from = monthFrom;
  if (!from) {
    const toDate = /* @__PURE__ */ new Date(`${to}-01`);
    const fromDate = new Date(toDate.getFullYear() - 1, toDate.getMonth() + 1, 1);
    const fYear = fromDate.getFullYear();
    const fMonth = String(fromDate.getMonth() + 1).padStart(2, "0");
    from = `${fYear}-${fMonth}`;
  } else {
    const [tY, tM] = to.split("-").map(Number);
    const [fY, fM] = from.split("-").map(Number);
    const diffMonths = (tY - fY) * 12 + (tM - fM);
    if (diffMonths >= 12) {
      const toDate = new Date(tY, tM - 1, 1);
      const clampFrom = new Date(toDate.getFullYear() - 1, toDate.getMonth() + 1, 1);
      from = `${clampFrom.getFullYear()}-${String(clampFrom.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  try {
    let meterNo = "";
    try {
      const balRes = await descoClient.get(`/getBalance?accountNo=${accountNo}&meterNo=`);
      if (balRes.data && balRes.data.data) {
        meterNo = balRes.data.data.meterNo || "";
      }
    } catch (_e) {
    }
    const response = await descoClient.get(
      `/getCustomerMonthlyConsumption?accountNo=${accountNo}&meterNo=${meterNo}&monthFrom=${from}&monthTo=${to}`
    );
    let rawData = response.data?.data || response.data || [];
    if (Array.isArray(rawData)) {
      rawData.sort((a, b) => (a.month || "").localeCompare(b.month || ""));
    }
    res.json({ success: true, data: rawData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
var app_default = app;
export {
  app_default as default
};
