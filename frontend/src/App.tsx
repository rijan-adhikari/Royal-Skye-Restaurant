import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useLanguage } from "./context/LanguageContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoadingScreen from "./components/LoadingScreen";
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tables = lazy(() => import("./pages/Tables"));
const POS = lazy(() => import("./pages/POS"));
const Billing = lazy(() => import("./pages/Billing"));
const Credit = lazy(() => import("./pages/Credit"));
const Operations = lazy(() => import("./pages/Operations"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminControls = lazy(() => import("./pages/AdminControls"));
type NavItem = { to: string; label: string; icon: string; tab?: string; panel?: string };

const iconPaths: Record<string, string> = {
  overview: "M3 3h7v7H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 14h7v7H3z",
  tables: "M3 4h18v16H3z M8 4v16 M16 4v16 M3 10h18",
  billing: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",
  credit: "M12 2v20 M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  master: "M12 3 3 8l9 5 9-5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  inventory: "M4 7 12 3l8 4-8 4-8-4z M4 7v10l8 4 8-4V7 M12 11v10",
  expenses: "M4 5h16 M4 10h10 M4 15h7 M16 14l2 2 4-5",
  cash: "M3 6h18v13H3z M3 10h18 M7 15h3 M17 3v3",
  payroll: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  reservations: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M8 17h7",
  controls: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.8.1l-.2.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.5-1l-.2-.1-1.8-3.1.1-.2a1.7 1.7 0 0 0-.1-1.8l-.1-.2V10l.2-.1a1.7 1.7 0 0 0 1-1.5l.1-.2 3.1-1.8.2.1a1.7 1.7 0 0 0 1.8-.1l.2-.1h3.6l.1.2a1.7 1.7 0 0 0 1.5 1l.2.1 1.8 3.1-.1.2a1.7 1.7 0 0 0 .1 1.8l.1.2v3.6z",
  staff: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M17 11h6",
  reports: "M4 19V5 M4 19h17 M8 15l3-4 3 2 5-7",
};
function NavGlyph({ name, active }: { name: string; active: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-[#f1c98d]" : "text-[#b7aaa1] group-hover:text-white"}`}><path d={iconPaths[name] || iconPaths.overview}/></svg>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { fullName, role, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const currentTab = new URLSearchParams(location.search).get("tab") || "";
  const isManager = role === "admin" || role === "manager";
  // Keep the first-stage restaurant workflow focused; advanced tools remain available inside their relevant screens.
  const workspace: NavItem[] = [
    ...(["admin", "manager", "cashier"].includes(role || "") ? [{ to: "/dashboard", label: t("Dashboard"), icon: "overview" }] : []),
    { to: "/tables", label: t("Tables & POS"), icon: "tables" },
    ...(["admin", "manager", "cashier"].includes(role || "") ? [{ to: "/billing", label: t("Billing & Orders"), icon: "billing" }] : []),
  ];
  const management: NavItem[] = isManager ? [
    { to: "/admin?panel=menu", label: t("Menu Management"), icon: "master", panel: "menu" },
    { to: "/admin?panel=customers", label: t("Customer Management"), icon: "master", panel: "customers" },
    { to: "/operations?tab=inventory", label: t("Inventory"), icon: "inventory", tab: "inventory" },
    { to: "/operations?tab=expenses", label: t("Expenses"), icon: "expenses", tab: "expenses" },
    { to: "/operations?tab=controls", label: t("Control Center"), icon: "controls", tab: "controls" },
    ...(["admin", "manager"].includes(role || "") ? [{ to: "/admin-controls", label: role === "admin" ? t("Admin Controls") : t("Backup & Restore"), icon: "controls" }] : []),
  ] : [];
  const groups = [
    { label: t("Workspace"), items: workspace },
    ...(management.length ? [{ label: t("Restaurant management"), items: management }] : []),
  ];
  const activeItem = groups.flatMap(group => group.items).find(item =>
    item.to.split("?")[0] === location.pathname &&
    (item.panel ? item.panel === (new URLSearchParams(location.search).get("panel") || "menu") : item.tab ? item.tab === currentTab : !currentTab)
  );
  const pageTitle = activeItem?.label || (location.pathname === "/admin" ? t("Management") : t("Royal Skye"));
  const initials = (fullName || "RS").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "RS";

  return (
    <div className="rs-app-shell min-h-screen bg-[#070a0d] text-[#e8f2ef] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {mobileOpen && <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/45 lg:hidden"/>}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col overflow-y-auto bg-[#090f12] px-4 py-5 text-[#e8f2ef] shadow-[12px_0_40px_rgba(25,18,14,.12)] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-2 pb-7">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#d7b17b]/30 bg-[#fffaf4] p-0 shadow-lg shadow-black/20"><img src="/images/logo.jpg" alt="Royal Skye" className="h-full w-full object-contain"/></div>
          <div className="min-w-0"><p className="text-[13px] font-black tracking-[.19em] text-white">ROYAL SKYE</p><p className="mt-1 text-[9px] font-semibold tracking-[.22em] text-[#a99b91]">RESTAURANT & BAR</p></div>
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-[#b7aaa1] hover:bg-white/10 lg:hidden" aria-label="Close menu">✕</button>
        </div>
        <div className="mb-5 rounded-xl border border-white/[.07] bg-white/[.045] px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#a99b91]">Operations workspace</p>
          <p className="mt-1 text-xs font-semibold text-[#f0e6dc]">Management console</p>
        </div>
        <nav className="flex-1 space-y-6">
          {groups.map(group => <section key={group.label}>
            <p className="mb-2 px-3 text-[9px] font-extrabold uppercase tracking-[.2em] text-[#8e8178]">{group.label}</p>
            <div className="space-y-1">
              {group.items.map(item => {
                const active = item.to.split("?")[0] === location.pathname && (item.panel ? item.panel === (new URLSearchParams(location.search).get("panel") || "menu") : item.tab ? item.tab === currentTab : !currentTab);
                return <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={`group relative flex items-center gap-3 rounded-xl px-3 py-[11px] text-[12px] font-semibold transition-all duration-150 ${active ? "bg-gradient-to-r from-[#8b1a1a]/90 to-[#69201e]/80 text-white shadow-lg shadow-black/15 ring-1 ring-[#d8a86f]/20" : "text-[#c9beb6] hover:bg-white/[.065] hover:text-white"}`}>
                  {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#e4bc83]"/>}
                  <NavGlyph name={item.icon} active={active}/><span className="min-w-0 flex-1">{item.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-[#e4bc83]"/>}
                </Link>;
              })}
            </div>
          </section>)}
        </nav>
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[.055] p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d9b98f] text-xs font-black text-[#3a2920]">{initials}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{fullName}</p><p className="mt-0.5 text-[10px] capitalize text-[#aa9c92]">{role}</p></div>
            <button onClick={logout} title={t("Log out")} aria-label={t("Log out")} className="rounded-lg p-2 text-[#b9aaa0] transition hover:bg-white/10 hover:text-white">↪</button>
          </div>
          <p className="px-2 pt-4 text-[9px] font-semibold tracking-[.16em] text-[#766b64]">ROYAL SKYE · OPERATIONS</p>
        </div>
      </aside>
      <main className="min-w-0">
        <div className="sticky top-0 z-30 border-b border-[#1d3434] bg-[#0a1114]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-[76px] max-w-[1600px] items-center justify-between gap-3 px-4 py-3 md:px-7 xl:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#29413f] bg-[#101b1e] text-[#c5d8d2] shadow-sm lg:hidden" aria-label="Open navigation"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
              <div className="min-w-0"><p className="truncate text-[9px] font-bold uppercase tracking-[.2em] text-[#78928d]">ROYAL SKYE <span className="px-1 text-[#c7b9ac]">/</span> {pageTitle.toUpperCase()}</p><h1 className="mt-1 truncate text-lg font-extrabold tracking-tight text-[#e8f2ef] md:text-xl">{pageTitle}</h1></div>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              
              <div className="hidden h-9 w-px bg-[#e8e1da] sm:block"/>
              <div className="grid h-9 w-9 place-items-center rounded-full border border-[#d9c5ad] bg-[#efe3d5] text-xs font-black text-[#6a4932]">{initials}</div>
              <div className="hidden sm:block"><p className="max-w-36 truncate text-xs font-bold text-[#e8f2ef]">{fullName}</p><p className="text-[10px] capitalize text-[#78928d]">{role}</p></div>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-7 md:py-8 xl:px-10">
          <div key={location.pathname + location.search} className="rs-page-transition min-h-[70vh]">{children}</div>
          <footer className="pt-10 text-center text-[9px] font-semibold tracking-[.18em] text-[#b1a59b]">
            ROYAL SKYE · DEVELOPED BY{" "}
            <a href="https://adhikari-rijan.onrender.com/" target="_blank" rel="noopener noreferrer" className="transition hover:text-[#8b1a1a] hover:underline">
              RIJAN ADHIKARI
            </a>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { token } = useAuth();

  return (
    <Suspense fallback={<LoadingScreen />}><Routes>
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
        path="/admin-controls"
        element={<ProtectedRoute allowedRoles={["admin", "manager"]}><Shell><AdminControls /></Shell></ProtectedRoute>}
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
