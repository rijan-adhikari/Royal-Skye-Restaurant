import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { useLanguage } from "../context/LanguageContext";
import DailySavings from "./DailySavings";
import { useTheme } from "../context/ThemeContext";

interface Summary {
  daily_sales: string;
  monthly_sales: string;
  yearly_sales: string;
  daily_expenses: string;
  total_expenses: string;
  monthly_expenses: string;
  yearly_expenses: string;
  daily_profit: string;
  monthly_profit: string | null;
  yearly_profit: string | null;
  daily_estimated_cogs: string;
  monthly_estimated_cogs: string;
  yearly_estimated_cogs: string;
  outstanding: string;
  occupied_tables: number;
}


const dashboardSettingsIndex = [
  { title: "Restaurant profile", detail: "Name, contact details, address, PAN, VAT number and currency", keywords: "restaurant business profile identity contact phone email address pan vat currency", href: "/admin-controls?section=system&tab=settings" },
  { title: "Receipt settings", detail: "Receipt footer and restaurant branding", keywords: "receipt footer logo branding print bill", href: "/admin-controls?section=system&tab=settings" },
  { title: "Payment QR code", detail: "Upload, preview or remove the billing QR image", keywords: "payment qr code billing scan upload image", href: "/admin-controls?section=system&tab=settings" },
  { title: "VAT / tax", detail: "Enable or change the tax rate", keywords: "vat tax percentage enable disable", href: "/admin-controls?section=system&tab=settings" },
  { title: "Service charge", detail: "Enable or change the service-charge rate", keywords: "service charge percentage enable disable", href: "/admin-controls?section=system&tab=settings" },
  { title: "Loyalty points", detail: "Configure customer points and redemption value", keywords: "loyalty rewards points spend value customers", href: "/admin-controls?section=system&tab=loyalty" },
  { title: "Staff accounts & roles", detail: "Create accounts, change roles, reset passwords and disable access", keywords: "staff employee user account role permission password access", href: "/admin-controls?section=staff" },
  { title: "Backup & restore", detail: "Create, download or restore a database backup", keywords: "database backup restore export import", href: "/admin-controls?section=system&tab=backup" },
  { title: "Audit trail", detail: "Review privileged actions and account changes", keywords: "audit history logs security activity", href: "/admin-controls?section=system&tab=audit" },
] as const;

const emptySummary: Summary = {
  daily_sales: "0", monthly_sales: "0", yearly_sales: "0",
  daily_expenses: "0", total_expenses: "0", monthly_expenses: "0", yearly_expenses: "0",
  daily_profit: "0", monthly_profit: "0", yearly_profit: "0",
  daily_estimated_cogs: "0", monthly_estimated_cogs: "0", yearly_estimated_cogs: "0",
  outstanding: "0", occupied_tables: 0,
};

export default function Dashboard() {
  const { fullName, role } = useAuth();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [reportDate, setReportDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; });
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [error, setError] = useState("");
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [showDailySales, setShowDailySales] = useState(false);
  const [salesLoading, setSalesLoading] = useState(false);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [showMonthlySales, setShowMonthlySales] = useState(false);
  const [monthlySalesLoading, setMonthlySalesLoading] = useState(false);
  const [yearlySales, setYearlySales] = useState<any[]>([]);
  const [showYearlySales, setShowYearlySales] = useState(false);
  const [yearlySalesLoading, setYearlySalesLoading] = useState(false);
  const [profitPeriod, setProfitPeriod] = useState<"monthly" | "yearly" | null>(null);
  const [settingsQuery, setSettingsQuery] = useState("");
  const [settingsSearchOpen, setSettingsSearchOpen] = useState(false);
  const settingsMatches = dashboardSettingsIndex.filter((item) =>
    (item.title + " " + item.detail + " " + item.keywords).toLowerCase().includes(settingsQuery.trim().toLowerCase())
  ).slice(0, 7);

  const load = () => api.get(`/api/dashboard/summary?report_date=${reportDate}`).then((response) => setSummary(response.data));

  useEffect(() => {
    load().catch(() => setError("Could not load dashboard metrics."));
    api.get("/api/dashboard/low-stock").then((response) => setLowStockItems(response.data)).catch(() => setLowStockItems([]));
  }, [reportDate, role]);

  const openDailySales = async () => {
    setShowDailySales(true);
    setSalesLoading(true);
    try {
      const response = await api.get(`/api/dashboard/daily-sales?report_date=${reportDate}`);
      setDailySales(response.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load daily sales details.");
    } finally {
      setSalesLoading(false);
    }
  };

  const openMonthlySales = async () => {
    setShowMonthlySales(true);
    setMonthlySalesLoading(true);
    try {
      const response = await api.get(`/api/dashboard/monthly-sales?report_date=${reportDate}`);
      setMonthlySales(response.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load monthly sales details.");
    } finally {
      setMonthlySalesLoading(false);
    }
  };

  const openYearlySales = async () => {
    setShowYearlySales(true);
    setYearlySalesLoading(true);
    try {
      const response = await api.get(`/api/dashboard/yearly-sales?report_date=${reportDate}`);
      setYearlySales(response.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load yearly sales details.");
    } finally {
      setYearlySalesLoading(false);
    }
  };

  const downloadReport = async (endpoint: string, filename: string, fallback: string) => {
    try {
      const response = await api.get(endpoint, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e: any) { setError(e?.response?.data?.detail || fallback); }
  };

  const downloadDashboardPdf = async () => {
    await downloadReport(`/api/dashboard/summary.pdf?report_date=${reportDate}`, `royal-skye-management-report-${reportDate}.pdf`, "Could not download dashboard PDF.");
  };

  const cards = [
    [t("Today's sales"), summary.daily_sales, "sales"],
    [t("Daily expenses"), summary.daily_expenses, "expenses"],
    [t("Estimated profit / loss"), summary.daily_profit, "profit"],
    [t("Occupied tables"), String(summary.occupied_tables), "tables"],
    [t("Outstanding credit"), summary.outstanding, "credit"],
  ];

  const money = (value: string) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const periods = [
    { label: t("Today"), sales: summary.daily_sales, expenses: summary.daily_expenses, profit: summary.daily_profit },
    ...(role === "admin" ? [
      { label: t("This month"), sales: summary.monthly_sales, expenses: summary.monthly_expenses, profit: summary.monthly_profit || "0" },
      { label: t("This year"), sales: summary.yearly_sales, expenses: summary.yearly_expenses, profit: summary.yearly_profit || "0" },
    ] : []),
  ];

  return (
    <div className="dashboard-page mx-auto max-w-[1500px] space-y-7 pb-8">
      <section className="dashboard-hero relative isolate overflow-hidden rounded-[28px] bg-[#2b211d] px-6 py-7 text-[#fffaf4] shadow-[0_22px_55px_rgba(45,30,22,.16)] md:px-9 md:py-9">
        <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border border-[#d9b98f]/15" />
        <div className="pointer-events-none absolute -right-2 -top-16 h-64 w-64 rounded-full border border-[#d9b98f]/10" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.24em] text-[#d7b17b]"><span className="h-px w-7 bg-[#d7b17b]" /> ROYAL SKYE <span className="text-[#8d7668]">/</span> {t("MANAGEMENT OVERVIEW")}</p>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-.045em] text-[#fffaf4] md:text-[42px]">{t("Good to see you,")} {fullName}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#c7b8ac]">{t("A clear view of today's restaurant performance and operations.")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[10px] font-bold uppercase tracking-[.14em] text-[#c7b8ac]">{t("Report date")}<input aria-label={t("Report date")} type="date" className="mt-2 block rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-white [color-scheme:dark]" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></label>
            {role === "admin" && <button type="button" onClick={downloadDashboardPdf} className="rounded-xl border border-[#d7b17b]/40 bg-[#d7b17b] px-4 py-[13px] text-xs font-extrabold text-[#2b211d] shadow-lg shadow-black/10 transition hover:bg-[#e5c493]">{t("Premium PDF")} <span className="ml-1">↗</span></button>}
            {role === "admin" && <button type="button" onClick={() => downloadReport(`/api/dashboard/summary.xlsx?report_date=${reportDate}`, `royal-skye-financial-report-${reportDate}.xlsx`, "Could not download Excel report.")} className="rounded-xl border border-white/20 bg-white/10 px-4 py-[13px] text-xs font-extrabold text-white hover:bg-white/15">Excel workbook ↗</button>}
<button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-xl border border-white/20 bg-white/10 px-4 py-[13px] text-xs font-extrabold text-white hover:bg-white/15">{theme === "dark" ? "☀ White theme" : "☾ Dark theme"}</button>
            {role === "admin" && <div className="relative w-full sm:w-[260px]">
              <label className="sr-only" htmlFor="dashboard-settings-search">Search website settings</label>
              <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5">
                <span aria-hidden="true" className="text-[#d7b17b]">⌕</span>
                <input id="dashboard-settings-search" value={settingsQuery} onChange={(event) => { setSettingsQuery(event.target.value); setSettingsSearchOpen(true); }} onFocus={() => setSettingsSearchOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setSettingsSearchOpen(false); setSettingsQuery(""); } }} placeholder="Search all settings..." className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none placeholder:text-[#c7b8ac]" />
                {settingsQuery && <button type="button" aria-label="Clear settings search" onClick={() => { setSettingsQuery(""); setSettingsSearchOpen(true); }} className="text-sm text-[#d7b17b]">×</button>}
              </div>
              {settingsSearchOpen && <div className="absolute right-0 top-full z-40 mt-2 max-h-[360px] w-[min(92vw,360px)] overflow-y-auto rounded-2xl border border-[#e8dfd5] bg-white p-2 text-left shadow-2xl">
                <div className="flex items-center justify-between px-3 py-2"><p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#9b8b7f]">Website settings</p><button type="button" onClick={() => setSettingsSearchOpen(false)} className="text-xs font-semibold text-[#8d6542]">Close</button></div>
                {settingsQuery.trim() ? settingsMatches.length ? settingsMatches.map((item) => <Link key={item.title} to={item.href} onClick={() => { setSettingsSearchOpen(false); setSettingsQuery(""); }} className="block rounded-xl px-3 py-3 transition hover:bg-[#f7f2ec]"><span className="block text-xs font-extrabold text-[#3d3028]">{item.title}</span><span className="mt-1 block text-[10px] leading-4 text-[#8b7c70]">{item.detail}</span></Link>) : <p className="px-3 py-5 text-xs text-[#8b7c70]">No matching settings. Try another keyword.</p> : <div className="px-3 pb-3 pt-1"><p className="text-xs font-semibold text-[#514238]">Find a setting by name or keyword.</p><p className="mt-1 text-[10px] leading-4 text-[#9b8b7f]">Search business details, tax, service charge, QR, loyalty, staff access, backups and audit history.</p></div>}
              </div>}
            </div>}
          </div>
        </div>
        <div className="relative mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#b8a89b]">
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#9ec6a2]" /> {t("Operations snapshot")}</span>
          <span className="text-[#6e5b50]">•</span><span>{new Date(reportDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <span className="text-[#6e5b50]">•</span><span className="capitalize">{role}</span>
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#a18d7c]">{t("At a glance")}</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-[#30251f]">{t("Today's performance")}</h2></div>
          <p className="text-[11px] font-medium text-[#9b8b7f]">{t("Select sales to inspect bills")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <button type="button" onClick={openDailySales} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Today's sales")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f5eee5] text-[#8d6542]">↗</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.daily_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652] group-hover:text-[#7d1e1e]">{t("View today's bills")} <span className="ml-1">→</span></p>
          </button>
          {role === "admin" && <button type="button" onClick={openMonthlySales} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]"><div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Monthly sales</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f5eee5] text-[#8d6542]">↗</span></div><p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.monthly_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652]">View this month's bills →</p></button>}
          {role === "admin" && <button type="button" onClick={openYearlySales} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]"><div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Yearly sales</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf2ee] text-[#52765b]">↗</span></div><p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.yearly_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652]">View this year's bills →</p></button>}
          <Link to="/operations?tab=expenses" className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Daily expenses")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#faeeee] text-[#9a3434]">↘</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#a43d3d]">{money(summary.daily_expenses)}</p><p className="mt-2 text-[10px] font-semibold text-[#a18d7c]">{t("Expenses recorded on the selected date")}</p>
          </Link>
          <div className="rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Estimated profit / loss")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f1eee8] text-[#80664c]">◒</span></div>
            <p className={`mt-4 text-[25px] font-extrabold tracking-[-.045em] ${Number(summary.daily_profit) < 0 ? "text-[#a43d3d]" : "text-[#477453]"}`}>{money(summary.daily_profit)}</p><p className="mt-2 text-[10px] font-semibold text-[#a18d7c]">{t("Estimated for selected date")}</p>
          </div>
          <Link to="/operations?tab=expenses" className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-sm transition hover:border-[#c6a77f]">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Total expenses</span>
            <p className="mt-4 text-[25px] font-extrabold text-[#a43d3d]">{money(summary.total_expenses)}</p>
            <p className="mt-2 text-[10px] text-[#a18d7c]">All recorded expenses and payroll</p>
          </Link>
          {role === "admin" && <button type="button" onClick={() => setProfitPeriod("monthly")} className="rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-sm hover:border-[#c6a77f]">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Monthly profit / loss</span>
            <p className="mt-4 text-[25px] font-extrabold text-[#477453]">{money(summary.monthly_profit || "0")}</p><p className="mt-2 text-[10px] text-[#9a7652]">View monthly breakdown →</p>
          </button>}
          {role === "admin" && <button type="button" onClick={() => setProfitPeriod("yearly")} className="rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-sm hover:border-[#c6a77f]">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Yearly profit / loss</span>
            <p className="mt-4 text-[25px] font-extrabold text-[#477453]">{money(summary.yearly_profit || "0")}</p><p className="mt-2 text-[10px] text-[#9a7652]">View yearly breakdown →</p>
          </button>}
          <Link to="/tables" className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Occupied tables")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf2ee] text-[#52765b]">▦</span></div>
            <p className="mt-4 text-[30px] font-extrabold tracking-[-.045em] text-[#30251f]">{summary.occupied_tables}</p><p className="mt-2 text-[10px] font-semibold text-[#a18d7c]">{t("Live table occupancy")} <span className="ml-1 text-[#9a7652]">→</span></p>
          </Link>
          <Link to={role === "cashier" ? "/credit" : "/admin?panel=customers"} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Outstanding credit")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f5eee5] text-[#8d6542]">↗</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.outstanding)}</p><p className="mt-2 text-[10px] font-semibold text-[#9a7652]">{t("View customers, orders & record payments")} →</p>
          </Link>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]">
        <div className="rounded-[24px] border border-[#e9dfd5] bg-white p-5 shadow-[0_8px_28px_rgba(45,30,22,.04)] md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.19em] text-[#a18d7c]">{t("Financial overview")}</p><h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#30251f]">{t("Sales, costs & estimated result")}</h2></div><span className="rounded-full bg-[#f7f2ec] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#92775e]">{t("Selected date range")}</span></div>
          <div className="mt-5 overflow-x-auto"><div className="min-w-[460px]">
            <div className="grid grid-cols-[100px_repeat(3,minmax(0,1fr))] border-b border-[#eee7df] pb-3 text-[9px] font-extrabold uppercase tracking-[.14em] text-[#a18d7c]"><span>{t("Period")}</span><span>{t("Sales")}</span><span>{t("Expenses")}</span><span>{t("Profit / loss")}</span></div>
            {periods.map((period) => <div key={period.label} className="grid grid-cols-[100px_repeat(3,minmax(0,1fr))] items-center gap-2 border-b border-[#f1ece6] py-4 last:border-0"><span className="text-xs font-bold text-[#514238]">{period.label}</span><span className="text-xs font-bold tabular-nums text-[#3f5946]">{money(period.sales)}</span><span className="text-xs font-bold tabular-nums text-[#a14b47]">{money(period.expenses)}</span><span className={`text-xs font-extrabold tabular-nums ${Number(period.profit) < 0 ? "text-[#a43d3d]" : "text-[#477453]"}`}>{money(period.profit)}</span></div>)}
          </div></div>
          <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-semibold text-[#9b8b7f]"><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#64856c]"/> {t("Sales")}</span><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#b96b64]"/> {t("Expenses")}</span><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#b78a54]"/> {t("Estimated result")}</span></div>
        </div>
        <div className="rounded-[24px] border border-[#e9dfd5] bg-[#f8f4ef] p-5 md:p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[.19em] text-[#a18d7c]">{t("Your workspace")}</p><h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#30251f]">{t("Quick access")}</h2><p className="mt-1 text-xs leading-5 text-[#928276]">{t("The essentials for keeping service moving.")}</p>
          <div className="mt-5 space-y-2">
            <Link to="/tables" className="flex items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3.5 transition hover:border-[#c6a77f] hover:shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5eee5] text-[#8d6542]">▦</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Tables & POS")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Manage tables and start orders")}</small></span><span className="text-[#b59a7d]">→</span></Link>
            <Link to="/billing" className="flex items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3.5 transition hover:border-[#c6a77f] hover:shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f7eeee] text-[#963f3f]">▤</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Billing & Orders")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Review bills and payment status")}</small></span><span className="text-[#b59a7d]">→</span></Link>
            <button type="button" onClick={() => downloadReport("/api/dashboard/operations-guide.pdf", "royal-skye-website-operational-guide.pdf", "Could not download the operational guide.")} className="flex w-full items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3.5 text-left transition hover:border-[#c6a77f] hover:shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f1eee8] text-[#80664c]">▤</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">Website Operational Guide</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">Download the step-by-step website manual (PDF)</small></span><span className="text-[#b59a7d]">↓</span></button>
            {role === "admin" && <><Link to="/operations?tab=inventory" className="flex items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3.5 transition hover:border-[#c6a77f] hover:shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf2ee] text-[#52765b]">▧</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Inventory")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Monitor stock and reorder levels")}</small></span><span className="text-[#b59a7d]">→</span></Link><Link to="/operations?tab=expenses" className="flex items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3.5 transition hover:border-[#c6a77f] hover:shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f7eeee] text-[#963f3f]">↘</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Expenses")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Track restaurant operating costs")}</small></span><span className="text-[#b59a7d]">→</span></Link><Link to="/operations?tab=controls&control=backup" className="flex items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3.5 transition hover:border-[#c6a77f] hover:shadow-sm"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5eee5] text-[#8d6542]">⇩</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">Backup & restore</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">Create or download a full sales and expenses backup</small></span><span className="text-[#b59a7d]">→</span></Link></>}
          </div>
        </div>
      </section>

      {role === "admin" && lowStockItems.length > 0 && <section className="overflow-hidden rounded-[22px] border border-[#ead9c2] bg-[#fffaf2] shadow-[0_8px_25px_rgba(45,30,22,.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e2ce] px-5 py-4 md:px-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f5e8d3] text-[#9a6a32]">!</span><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a17d54]">{t("Inventory attention")}</p><h2 className="mt-0.5 text-sm font-extrabold text-[#59432e]">{t("Low stock alert")}</h2></div></div><span className="rounded-full bg-[#f1dfc5] px-3 py-1 text-xs font-extrabold text-[#805b32]">{lowStockItems.length}</span></div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 md:p-5">{lowStockItems.map((item) => <div key={item.id} className="rounded-xl border border-[#efe3d3] bg-white p-3.5 text-xs"><p className="font-extrabold text-[#49392d]">{item.name}</p><div className="mt-2 flex justify-between gap-2 text-[#8c7b6b]"><span>{t("On hand")}: <b className="text-[#a14b47]">{item.quantity} {item.unit}</b></span><span>{t("Reorder")}: {item.reorder_level} {item.unit}</span></div></div>)}</div>
        <div className="px-5 pb-5 md:px-6"><Link to="/operations?tab=inventory" className="text-xs font-extrabold text-[#8b1a1a] hover:underline">{t("Open inventory")} →</Link><p className="mt-1 text-[10px] text-[#a18d7c]">{t("This alert remains visible until stock is replenished.")}</p></div>
      </section>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      {role === "admin" && profitPeriod && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3" onClick={() => setProfitPeriod(null)}>
        <section className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{profitPeriod === "monthly" ? "Monthly" : "Yearly"} profit / loss</h2><p className="text-xs text-neutral-500">{profitPeriod === "monthly" ? reportDate.slice(0,7) : reportDate.slice(0,4)}</p></div><button type="button" onClick={() => setProfitPeriod(null)} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><span>Net sales collected</span><b>{money(profitPeriod === "monthly" ? summary.monthly_sales : summary.yearly_sales)}</b></div>
            <div className="flex justify-between"><span>Estimated cost of goods sold</span><b>{money(profitPeriod === "monthly" ? summary.monthly_estimated_cogs : summary.yearly_estimated_cogs)}</b></div>
            <div className="flex justify-between"><span>Expenses + payroll</span><b>{money(profitPeriod === "monthly" ? summary.monthly_expenses : summary.yearly_expenses)}</b></div>
            <div className="flex justify-between border-t pt-3 text-base font-extrabold"><span>Estimated result</span><b>{money((profitPeriod === "monthly" ? summary.monthly_profit : summary.yearly_profit) || "0")}</b></div>
          </div>
          <p className="mt-4 text-[11px] text-neutral-500">Estimate based on collected sales, recipe-based ingredient costs and recorded expenses/payroll.</p>
        </section>
      </div>}
      {showMonthlySales && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => setShowMonthlySales(false)}>
        <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("Monthly sales details")}</h2><p className="text-sm text-neutral-500">{reportDate.slice(0, 7)}</p></div><button type="button" onClick={() => setShowMonthlySales(false)} className="rounded-lg border px-3 py-2">{t("Close")}</button></div>
          {monthlySalesLoading ? <div className="space-y-3 py-5">{Array.from({length:3},(_,i)=><div key={i} className="rounded-xl border p-4"><div className="bg-[#eee9e3] h-4 w-40 rounded"/><div className="bg-[#eee9e3] mt-3 h-3 w-64 max-w-full rounded"/><div className="bg-[#eee9e3] mt-5 h-16 w-full rounded-lg"/></div>)}</div> : monthlySales.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">{t("No sales recorded for this month.")}</p> : <div className="mt-4 space-y-4">{monthlySales.map((bill) => <article key={bill.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{bill.bill_number} · {bill.customer_name}</p><p className="text-xs text-neutral-500">{bill.customer_phone || t("No phone")} · {bill.table_name} · {new Date(bill.created_at).toLocaleString()}</p></div><div className="text-right text-sm"><p className="font-semibold">Received: Rs. {bill.collected_amount}</p><p className="text-neutral-500">Collected in selected period · Outstanding now: Rs. {bill.outstanding_amount}</p></div></div><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">{t("Food")}</th><th>{t("Quantity")}</th><th>{t("Price")}</th><th>{t("Total")}</th></tr></thead><tbody>{bill.items.map((item: any, index: number) => <tr key={index} className="border-b last:border-0"><td className="py-2">{item.name}</td><td>{item.quantity}</td><td>Rs. {item.unit_price}</td><td>Rs. {item.total}</td></tr>)}</tbody></table></div></article>)}</div>}
        </section>
      </div>}
      {showYearlySales && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => setShowYearlySales(false)}>
        <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Yearly sales details</h2><p className="text-sm text-neutral-500">{reportDate.slice(0, 4)}</p></div><button type="button" onClick={() => setShowYearlySales(false)} className="rounded-lg border px-3 py-2">Close</button></div>
          {yearlySalesLoading ? <div className="space-y-3 py-5">{Array.from({length:3},(_,i)=><div key={i} className="rounded-xl border p-4"><div className="bg-[#eee9e3] h-4 w-40 rounded"/><div className="bg-[#eee9e3] mt-3 h-3 w-64 max-w-full rounded"/><div className="bg-[#eee9e3] mt-5 h-16 w-full rounded-lg"/></div>)}</div> : yearlySales.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">No sales recorded for this year.</p> : <div className="mt-4 space-y-4">{yearlySales.map((bill) => <article key={bill.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{bill.bill_number} · {bill.customer_name}</p><p className="text-xs text-neutral-500">{bill.customer_phone || "No phone"} · {bill.table_name} · {new Date(bill.created_at).toLocaleString()}</p></div><div className="text-right text-sm"><p className="font-semibold">Received: Rs. {bill.collected_amount}</p><p className="text-neutral-500">Collected in selected period · Outstanding now: Rs. {bill.outstanding_amount}</p></div></div><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Item</th><th>Quantity</th><th>Price</th><th>Total</th></tr></thead><tbody>{(bill.items || []).map((item: any, index: number) => <tr key={index} className="border-b last:border-0"><td className="py-2">{item.name}</td><td>{item.quantity}</td><td>Rs. {item.unit_price}</td><td>Rs. {item.total}</td></tr>)}</tbody></table></div></article>)}</div>}
        </section>
      </div>}
      {showDailySales && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => setShowDailySales(false)}>
        <section className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("Daily sales details")}</h2><p className="text-sm text-neutral-500">{reportDate}</p></div><button type="button" onClick={() => setShowDailySales(false)} className="rounded-lg border px-3 py-2">{t("Close")}</button></div>
          {salesLoading ? <div className="space-y-3 py-5">{Array.from({length:3},(_,i)=><div key={i} className="rounded-xl border p-4"><div className="bg-[#eee9e3] h-4 w-40 rounded"/><div className="bg-[#eee9e3] mt-3 h-3 w-64 max-w-full rounded"/><div className="bg-[#eee9e3] mt-5 h-16 w-full rounded-lg"/></div>)}</div> : dailySales.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">{t("No sales recorded for this date.")}</p> : <div className="mt-4 space-y-4">{dailySales.map((bill) => <article key={bill.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{bill.bill_number} · {bill.customer_name}</p><p className="text-xs text-neutral-500">{bill.customer_phone || t("No phone")} · {bill.table_name} · {new Date(bill.created_at).toLocaleString()}</p></div><div className="text-right text-sm"><p className="font-semibold">Received: Rs. {bill.collected_amount}</p><p className="text-neutral-500">Collected in selected period · Outstanding now: Rs. {bill.outstanding_amount}</p></div></div><div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">{t("Food")}</th><th>{t("Quantity")}</th><th>{t("Price")}</th><th>{t("Total")}</th></tr></thead><tbody>{bill.items.map((item: any, index: number) => <tr key={index} className="border-b last:border-0"><td className="py-2">{item.name}</td><td>{item.quantity}</td><td>Rs. {item.unit_price}</td><td>Rs. {item.total}</td></tr>)}</tbody></table></div></article>)}</div>}
        </section>
      </div>}
      {role === "admin" && <section id="daily-savings" className="pt-3"><div className="mb-3"><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#9b7957]">Reserve & cash discipline</p><h2 className="mt-1 text-xl font-extrabold tracking-tight">Daily savings</h2><p className="mt-1 text-xs text-neutral-500">A running record of cash transferred from the drawer into the savings reserve.</p></div><DailySavings embedded /></section>}
    </div>
  );
}
