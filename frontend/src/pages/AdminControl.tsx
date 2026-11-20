import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Tab = "cash" | "sales" | "suppliers" | "reports" | "service" | "backup" | "audit" | "settings" | "loyalty";
type AdminControlProps = { visibleTabs?: Tab[]; embedded?: boolean; managerView?: boolean; initialTab?: string };
const tabs: { id: Tab; label: string }[] = [
  { id: "cash", label: "Cash drawer" },
  { id: "sales", label: "Manage sales" }, { id: "suppliers", label: "Supplier ledger" },
  { id: "reports", label: "Reports & exports" }, { id: "service", label: "Service orders" }, { id: "loyalty", label: "Loyalty points" }, { id: "backup", label: "Backup & restore" },
  { id: "audit", label: "Audit trail" }, { id: "settings", label: "Business settings" },
];
const field = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";
const primary = "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const panel = "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm";
const money = (v: any) => "Rs. " + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdminControl({ visibleTabs, embedded = false, managerView = false, initialTab }: AdminControlProps) {
  const { role } = useAuth();
  const canAdminEditCash = role === "admin";
  // Managers can use day-to-day operations and loyalty controls, but destructive backup/restore and audit access remain admin-only.
  const roleTabs = managerView ? tabs.filter((item) => ["cash", "service", "loyalty"].includes(item.id)) : tabs;
  const availableTabs = visibleTabs ?? roleTabs.map((item) => item.id);
  const [tab, setTab] = useState<Tab>(initialTab && availableTabs.includes(initialTab as Tab) ? initialTab as Tab : (availableTabs[0] ?? "cash"));
  const [data, setData] = useState<any>({ shifts: [], refunds: [], bills: [], suppliers: [], inventory: [], ledger: [], supplierBalances: [], loyalty: [], serviceOrders: [], audit: [], salesSummary: null, monthlySales: [], yearlySales: [] });
  const [shift, setShift] = useState<any>(null);
  const [tax, setTax] = useState<any>({ tax_enabled: true, tax_percent: "14", service_charge_enabled: false, service_charge_percent: "0" });
  const [loyaltySettings, setLoyaltySettings] = useState<any>({ enabled: true, spend_per_point: "100", point_value: "1" });
  const [restaurant, setRestaurant] = useState<any>({ name: "", email: "", phone: "", address: "", pan: "", vat: "", currency: "NPR", logo_path: "", qr_image_path: "", receipt_footer: "" });
  const [openFloat, setOpenFloat] = useState("0");
  const [countedCash, setCountedCash] = useState("");
  const [cashEntry, setCashEntry] = useState({ entry_type: "cash_in", amount: "", reference: "", notes: "" });
  const [editingCashEntry, setEditingCashEntry] = useState<string | null>(null);
  const [cashEntryEdit, setCashEntryEdit] = useState({ entry_type: "cash_in", amount: "", reference: "", notes: "" });
  const [refund, setRefund] = useState({ bill_id: "", amount: "", reason: "", method: "cash" });
  const [supplierEntry, setSupplierEntry] = useState({ supplier_id: "", entry_type: "payment", amount: "", reference: "", notes: "" });
  const [supplierReturn, setSupplierReturn] = useState({ supplier_id: "", item_id: "", quantity: "", unit_cost: "", reference: "", notes: "" });
  const [adjustment, setAdjustment] = useState({ customer_id: "", points: "", notes: "" });
  const [reportFrom, setReportFrom] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [salesDetailsOpen, setSalesDetailsOpen] = useState({ monthly: false, yearly: false, individual: false });
  const [saleDateDraft, setSaleDateDraft] = useState("");
  const [selectedSaleDates, setSelectedSaleDates] = useState<string[]>([]);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const requests = [
      ["current", "/api/admin/cash-shifts/current"], ["shifts", "/api/admin/cash-shifts"],
      ...(!managerView ? ([["sales", "/api/admin/sales"], ["salesSummary", "/api/dashboard/summary"], ["monthlySales", "/api/dashboard/monthly-sales"], ["yearlySales", "/api/dashboard/yearly-sales"]] as [string, string][]) : []),
      ["suppliers", "/api/operations/suppliers"], ["inventory", "/api/operations/inventory"], ["ledger", "/api/admin/suppliers/ledger"], ["supplierBalances", "/api/admin/suppliers/balances"],
      ["serviceOrders", "/api/admin/service-orders"],
      ["loyalty", "/api/admin/loyalty/accounts"], ["loyaltySettings", "/api/admin/loyalty/settings"],
      ...(!managerView ? ([["audit", "/api/admin/audit"], ["tax", "/api/settings/tax"], ["restaurant", "/api/settings/restaurant"]] as [string, string][]) : []),
    ] as const;
    const results = await Promise.allSettled(requests.map(([, url]) => api.get(url)));
    const next: any = {};
    results.forEach((result, index) => {
      if (result.status === "fulfilled") next[requests[index][0]] = result.value.data;
    });
    setShift(next.current ?? null);
    if (!next.current && Array.isArray(next.shifts)) {
      const previousClosed = next.shifts.find((item: any) => item.status === "closed");
      if (previousClosed) setOpenFloat(String(previousClosed.counted_cash ?? previousClosed.expected_cash ?? previousClosed.opening_float ?? "0"));
    }
    setData((old: any) => ({ ...old, ...next }));
    if (next.tax) setTax(next.tax);
    if (next.restaurant) setRestaurant(next.restaurant);
    if (next.loyaltySettings) setLoyaltySettings(next.loyaltySettings);
  };

  const openPeriodSales = async (period: "monthly" | "yearly") => {
    setBusy(true); setError("");
    try { const response = await api.get(`/api/dashboard/${period}-sales`); setData((old: any) => ({ ...old, [period === "monthly" ? "monthlySales" : "yearlySales"]: response.data })); }
    catch (e: any) { setError(apiErrorMessage(e, `Could not load ${period} sales details.`)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load().catch(() => setError("Could not load administration data.")); }, []);
  useEffect(() => { if (!availableTabs.includes(tab)) setTab(availableTabs[0] ?? "cash"); }, [availableTabs.join(","), tab]);
  useEffect(() => { if (initialTab && availableTabs.includes(initialTab as Tab)) setTab(initialTab as Tab); }, [initialTab, availableTabs.join(",")]);

  const run = async (action: () => Promise<any>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); await load(); }
    catch (e: any) { setError(apiErrorMessage(e, "Control centre operation failed")); }
    finally { setBusy(false); }
  };

  const openShift = async () => { await run(() => api.post("/api/admin/cash-shifts/open", { opening_float: Number(openFloat) }), "Cash drawer shift opened."); setCountedCash(""); };
  const closeShift = () => {
    if (!shift || !countedCash.trim()) return;
    run(() => api.post(`/api/admin/cash-shifts/${shift.id}/close`, { counted_cash: Number(countedCash) }), "Shift closed and variance recorded.");
    setCountedCash("");
  };
  const addCashEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;
    const isSavings = cashEntry.entry_type === "daily_savings";
    run(() => api.post(isSavings ? `/api/admin/cash-shifts/${shift.id}/daily-savings` : `/api/admin/cash-shifts/${shift.id}/entries`,
      isSavings ? { entry_type: "cash_out", amount: Number(cashEntry.amount), notes: cashEntry.notes } : { ...cashEntry, amount: Number(cashEntry.amount) }),
      isSavings ? "Amount transferred to daily savings." : "Cash movement recorded.");
    setCashEntry({ entry_type: "cash_in", amount: "", reference: "", notes: "" });
  };
  const editCashEntry = (entry: any) => {
    setEditingCashEntry(entry.id);
    setCashEntryEdit({ entry_type: entry.entry_type, amount: String(entry.amount), reference: entry.reference || "", notes: entry.notes || "" });
  };
  const saveCashEntryEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift || !editingCashEntry) return;
    run(() => api.patch(`/api/admin/cash-shifts/${shift.id}/entries/${editingCashEntry}`, { ...cashEntryEdit, amount: Number(cashEntryEdit.amount) }), "Cash movement updated.");
    setEditingCashEntry(null);
  };
  const deleteCashEntry = async (entry: any, shiftId: string = shift?.id) => {
    if (!shiftId) return;
    const systemGenerated = ["sale", "refund"].includes(entry.entry_type);
    if (systemGenerated) {
      const reason = window.prompt(`Reason for deleting this system-generated ${entry.entry_type} entry (NPR ${money(entry.amount)}):`);
      if (!reason || reason.trim().length < 3) return;
      if (!window.confirm(`Delete only this cash-drawer ${entry.entry_type} record? The original bill/refund record will remain unchanged. ${reason.trim()}`)) return;
      await run(() => api.delete(`/api/admin/cash-shifts/${shiftId}/entries/${entry.id}/system-delete`, { params: { reason: reason.trim() } }), "Cash-drawer entry deleted and reconciliation updated.");
      return;
    }
    if (!window.confirm(`Delete this ${entry.entry_type.replace("_", " ")} record for ${money(entry.amount)}? This will change the shift expected cash.`)) return;
    await run(() => api.delete(`/api/admin/cash-shifts/${shiftId}/entries/${entry.id}`), "Cash movement deleted.");
  };
  const correctSystemSaleEntry = async (entry: any, shiftId: string) => {
    const method = window.prompt("Correct payment method (cash, qr, card, bank_transfer):", "qr");
    if (method === null) return;
    const normalized = method.trim().toLowerCase();
    if (!["cash", "qr", "card", "bank_transfer"].includes(normalized)) {
      setError("Choose cash, qr, card or bank_transfer.");
      return;
    }
    await run(() => api.patch(`/api/admin/cash-shifts/${shiftId}/entries/${entry.id}/sale-correction`, { method: normalized }),
      normalized === "cash" ? "Payment remains recorded as cash." : `Payment changed to ${normalized}; removed from physical cash drawer.`);
  };

  const correctClosedCashEntry = async (entry: any, shiftId: string) => {
    const amount = window.prompt("Correct cash movement amount (NPR):", String(entry.amount));
    if (amount === null) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError("Enter a valid amount greater than zero."); return; }
    const reference = window.prompt("Reference:", entry.reference || ""); if (reference === null) return;
    const notes = window.prompt("Notes:", entry.notes || ""); if (notes === null) return;
    await run(() => api.patch(`/api/admin/cash-shifts/${shiftId}/entries/${entry.id}/closed-correction`, { entry_type: entry.entry_type, amount: parsed, reference, notes }), "Closed shift cash movement corrected and reconciliation recalculated.");
  };
  const deleteClosedCashEntry = async (entry: any, shiftId: string) => {
    if (!window.confirm(`Delete the ${entry.entry_type.replace("_"," ")} record for ${money(entry.amount)} from this closed shift? Reconciliation will be recalculated and the action audited.`)) return;
    await run(() => api.delete(`/api/admin/cash-shifts/${shiftId}/entries/${entry.id}/closed-correction`), "Closed shift cash movement deleted and reconciliation recalculated.");
  };

  const addSupplierEntry = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api.post("/api/admin/suppliers/ledger", { ...supplierEntry, amount: Number(supplierEntry.amount) }), "Supplier ledger entry saved.");
    setSupplierEntry({ ...supplierEntry, amount: "", reference: "", notes: "" });
  };
  const returnStockToSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api.post("/api/operations/supplier-returns", {
      ...supplierReturn, quantity: Number(supplierReturn.quantity), unit_cost: Number(supplierReturn.unit_cost),
    }), "Supplier return posted; stock and supplier ledger updated.");
    setSupplierReturn({ supplier_id: "", item_id: "", quantity: "", unit_cost: "", reference: "", notes: "" });
  };
  const voidSale = async (sale: any) => {
    const reason = window.prompt(`Reason for voiding ${sale.bill_number}:`);
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm(`Void ${sale.bill_number}? It will be excluded from reports and stock effects will be reversed. Any money already received is not automatically refunded.`)) return;
    await run(() => api.patch(`/api/admin/sales/${sale.id}/void`, { reason: reason.trim() }), "Sale voided and excluded from reports.");
  };
  const permanentlyDeleteSale = async (sale: any) => {
    if (!window.confirm(`PERMANENTLY DELETE ${sale.bill_number}? This cannot be undone. Cash-drawer history and the admin audit trail are retained.`)) return;
    if (window.prompt(`Type DELETE ${sale.bill_number} to confirm:`) !== `DELETE ${sale.bill_number}`) return;
    await run(() => api.delete(`/api/admin/sales/${sale.id}`), "Sale permanently deleted.");
  };
  const updateServiceOrder = async (orderId: string, status: string) => {
    await run(() => api.patch(`/api/admin/service-orders/${orderId}/status`, { status }), "Service order status updated.");
  };

  const downloadReport = async (format: "csv" | "xlsx" | "pdf") => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await api.get(`/api/admin/reports/sales.${format}`, {
        params: { start: reportFrom, end: reportTo }, responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `royal-skye-sales-${reportFrom}-to-${reportTo}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setMessage(`${format.toUpperCase()} sales report generated.`);
    } catch (e: any) {
      setError("Could not generate the report for the selected dates.");
    } finally { setBusy(false); }
  };

  const downloadBackup = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await api.get("/api/admin/backup", { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `royal-skye-backup-${new Date().toISOString().slice(0, 10)}.dump`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setMessage("Database backup downloaded. Keep it somewhere secure.");
    } catch {
      setError("Database backup failed. Check the backend logs and database connection.");
    } finally { setBusy(false); }
  };

  const restoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupFile || restoreConfirmation !== "RESTORE ROYAL SKYE DATABASE") {
      setError("Choose a .dump file and enter the exact confirmation phrase.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const body = new FormData();
      body.append("backup_file", backupFile);
      body.append("confirmation", restoreConfirmation);
      const response = await api.post("/api/admin/restore", body);
      setMessage(`${response.data.message} Safety backup: ${response.data.safety_backup}`);
      setBackupFile(null); setRestoreConfirmation("");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Database restore failed. The pre-restore safety backup is retained.");
    } finally { setBusy(false); }
  };

  const saveLoyaltySettings = () => run(() => api.put("/api/admin/loyalty/settings", {
    enabled: !!loyaltySettings.enabled,
    spend_per_point: Number(loyaltySettings.spend_per_point),
    point_value: Number(loyaltySettings.point_value),
  }), "Loyalty settings saved.");

  const adjustLoyaltyPoints = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustment.customer_id || !adjustment.notes.trim() || !Number.isFinite(Number(adjustment.points)) || Number(adjustment.points) === 0) {
      setError("Select a customer and enter a non-zero point adjustment with a reason.");
      return;
    }
    run(() => api.post("/api/admin/loyalty/adjust", { ...adjustment, points: Number(adjustment.points) }), "Customer loyalty points adjusted.");
    setAdjustment({ customer_id: "", points: "", notes: "" });
  };

  const saveSettings = async () => {
    if (!restaurant.name?.trim()) {
      setError("Restaurant name is required.");
      return;
    }
    const taxPercent = Number(tax.tax_percent);
    const servicePercent = Number(tax.service_charge_percent);
    if (![taxPercent, servicePercent].every(Number.isFinite)
        || taxPercent < 0 || taxPercent > 100 || servicePercent < 0 || servicePercent > 100
) {
      setError("Check tax and service charge (0–100%).");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    const steps: [string, () => Promise<any>][] = [
      ["Restaurant profile", () => api.put("/api/settings/restaurant", restaurant)],
      ["Tax and service charge", () => api.put("/api/settings/tax", { ...tax, tax_percent: taxPercent, service_charge_percent: servicePercent })],
    ];
    try {
      for (const [label, save] of steps) {
        try { await save(); }
        catch (error: any) {
          throw new Error(`${label} could not be saved: ${apiErrorMessage(error, "Server rejected the update")}`);
        }
      }
      setMessage("All business settings saved successfully.");
      await load();
    } catch (error: any) {
      setError(error?.message || "Business settings could not be saved.");
    } finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Royal Skye · {embedded ? "Restaurant Operations" : "Administration"}</p><h1 className="mt-1 text-3xl font-bold">{embedded ? (tab === "cash" ? "Cash drawer" : "Restaurant operations") : "Admin controls"}</h1><p className="text-sm text-neutral-500">{embedded ? "Cash handling, order fulfilment and customer loyalty." : "Sales oversight, suppliers, reports, business configuration and security."}</p></div>
      <button className={primary} disabled={busy} onClick={() => load()}>{busy ? "Working…" : "Refresh"}</button>
    </header>
    {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <nav className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-3">
      {([{label:"Cash & transactions",ids:["cash","sales","suppliers"]},{label:"Customers & service",ids:["service","loyalty"]},{label:"Reports & administration",ids:["reports","backup","audit","settings"]}] as const).map(group=>{const items=tabs.filter(item=>(group.ids as readonly string[]).includes(item.id)&&availableTabs.includes(item.id));return items.length?<section key={group.label}><p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-[#9b8065]">{group.label}</p><div className="flex flex-wrap gap-1.5">{items.map(item=><button key={item.id} type="button" onClick={()=>setTab(item.id)} className={"rounded-lg px-3 py-2 text-xs font-bold transition "+(tab===item.id?"bg-[#7b2926] text-white shadow-sm":"bg-[#f7f3ee] text-[#6d5a4a] hover:bg-[#eee5db]")}>{item.label}</button>)}</div></section>:null})}
    </nav>

    {tab === "cash" && <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className={panel}>
        <h2 className="font-semibold text-lg">Cash drawer session</h2>
        {shift ? <div className="mt-3 space-y-3">
          <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-800">OPEN SHIFT · {shift.opened_by_name}</p><p className="mt-1 text-2xl font-bold">{money(shift.expected_cash)}</p><p className="text-xs text-neutral-500">Expected cash in drawer · Opening float {money(shift.opening_float)}</p></div>
          <form onSubmit={addCashEntry} className="space-y-2">
            <label className="block text-xs">Movement<select className={field} value={cashEntry.entry_type} onChange={e => setCashEntry({ ...cashEntry, entry_type: e.target.value })}><option value="cash_in">Cash in</option><option value="cash_out">Cash out</option><option value="payout">Payout</option><option value="daily_savings">Add to daily savings</option></select></label>
            <input required type="number" min="0.01" step="0.01" className={field} placeholder="Amount (NPR)" value={cashEntry.amount} onChange={e => setCashEntry({ ...cashEntry, amount: e.target.value })} />
            <input className={field} placeholder="Reference" value={cashEntry.reference} onChange={e => setCashEntry({ ...cashEntry, reference: e.target.value })} />
            <input className={field} placeholder="Notes" value={cashEntry.notes} onChange={e => setCashEntry({ ...cashEntry, notes: e.target.value })} />
            <button className={primary} disabled={busy}>Record movement</button>
          </form>
          <div className="border-t pt-3 space-y-2"><label className="block text-xs">Counted cash at close<input required type="number" min="0" step="0.01" className={field + " mt-1"} value={countedCash} onChange={e => setCountedCash(e.target.value)} /></label><button className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white" disabled={busy || !countedCash} onClick={closeShift}>Close shift & reconcile</button></div>
        </div> : <div className="mt-3 space-y-3"><p className="text-sm text-neutral-500">No drawer session is currently open.</p>{data.shifts.some((item: any) => item.status === "closed") ? <div className="rounded-lg bg-[#f7f3ee] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#90785f]">Opening cash carried forward</p><p className="mt-1 text-lg font-extrabold">{money(openFloat)}</p><p className="mt-1 text-xs text-neutral-500">Automatically taken from the previous shift's counted closing cash.</p></div> : <label className="block text-xs">Opening float (NPR)<input type="number" min="0" step="0.01" className={field + " mt-1"} value={openFloat} onChange={e => setOpenFloat(e.target.value)} /></label>}<button className={primary} disabled={busy} onClick={openShift}>Open cash drawer</button></div>}
      </section>
      <section className={panel}>
        {shift && <div className="mb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-lg">Session cash movements</h2><span className="text-xs text-neutral-500">{(shift.cash_entries || []).length} record(s)</span></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Time</th><th>Type</th><th>Reference / notes</th><th>Amount</th><th>Actions</th></tr></thead><tbody>
            {(shift.cash_entries || []).map((entry: any) => <React.Fragment key={entry.id}>
              <tr className="border-b align-top"><td className="py-2 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td><td className="capitalize">{entry.entry_type.replace("_", " ")}</td><td>{entry.reference || "—"}{entry.notes ? <p className="text-xs text-neutral-500">{entry.notes}</p> : null}</td><td>{money(entry.amount)}</td><td><div className="flex gap-2">{canAdminEditCash && <>{entry.entry_type === "sale" ? <button type="button" disabled={busy} onClick={() => correctSystemSaleEntry(entry, shift.id)} className="rounded-lg border px-2 py-1 text-xs font-semibold">Edit payment</button> : <button type="button" disabled={busy || !["cash_in","cash_out","payout"].includes(entry.entry_type)} onClick={() => editCashEntry(entry)} className="rounded-lg border px-2 py-1 text-xs font-semibold">Edit</button>}<button type="button" disabled={busy || !["cash_in","cash_out","payout","sale","refund"].includes(entry.entry_type)} onClick={() => deleteCashEntry(entry)} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white">Delete</button></>}</div></td></tr>
              {editingCashEntry === entry.id && <tr className="border-b bg-neutral-50"><td colSpan={5} className="p-3"><form onSubmit={saveCashEntryEdit} className="grid gap-2 md:grid-cols-2">
                <label className="block text-xs">Movement<select className={field + " mt-1"} value={cashEntryEdit.entry_type} onChange={e => setCashEntryEdit({ ...cashEntryEdit, entry_type: e.target.value })}><option value="cash_in">Cash in</option><option value="cash_out">Cash out</option><option value="payout">Payout</option></select></label>
                <label className="block text-xs">Amount (NPR)<input required type="number" min="0.01" step="0.01" className={field + " mt-1"} value={cashEntryEdit.amount} onChange={e => setCashEntryEdit({ ...cashEntryEdit, amount: e.target.value })} /></label>
                <label className="block text-xs">Reference<input className={field + " mt-1"} value={cashEntryEdit.reference} onChange={e => setCashEntryEdit({ ...cashEntryEdit, reference: e.target.value })} /></label>
                <label className="block text-xs">Notes<input className={field + " mt-1"} value={cashEntryEdit.notes} onChange={e => setCashEntryEdit({ ...cashEntryEdit, notes: e.target.value })} /></label>
                <div className="flex gap-2 md:col-span-2"><button className={primary} disabled={busy}>Save changes</button><button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setEditingCashEntry(null)}>Cancel</button></div>
              </form></td></tr>}
            </React.Fragment>)}
            {(shift.cash_entries || []).length === 0 && <tr><td colSpan={5} className="py-5 text-center text-neutral-400">No cash movements recorded in this session.</td></tr>}
          </tbody></table></div>
          <p className="mt-2 text-xs text-neutral-500">Only admins can edit or delete cash-drawer entries. Correcting a sale payment to QR, card or bank transfer removes it from physical cash while preserving the bill and receipt history.</p>
        </div>}
        <h2 className="font-semibold text-lg mb-3">Recent shift reconciliation</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Opened</th><th>Staff</th><th>Status</th><th>Expected</th><th>Counted</th><th>Variance</th></tr></thead><tbody>{data.shifts.map((s: any) => <React.Fragment key={s.id}><tr className="border-b"><td className="py-2">{new Date(s.opened_at).toLocaleString()}</td><td>{s.opened_by_name}</td><td className="capitalize">{s.status}</td><td>{s.expected_cash == null ? "—" : money(s.expected_cash)}</td><td>{s.counted_cash == null ? "—" : money(s.counted_cash)}</td><td className={Number(s.cash_difference) < 0 ? "text-red-700" : "text-emerald-700"}>{s.cash_difference == null ? "—" : money(s.cash_difference)}</td></tr>{(s.cash_entries || []).length > 0 && <tr className="border-b bg-neutral-50"><td colSpan={6} className="p-3"><p className="mb-2 text-xs font-semibold">Cash movements · {s.status === "closed" ? "Admin corrections" : "History"}</p>{s.cash_entries.map((entry: any) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-xs"><span>{new Date(entry.created_at).toLocaleString()} · <b className="capitalize">{entry.entry_type.replace("_"," ")}</b> · {money(entry.amount)} · {entry.reference || entry.notes || "No reference"}</span>{s.status === "closed" && canAdminEditCash && <span className="flex gap-2">{["cash_in","cash_out","payout"].includes(entry.entry_type) && <><button type="button" disabled={busy} onClick={() => correctClosedCashEntry(entry,s.id)} className="rounded border px-2 py-1 font-semibold">Edit</button><button type="button" disabled={busy} onClick={() => deleteClosedCashEntry(entry,s.id)} className="rounded bg-red-700 px-2 py-1 font-semibold text-white">Delete</button></>}{entry.entry_type === "sale" && <><button type="button" disabled={busy} onClick={() => correctSystemSaleEntry(entry,s.id)} className="rounded border px-2 py-1 font-semibold">Edit payment</button><button type="button" disabled={busy} onClick={() => deleteCashEntry(entry,s.id)} className="rounded bg-red-700 px-2 py-1 font-semibold text-white">Delete</button></>}{entry.entry_type === "refund" && <button type="button" disabled={busy} onClick={() => deleteCashEntry(entry,s.id)} className="rounded bg-red-700 px-2 py-1 font-semibold text-white">Delete</button>}</span>}</div>)}</td></tr>}</React.Fragment>)}</tbody></table></div></section>
    </div>}

    {tab === "sales" && <section className={panel}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => openPeriodSales("monthly")} className="rounded-xl border border-[#e8dfd6] bg-[#faf7f3] p-4 text-left transition hover:border-[#b99a78]"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#92775e]">Monthly sales · current month</p><p className="mt-2 text-2xl font-extrabold tracking-tight text-[#3c3029]">{money(data.salesSummary?.monthly_sales)}</p><p className="mt-2 text-xs font-semibold text-[#92775e]">Load / refresh bills ↗</p></button>
        <button type="button" onClick={() => openPeriodSales("yearly")} className="rounded-xl border border-[#e8dfd6] bg-[#faf7f3] p-4 text-left transition hover:border-[#b99a78]"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#92775e]">Yearly sales · current year</p><p className="mt-2 text-2xl font-extrabold tracking-tight text-[#3c3029]">{money(data.salesSummary?.yearly_sales)}</p><p className="mt-2 text-xs font-semibold text-[#92775e]">Load / refresh bills ↗</p></button>
      </div>
      {(["monthly","yearly"] as const).map(period => { const rows = data[period === "monthly" ? "monthlySales" : "yearlySales"] || []; const isOpen = salesDetailsOpen[period]; return <div key={period} className="mb-3 rounded-xl border border-neutral-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{period === "monthly" ? "Monthly sales details" : "Yearly sales details"}</h3><p className="text-xs text-neutral-500">{rows.length} bills loaded</p></div><button type="button" aria-expanded={isOpen} onClick={() => setSalesDetailsOpen(old => ({ ...old, [period]: !old[period] }))} className="rounded-lg border px-3 py-2 text-xs font-semibold">{isOpen ? "Hide details" : "Show details"}</button></div>
        {isOpen && (rows.length === 0 ? <p className="py-4 text-center text-sm text-neutral-400">Click the sales summary above to load bills and items.</p> : <div className="mt-3 space-y-3">{rows.map((bill: any) => <article key={bill.id} className="rounded-lg border border-neutral-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{bill.bill_number} · {bill.customer_name || "Walk-in"}</p><p className="text-xs text-neutral-500">{bill.business_date || new Date(bill.created_at).toLocaleDateString()} · {bill.table_name || bill.service_type}</p></div><p className="font-bold">{money(bill.grand_total)}</p></div>
          <div className="mt-2 border-t border-neutral-100 pt-2">{(bill.items || []).map((item: any, index: number) => <div key={index} className="flex justify-between gap-3 py-1 text-xs"><span>{item.name} × {item.quantity}</span><span>{money(item.total)}</span></div>)}</div>
        </article>)}</div>)}
      </div>; })}
      <section className="mt-4 rounded-xl border border-neutral-200 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-lg">Manage individual sales</h2><p className="text-sm text-neutral-500">Filter bills by business date, then expand the register when you need to edit a sale.</p></div><button type="button" aria-expanded={salesDetailsOpen.individual} onClick={() => setSalesDetailsOpen(old => ({ ...old, individual: !old.individual }))} className="rounded-lg border px-3 py-2 text-sm font-semibold">{salesDetailsOpen.individual ? "Hide sales" : "Show sales"}</button></div>
        <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={e => { e.preventDefault(); if (!saleDateDraft || selectedSaleDates.includes(saleDateDraft)) return; setSelectedSaleDates(old => [...old, saleDateDraft].sort()); setSaleDateDraft(""); }}>
          <label className="block text-xs font-medium text-neutral-600">Add business date<input type="date" className={field + " mt-1"} value={saleDateDraft} onChange={e => setSaleDateDraft(e.target.value)} /></label>
          <button type="submit" disabled={!saleDateDraft || selectedSaleDates.includes(saleDateDraft)} className={primary + " self-end min-h-10"}>Add date</button>
        </form>
        {selectedSaleDates.length > 0 && <div className="mt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-neutral-600">Showing only these selected dates</p><button type="button" className="text-xs font-semibold text-red-700" onClick={() => setSelectedSaleDates([])}>Clear dates</button></div><div className="mt-2 flex flex-wrap gap-2">{selectedSaleDates.map(date => <span key={date} className="inline-flex items-center gap-2 rounded-full border border-[#e8dfd6] bg-[#faf7f3] px-3 py-1.5 text-xs font-semibold text-[#6f5140]">{date}<button type="button" aria-label={"Remove date " + date} onClick={() => setSelectedSaleDates(old => old.filter(item => item !== date))} className="font-bold text-red-700">×</button></span>)}</div></div>}
        {salesDetailsOpen.individual && <><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-neutral-500">{(data.sales || []).filter((s: any) => selectedSaleDates.length === 0 || selectedSaleDates.includes(String(s.business_date || s.created_at || "").slice(0,10))).length} matching sales</p><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => load().catch(() => setError("Could not refresh sales."))}>Refresh</button></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Bill / customer</th><th>Business date</th><th>Created</th><th>Table / service</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {(data.sales || []).filter((s: any) => selectedSaleDates.length === 0 || selectedSaleDates.includes(String(s.business_date || s.created_at || "").slice(0,10))).map((s: any) => <tr key={s.id} className="border-b align-top"><td className="py-2"><span className="font-semibold">{s.bill_number}</span><p className="text-xs text-neutral-500">{s.customer_name}</p></td><td>{s.business_date}</td><td className="whitespace-nowrap">{new Date(s.created_at).toLocaleString()}</td><td>{s.table_name}</td><td>{money(s.grand_total)}</td><td><span className={s.sale_status === "voided" ? "rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800" : "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800"}>{s.sale_status}{s.void_reason ? <span className="block max-w-40 text-xs">{s.void_reason}</span> : null}</span></td><td><div className="flex flex-wrap gap-2">{s.sale_status === "active" && <button disabled={busy} onClick={() => voidSale(s)} className="rounded-lg border border-amber-500 px-2 py-1 text-xs font-semibold text-amber-700">Void</button>}<button disabled={busy} onClick={() => permanentlyDeleteSale(s)} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-semibold text-white">Permanently delete</button></div></td></tr>)}
          {(data.sales || []).filter((s: any) => selectedSaleDates.length === 0 || selectedSaleDates.includes(String(s.business_date || s.created_at || "").slice(0,10))).length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-400">No sales found for the selected date(s).</td></tr>}
        </tbody></table></div></>}
      </section>
    </section>}

    {tab === "suppliers" && <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}><h2 className="font-semibold text-lg mb-3">Supplier payment / credit adjustment</h2><form onSubmit={addSupplierEntry} className="space-y-3">
        <label className="block text-xs">Supplier<select required className={field + " mt-1"} value={supplierEntry.supplier_id} onChange={e => setSupplierEntry({ ...supplierEntry, supplier_id: e.target.value })}><option value="">Choose supplier</option>{data.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block text-xs">Entry type<select className={field + " mt-1"} value={supplierEntry.entry_type} onChange={e => setSupplierEntry({ ...supplierEntry, entry_type: e.target.value })}><option value="payment">Payment made</option><option value="return">Purchase return credit</option><option value="adjustment">Balance adjustment</option></select></label>
        <input required type="number" min="0.01" step="0.01" className={field} placeholder="Amount (NPR)" value={supplierEntry.amount} onChange={e => setSupplierEntry({ ...supplierEntry, amount: e.target.value })} />
        <input className={field} placeholder="Reference / voucher" value={supplierEntry.reference} onChange={e => setSupplierEntry({ ...supplierEntry, reference: e.target.value })} />
        <textarea className={field} rows={2} placeholder="Notes" value={supplierEntry.notes} onChange={e => setSupplierEntry({ ...supplierEntry, notes: e.target.value })} />
        <button className={primary} disabled={busy}>Post supplier entry</button>
      </form><p className="mt-3 text-xs text-neutral-500">Received purchases are posted as supplier liabilities. Payments and credit adjustments are tracked here.</p></section>
      <section className={panel}><h2 className="font-semibold text-lg mb-3">Return stock to supplier</h2><form onSubmit={returnStockToSupplier} className="space-y-3">
        <label className="block text-xs">Supplier<select required className={field + " mt-1"} value={supplierReturn.supplier_id} onChange={e => setSupplierReturn({ ...supplierReturn, supplier_id: e.target.value })}><option value="">Choose supplier</option>{data.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="block text-xs">Stock item<select required className={field + " mt-1"} value={supplierReturn.item_id} onChange={e => setSupplierReturn({ ...supplierReturn, item_id: e.target.value })}><option value="">Choose item</option>{data.inventory.map((i: any) => <option key={i.id} value={i.id}>{i.name} · {i.quantity} {i.unit} available</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><input required type="number" min="0.001" step="0.001" className={field} placeholder="Quantity" value={supplierReturn.quantity} onChange={e => setSupplierReturn({ ...supplierReturn, quantity: e.target.value })} /><input required type="number" min="0" step="0.01" className={field} placeholder="Unit cost" value={supplierReturn.unit_cost} onChange={e => setSupplierReturn({ ...supplierReturn, unit_cost: e.target.value })} /></div>
        <input className={field} placeholder="Reference / supplier credit note" value={supplierReturn.reference} onChange={e => setSupplierReturn({ ...supplierReturn, reference: e.target.value })} />
        <textarea className={field} rows={2} placeholder="Reason / notes" value={supplierReturn.notes} onChange={e => setSupplierReturn({ ...supplierReturn, notes: e.target.value })} />
        <button className={primary} disabled={busy}>Return stock & update ledger</button>
      </form><p className="mt-3 text-xs text-amber-700">The system checks on-hand quantity, deducts returned stock and records the supplier credit in one transaction.</p></section>
      <section className={panel}><h2 className="font-semibold text-lg mb-3">Supplier balances</h2><div className="mb-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Supplier</th><th>Phone</th><th>Outstanding payable</th></tr></thead><tbody>{data.supplierBalances.map((b: any) => <tr key={b.id} className="border-b"><td className="py-2">{b.name}</td><td>{b.phone || "—"}</td><td className={Number(b.balance) > 0 ? "font-semibold text-amber-700" : "text-emerald-700"}>{money(b.balance)}</td></tr>)}</tbody></table></div><h3 className="font-semibold mb-3">Ledger history</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Date</th><th>Supplier</th><th>Type</th><th>Reference</th><th>Amount</th></tr></thead><tbody>{data.ledger.map((l: any) => <tr key={l.id} className="border-b"><td className="py-2">{new Date(l.created_at).toLocaleString()}</td><td>{l.supplier_name}</td><td className="capitalize">{l.entry_type}</td><td>{l.reference || "—"}</td><td>{money(l.amount)}</td></tr>)}</tbody></table></div></section>
    </div>}

    {tab === "reports" && <section className={panel}>
      <h2 className="font-semibold text-lg">Management reports</h2>
      <p className="mt-1 text-sm text-neutral-500">Export sales, discounts, refunds, taxes, payment methods, top-selling items and staff performance for a selected period.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <label className="block text-xs">From date<input type="date" className={field + " mt-1"} value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></label>
        <label className="block text-xs">To date<input type="date" className={field + " mt-1"} value={reportTo} onChange={e => setReportTo(e.target.value)} /></label>
        <button className={primary} disabled={busy || !reportFrom || !reportTo || reportTo < reportFrom} onClick={() => downloadReport("xlsx")}>Export Excel (.xlsx)</button>
        <button className={primary} disabled={busy || !reportFrom || !reportTo || reportTo < reportFrom} onClick={() => downloadReport("pdf")}>Export PDF</button>
        <button className="rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand sm:col-span-2" disabled={busy || !reportFrom || !reportTo || reportTo < reportFrom} onClick={() => downloadReport("csv")}>Export CSV</button>
      </div>
      <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">The exports include sales totals, discounts, refunds, VAT/service charge, payment-method breakdown, item quantities and waiter performance. Financial totals are operational reports and should be reconciled against bank and cash records.</div>
    </section>}

    {tab === "service" && <section className={panel}>
      <h2 className="font-semibold text-lg mb-1">Takeaway & delivery fulfilment</h2>
      <p className="mb-3 text-sm text-neutral-500">Kitchen KOT progress updates these statuses automatically. Managers can dispatch delivery orders and close completed pickups.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Order</th><th>Type / Customer</th><th>Contact / Address</th><th>Bill</th><th>Status</th></tr></thead><tbody>
        {data.serviceOrders.map((o: any) => <tr key={o.order_id} className="border-b align-top"><td className="py-2 font-semibold">{o.order_number}<p className="text-xs font-normal text-neutral-500">{new Date(o.created_at).toLocaleString()}</p></td><td className="capitalize">{o.service_type}<p className="text-xs text-neutral-500">{o.customer_name || "Walk-in"}</p></td><td>{o.phone || "—"}<p className="max-w-xs text-xs text-neutral-500">{o.delivery_address || "—"}</p></td><td>{o.bill_number ? money(o.grand_total) : "Not billed"}</td><td><select className={field + " min-w-40"} value={o.status} onChange={e => updateServiceOrder(o.order_id, e.target.value)} disabled={busy}><option value="received">Received</option><option value="preparing">Preparing</option><option value="ready">Ready</option>{o.service_type === "delivery" && <option value="out_for_delivery">Out for delivery</option>}<option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td></tr>)}
        {data.serviceOrders.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">No takeaway or delivery orders yet.</td></tr>}
      </tbody></table></div>
    </section>}

    {tab === "backup" && <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}><h2 className="font-semibold text-lg">Create / download full backup</h2><p className="mt-2 text-sm text-neutral-500">Download a complete PostgreSQL database backup. It includes sales and bills, expenses, inventory, customers, staff and payroll, cash drawer records, settings and other restaurant data. Keep your own secure copy; server-local temporary files are not guaranteed to persist across deployments.</p><button className={primary + " mt-4"} disabled={busy} onClick={downloadBackup}>Create & download backup</button></section>
      <section className={panel}><h2 className="font-semibold text-lg">Restore from backup</h2><p className="mt-2 text-sm text-red-700">Restore replaces the current database. The system first creates a safety backup and blocks restore while orders or cash drawer shifts are open.</p><form onSubmit={restoreBackup} className="mt-4 space-y-3">
        <label className="block text-xs">Upload backup file (.dump) — sales, expenses and all database records<input required type="file" accept=".dump,application/octet-stream" className={field + " mt-1"} onChange={e => setBackupFile(e.target.files?.[0] || null)} /></label>
        <label className="block text-xs">Type RESTORE ROYAL SKYE DATABASE to confirm<input required className={field + " mt-1"} value={restoreConfirmation} onChange={e => setRestoreConfirmation(e.target.value)} /></label>
        <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !backupFile || restoreConfirmation !== "RESTORE ROYAL SKYE DATABASE"}>Restore database</button>
      </form></section>
    </div>}

    {tab === "audit" && <section className={panel}><h2 className="font-semibold text-lg mb-3">Recent administrative activity</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody>{data.audit.map((a: any) => <tr key={a.id} className="border-b"><td className="py-2 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td><td>{a.full_name || a.username || "System"}</td><td>{a.action}</td><td>{a.details}</td></tr>)}</tbody></table></div></section>}

    {tab === "loyalty" && <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}><h2 className="mb-3 text-lg font-semibold">Loyalty programme</h2>
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!loyaltySettings.enabled} onChange={e => setLoyaltySettings({ ...loyaltySettings, enabled: e.target.checked })} /> Enable customer loyalty points</label>
        <label className="mb-3 block text-xs">Spend required per point (NPR)<input className={field + " mt-1"} type="number" min="0.01" step="0.01" value={loyaltySettings.spend_per_point} onChange={e => setLoyaltySettings({ ...loyaltySettings, spend_per_point: e.target.value })} /></label>
        <label className="mb-3 block text-xs">Value per point (NPR)<input className={field + " mt-1"} type="number" min="0" step="0.01" value={loyaltySettings.point_value} onChange={e => setLoyaltySettings({ ...loyaltySettings, point_value: e.target.value })} /></label>
        <button className={primary} disabled={busy} onClick={saveLoyaltySettings}>Save loyalty settings</button>
        <form className="mt-5 space-y-2 border-t pt-4" onSubmit={adjustLoyaltyPoints}><h3 className="font-semibold">Adjust customer points</h3>
          <select className={field} required value={adjustment.customer_id} onChange={e => setAdjustment({ ...adjustment, customer_id: e.target.value })}><option value="">Select customer</option>{data.loyalty.map((a: any) => <option key={a.customer_id} value={a.customer_id}>{a.name} · {a.points_balance} points</option>)}</select>
          <input className={field} required type="number" step="0.01" placeholder="Points to add (+) or deduct (-)" value={adjustment.points} onChange={e => setAdjustment({ ...adjustment, points: e.target.value })} />
          <input className={field} required minLength={3} placeholder="Reason for adjustment" value={adjustment.notes} onChange={e => setAdjustment({ ...adjustment, notes: e.target.value })} />
          <button className={primary} disabled={busy}>Apply adjustment</button>
        </form>
      </section>
      <section className={panel}><h2 className="mb-3 text-lg font-semibold">Customer points register</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-neutral-500"><th className="py-2">Customer</th><th>Phone</th><th>Available points</th><th>Lifetime points</th></tr></thead><tbody>{data.loyalty.map((a: any) => <tr key={a.id} className="border-b"><td className="py-3 font-medium">{a.name}</td><td>{a.phone || "—"}</td><td className={Number(a.points_balance) <= 5 ? "font-semibold text-amber-700" : "font-semibold"}>{a.points_balance}</td><td>{a.lifetime_points}</td></tr>)}{data.loyalty.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-neutral-400">No customer points recorded yet.</td></tr>}</tbody></table></div>
      </section>
    </div>}

    {tab === "settings" && <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}><h2 className="font-semibold text-lg mb-3">Restaurant identity & receipt</h2><div className="space-y-3">
        {(["name","email","phone","address","pan","vat","currency","logo_path","receipt_footer"] as const).map(k => <label key={k} className="block text-xs capitalize">{k.replace(/_/g," ")}{k === "address" || k === "receipt_footer" ? <textarea rows={2} className={field + " mt-1"} value={restaurant[k] || ""} onChange={e => setRestaurant({ ...restaurant, [k]: e.target.value })} /> : <input className={field + " mt-1"} value={restaurant[k] || ""} onChange={e => setRestaurant({ ...restaurant, [k]: e.target.value })} />}</label>)}
        <label className="block text-xs font-semibold">Payment QR code
          <input className={field + " mt-2"} type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Upload a PNG, JPG or WebP QR image up to 5 MB."); e.target.value = ""; return; }
            const reader = new FileReader();
            reader.onload = () => { setRestaurant((old: any) => ({ ...old, qr_image_path: String(reader.result || "") })); setMessage("QR image selected. Save business settings to publish it to Billing."); setError(""); };
            reader.onerror = () => setError("Could not read the selected QR image.");
            reader.readAsDataURL(file);
          }} />
          <span className="mt-1 block text-[11px] font-normal text-neutral-500">PNG, JPG or WebP · maximum 5 MB. Saved in the restaurant database, so it survives redeployments.</span>
        </label>
        {restaurant.qr_image_path && <div className="rounded-xl border bg-neutral-50 p-3"><p className="mb-2 text-xs font-semibold text-neutral-600">Current payment QR preview</p><img src={restaurant.qr_image_path} alt="Restaurant payment QR" className="mx-auto max-h-56 max-w-full rounded-lg object-contain" /><button type="button" className="mt-2 text-xs font-semibold text-red-700" onClick={() => setRestaurant((old: any) => ({ ...old, qr_image_path: "" }))}>Remove QR image</button></div>}
      </div></section>
      <section className={panel}><h2 className="font-semibold text-lg mb-3">Tax & service charge</h2><div className="space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!tax.tax_enabled} onChange={e => setTax({ ...tax, tax_enabled: e.target.checked })} /> Enable VAT / tax</label>
        <label className="block text-xs">Tax percent<input type="number" min="0" max="100" step="0.01" className={field + " mt-1"} value={tax.tax_percent} onChange={e => setTax({ ...tax, tax_percent: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!tax.service_charge_enabled} onChange={e => setTax({ ...tax, service_charge_enabled: e.target.checked })} /> Enable service charge</label>
        <label className="block text-xs">Service charge percent<input type="number" min="0" max="100" step="0.01" className={field + " mt-1"} value={tax.service_charge_percent} onChange={e => setTax({ ...tax, service_charge_percent: e.target.value })} /></label>
        <button className={primary} disabled={busy} onClick={saveSettings}>Save all business settings</button>
      </div></section>
    </div>}
  </div>;
}
