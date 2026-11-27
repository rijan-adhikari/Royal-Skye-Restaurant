import React from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminControl from "./AdminControl";
import Admin from "./Admin";

export default function AdminControls() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { role } = useAuth();
  const isManager = role === "manager";
  const directTabs: Record<string, string> = { "/sales": "sales", "/reports": "reports", "/backup": "backup", "/settings": "settings" };
  const standalone = Boolean(directTabs[location.pathname]);
  const section = !isManager && params.get("section") === "staff" ? "staff" : "system";
  const requestedTab = directTabs[location.pathname] || params.get("tab") || undefined;
  return <div className="mx-auto max-w-7xl space-y-5 pb-8">
    <header className="rounded-2xl border border-[var(--rs-line)] bg-[var(--rs-panel)] p-5 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[var(--rs-gold)]">{isManager ? "Manager workspace" : "Restricted workspace / Administrator"}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-[var(--rs-ink)]">Admin Controls</h1>
      <p className="mt-1 text-sm text-[var(--rs-muted)]">{isManager ? "Database backup and restore tools." : "Privileged account, business configuration, backup and security controls."}</p>
      {!standalone && <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setParams({section:"system"})} className={"rounded-xl px-4 py-2.5 text-xs font-bold "+(section==="system"?"bg-[#7d2523] text-white":"border border-[var(--rs-line)] text-[var(--rs-ink)]")}>System & security</button>
        {!isManager && <button onClick={() => setParams({section:"staff"})} className={"rounded-xl px-4 py-2.5 text-xs font-bold "+(section==="staff"?"bg-[#7d2523] text-white":"border border-[var(--rs-line)] text-[var(--rs-ink)]")}>Staff Accounts</button>}
      </div>
    </header>
    {section === "system" ? <AdminControl visibleTabs={isManager ? ["backup"] : ["sales","suppliers","reports","backup","audit","settings","loyalty","account"]} managerView={isManager} initialTab={isManager ? "backup" : requestedTab} hideNavigation={standalone} /> : <Admin staffOnly />}
  </div>;
}
