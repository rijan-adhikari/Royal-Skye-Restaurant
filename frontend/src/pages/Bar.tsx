import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, wsBaseUrl } from "../api/client";

interface KOTItemView { id: string; quantity: number; notes: string; menu_item_name: string; }
interface KOTView { id: string; kot_number: string; status: string; order_number: string; table_name: string; customer_name?: string | null; phone?: string | null; delivery_address?: string | null; items: KOTItemView[]; }

const STATION = "bar";
const stages = [
  { id: "new", title: "New tickets", hint: "Waiting for kitchen acceptance", tone: "border-[#e7c99d] bg-[#fff8ed]", dot: "bg-[#c58b3e]" },
  { id: "accepted", title: "Accepted", hint: "Queued for preparation", tone: "border-[#d8c9b7] bg-[#faf6f1]", dot: "bg-[#a98762]" },
  { id: "preparing", title: "Preparing", hint: "Currently being prepared", tone: "border-[#e8c4a7] bg-[#fff4ec]", dot: "bg-[#c47b4d]" },
  { id: "ready", title: "Ready to serve", hint: "Completed by the kitchen", tone: "border-[#c5d9c8] bg-[#f1f7f1]", dot: "bg-[#64856c]" },
];
const next: Record<string, string> = { new: "accepted", accepted: "preparing", preparing: "ready", ready: "served" };
const label: Record<string, string> = { new: "Accept ticket", accepted: "Start preparing", preparing: "Mark ready", ready: "Mark served" };

export default function Kitchen() {
  const [kots, setKots] = useState<KOTView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/kots?station=${STATION}`);
      setKots(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Bar tickets could not be loaded. Check the connection and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const ws = new WebSocket(`${wsBaseUrl}/api/ws/updates`);
    ws.onmessage = () => load();
    ws.onerror = () => setError("Live updates are temporarily unavailable. Use refresh to check tickets.");
    return () => ws.close();
  }, [load]);

  const active = useMemo(() => kots.filter((k) => !["served", "cancelled"].includes(k.status)), [kots]);
  const advance = async (id: string, status: string) => {
    setBusyId(id);
    try { await api.patch(`/api/kots/${id}/status`, { status }); await load(); }
    catch (e: any) { setError(e?.response?.data?.detail || "Ticket status could not be updated."); }
    finally { setBusyId(""); }
  };

  return <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
    <header className="overflow-hidden rounded-[26px] bg-[#29211d] px-6 py-7 text-[#fffaf4] shadow-[0_18px_44px_rgba(45,30,22,.12)] md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-[#d7b17b]">Royal Skye / Service operations</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">Bar</h1><p className="mt-2 text-sm text-[#c7b8ac]">A live production board for food orders and kitchen hand-offs.</p></div>
        <button onClick={load} className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15">↻ Refresh tickets</button>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
        {[["Active tickets", active.length], ["New", active.filter(k=>k.status==="new").length], ["In preparation", active.filter(k=>k.status==="preparing").length], ["Ready", active.filter(k=>k.status==="ready").length]].map(([name,value])=><div key={name}><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#b8a89b]">{name}</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p></div>)}
      </div>
    </header>
    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-[#edc9c4] bg-[#fff4f2] px-4 py-3 text-sm text-[#9b3f38]"><span>{error}</span><button onClick={load} className="shrink-0 font-bold underline">Retry</button></div>}
    <div className="grid items-start gap-4 xl:grid-cols-4">
      {stages.map(stage => {
        const tickets = active.filter(k=>k.status===stage.id);
        return <section key={stage.id} className="min-w-0">
          <div className={`mb-3 rounded-2xl border px-4 py-3 ${stage.tone}`}><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`}/><h2 className="text-sm font-extrabold text-[#3b3029]">{stage.title}</h2></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#5a4a3d]">{tickets.length}</span></div><p className="mt-1 text-[10px] text-[#8b7a6d]">{stage.hint}</p></div>
          <div className="space-y-3">
            {tickets.map(k=><article key={k.id} className="rounded-2xl border border-[#e8dfd6] bg-white p-4 shadow-[0_5px_18px_rgba(45,30,22,.04)] transition hover:border-[#cbb79f] hover:shadow-[0_10px_25px_rgba(45,30,22,.07)]">
              <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#a18d7c]">{k.kot_number}</p><h3 className="mt-1 text-base font-extrabold text-[#30251f]">{k.table_name || "Service order"}</h3></div><span className="rounded-lg bg-[#f7f2ec] px-2 py-1 text-[10px] font-bold text-[#80664c]">{k.order_number}</span></div>
              {(k.customer_name || k.delivery_address) && <div className="mt-3 rounded-xl bg-[#fbf7f2] p-3 text-xs text-[#6e5b50]"><p className="font-bold text-[#49392d]">{k.customer_name || "Off-premise order"}{k.phone ? ` · ${k.phone}` : ""}</p>{k.delivery_address && <p className="mt-1">{k.delivery_address}</p>}</div>}
              <div className="my-3 space-y-2 border-y border-[#f0ebe5] py-3">{k.items.map(i=><div key={i.id} className="flex items-start gap-2 text-sm"><span className="grid h-6 min-w-6 place-items-center rounded-md bg-[#f4eee7] text-[11px] font-extrabold text-[#785b40]">{i.quantity}×</span><div className="min-w-0 flex-1"><p className="font-semibold text-[#3c312b]">{i.menu_item_name}</p>{i.notes && <p className="mt-0.5 text-xs text-[#9b8b7f]">Note: {i.notes}</p>}</div></div>)}</div>
              <button disabled={busyId===k.id} onClick={()=>advance(k.id,next[k.status])} className="w-full rounded-xl bg-[#7d2523] px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#67201e] disabled:cursor-wait disabled:opacity-60">{busyId===k.id ? "Updating…" : label[k.status] || "Update ticket"} <span className="ml-1">→</span></button>
            </article>)}
            {!tickets.length && <div className="rounded-2xl border border-dashed border-[#e5dbd0] bg-[#fbfaf8] px-4 py-8 text-center"><p className="text-xs font-semibold text-[#85776c]">{loading ? "Loading tickets…" : "No tickets in this stage"}</p></div>}
          </div>
        </section>;
      })}
    </div>
    <p className="text-center text-[10px] font-medium tracking-wide text-[#a99a8d]">LIVE BAR QUEUE · TICKETS UPDATE WHEN ORDER STATUS CHANGES</p>
  </div>;
}
