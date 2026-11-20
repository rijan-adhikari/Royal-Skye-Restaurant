import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

const money = (v: any) => "Rs. " + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DailySavings({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<any>({ total: "0", entries: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await api.get("/api/admin/daily-savings");
      setData(r.data || { total: "0", entries: [] });
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not load daily savings.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return <section className={embedded ? "overflow-hidden rounded-[24px] border border-[#e8dfd6] bg-white shadow-[0_8px_28px_rgba(45,30,22,.04)]" : "mx-auto max-w-6xl space-y-5"}>
    <div className={embedded ? "flex flex-wrap items-center justify-between gap-4 border-b border-[#eee7df] px-5 py-5 md:px-6" : "flex items-end justify-between gap-3"}>
      <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a18d7c]">Royal Skye / Finance</p><h2 className={embedded ? "mt-1 text-xl font-extrabold tracking-tight text-[#30251f]" : "mt-1 text-3xl font-bold"}>Daily savings</h2><p className="mt-1 text-xs text-[#928276]">Cash transferred from the drawer into the savings reserve.</p></div>
      <div className="flex items-center gap-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9b8b7f]">All-time total</p><p className="text-xl font-extrabold tabular-nums text-[#477453]">{money(data.total)}</p><button onClick={load} disabled={loading} className="rounded-xl border border-[#e8dfd6] bg-white px-3 py-2 text-xs font-bold text-[#6f6258] hover:bg-[#faf7f3] disabled:opacity-50">↻ Refresh</button></div>
    </div>
    {error && <p className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 md:mx-6">{error}</p>}
    <div className="px-5 py-4 md:px-6"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold text-[#43352c]">Savings history</h3><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#a18d7c]">Latest 1,000 entries</span></div>
      {loading ? <p className="py-8 text-center text-sm text-[#928276]">Loading savings history…</p> : !data.entries?.length ? <div className="rounded-xl border border-dashed border-[#e5dbd0] bg-[#fbfaf8] px-4 py-8 text-center"><p className="text-sm font-bold text-[#514238]">No savings recorded yet</p><p className="mt-1 text-xs text-[#928276]">Record a transfer from Cash Drawer → Add to daily savings.</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[#eee7df] text-[10px] font-bold uppercase tracking-[.12em] text-[#a18d7c]"><th className="py-3 pr-4">Date & time</th><th className="pr-4">Amount</th><th className="pr-4">Notes</th><th>Recorded by</th></tr></thead><tbody>{data.entries.map((x: any)=><tr key={x.id} className="border-b border-[#f2ede7] last:border-0"><td className="whitespace-nowrap py-3 pr-4 text-xs text-[#71645a]">{new Date(x.created_at).toLocaleString()}</td><td className="pr-4 font-extrabold tabular-nums text-[#477453]">{money(x.amount)}</td><td className="pr-4 text-xs text-[#71645a]">{x.notes || "—"}</td><td className="text-xs font-semibold text-[#514238]">{x.created_by_name || "—"}</td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
