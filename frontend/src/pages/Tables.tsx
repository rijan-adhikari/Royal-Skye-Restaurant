import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface Floor { id: string; name: string; }
interface TableRow { id: string; floor_id: string; name: string; status: string; capacity: number; }

const statusStyle: Record<string, { label: string; card: string; dot: string }> = {
  available: { label: "Available", card: "border-[#d7e5d8] bg-[#f7fbf7] hover:border-[#9fbea3]", dot: "bg-[#668b6d]" },
  occupied: { label: "Occupied", card: "border-[#edcfcc] bg-[#fff8f7] hover:border-[#d59b96]", dot: "bg-[#b45b55]" },
  billing: { label: "Billing", card: "border-[#ecdcbf] bg-[#fffbf3] hover:border-[#d8b778]", dot: "bg-[#c39445]" },
  reserved: { label: "Reserved", card: "border-[#d7e0ed] bg-[#f7f9fd] hover:border-[#a4b8d3]", dot: "bg-[#6d88ad]" },
  cleaning: { label: "Cleaning", card: "border-[#e1dfdc] bg-[#faf9f8] hover:border-[#bcb7b0]", dot: "bg-[#8e8983]" },
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

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
    <header className="overflow-hidden rounded-[26px] bg-[#29211d] px-6 py-7 text-[#fffaf4] shadow-[0_18px_44px_rgba(45,30,22,.12)] md:px-8">
      <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#d7b17b]">Royal Skye / Front of house</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Tables & service</h1><p className="mt-2 text-sm text-[#c7b8ac]">Choose a table or open a takeaway and delivery order.</p></div><span className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-[#ead8c2]">{visibleTables.length} tables on this floor</span></div>
      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
        {[["Available",count("available"),"text-[#b7d2b9]"],["Occupied",count("occupied"),"text-[#efb6b0]"],["Billing",count("billing"),"text-[#f0d19b]"],["Reserved",count("reserved"),"text-[#b9c9e0]"]].map(([name,value,tone])=><div key={name}><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#b8a89b]">{name}</p><p className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p></div>)}
      </div>
    </header>

    <section className="grid gap-3 md:grid-cols-2">
      <button onClick={()=>startService("takeaway")} className="group flex items-center gap-4 rounded-2xl border border-[#e8dfd6] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-0.5 hover:border-[#c6a77f] hover:shadow-md"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f5eee5] text-xl text-[#8d6542]">↗</span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-[#382d26]">Takeaway order</strong><span className="mt-1 block text-xs text-[#928276]">Create a pickup order without a dining table.</span></span><span className="text-lg text-[#b59a7d] transition group-hover:translate-x-1">→</span></button>
      <button onClick={()=>startService("delivery")} className="group flex items-center gap-4 rounded-2xl border border-[#e8dfd6] bg-white p-5 text-left shadow-[0_5px_18px_rgba(45,30,22,.035)] transition hover:-translate-y-0.5 hover:border-[#c6a77f] hover:shadow-md"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f7eeee] text-xl text-[#963f3f]">⌁</span><span className="min-w-0 flex-1"><strong className="block text-sm font-extrabold text-[#382d26]">Delivery order</strong><span className="mt-1 block text-xs text-[#928276]">Capture customer contact and delivery address.</span></span><span className="text-lg text-[#b59a7d] transition group-hover:translate-x-1">→</span></button>
    </section>

    <section className="rounded-[24px] border border-[#e8dfd6] bg-white p-5 shadow-[0_8px_28px_rgba(45,30,22,.04)] md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a18d7c]">Dining room</p><h2 className="mt-1 text-xl font-extrabold text-[#30251f]">Floor plan</h2><p className="mt-1 text-xs text-[#928276]">Select an available table to start an order or open an occupied table.</p></div>
        <div className="flex flex-wrap gap-2">{Object.entries(statusStyle).map(([key,s])=><span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-[#faf8f5] px-2.5 py-1.5 text-[10px] font-semibold text-[#75675c]"><i className={`h-1.5 w-1.5 rounded-full ${s.dot}`}/>{s.label}</span>)}</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-[#eee7df] pb-4">{floors.map(f=><button key={f.id} onClick={()=>setActiveFloor(f.id)} className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${activeFloor===f.id?"bg-[#7d2523] text-white shadow-sm":"border border-[#e8dfd6] bg-white text-[#6f6258] hover:bg-[#faf7f3]"}`}>{f.name}</button>)}</div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <div className="py-12 text-center text-sm text-[#928276]">Loading floor plan…</div> : visibleTables.length ? <div className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {visibleTables.map(t=>{const s=statusStyle[t.status] || statusStyle.available;return <button key={t.id} onClick={()=>navigate(`/pos?table=${t.id}`)} className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${s.card}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#9a8b7f]">Dining table</span><i className={`h-2 w-2 rounded-full ${s.dot}`}/></div><p className="mt-4 text-2xl font-extrabold tracking-tight text-[#30251f]">{t.name}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-[#71645a]">{s.label}</span><span className="text-[10px] text-[#9b8b7f]">{t.capacity} seats</span></div><p className="mt-3 border-t border-black/[.06] pt-2 text-[10px] font-bold text-[#9a7652] group-hover:text-[#7d2523]">Open table →</p></button>})}
      </div> : <div className="mt-5 rounded-2xl border border-dashed border-[#e5dbd0] bg-[#fbfaf8] py-12 text-center"><p className="text-sm font-bold text-[#514238]">No tables on this floor</p><p className="mt-1 text-xs text-[#928276]">Choose another floor to continue.</p></div>}
    </section>

    {cabinTable && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8d6b9] bg-[#fffaf2] p-5"><div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a17d54]">Private dining</p><h2 className="mt-1 text-lg font-extrabold text-[#59432e]">Cabin room</h2><p className="mt-1 text-xs text-[#8c765e]">Private dining table with its configured cabin surcharge.</p></div><button onClick={()=>navigate(`/pos?table=${cabinTable.id}`)} className="rounded-xl bg-[#8b633d] px-5 py-2.5 text-xs font-extrabold text-white hover:bg-[#725032]">Open cabin →</button></section>}
  </div>;
}
