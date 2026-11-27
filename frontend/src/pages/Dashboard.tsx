import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { useLanguage } from "../context/LanguageContext";
import DailySavings from "./DailySavings";
import { useTheme } from "../context/ThemeContext";

interface Summary {
  daily_sales: string;
  monthly_sales: string;
  yearly_sales: string;
  daily_billed_sales: string;
  monthly_billed_sales: string;
  yearly_billed_sales: string;
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
  { title: "Restaurant profile", detail: "Restaurant name, contact details, address, PAN, VAT number and currency", keywords: "restaurant business profile identity contact phone email address pan vat currency company", href: "/settings" },
  { title: "Receipt & bill branding", detail: "Receipt footer, logo, print layout and billing identity", keywords: "receipt footer logo branding print bill invoice billing", href: "/settings" },
  { title: "Payment QR code", detail: "Upload, preview or remove the QR image shown during billing", keywords: "payment qr code billing scan upload image esewa khalti bank", href: "/settings" },
  { title: "VAT & tax settings", detail: "Enable tax and configure the VAT percentage", keywords: "vat tax percentage enable disable rate", href: "/settings" },
  { title: "Service charge settings", detail: "Enable and configure the service-charge percentage", keywords: "service charge percentage enable disable rate", href: "/settings" },
  { title: "Loyalty programme", detail: "Configure customer points, earning rules and redemption value", keywords: "loyalty rewards points spend value customers redemption", href: "/loyalty" },
  { title: "Staff accounts & permissions", detail: "Create staff accounts, assign roles, reset passwords and manage access", keywords: "staff employee user account role permission password access manager cashier admin", href: "/staff" },
  { title: "Staff attendance", detail: "Manage staff clock-in, clock-out and attendance records", keywords: "staff attendance clock in clock out team employee", href: "/attendance" },
  { title: "Payroll register", detail: "Record salary periods, partial payments and outstanding balances", keywords: "payroll salary wages staff cashout advance payment", href: "/payroll" },
  { title: "Menu management", detail: "Manage food and drink items, categories, prices and availability", keywords: "menu food drink item category price product availability", href: "/menu" },
  { title: "Customer management", detail: "Find customers and manage their profiles and contact details", keywords: "customer client guest phone name profile", href: "/customers" },
  { title: "Inventory & stock", detail: "Manage stock items, quantities, categories and low-stock alerts", keywords: "inventory stock item quantity category low alert purchase", href: "/inventory" },
  { title: "Stock recipes", detail: "Link menu items to ingredients and configure stock consumption", keywords: "recipe ingredients menu item stock consumption deduction", href: "/inventory" },
  { title: "Expenses", detail: "Record purchases and review restaurant operating expenses", keywords: "expense purchases costs supplier spending", href: "/expenses" },
  { title: "Cash drawer", detail: "Open shifts, cash movements, assigned amounts and reconciliation", keywords: "cash drawer shift open close cash movement reconciliation register", href: "/cash-drawer" },
  { title: "Sales register", detail: "Review bills, sales transactions and correct settled payments", keywords: "sales bills transactions payment register cash credit history", href: "/sales" },
  { title: "Supplier ledger", detail: "Track supplier balances, payments, credit adjustments and returns", keywords: "supplier vendor ledger balance payment credit return stock", href: "/suppliers" },
  { title: "Management reports", detail: "Review sales, profit and loss, exports and business performance", keywords: "reports analytics profit loss sales export excel pdf", href: "/reports" },
  { title: "Reservations", detail: "Create and manage future table bookings", keywords: "reservation booking table guest party date time", href: "/reservations" },
  { title: "Takeaway & delivery", detail: "Track takeaway and delivery orders and fulfilment status", keywords: "takeaway delivery service order fulfilment dispatch", href: "/operations?tab=controls&control=service" },
  { title: "Backup & restore", detail: "Create, download or restore a complete database backup", keywords: "database backup restore export import dump recovery", href: "/backup" },
  { title: "Audit trail", detail: "Review privileged actions, security events and account changes", keywords: "audit history logs security activity admin events", href: "/audit" },
] as const;

const emptySummary: Summary = {
  daily_sales: "0", monthly_sales: "0", yearly_sales: "0",
  daily_billed_sales: "0", monthly_billed_sales: "0", yearly_billed_sales: "0",
  daily_expenses: "0", total_expenses: "0", monthly_expenses: "0", yearly_expenses: "0",
  daily_profit: "0", monthly_profit: "0", yearly_profit: "0",
  daily_estimated_cogs: "0", monthly_estimated_cogs: "0", yearly_estimated_cogs: "0",
  outstanding: "0", occupied_tables: 0,
};

export default function Dashboard() {
  const { fullName, role } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [reportDate, setReportDate] = useState(() => { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (type: string) => parts.find((item) => item.type === type)?.value || "00"; return `${part("year")}-${part("month")}-${part("day")}`; });
  const [reportBsDate, setReportBsDate] = useState("Loading…");
  useEffect(() => { let active = true; setReportBsDate("Loading…"); fetch(`https://ndt.amitgaru.com.np/date/convert/ad-bs?ad_date=${reportDate}&format=${encodeURIComponent("%Y-%m-%d")}`).then((response) => { if (!response.ok) throw new Error("Date conversion unavailable"); return response.json(); }).then((payload) => { const value = String(payload?.data || "").trim(); if (active) setReportBsDate(/^\\d{4}-\\d{2}-\\d{2}$/.test(value) ? value : "Unavailable"); }).catch(() => { if (active) setReportBsDate("Unavailable"); }); return () => { active = false; }; }, [reportDate]);
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
  const [lastSevenDays, setLastSevenDays] = useState<{days: {date:string;sales:string;transactions:number}[];total_sales:string;transaction_count:number}>({days:[],total_sales:"0",transaction_count:0});
  const [showLastSevenDays, setShowLastSevenDays] = useState(false);
  const [lastSevenDaysLoading, setLastSevenDaysLoading] = useState(false);
  const [profitPeriod, setProfitPeriod] = useState<"monthly" | "yearly" | null>(null);
  const [settingsQuery, setSettingsQuery] = useState("");
  const [settingsSearchOpen, setSettingsSearchOpen] = useState(false);
  const [settingsActiveIndex, setSettingsActiveIndex] = useState(0);
  const normalizedSettingsQuery = settingsQuery.toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, " ");
  const settingsTerms = normalizedSettingsQuery.split(/\s+/).filter(Boolean);
  const settingsMatches = dashboardSettingsIndex.filter((item) => {
    const searchable = (item.title + " " + item.detail + " " + item.keywords).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
    return settingsTerms.every((term) => searchable.includes(term));
  }).sort((a, b) => {
    const aTitle = a.title.toLocaleLowerCase();
    const bTitle = b.title.toLocaleLowerCase();
    const aRank = normalizedSettingsQuery && aTitle.startsWith(normalizedSettingsQuery) ? 0 : normalizedSettingsQuery && aTitle.includes(normalizedSettingsQuery) ? 1 : 2;
    const bRank = normalizedSettingsQuery && bTitle.startsWith(normalizedSettingsQuery) ? 0 : normalizedSettingsQuery && bTitle.includes(normalizedSettingsQuery) ? 1 : 2;
    return aRank - bRank || a.title.localeCompare(b.title);
  });
  const selectSettingsResult = (item: (typeof dashboardSettingsIndex)[number]) => {
    setSettingsSearchOpen(false);
    setSettingsQuery("");
    setSettingsActiveIndex(0);
    navigate(item.href);
  };

  const load = () => api.get(`/api/dashboard/summary?report_date=${reportDate}`).then((response) => setSummary(response.data));

  useEffect(() => {
    load().catch(() => setError("Could not load dashboard metrics."));
    api.get("/api/dashboard/low-stock").then((response) => setLowStockItems(response.data)).catch(() => setLowStockItems([]));
  }, [reportDate, role]);

  // Populate the manager's seven-day sales card immediately, rather than waiting
  // for the report modal to be opened.
  useEffect(() => {
    if (role !== "manager") return;
    api.get("/api/dashboard/last-seven-days-sales")
      .then((response) => setLastSevenDays(response.data))
      .catch(() => setLastSevenDays({days:[], total_sales:"0", transaction_count:0}));
  }, [role]);

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

  const openLastSevenDays = async () => {
    setShowLastSevenDays(true);
    setLastSevenDaysLoading(true);
    try {
      const response = await api.get("/api/dashboard/last-seven-days-sales");
      setLastSevenDays(response.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load last seven days sales.");
      setShowLastSevenDays(false);
    } finally {
      setLastSevenDaysLoading(false);
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
    <div data-theme={theme} className="dashboard-page mx-auto max-w-[1500px] space-y-7 pb-8">
      
<style>{`
/* Dashboard theme tokens: keep the warm Royal Skye identity while preserving contrast. */
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .rounded-2xl.border,
.dashboard-page[data-theme="dark"] .dashboard-financial-card,
.dashboard-page[data-theme="dark"] .dashboard-quick-access,
.dashboard-page[data-theme="dark"] .dashboard-quick-link,
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) button.rounded-2xl,
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) a.rounded-2xl {
  background-color:#122123 !important;
  border-color:#29413f !important;
  color:#e5eeeb !important;
}
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="bg-[#f"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="bg-[#e"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="bg-[#edf"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="bg-[#fa"] {
  background-color:#192c2d !important;
}
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#30251f]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#514238]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#43352c]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#59432e]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#49392d]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#3d3028]"] { color:#e5eeeb !important; }
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#a18d7c]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#958477]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#9b8b7f]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#928276]"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="text-[#8c7b6b]"] { color:#a9bbb5 !important; }
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="border-[#e"],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) [class*="border-[#f"] { border-color:#29413f !important; }
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .text-\[\#3f5946\],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .text-\[\#477453\] { color:#9dd3a8 !important; }
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .text-\[\#a43d3d\],
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .text-\[\#a14b47\] { color:#f29b96 !important; }
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .bg-\[\#64856c\] { background-color:#80b88d !important; }
.dashboard-page[data-theme="dark"] section:not(.dashboard-hero) .bg-\[\#f0ece6\] { background-color:#29413f !important; }
/* Portal-based sales dialogs sit outside the dashboard DOM, so theme them at the document level. */
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 > section {
  background-color:#0d191b !important; color:#e5eeeb !important; border:1px solid #29413f !important;
}
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 article,
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="bg-[#f8f4ef]"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="bg-[#fdfbf8]"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="bg-[#f0ece6]"] {
  background-color:#172a2b !important; border-color:#29413f !important;
}
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="text-[#30251f]"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="text-[#514238]"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="text-[#43352c]"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="text-neutral-500"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="text-[#9b8b7f]"],
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 [class*="text-[#958477]"] { color:#b8c9c3 !important; }
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 table th,
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 table td,
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 table tr { border-color:#29413f !important; }
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 thead { background-color:#1c3434 !important; color:#e5eeeb !important; }
body:has(.dashboard-page[data-theme="dark"]) .fixed.z-50 button { color:#e5eeeb; }
@media (prefers-reduced-motion:no-preference) {
  .dashboard-page .dashboard-quick-link, .dashboard-page section:not(.dashboard-hero) button.rounded-2xl { transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease; }
}
`}</style>

      <section className={`dashboard-hero relative isolate rounded-[28px] border px-6 py-7 shadow-[0_22px_55px_rgba(45,30,22,.10)] transition-colors duration-200 md:px-9 md:py-9 ${theme === "dark" ? "border-[#57383d] bg-[linear-gradient(118deg,#21191b_0%,#302024_54%,#1b2928_100%)] text-[#fff8f1]" : "border-[#ead8c8] bg-[linear-gradient(118deg,#fffaf3_0%,#f4e8dc_54%,#f8eee8_100%)] text-[#30251f]"}`}>
        <div className={`pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border ${theme === "dark" ? "border-[#c28b78]/20" : "border-[#9b4d45]/15"}`} />
        <div className={`pointer-events-none absolute -right-2 -top-16 h-64 w-64 rounded-full border ${theme === "dark" ? "border-[#d9b98f]/15" : "border-[#b98263]/20"}`} />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className={`flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.24em] ${theme === "dark" ? "text-[#e2b98d]" : "text-[#925044]"}`}><span className={`h-px w-7 ${theme === "dark" ? "bg-[#e2b98d]" : "bg-[#925044]"}`} /> ROYAL SKYE <span className={theme === "dark" ? "text-[#9a7770]" : "text-[#b58c76]" }>/</span> {t("MANAGEMENT OVERVIEW")}</p>
            <h1 className={`mt-4 text-3xl font-extrabold leading-tight tracking-[-.045em] ${theme === "dark" ? "text-[#fff8f1]" : "text-[#30251f]"} md:text-[42px]`}>{t("Good to see you,")} {fullName}</h1>
            <p className={`mt-3 max-w-xl text-sm leading-6 ${theme === "dark" ? "text-[#cbbab3]" : "text-[#766257]"}`}>{t("A clear view of today's restaurant performance and operations.")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className={`text-[10px] font-bold uppercase tracking-[.14em] ${theme === "dark" ? "text-[#cbbab3]" : "text-[#766257]"}`}>{t("Report date")}<input aria-label={t("Report date")} type="date" className={`mt-2 block rounded-xl border px-3 py-2.5 text-sm font-semibold normal-case tracking-normal ${theme === "dark" ? "border-white/15 bg-white/10 text-white [color-scheme:dark]" : "border-[#dfcbbb] bg-white/75 text-[#49372f] [color-scheme:light]"}`} value={reportDate} onChange={(e) => setReportDate(e.target.value)} /><span className="mt-1 block text-[10px] font-semibold normal-case tracking-normal">Nepali date (BS): {reportBsDate}</span></label>
            {role === "admin" && <button type="button" onClick={downloadDashboardPdf} className="rounded-xl border border-[#a96a50]/30 bg-[#9a4b43] px-4 py-[13px] text-xs font-extrabold text-white shadow-lg shadow-black/10 transition hover:bg-[#843d38]">{t("Premium PDF")} <span className="ml-1">↗</span></button>}
            {role === "admin" && <button type="button" onClick={() => downloadReport(`/api/dashboard/summary.xlsx?report_date=${reportDate}`, `royal-skye-financial-report-${reportDate}.xlsx`, "Could not download Excel report.")} className={`rounded-xl border px-4 py-[13px] text-xs font-extrabold ${theme === "dark" ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-[#d8c2b0] bg-white/65 text-[#49372f] hover:bg-white"}`}>Excel workbook ↗</button>}
<button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-xl border border-white/20 bg-white/10 px-4 py-[13px] text-xs font-extrabold text-white hover:bg-white/15">{theme === "dark" ? "☀ White theme" : "☾ Dark theme"}</button>
            {role === "admin" && <div className="relative w-full sm:w-[260px]">
              <label className="sr-only" htmlFor="dashboard-settings-search">Search website settings</label>
              <div className="rs-command-search flex items-center gap-3 rounded-xl border px-3.5 py-3">
                <span aria-hidden="true" className="rs-command-search-icon">⌕</span>
                <input id="dashboard-settings-search" value={settingsQuery} onChange={(event) => { setSettingsQuery(event.target.value); setSettingsActiveIndex(0); setSettingsSearchOpen(true); }} onFocus={() => setSettingsSearchOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") { setSettingsSearchOpen(false); setSettingsQuery(""); setSettingsActiveIndex(0); } else if (event.key === "ArrowDown" && settingsMatches.length) { event.preventDefault(); setSettingsActiveIndex((index) => (index + 1) % settingsMatches.length); } else if (event.key === "ArrowUp" && settingsMatches.length) { event.preventDefault(); setSettingsActiveIndex((index) => (index - 1 + settingsMatches.length) % settingsMatches.length); } else if (event.key === "Enter" && settingsMatches.length) { event.preventDefault(); selectSettingsResult(settingsMatches[Math.min(settingsActiveIndex, settingsMatches.length - 1)]); } }} placeholder="Search settings, staff, stock, sales…" autoComplete="off" role="combobox" aria-expanded={settingsSearchOpen} aria-controls="dashboard-settings-results" aria-activedescendant={settingsSearchOpen && settingsQuery.trim() && settingsMatches.length ? `settings-result-${settingsActiveIndex}` : undefined} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--rs-ink)] outline-none placeholder:text-[var(--rs-muted)]" />
                {settingsQuery && <button type="button" aria-label="Clear settings search" onClick={() => { setSettingsQuery(""); setSettingsSearchOpen(true); }} className="text-sm text-[#d7b17b]">×</button>}
              </div>
              {settingsSearchOpen && <div id="dashboard-settings-results" role="listbox" aria-label="Search results" className="rs-command-results absolute right-0 top-full z-50 mt-2 max-h-[min(65vh,560px)] w-[min(92vw,460px)] overflow-y-auto overscroll-contain rounded-2xl border p-2 text-left">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2"><div><p className="rs-command-results-kicker text-[10px] font-extrabold uppercase tracking-[.15em]">CONTROL INDEX</p><p className="mt-1 text-[10px] text-[var(--rs-muted)]">{settingsQuery.trim() ? `${settingsMatches.length} matching destinations` : `${dashboardSettingsIndex.length} available destinations`}</p></div><button type="button" onClick={() => setSettingsSearchOpen(false)} className="rounded-lg px-2 py-1 text-xs font-semibold text-[#8d6542] hover:bg-white/10">Close</button></div>
                {settingsQuery.trim() ? settingsMatches.length ? <div className="space-y-1 py-2">{settingsMatches.map((item, index) => <button id={`settings-result-${index}`} key={item.title} type="button" role="option" aria-selected={index === settingsActiveIndex} onMouseEnter={() => setSettingsActiveIndex(index)} onClick={() => selectSettingsResult(item)} className={`rs-command-result block w-full rounded-xl px-3 py-3 text-left transition ${index === settingsActiveIndex ? "is-active" : ""}`}><span className="block text-xs font-extrabold">{item.title}</span><span className="mt-1 block text-[10px] leading-4">{item.detail}</span></button>)}</div> : <div className="px-3 py-6 text-center"><p className="text-xs font-semibold">No matching destinations</p><p className="mt-1 text-[10px]">Try a shorter term such as “tax”, “cash”, “staff” or “stock”.</p></div> : <div className="px-3 py-4"><p className="text-xs font-semibold">Search every available management destination.</p><p className="mt-1 text-[10px] leading-4">Try restaurant, receipt, QR, tax, loyalty, staff, payroll, menu, customer, inventory, expenses, cash, sales, suppliers, reports, reservations, delivery, backup or audit.</p></div>}
                <div className="sticky bottom-0 flex items-center justify-between border-t border-white/10 px-3 py-2 text-[9px]"><span>↑ ↓ Navigate</span><span>Enter Open · Esc Close</span></div>
              </div>}
            </div>}
          </div>
        </div>
        <div className={`relative mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-5 text-[10px] font-semibold uppercase tracking-[.13em] ${theme === "dark" ? "border-white/10 text-[#c3b1a8]" : "border-[#d8c6b8] text-[#806d61]"}`}>
          <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#7eaa83]" /> {t("Operations snapshot")}</span>
          <span className={theme === "dark" ? "text-[#80655f]" : "text-[#b18c78]"}>•</span><span>{new Date(reportDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
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
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Today's billed sales")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f5eee5] text-[#8d6542]">↗</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.daily_billed_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652] group-hover:text-[#7d1e1e]">{t("View today's bills")} <span className="ml-1">→</span></p>
          </button>
          <div className="rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Net collected revenue</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf2ee] text-[#52765b]">↙</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.daily_sales)}</p>
            <p className="mt-2 text-[10px] font-semibold text-[#9a7652]">Payments received, excluding tax and service charge</p>
          </div>
          {role === "manager" && <button type="button" onClick={openLastSevenDays} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]"><div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Last 7 days sales</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf2ee] text-[#52765b]">↗</span></div><p className="mt-4 break-words text-[25px] font-extrabold tracking-[-.045em] tabular-nums text-[#30251f]">{money(lastSevenDays.total_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652]">Last 7 days · View breakdown →</p></button>}
          {role === "admin" && <button type="button" onClick={openMonthlySales} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]"><div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Monthly billed sales</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f5eee5] text-[#8d6542]">↗</span></div><p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.monthly_billed_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652]">View this month's bills →</p></button>}
          {role === "admin" && <button type="button" onClick={openYearlySales} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]"><div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Yearly billed sales</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf2ee] text-[#52765b]">↗</span></div><p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.yearly_billed_sales)}</p><p className="mt-2 text-[10px] font-bold text-[#9a7652]">View this year's bills →</p></button>}
          <Link to="/expenses" className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Daily expenses")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#faeeee] text-[#9a3434]">↘</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#a43d3d]">{money(summary.daily_expenses)}</p><p className="mt-2 text-[10px] font-semibold text-[#a18d7c]">{t("Expenses recorded on the selected date")}</p>
          </Link>
          <div className="rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Estimated cash-based result")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f1eee8] text-[#80664c]">◒</span></div>
            <p className={`mt-4 text-[25px] font-extrabold tracking-[-.045em] ${Number(summary.daily_profit) < 0 ? "text-[#a43d3d]" : "text-[#477453]"}`}>{money(summary.daily_profit)}</p><p className="mt-2 text-[10px] font-semibold text-[#a18d7c]">{t("Estimated for selected date")}</p>
          </div>
          <Link to="/expenses" className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-sm transition hover:border-[#c6a77f]">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Total expenses</span>
            <p className="mt-4 text-[25px] font-extrabold text-[#a43d3d]">{money(summary.total_expenses)}</p>
            <p className="mt-2 text-[10px] text-[#a18d7c]">All recorded expenses and payroll</p>
          </Link>
          {role === "admin" && <button type="button" onClick={() => setProfitPeriod("monthly")} className="rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-sm hover:border-[#c6a77f]">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Monthly cash-based result</span>
            <p className="mt-4 text-[25px] font-extrabold text-[#477453]">{money(summary.monthly_profit || "0")}</p><p className="mt-2 text-[10px] text-[#9a7652]">View monthly breakdown →</p>
          </button>}
          {role === "admin" && <button type="button" onClick={() => setProfitPeriod("yearly")} className="rounded-2xl border border-[#e9dfd5] bg-white p-5 text-left shadow-sm hover:border-[#c6a77f]">
            <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">Yearly cash-based result</span>
            <p className="mt-4 text-[25px] font-extrabold text-[#477453]">{money(summary.yearly_profit || "0")}</p><p className="mt-2 text-[10px] text-[#9a7652]">View yearly breakdown →</p>
          </button>}
          <Link to="/tables" className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Occupied tables")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf2ee] text-[#52765b]">▦</span></div>
            <p className="mt-4 text-[30px] font-extrabold tracking-[-.045em] text-[#30251f]">{summary.occupied_tables}</p><p className="mt-2 text-[10px] font-semibold text-[#a18d7c]">{t("Live table occupancy")} <span className="ml-1 text-[#9a7652]">→</span></p>
          </Link>
          <Link to={role === "cashier" ? "/credit" : "/customers"} className="group rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-1 hover:border-[#c6a77f] hover:shadow-[0_14px_28px_rgba(45,30,22,.08)]">
            <div className="flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#958477]">{t("Outstanding credit")}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f5eee5] text-[#8d6542]">↗</span></div>
            <p className="mt-4 text-[25px] font-extrabold tracking-[-.045em] text-[#30251f]">{money(summary.outstanding)}</p><p className="mt-2 text-[10px] font-semibold text-[#9a7652]">{t("View customers, orders & record payments")} →</p>
          </Link>
        </div>
      </section>

      <section className="dashboard-financial-layout grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,.85fr)]">
        <div className="dashboard-financial-card min-w-0 rounded-[24px] border border-[#e9dfd5] bg-white p-4 shadow-[0_8px_28px_rgba(45,30,22,.04)] sm:p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[.19em] text-[#a18d7c]">{t("Financial overview")}</p><h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#30251f]">{t("Net collections, costs & cash-based result")}</h2></div><span className="rounded-full bg-[#f7f2ec] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#92775e]">{t("Selected date range")}</span></div>
          <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-0">
            <div className="hidden grid-cols-[minmax(76px,.8fr)_repeat(3,minmax(0,1fr))] border-b border-[#eee7df] pb-3 text-[9px] font-extrabold uppercase tracking-[.12em] text-[#a18d7c] sm:grid"><span>{t("Period")}</span><span>{t("Net collections")}</span><span>{t("Expenses")}</span><span>{t("Profit / loss")}</span></div>
            {periods.map((period) => <div key={period.label} className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-[#f1ece6] bg-[#fdfbf8] p-3 sm:grid-cols-[minmax(76px,.8fr)_repeat(3,minmax(0,1fr))] sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:px-0 sm:py-4">
              <span className="col-span-2 text-xs font-extrabold text-[#514238] sm:col-span-1">{period.label}</span>
              <span className="min-w-0"><small className="block text-[9px] font-bold uppercase tracking-wide text-[#a18d7c] sm:hidden">{t("Net collections")}</small><b className="block break-words text-xs font-bold tabular-nums text-[#3f5946]">{money(period.sales)}</b></span>
              <span className="min-w-0"><small className="block text-[9px] font-bold uppercase tracking-wide text-[#a18d7c] sm:hidden">{t("Expenses")}</small><b className="block break-words text-xs font-bold tabular-nums text-[#a14b47]">{money(period.expenses)}</b></span>
              <span className="min-w-0"><small className="block text-[9px] font-bold uppercase tracking-wide text-[#a18d7c] sm:hidden">{t("Profit / loss")}</small><b className={`block break-words text-xs font-extrabold tabular-nums ${Number(period.profit) < 0 ? "text-[#a43d3d]" : "text-[#477453]"}`}>{money(period.profit)}</b></span>
            </div>)}
          </div>
          <p className="mt-4 text-[10px] leading-5 text-[#9b8b7f]">Billed sales include active bills, including unpaid credit. Net collected revenue reflects money received after tax and service-charge adjustments and refunds. The cash-based result subtracts estimated recipe costs, recorded expenses and payroll from net collections.</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold text-[#9b8b7f]"><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#64856c]"/> {t("Net collections")}</span><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#b96b64]"/> {t("Expenses")}</span><span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#b78a54]"/> {t("Estimated result")}</span></div>
        </div>
        <div className="dashboard-quick-access min-w-0 rounded-[24px] border border-[#e9dfd5] bg-[#f8f4ef] p-4 sm:p-5 md:p-6">
          <p className="text-[10px] font-extrabold uppercase tracking-[.19em] text-[#a18d7c]">{t("Your workspace")}</p><h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#30251f]">{t("Quick access")}</h2><p className="mt-1 text-xs leading-5 text-[#928276]">{t("The essentials for keeping service moving.")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-1 sm:gap-2">
            <Link to="/tables" className="dashboard-quick-link flex min-w-0 items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3 transition hover:border-[#c6a77f] hover:shadow-sm sm:p-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5eee5] text-[#8d6542]">▦</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Tables & POS")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Manage tables and start orders")}</small></span><span className="text-[#b59a7d]">→</span></Link>
            <Link to="/billing" className="dashboard-quick-link flex min-w-0 items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3 transition hover:border-[#c6a77f] hover:shadow-sm sm:p-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f7eeee] text-[#963f3f]">▤</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Billing & Orders")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Review bills and payment status")}</small></span><span className="text-[#b59a7d]">→</span></Link>
            <button type="button" onClick={() => downloadReport("/api/dashboard/operations-guide.pdf", "royal-skye-website-operational-guide.pdf", "Could not download the operational guide.")} className="dashboard-quick-link flex w-full min-w-0 items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3 text-left transition hover:border-[#c6a77f] hover:shadow-sm sm:p-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f1eee8] text-[#80664c]">▤</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">Website Operational Guide</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">Download the step-by-step website manual (PDF)</small></span><span className="text-[#b59a7d]">↓</span></button>
            {role === "admin" && <><Link to="/inventory" className="dashboard-quick-link flex min-w-0 items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3 transition hover:border-[#c6a77f] hover:shadow-sm sm:p-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf2ee] text-[#52765b]">▧</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Inventory")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Monitor stock and reorder levels")}</small></span><span className="text-[#b59a7d]">→</span></Link><Link to="/expenses" className="dashboard-quick-link flex min-w-0 items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3 transition hover:border-[#c6a77f] hover:shadow-sm sm:p-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f7eeee] text-[#963f3f]">↘</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">{t("Expenses")}</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">{t("Track restaurant operating costs")}</small></span><span className="text-[#b59a7d]">→</span></Link><Link to="/operations?tab=controls&control=backup" className="dashboard-quick-link flex min-w-0 items-center gap-3 rounded-xl border border-[#e9dfd5] bg-white p-3 transition hover:border-[#c6a77f] hover:shadow-sm sm:p-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f5eee5] text-[#8d6542]">⇩</span><span className="min-w-0 flex-1"><strong className="block text-xs font-extrabold text-[#43352c]">Backup & restore</strong><small className="mt-0.5 block text-[10px] text-[#9b8b7f]">Create or download a full sales and expenses backup</small></span><span className="text-[#b59a7d]">→</span></Link></>}
          </div>
        </div>
      </section>

      {role === "admin" && lowStockItems.length > 0 && <section className="overflow-hidden rounded-[22px] border border-[#ead9c2] bg-[#fffaf2] shadow-[0_8px_25px_rgba(45,30,22,.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e2ce] px-5 py-4 md:px-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f5e8d3] text-[#9a6a32]">!</span><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a17d54]">{t("Inventory attention")}</p><h2 className="mt-0.5 text-sm font-extrabold text-[#59432e]">{t("Low stock alert")}</h2></div></div><span className="rounded-full bg-[#f1dfc5] px-3 py-1 text-xs font-extrabold text-[#805b32]">{lowStockItems.length}</span></div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 md:p-5">{lowStockItems.map((item) => <div key={item.id} className="rounded-xl border border-[#efe3d3] bg-white p-3.5 text-xs"><p className="font-extrabold text-[#49392d]">{item.name}</p><div className="mt-2 flex justify-between gap-2 text-[#8c7b6b]"><span>{t("On hand")}: <b className="text-[#a14b47]">{item.quantity} {item.unit}</b></span><span>{t("Reorder")}: {item.reorder_level} {item.unit}</span></div></div>)}</div>
        <div className="px-5 pb-5 md:px-6"><Link to="/inventory" className="text-xs font-extrabold text-[#8b1a1a] hover:underline">{t("Open inventory")} →</Link><p className="mt-1 text-[10px] text-[#a18d7c]">{t("This alert remains visible until stock is replenished.")}</p></div>
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
      {showMonthlySales && createPortal(<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 pt-6 sm:pt-8" onClick={() => setShowMonthlySales(false)}>
        <section className={`max-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-y-auto rounded-2xl p-5 shadow-2xl ${theme === "dark" ? "border border-white/10 bg-[#0b1718] text-[#e7efed] [&_article]:border-white/10 [&_article]:bg-[#102021] [&_p.text-neutral-500]:text-[#a4b8b2] [&_th]:bg-[#17302f] [&_tr]:border-white/10 [&_button]:border-white/20" : "bg-white text-[#30251f]"}`} onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("Monthly sales details")}</h2><p className="text-sm text-neutral-500">{reportDate.slice(0, 7)}</p></div><button type="button" onClick={() => setShowMonthlySales(false)} className="rounded-lg border px-3 py-2">{t("Close")}</button></div>
          {monthlySalesLoading ? <div className="space-y-3 py-5">{Array.from({length:3},(_,i)=><div key={i} className="rounded-xl border p-4"><div className="bg-[#eee9e3] h-4 w-40 rounded"/><div className="bg-[#eee9e3] mt-3 h-3 w-64 max-w-full rounded"/><div className="bg-[#eee9e3] mt-5 h-16 w-full rounded-lg"/></div>)}</div> : monthlySales.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">{t("No sales recorded for this month.")}</p> : <div className="mt-4 space-y-4">{monthlySales.map((bill) => <article key={bill.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">#{bill.transaction_number || "—"} · {bill.bill_number} · {bill.customer_name}</p><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a5941]">{[...new Set([...(bill.payments || []).map((payment: any) => String(payment.method).replace(/_/g, " ").toUpperCase()).filter((method: string) => method !== "CUSTOMER CREDIT BALANCE"), ...(Number(bill.outstanding_amount) > 0 ? ["CREDIT"] : [])])].join(" · ") || "CREDIT"}</p><p className="text-xs text-neutral-500">{bill.customer_phone || t("No phone")} · {bill.table_name} · {new Date(bill.created_at).toLocaleString()}</p></div><div className="text-right text-sm"><p className="font-semibold">Received: Rs. {bill.collected_amount}</p><p className="text-neutral-500">Collected in selected period · Outstanding now: Rs. {bill.outstanding_amount}</p></div></div>{(bill.payments || []).length > 0 && <div className="mt-3 rounded-lg bg-[#f8f4ef] p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#80664c]">Payment breakdown</p>{bill.payments.map((payment: any, paymentIndex: number) => <div key={paymentIndex} className="flex justify-between gap-3 py-1 text-xs"><span className="capitalize">#{payment.transaction_number || bill.transaction_number || "—"} · {String(payment.method).replace(/_/g, " ")}</span><b>Rs. {payment.amount}</b></div>)}</div>}<div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">{t("Food")}</th><th>{t("Quantity")}</th><th>{t("Price")}</th><th>{t("Total")}</th></tr></thead><tbody>{bill.items.map((item: any, index: number) => <tr key={index} className="border-b last:border-0"><td className="py-2">{item.name}</td><td>{item.quantity}</td><td>Rs. {item.unit_price}</td><td>Rs. {item.total}</td></tr>)}</tbody></table></div></article>)}</div>}
        </section>
      </div>, document.body)}
      {showYearlySales && createPortal(<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 pt-6 sm:pt-8" onClick={() => setShowYearlySales(false)}>
        <section className={`max-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-y-auto rounded-2xl p-5 shadow-2xl ${theme === "dark" ? "border border-white/10 bg-[#0b1718] text-[#e7efed] [&_article]:border-white/10 [&_article]:bg-[#102021] [&_p.text-neutral-500]:text-[#a4b8b2] [&_th]:bg-[#17302f] [&_tr]:border-white/10 [&_button]:border-white/20" : "bg-white text-[#30251f]"}`} onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Yearly sales details</h2><p className="text-sm text-neutral-500">{reportDate.slice(0, 4)}</p></div><button type="button" onClick={() => setShowYearlySales(false)} className="rounded-lg border px-3 py-2">Close</button></div>
          {yearlySalesLoading ? <div className="space-y-3 py-5">{Array.from({length:3},(_,i)=><div key={i} className="rounded-xl border p-4"><div className="bg-[#eee9e3] h-4 w-40 rounded"/><div className="bg-[#eee9e3] mt-3 h-3 w-64 max-w-full rounded"/><div className="bg-[#eee9e3] mt-5 h-16 w-full rounded-lg"/></div>)}</div> : yearlySales.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">No sales recorded for this year.</p> : <div className="mt-4 space-y-4">{yearlySales.map((bill) => <article key={bill.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{bill.bill_number} · {bill.customer_name}</p><p className="text-xs text-neutral-500">{bill.customer_phone || "No phone"} · {bill.table_name} · {new Date(bill.created_at).toLocaleString()}</p></div><div className="text-right text-sm"><p className="font-semibold">Received: Rs. {bill.collected_amount}</p><p className="text-neutral-500">Collected in selected period · Outstanding now: Rs. {bill.outstanding_amount}</p></div></div>{(bill.payments || []).length > 0 && <div className="mt-3 rounded-lg bg-[#f8f4ef] p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#80664c]">Payment breakdown</p>{bill.payments.map((payment: any, paymentIndex: number) => <div key={paymentIndex} className="flex justify-between gap-3 py-1 text-xs"><span className="capitalize">{String(payment.method).replace(/_/g, " ")}</span><b>Rs. {payment.amount}</b></div>)}</div>}<div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Item</th><th>Quantity</th><th>Price</th><th>Total</th></tr></thead><tbody>{(bill.items || []).map((item: any, index: number) => <tr key={index} className="border-b last:border-0"><td className="py-2">{item.name}</td><td>{item.quantity}</td><td>Rs. {item.unit_price}</td><td>Rs. {item.total}</td></tr>)}</tbody></table></div></article>)}</div>}
        </section>
      </div>, document.body)}
      {showLastSevenDays && createPortal(<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 pt-6 sm:pt-8" onClick={() => setShowLastSevenDays(false)}>
        <section className={`max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border p-4 shadow-2xl sm:p-6 ${theme === "dark" ? "border-white/10 bg-[#0b1718] text-[#e7efed] [&_h2]:!text-[#e7efed] [&_p]:!text-[#a4b8b2] [&_span]:!text-[#d5e3de] [&_div.rounded-xl]:border-white/10 [&_div.rounded-xl]:bg-[#102021]" : "border-[#e9dfd5] bg-white text-[#30251f]"}`} onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#9b7957]">Manager insights</p><h2 className="mt-1 text-xl font-extrabold text-[#30251f]">Last 7 days sales</h2><p className="mt-1 text-xs text-neutral-500">Collected sales · Today and previous six business days</p></div>
            <button type="button" onClick={() => setShowLastSevenDays(false)} className="rounded-lg border border-[#e9dfd5] px-3 py-2 text-xs font-bold">Close</button>
          </div>
          {lastSevenDaysLoading ? <div className="py-12 text-center text-sm text-neutral-500">Loading sales activity…</div> : <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={`rounded-xl border p-4 ${theme === "dark" ? "border-white/10 bg-[#132526]" : "border-[#e9dfd5] bg-[#f8f4ef]"}`}><p className="text-[9px] font-extrabold uppercase tracking-wider text-[#958477]">Total collected</p><p className="mt-2 break-words text-xl font-extrabold text-[#30251f]">{money(lastSevenDays.total_sales)}</p></div>
              <div className={`rounded-xl border p-4 ${theme === "dark" ? "border-white/10 bg-[#132526]" : "border-[#e9dfd5] bg-[#f8f4ef]"}`}><p className="text-[9px] font-extrabold uppercase tracking-wider text-[#958477]">Transactions</p><p className="mt-2 text-xl font-extrabold text-[#30251f]">{lastSevenDays.transaction_count}</p></div>
            </div>
            <div className="mt-5 space-y-3">
              {lastSevenDays.days.map((day) => {
                const maximum = Math.max(1, ...lastSevenDays.days.map((item) => Number(item.sales || 0)));
                const width = Math.max(0, Math.min(100, Number(day.sales || 0) / maximum * 100));
                return <div key={day.date} className={`rounded-xl border p-3 ${theme === "dark" ? "border-white/10 bg-[#102021]" : "border-[#eee7df]"}`}>
                  <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-[#514238]">{new Date(day.date + "T12:00:00").toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"})}</span><span className="text-right text-xs font-extrabold tabular-nums text-[#3f5946]">{money(day.sales)}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0ece6]"><div className="h-full rounded-full bg-[#8b3c42] transition-all" style={{width: width + "%"}} /></div>
                  <p className="mt-1 text-[10px] text-[#9b8b7f]">{day.transactions} {day.transactions === 1 ? "transaction" : "transactions"}</p>
                </div>;
              })}
            </div>
          </>}
        </section>
      </div>, document.body)}
      {showDailySales && createPortal(<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 pt-6 sm:pt-8" onClick={() => setShowDailySales(false)}>
        <section className={`max-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-y-auto rounded-2xl p-5 shadow-2xl ${theme === "dark" ? "border border-white/10 bg-[#0b1718] text-[#e7efed] [&_article]:border-white/10 [&_article]:bg-[#102021] [&_p.text-neutral-500]:text-[#a4b8b2] [&_th]:bg-[#17302f] [&_tr]:border-white/10 [&_button]:border-white/20" : "bg-white text-[#30251f]"}`} onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("Daily sales details")}</h2><p className="text-sm text-neutral-500">{reportDate}</p></div><button type="button" onClick={() => setShowDailySales(false)} className="rounded-lg border px-3 py-2">{t("Close")}</button></div>
          {salesLoading ? <div className="space-y-3 py-5">{Array.from({length:3},(_,i)=><div key={i} className="rounded-xl border p-4"><div className="bg-[#eee9e3] h-4 w-40 rounded"/><div className="bg-[#eee9e3] mt-3 h-3 w-64 max-w-full rounded"/><div className="bg-[#eee9e3] mt-5 h-16 w-full rounded-lg"/></div>)}</div> : dailySales.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">{t("No sales recorded for this date.")}</p> : <div className="mt-4 space-y-4">{dailySales.map((bill) => <article key={bill.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">{bill.bill_number} · {bill.customer_name}</p><p className="text-xs text-neutral-500">{bill.customer_phone || t("No phone")} · {bill.table_name} · {new Date(bill.created_at).toLocaleString()}</p></div><div className="text-right text-sm"><p className="font-semibold">Received: Rs. {bill.collected_amount}</p><p className="text-neutral-500">Collected in selected period · Outstanding now: Rs. {bill.outstanding_amount}</p></div></div>{(bill.payments || []).length > 0 && <div className="mt-3 rounded-lg bg-[#f8f4ef] p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#80664c]">Payment breakdown</p>{bill.payments.map((payment: any, paymentIndex: number) => <div key={paymentIndex} className="flex justify-between gap-3 py-1 text-xs"><span className="capitalize">{String(payment.method).replace(/_/g, " ")}</span><b>Rs. {payment.amount}</b></div>)}</div>}<div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">{t("Food")}</th><th>{t("Quantity")}</th><th>{t("Price")}</th><th>{t("Total")}</th></tr></thead><tbody>{bill.items.map((item: any, index: number) => <tr key={index} className="border-b last:border-0"><td className="py-2">{item.name}</td><td>{item.quantity}</td><td>Rs. {item.unit_price}</td><td>Rs. {item.total}</td></tr>)}</tbody></table></div></article>)}</div>}
        </section>
      </div>, document.body)}
      {role === "admin" && <section id="daily-savings" className="pt-3"><div className="mb-3"><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#9b7957]">Reserve & cash discipline</p><h2 className="mt-1 text-xl font-extrabold tracking-tight">Daily savings</h2><p className="mt-1 text-xs text-neutral-500">A running record of cash transferred from the drawer into the savings reserve.</p></div><DailySavings embedded /></section>}
    </div>
  );
}
