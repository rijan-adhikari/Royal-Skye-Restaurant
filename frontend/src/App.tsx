import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import ProtectedRoute from "./components/ProtectedRoute";
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tables = lazy(() => import("./pages/Tables"));
const POS = lazy(() => import("./pages/POS"));
const Billing = lazy(() => import("./pages/Billing"));
const Credit = lazy(() => import("./pages/Credit"));
const Operations = lazy(() => import("./pages/Operations"));
const Admin = lazy(() => import("./pages/Admin"));
const Kitchen = lazy(() => import("./pages/Kitchen"));
const Bar = lazy(() => import("./pages/Bar"));
type NavItem = { to: string; label: string; icon: string; tab?: string };

function Shell({ children }: { children: React.ReactNode }) {
  const { fullName, role, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const currentTab = new URLSearchParams(location.search).get("tab") || "";

  const isManager = role === "admin" || role === "manager";
  const workspace: NavItem[] = [
    ...(["admin", "manager", "cashier"].includes(role || "") ? [{ to: "/dashboard", label: t("Dashboard"), icon: "▦" }] : []),
    { to: "/tables", label: t("Tables & POS"), icon: "⌂" },
    ...(["admin", "manager", "cashier"].includes(role || "") ? [
      { to: "/billing", label: t("Billing & Orders"), icon: "▤" },
      { to: "/credit", label: t("Credit"), icon: "◉" },
    ] : []),
    ...(["admin", "manager", "kitchen"].includes(role || "") ? [{ to: "/kitchen", label: t("Kitchen"), icon: "♨" }] : []),
    ...(["admin", "manager", "bar"].includes(role || "") ? [{ to: "/bar", label: t("Bar"), icon: "◌" }] : []),
  ];
  const management: NavItem[] = isManager ? [
    { to: "/admin", label: role === "admin" ? t("Master Panel") : t("Menu & Customers"), icon: "♧" },
    { to: "/operations?tab=inventory", label: t("Inventory & Stock"), icon: "▣", tab: "inventory" },
    { to: "/operations?tab=expenses", label: t("Expenses"), icon: "↗", tab: "expenses" },
    { to: "/operations?tab=cash", label: t("Cash Drawer"), icon: "◷", tab: "cash" },
    { to: "/operations?tab=payroll", label: t("Payroll"), icon: "♙", tab: "payroll" },
    { to: "/operations?tab=reservations", label: t("Reservations"), icon: "▧", tab: "reservations" },
    { to: "/operations?tab=controls", label: t("Control Center"), icon: "⚙", tab: "controls" },
  ] : [];
  const administration: NavItem[] = role === "admin" ? [
    { to: "/operations?tab=staff", label: t("Staff Attendance"), icon: "♟", tab: "staff" },
    { to: "/operations?tab=reports", label: t("Reports & Activity"), icon: "☷", tab: "reports" },
  ] : [];
  const groups = [
    { label: t("Workspace"), items: workspace },
    ...(management.length ? [{ label: t("Management"), items: management }] : []),
    ...(administration.length ? [{ label: t("Administration"), items: administration }] : []),
  ];
  const activeItem = groups.flatMap(group => group.items).find(item =>
    item.to.split("?")[0] === location.pathname &&
    (item.tab ? item.tab === currentTab : !item.tab || !currentTab)
  );
  const pageTitle = activeItem?.label || (location.pathname === "/admin" ? t("Master Panel") : t("Royal Skye"));
  const initials = (fullName || "RS").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "RS";

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-[#211d1b] md:grid md:grid-cols-[238px_minmax(0,1fr)]">
      <aside className="flex flex-col bg-[#211e1d] px-4 py-4 text-[#f7f3ef] shadow-xl md:sticky md:top-0 md:h-screen md:px-4 md:py-6">
        <div className="flex items-center gap-3 px-2 pb-4 md:pb-7">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#b78a54] text-sm font-extrabold tracking-tight text-[#211d1b]">RS</div>
          <div className="min-w-0"><p className="text-sm font-extrabold tracking-[0.12em]">ROYAL SKYE</p><p className="text-[9px] tracking-[0.19em] text-[#bdb4ae]">RESTAURANT & BAR</p></div>
        </div>
        <div className="flex gap-5 overflow-x-auto pb-2 md:flex-col md:gap-4 md:overflow-visible md:pb-0">
          {groups.map(group => <section key={group.label} className="min-w-max md:min-w-0">
            <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#968b84]">{group.label}</p>
            <nav className="flex gap-1 md:flex-col">
              {group.items.map(item => {
                const active = item.to.split("?")[0] === location.pathname &&
                  (item.tab ? item.tab === currentTab : !currentTab);
                return <Link key={item.to} to={item.to} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[12px] transition-colors ${active ? "bg-[#39312e] text-white ring-1 ring-[#b78a54]/20" : "text-[#d5cec8] hover:bg-[#302a27] hover:text-white"}`}>
                  <span className="w-4 text-center text-sm text-[#c6a77e]">{item.icon}</span><span>{item.label}</span>
                </Link>;
              })}
            </nav>
          </section>)}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#403936] px-2 pt-4 md:mt-auto">
          <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{fullName}</p><p className="text-[10px] capitalize text-[#a99f98]">{role}</p></div>
          <button onClick={logout} className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-[11px] text-white/75 hover:bg-white/10 hover:text-white">{t("Log out")}</button>
        </div>
        <p className="hidden px-2 pt-4 text-[9px] tracking-[0.12em] text-[#80756e] md:block">ROYAL SKYE · OPERATIONS</p>
      </aside>

      <main className="min-w-0 px-4 py-5 md:px-7 md:py-7 xl:px-9">
        <div className="mx-auto w-full max-w-[1500px]">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#e9e4df] pb-4">
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#817872]">ROYAL SKYE / {pageTitle.toUpperCase()}</p><p className="mt-1 text-sm font-semibold text-[#817872]">{t("Restaurant management workspace")}</p></div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-[#e9e4df] bg-white px-3 py-2 text-xs shadow-sm"><span className="text-[#817872]">{t("Language")}</span><select aria-label="Select language" className="bg-transparent font-semibold outline-none" value={language} onChange={(event) => setLanguage(event.target.value as "en" | "ne")}><option value="en">English</option><option value="ne">नेपाली</option></select></label>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8d9ca] text-xs font-bold text-[#5f4631]">{initials}</div>
              <div className="hidden sm:block"><p className="max-w-36 truncate text-xs font-semibold">{fullName}</p><p className="text-[10px] capitalize text-[#817872]">{role}</p></div>
            </div>
          </header>
          <div className="min-h-[70vh]">{children}</div>
          <footer className="pt-8 text-center text-[9px] tracking-[0.16em] text-[#a49a92]">ROYAL SKYE · DEVELOPED BY RIJAN ADHIKARI</footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { token } = useAuth();

  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-sm text-neutral-500">Loading...</div>}><Routes>
      <Route path="/login" element={token ? <Navigate to="/dashboard" /> : <Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "cashier"]}>
            <Shell><Dashboard /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tables"
        element={
          <ProtectedRoute>
            <Shell><Tables /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute>
            <Shell><POS /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "cashier"]}>
            <Shell><Billing /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/credit"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "cashier"]}>
            <Shell><Credit /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
            <Shell><Admin /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "kitchen"]}>
            <Shell><Kitchen /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bar"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "bar"]}>
            <Shell><Bar /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/operations"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
            <Shell><Operations /></Shell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
    </Routes></Suspense>
  );
}
