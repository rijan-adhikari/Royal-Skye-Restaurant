import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface Floor { id: string; name: string; }
interface TableRow { id: string; floor_id: string; name: string; status: string; capacity: number; }

const statusStyle: Record<string, { label: string; card: string; dot: string }> = {
  available: { label: "Available", card: "table-card--available", dot: "table-status-dot" },
  occupied: { label: "Occupied", card: "table-card--occupied", dot: "table-status-dot" },
  billing: { label: "Billing", card: "table-card--billing", dot: "table-status-dot" },
  reserved: { label: "Reserved", card: "table-card--reserved", dot: "table-status-dot" },
  cleaning: { label: "Cleaning", card: "table-card--cleaning", dot: "table-status-dot" },
};

export default function Tables() {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [activeFloor, setActiveFloor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.get("/api/floors"), api.get("/api/tables")]).then(([floorRes, tableRes]) => {
      const fetchedFloors = floorRes.data as Floor[];
      setFloors(fetchedFloors);
      setTables(tableRes.data as TableRow[]);
      const ground = fetchedFloors.find(f=>/ground/i.test(f.name));
      setActiveFloor(ground?.id || fetchedFloors[0]?.id || null);
    }).catch((e:any)=>setError(e?.response?.data?.detail || "Dining floor information could not be loaded.")).finally(()=>setLoading(false));
  }, []);

  const visibleTables = useMemo(()=>tables.filter(t=>t.floor_id===activeFloor && !/cabin|service orders/i.test(t.name)),[tables,activeFloor]);
  const cabinTable = tables.find(t=>/cabin/i.test(t.name));
  const count = (status:string)=>visibleTables.filter(t=>t.status===status).length;
  const startService = (service:"takeaway"|"delivery")=>navigate(`/pos?service=${service}`);

  return <div className="tables-page mx-auto max-w-[1500px] space-y-6 pb-8">
    <header className="tables-hero overflow-hidden rounded-[26px] bg-[#29211d] px-6 py-7 text-[#fffaf4] shadow-[0_18px_44px_rgba(45,30,22,.12)] md:px-8">
      <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#d7b17b]">Royal Skye / Front of house</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Tables & service</h1><p className="mt-2 text-sm text-[#c7b8ac]">Choose a table or open a takeaway and delivery order.</p></div><span className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#ead8c2]">{visibleTables.length} tables on this floor</span></div>
      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
        {[["Available",count("available"),"text-[#b7d2b9]"],["Occupied",count("occupied"),"text-[#efb6b0]"],["Billing",count("billing"),"text-[#f0d19b]"],["Reserved",count("reserved"),"text-[#b9c9e0]"]].map(([name,value,tone])=><div key={name}><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#b8a89b]">{name}</p><p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p></div>)}
      </div>
    </header>

    <section className="grid gap-3 md:grid-cols-2">
      <button onClick={()=>startService("takeaway")} className="table-service-card group flex items-center gap-4 rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f5eee5] text-xl text-[#8d6542]">↗</span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-[#382d26]">Takeaway order</strong><span className="mt-1 block text-xs text-[#928276]">Create a pickup order without a dining table.</span></span><span className="text-lg text-[#b59a7d] transition group-hover:translate-x-1">→</span></button>
      <button onClick={()=>startService("delivery")} className="table-service-card group flex items-center gap-4 rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7eeee] text-xl text-[#963f3f]">⌁</span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-[#382d26]">Delivery order</strong><span className="mt-1 block text-xs text-[#928276]">Capture customer contact and delivery address.</span></span><span className="text-lg text-[#b59a7d] transition group-hover:translate-x-1">→</span></button>
    </section>

    <section className="rounded-[24px] border border-[var(--rs-line)] bg-[var(--rs-panel)] p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a18d7c]">Dining room</p><h2 className="mt-1 text-xl font-extrabold text-[#30251f]">Floor plan</h2><p className="mt-1 text-xs text-[#928276]">Select an available table to start an order or open an occupied table.</p></div>
        <div className="flex flex-wrap gap-2">{Object.entries(statusStyle).map(([key,s])=><span key={key} className="table-status-legend inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold"><i className={`h-1.5 w-1.5 rounded-full ${s.dot}`}/>{s.label}</span>)}</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-[#eee7df] pb-4">{floors.map(f=><button key={f.id} aria-pressed={activeFloor===f.id} onClick={()=>setActiveFloor(f.id)} className="table-floor-button rounded-xl border px-4 py-2.5 text-xs font-bold transition">{f.name}</button>)}</div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <div aria-label="Loading dining floor" className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">{Array.from({length:8},(_,i)=><div key={i} className="rounded-2xl border border-[var(--rs-line)] bg-[var(--rs-panel)] p-4"><div className="rs-skeleton h-3 w-24 rounded"/><div className="rs-skeleton mt-5 h-8 w-20 rounded"/><div className="rs-skeleton mt-4 h-3 w-28 rounded"/><div className="rs-skeleton mt-4 h-7 w-full rounded-lg"/></div>)}</div> : visibleTables.length ? <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {visibleTables.map(t=>{const s=statusStyle[t.status] || statusStyle.available;return <button key={t.id} onClick={()=>navigate(`/pos?table=${t.id}`)} className={`table-card group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${s.card}`}><div className="flex items-center justify-between gap-2"><span className="table-kicker text-[10px] font-extrabold uppercase tracking-[.13em]">Dining table</span><i className={`table-status-dot h-2 w-2 rounded-full ${s.dot}`}/></div><p className="table-name mt-4 text-2xl font-extrabold tracking-tight">{t.name}</p><div className="table-meta mt-3 flex items-center justify-between gap-2"><span className="table-status-text text-[11px] font-bold">{s.label}</span><span className="text-[10px]">{t.capacity} seats</span></div><p className="table-action mt-3 border-t pt-2 text-[10px] font-bold">Open table →</p></button>})}
      </div> : <div className="table-empty-state mt-5 rounded-2xl border border-dashed py-12 text-center"><p className="text-sm font-bold text-[#514238]">No tables on this floor</p><p className="mt-1 text-xs text-[#928276]">Choose another floor to continue.</p></div>}
    </section>

    {cabinTable && <section className="table-cabin-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5"><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[var(--rs-gold)]">Private dining</p><h2 className="mt-1 text-lg font-extrabold text-[var(--rs-ink)]">Cabin room</h2><p className="mt-1 text-xs text-[var(--rs-muted)]">Private dining table with its configured cabin surcharge.</p></div><button onClick={()=>navigate(`/pos?table=${cabinTable.id}`)} className="rounded-xl bg-[#8b633d] px-5 py-2.5 text-xs font-extrabold text-white hover:bg-[#725032]">Open cabin →</button></section>}
  </div>;
}
