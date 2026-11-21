import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import AdminControl from "./AdminControl";

type Tab = "cash" | "expenses" | "inventory" | "reservations" | "controls" | "reports" | "payroll" | "staff";
const tabs: Tab[] = ["expenses", "inventory", "reservations", "controls", "payroll", "reports", "staff"];
const units = ["kg", "g", "litre", "ml", "dozen", "pcs", "bottle", "packet", "box", "case"];
const field = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white";
const money = (n: any) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function Operations() {
  const { t } = useLanguage();
  const { role } = useAuth();
  // Keep the manager workspace focused on the three daily controls; advanced administration stays with the admin role.
  const visibleTabs = role === "admin" ? tabs : tabs.filter((item) => ["expenses", "inventory", "controls"].includes(item));
  const [tab, setTab] = useState<Tab>("expenses");
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const requested = searchParams.get("tab") as Tab | null;
    if (requested && visibleTabs.includes(requested)) setTab(requested);
  }, [searchParams, role]);
  const [data, setData] = useState<any>({ inventory: [], categories: [], menuItems: [], recipes: [], expenses: [], staff: [], attendance: [], payroll: [], payrollStaff: [], reservations: [], tables: [] });
  const [report, setReport] = useState<any>(null);
  const [start, setStart] = useState(today().slice(0, 7) + "-01");
  const [end, setEnd] = useState(today());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState({ name: "", category: "General", unit: "kg", quantity: "0", reorder_level: "1", unit_price: "0", expiry_date: "" });
  const [categoryName, setCategoryName] = useState("");
  const [recipeDraft, setRecipeDraft] = useState({ menu_item_id: "", yield_quantity: "1", instructions: "" });
  const [recipeLines, setRecipeLines] = useState<any[]>([{ item_id: "", quantity: "1", case_pack_size: "" }]);
  const [expense, setExpense] = useState({ description: "", amount: "" });
  const [reservation, setReservation] = useState({ customer_name: "", phone: "", party_size: "2", reserved_for: "", table_id: "", notes: "" });
  const [movement, setMovement] = useState({ item_id: "", movement_type: "waste", quantity: "", notes: "" });
  const [payrollForm, setPayrollForm] = useState({ user_id: "", period_start: today().slice(0, 8) + "01", period_end: today(), gross_pay: "", deductions: "0", notes: "" });

  const load = async () => {
    const requests: [string, string][] = [
      ["inventory", "/api/operations/inventory"], ["categories", "/api/operations/inventory/categories"],
      ["menuItems", "/api/menu-items"], ["recipes", "/api/operations/recipes"],
      ["expenses", "/api/operations/expenses"], ["reservations", "/api/operations/reservations"],
      ["tables", "/api/tables"],
      ...(role === "admin" ? ([["staff", "/api/users"], ["attendance", "/api/operations/staff/attendance"]] as [string, string][]) : []),
      ...(role === "admin" || role === "manager" ? ([["payroll", "/api/operations/staff/payroll"], ["payrollStaff", "/api/operations/staff/payroll/staff"]] as [string, string][]) : []),
    ];
    const results = await Promise.allSettled(requests.map(([, url]) => api.get(url)));
    setData((old: any) => {
      const next = { ...old };
      results.forEach((result, index) => { if (result.status === "fulfilled") next[requests[index][0]] = result.value.data; });
      return next;
    });
  };
  useEffect(() => { load().catch(() => setError("Could not load operations data.")); }, []);
  const run = async (fn: () => Promise<any>, success: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await fn(); setMessage(t(success)); await load(); }
    catch (e: any) { setError(t(apiErrorMessage(e, "Restaurant operations request failed"))); }
    finally { setBusy(false); }
  };
  const cashoutPayroll = async (p: any) => {
    const remaining = Number(p.remaining_balance ?? (Number(p.gross_pay) - Number(p.deductions)));
    const amountText = window.prompt("Remaining salary: " + money(remaining) + "\nEnter amount to cash out (NPR):", String(remaining));
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setError("Enter a valid amount within the remaining salary balance.");
      return;
    }
    const notes = window.prompt("Cash-out notes (optional):", "");
    if (notes === null) return;
    await run(() => api.post("/api/operations/staff/payroll/" + p.id + "/cashout", {
      amount, payment_date: today(), notes
    }), "Salary cash-out recorded.");
  };
  const deletePayroll = async (p: any) => {
    if (!window.confirm("Delete payroll record for " + p.full_name + " (" + money(Number(p.gross_pay)-Number(p.deductions)) + ")? This cannot be undone.")) return;
    await run(() => api.delete("/api/operations/staff/payroll/" + p.id), "Payroll record deleted.");
  };
  const lowStock = data.inventory.filter((x: any) => x.low_stock);
  const input = (label: string, value: string, change: (v: string) => void, type = "text", required = true) => <label className="block text-xs font-medium text-neutral-600">{t(label)}<input className={field + " mt-1"} type={type} required={required} value={value} onChange={(e) => change(e.target.value)} /></label>;
  const panel = "rounded-xl border border-neutral-200 bg-white p-4 shadow-sm";
  const heading = (title: string, subtitle: string) => <div className="mb-4"><h2 className="text-lg font-semibold">{t(title)}</h2><p className="text-sm text-neutral-500">{t(subtitle)}</p></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-brand">{t("Royal Skye · Restaurant Operations")}</p><h1 className="mt-1 text-2xl font-bold">{t("Restaurant Operations")}</h1><p className="text-sm text-neutral-500">{t("Cash drawer, expenses, inventory, reservations and administration.")}</p></div><button className={button} disabled={busy} onClick={() => load()}>{busy ? t("Working...") : t("Refresh data")}</button></header>
    {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Expenses recorded", data.expenses.length], ["Total expenses", money(data.expenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0))], ["Stock items", data.inventory.length], ["Low stock", lowStock.length]].map((x) => <div className={panel} key={x[0]}><p className="text-xs text-neutral-500">{t(x[0])}</p><p className="mt-1 text-2xl font-bold">{x[1]}</p></div>)}</div>
    <nav className="space-y-3 rounded-2xl border border-[#e8dfd6] bg-white p-4 shadow-sm">
      <div><p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a18d7c]">Daily restaurant operations</p><div className="flex flex-wrap gap-2">{visibleTabs.filter((name) => ["expenses", "inventory", "controls"].includes(name)).map((tabName) => <button key={tabName} onClick={() => setTab(tabName)} className={"rounded-xl px-4 py-2.5 text-xs font-bold transition " + (tab === tabName ? "bg-[#7d2523] text-white shadow-sm" : "border border-[#e8dfd6] bg-[#fbfaf8] text-[#6f6258] hover:bg-[#f4eee7]")}>{t(tabName === "expenses" ? "Expenses" : tabName === "inventory" ? "Inventory" : "Control Center")}</button>)}</div></div>
      {role === "admin" && <div className="border-t border-[#eee7df] pt-3"><p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[#a18d7c]">Team operations</p><div className="flex flex-wrap gap-2">{visibleTabs.filter((name) => !["expenses", "inventory", "controls"].includes(name)).map((tabName) => <button key={tabName} onClick={() => setTab(tabName)} className={"rounded-xl px-3 py-2 text-xs font-semibold capitalize transition " + (tab === tabName ? "bg-[#7d2523] text-white" : "border border-[#e8dfd6] bg-white text-[#6f6258] hover:bg-[#faf7f3]")}>{t(tabName === "staff" ? "Staff attendance" : tabName)}</button>)}</div></div>}
    </nav>

    {tab === "inventory" && <>
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div>{heading("Inventory categories", "Create and manage categories for your stock items.")}</div><span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">{data.categories.length} {t("categories")}</span></div>
        <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); const name = categoryName.trim(); if (!name) return; run(async () => { const created = await api.post("/api/operations/inventory/categories", { name }); setCategoryName(""); setStock((old) => ({ ...old, category: created.data.name })); }, "Inventory category created."); }}>
          <input className={field + " min-w-[180px] flex-1"} placeholder={t("New category name")} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} maxLength={80} required />
          <button className={button} disabled={busy || !categoryName.trim()}>{t("Add category")}</button>
        </form>
        <div className="flex flex-wrap gap-2">{data.categories.map((category: any) => <div key={category.id} className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold"><span>{category.name}</span><button type="button" title={t("Delete category")} aria-label={t("Delete category")} className="font-bold text-red-600" disabled={busy} onClick={() => { if (!window.confirm(t("Delete this category? Categories assigned to stock items cannot be deleted."))) return; run(() => api.delete("/api/operations/inventory/categories/" + category.id), "Inventory category deleted."); }}>×</button></div>)}</div>
      </section>
      <section className={panel}>
{heading("Menu item stock recipes", "Link POS menu items to stock. Stock is deducted when an item is added to a table.")}
<form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const items = recipeLines.map((line) => { const item = data.inventory.find((x: any) => x.id === line.item_id); const quantity = item?.unit === "case" ? (Math.floor((1 / Number(line.case_pack_size)) * 1000000) / 1000000).toFixed(6) : Number(line.quantity).toFixed(6); return { item_id: line.item_id, quantity }; }); if (!recipeDraft.menu_item_id || items.some((line: any) => !line.item_id || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0)) { setError(t("Complete the menu item and every stock ingredient quantity.")); return; } run(() => api.post("/api/operations/recipes", { ...recipeDraft, yield_quantity: Number(recipeDraft.yield_quantity), items }), "Menu item stock recipe saved."); }}>
<label className="block text-xs font-medium text-neutral-600">{t("POS menu item")}<select className={field + " mt-1"} required value={recipeDraft.menu_item_id} onChange={(e) => { const menu = data.menuItems.find((x: any) => x.id === e.target.value); setRecipeDraft({ ...recipeDraft, menu_item_id: e.target.value }); const pack = /small.*beer|beer.*small/i.test(menu?.name || "") ? "24" : /big.*beer|beer.*big/i.test(menu?.name || "") ? "12" : ""; setRecipeLines((old) => old.map((line) => ({ ...line, case_pack_size: line.case_pack_size || pack }))); }}><option value="">{t("Select menu item")}</option>{data.menuItems.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
{recipeLines.map((line, index) => {
  const selected = data.inventory.find((x: any) => x.id === line.item_id);
  return <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2">
    <label className="block text-xs font-medium text-neutral-600">{t("Stock item")}<select className={field + " mt-1"} required value={line.item_id} onChange={(e) => { const item = data.inventory.find((x: any) => x.id === e.target.value); const menu = data.menuItems.find((x: any) => x.id === recipeDraft.menu_item_id); const pack = /small.*beer|beer.*small/i.test(menu?.name || "") ? "24" : /big.*beer|beer.*big/i.test(menu?.name || "") ? "12" : ""; const next = [...recipeLines]; next[index] = { ...line, item_id: e.target.value, case_pack_size: item?.unit === "case" ? (line.case_pack_size || pack) : "" }; setRecipeLines(next); }}><option value="">{t("Select stock item")}</option>{data.inventory.map((x: any) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}</select></label>
    {selected?.unit === "case" ? <label className="block text-xs font-medium text-neutral-600">{t("Pieces in one case")}<input className={field + " mt-1"} type="number" min="1" step="1" required value={line.case_pack_size} placeholder="24 small / 12 big" onChange={(e) => { const next = [...recipeLines]; next[index] = { ...line, case_pack_size: e.target.value }; setRecipeLines(next); }}/><span className="mt-1 block text-[10px] text-neutral-500">One sale consumes {line.case_pack_size ? (Math.floor((1 / Number(line.case_pack_size)) * 1000000) / 1000000).toFixed(6) + " case" : "a fraction of one case"}.</span></label> : <label className="block text-xs font-medium text-neutral-600">{t("Quantity consumed per menu item")}<input className={field + " mt-1"} type="number" min="0.000001" step="any" required value={line.quantity} onChange={(e) => { const next = [...recipeLines]; next[index] = { ...line, quantity: e.target.value }; setRecipeLines(next); }}/></label>}
    <button type="button" className="justify-self-start rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700" disabled={recipeLines.length === 1} onClick={() => setRecipeLines((old) => old.filter((_, i) => i !== index))}>{t("Remove ingredient")}</button>
  </div>;
})}
<label className="block text-xs font-medium text-neutral-600">{t("Recipe yield")}<input className={field + " mt-1"} type="number" min="0.001" step="any" value={recipeDraft.yield_quantity} onChange={(e) => setRecipeDraft({ ...recipeDraft, yield_quantity: e.target.value })}/></label>
<div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={() => setRecipeLines((old) => [...old, { item_id: "", quantity: "1", case_pack_size: "" }])}>{t("Add ingredient")}</button><button className={button} disabled={busy || !data.menuItems.length || !data.inventory.length}>{t("Save stock recipe")}</button></div>
<p className="text-xs text-neutral-500">For beer cases, enter 24 for small beer and 12 for big beer. Set one stock recipe for each POS menu item.</p>
</form>
<div className="mt-4 space-y-2 border-t pt-4">{data.recipes.map((r: any) => <article key={r.id} className="rounded-xl border border-neutral-200 p-3"><p className="font-semibold">{r.menu_item_name}</p><p className="text-xs text-neutral-600">{(r.ingredients || []).map((i: any) => i.item_name + ": " + Number(i.quantity).toFixed(6) + " " + i.unit).join(" · ")}</p></article>)}</div>
</section>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className={panel}>{heading("Add stock item", "Enter the price for one unit and quantity; total cost is calculated automatically.")}<form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const quantity = Number(stock.quantity);
        const unitPrice = Number(stock.unit_price);
        if (quantity === 0 && unitPrice > 0) {
          setError(t("Enter a quantity greater than zero when total cost is provided."));
          return;
        }
        run(async () => {
          await api.post("/api/operations/inventory", {
            name: stock.name,
            sku: null,
            category: stock.category,
            unit: stock.unit,
            quantity,
            reorder_level: Number(stock.reorder_level),
            average_cost: unitPrice,
            supplier_id: null,
            expiry_date: stock.expiry_date || null,
          });
        }, "Inventory item created.");
      }}>
        {input("Item name", stock.name, (v) => setStock({ ...stock, name: v }))}
        <label className="block text-xs font-medium text-neutral-600">{t("Category")}<select className={field + " mt-1"} required value={stock.category} onChange={(e) => setStock({ ...stock, category: e.target.value })}>{data.categories.map((category: any) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label>
        {input("Expiry date", stock.expiry_date, (v) => setStock({ ...stock, expiry_date: v }), "date", false)}
        <label className="block text-xs font-medium text-neutral-600">{t("Price per " + stock.unit + " (NPR)") }<input className={field + " mt-1"} type="number" min="0" step="0.01" required value={stock.unit_price} onChange={(e) => setStock({ ...stock, unit_price: e.target.value })} /></label>
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-3"><p className="text-xs font-semibold text-neutral-500">{t("Calculated total cost")}</p><p className="mt-1 text-xl font-bold text-brand">{money(Math.max(0, Number(stock.quantity) || 0) * Math.max(0, Number(stock.unit_price) || 0))}</p><p className="mt-1 text-[11px] text-neutral-500">{Number(stock.quantity) || 0} × {money(Math.max(0, Number(stock.unit_price) || 0))}</p></div>
        <div className="grid grid-cols-2 gap-2"><label className="block text-xs font-medium text-neutral-600">{t("Unit")}<select className={field + " mt-1"} value={stock.unit} onChange={(e) => setStock({ ...stock, unit: e.target.value })}><option value="kg">kg</option><option value="g">{t("Gram (g)")}</option><option value="litre">{t("Litre")}</option><option value="pcs">{t("Pieces (pcs)")}</option><option value="case">{t("Case")}</option></select></label><label className="block text-xs font-medium text-neutral-600">{t("Quantity")}<input className={field + " mt-1"} type="number" min="0" step="any" required value={stock.quantity} onChange={(e) => setStock({ ...stock, quantity: e.target.value })} /></label></div>
        <label className="block text-xs font-medium text-neutral-600">{t("Reorder level")}<input className={field + " mt-1"} type="number" min="0" step="any" required value={stock.reorder_level} onChange={(e) => setStock({ ...stock, reorder_level: e.target.value })} /></label>
        <button className={button} disabled={busy}>{t("Add item")}</button>
      </form></section>
      <section className={panel}>{heading("Stock register", "Quantity, valuation and low-stock alerts.")}{lowStock.length > 0 && <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-bold">{lowStock.length} {t("item(s) at or below reorder level.")}</p><p className="mt-1 text-xs">{lowStock.map((item: any) => item.name + ": " + item.quantity + " " + item.unit + " left (reorder at " + item.reorder_level + ")").join(" · ")}</p></div>}
        <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs text-neutral-500"><th className="py-2">{t("Item name")}</th><th>{t("Category")}</th><th>{t("Quantity")}</th><th>{t("Reorder level")}</th><th>{t("Total cost (NPR)")}</th><th>{t("Expiry date")}</th><th>{t("Status")}</th></tr></thead><tbody>{data.inventory.map((i: any) => <tr key={i.id} className="border-b"><td className="py-3 font-medium">{i.name}</td><td>{i.category || "General"}</td><td>{i.quantity} {i.unit}</td><td>{i.reorder_level} {i.unit}</td><td>{money(i.stock_value)}</td><td>{i.expiry_date || "—"}</td><td className={i.low_stock ? "text-amber-700" : "text-emerald-700"}>{i.low_stock ? t("Low") : t("OK")}</td></tr>)}</tbody></table></div>
        <div className="space-y-2 sm:hidden">{data.inventory.length === 0 ? <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">{t("No stock items found.")}</p> : data.inventory.map((i: any) => <article key={i.id} className="min-w-0 rounded-xl border border-neutral-200 bg-[#fbfaf8] p-3 shadow-sm"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold text-neutral-800">{i.name}</h3><p className="mt-1 text-xs font-semibold text-brand">{i.category || "General"}</p><p className="mt-1 text-xs text-neutral-500">{t("Stock value")}: {money(i.stock_value)}</p></div><span className={"shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " + (i.low_stock ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{i.low_stock ? t("Low stock") : t("In stock")}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t("Quantity")}</p><p className="mt-1 break-words text-sm font-bold text-neutral-800">{i.quantity} {i.unit}</p></div><div className="rounded-lg bg-white p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t("Reorder level")}</p><p className="mt-1 break-words text-sm font-semibold text-neutral-800">{i.reorder_level} {i.unit}</p></div></div><p className="mt-2 break-words text-xs text-neutral-500">{t("Expiry date")}: {i.expiry_date || "—"}</p></article>)}</div>
        <form className="mt-4 grid min-w-0 grid-cols-1 gap-2 rounded-xl bg-neutral-50 p-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/api/operations/inventory/" + movement.item_id + "/movements", { ...movement, quantity: Number(movement.quantity) }), "Stock movement recorded."); }}>
          <label className="min-w-0 text-xs font-medium text-neutral-600">{t("Select item")}<select className={field + " mt-1"} required value={movement.item_id} onChange={(e) => setMovement({ ...movement, item_id: e.target.value })}><option value="">{t("Select item")}</option>{data.inventory.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
          <label className="min-w-0 text-xs font-medium text-neutral-600">{t("Movement type")}<select className={field + " mt-1"} value={movement.movement_type} onChange={(e) => setMovement({ ...movement, movement_type: e.target.value })}><option value="waste">{t("Wastage")}</option><option value="consumption">{t("Consumption")}</option><option value="return">{t("Return")}</option><option value="adjustment">{t("Stock count adjustment")}</option></select></label>
          <label className="min-w-0 text-xs font-medium text-neutral-600">{t("Quantity")}<input className={field + " mt-1"} type="number" min={movement.movement_type === "adjustment" ? "0" : "0.001"} step="0.001" required placeholder={movement.movement_type === "adjustment" ? t("Counted stock quantity") : t("Quantity")} value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} /></label><button className={button + " min-h-11 w-full self-end"} disabled={busy || !movement.item_id || !movement.quantity}>{t("Record movement")}</button>
        </form>
      </section>
      </div>
    </>}

    {tab === "expenses" && <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <section className={panel}>{heading("Add expense", "Record purchases and other restaurant expenses in one place.")}<form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post("/api/operations/expenses", { category: "General", description: expense.description.trim(), amount: Number(expense.amount), expense_date: today() + "T12:00:00", department: "General", payment_status: "paid", supplier_id: null, receipt_reference: null, notes: null }); setExpense({ description: "", amount: "" }); }, "Expense recorded."); }}>
        {input("Item name", expense.description, (v) => setExpense({ ...expense, description: v }))}
        {input("Price (NPR)", expense.amount, (v) => setExpense({ ...expense, amount: v }), "number")}
        <button className={button} disabled={busy || !expense.description.trim() || !expense.amount || Number(expense.amount) <= 0}>{t("Add expense")}</button>
      </form></section>
      <section className={panel}>{heading("Expenses dashboard", "All recorded purchases and expenses.")}<div className="mb-3 rounded-lg bg-neutral-50 p-4"><p className="text-xs text-neutral-500">{t("Total recorded expenses")}</p><p className="text-2xl font-bold text-red-700">{money(data.expenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0))}</p></div>
        {data.expenses.length === 0 ? <p className="py-6 text-center text-sm text-neutral-500">{t("No expenses recorded yet.")}</p> : data.expenses.map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm"><div><p className="font-medium">{item.description || item.category}</p><p className="text-xs text-neutral-500">{item.expense_date?.slice(0, 10) || "—"}</p></div><strong className="text-red-700">{money(item.amount)}</strong></div>)}
      </section>
    </div>}

    {role === "admin" && tab === "reports" && <section className={panel}>{heading("Profit & loss", "Net sales, estimated recipe-based COGS and operating expenses.")}<div className="flex flex-wrap items-end gap-3"><label className="text-xs">{t("From")}<input className={field} type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label><label className="text-xs">{t("To")}<input className={field} type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label><button className={button} onClick={() => run(async () => { const r = await api.get("/api/operations/reports/profit-loss", { params: { start, end } }); setReport(r.data); }, "Report generated.")}>{t("Generate report")}</button><a className="rounded-lg border px-4 py-2 text-sm" href={api.defaults.baseURL + "/api/operations/reports/stock.csv"} target="_blank" rel="noreferrer">{t("Export stock CSV")}</a></div>{report && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Net sales", report.net_sales], ["Estimated COGS", report.cost_of_goods_sold_estimate], ["Estimated gross profit", report.gross_profit_estimate], ["Estimated operating profit", report.operating_profit_estimate]].map((x) => <div key={x[0]} className="rounded-lg bg-neutral-50 p-4"><p className="text-xs text-neutral-500">{t(x[0])}</p><p className="text-xl font-bold">{money(x[1])}</p></div>)}<p className="col-span-full rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{report.note}</p></div>}</section>}

    
    {tab === "controls" && <AdminControl embedded managerView={role !== "admin"} visibleTabs={["cash", "service", "loyalty"]} initialTab={searchParams.get("control") || "cash"} />}
    {tab === "payroll" && <div className="grid gap-4 lg:grid-cols-2">
      <section className={panel}>{heading("Payroll register", "Record salary periods, partial cash-outs and remaining balances.")}<form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/api/operations/staff/payroll", { ...payrollForm, gross_pay: Number(payrollForm.gross_pay), deductions: Number(payrollForm.deductions) }), "Payroll entry created."); }}>
        <label className="block text-xs">{t("Staff member")}<select className={field} required value={payrollForm.user_id} onChange={(e) => setPayrollForm({ ...payrollForm, user_id: e.target.value })}><option value="">{t("Select staff")}</option>{data.payrollStaff.map((member: any) => <option key={member.id} value={member.id}>{member.full_name} · {member.role}</option>)}</select></label>
        {input("Gross salary (NPR)", payrollForm.gross_pay, (v) => setPayrollForm({ ...payrollForm, gross_pay: v }), "number")}
        {input("Period start", payrollForm.period_start, (v) => setPayrollForm({ ...payrollForm, period_start: v }), "date")}
        {input("Period end", payrollForm.period_end, (v) => setPayrollForm({ ...payrollForm, period_end: v }), "date")}
        {input("Deductions (NPR)", payrollForm.deductions, (v) => setPayrollForm({ ...payrollForm, deductions: v }), "number")}
        {input("Notes", payrollForm.notes, (v) => setPayrollForm({ ...payrollForm, notes: v }), "text", false)}
        <div className="sm:col-span-2"><button className={button} disabled={busy || data.payrollStaff.length === 0}>{t("Create payroll record")}</button></div>
      </form></section>
      <section className={panel}>{heading("Payroll records", "Track paid amounts, partial cash-outs and outstanding salary.")}{data.payroll.map((p: any) => <div key={p.id} className="border-b py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{p.full_name}</p><p className="text-xs text-neutral-500">{p.period_start} {t("to")} {p.period_end} · {t("Gross")} {money(p.gross_pay)} · {t("Deductions")} {money(p.deductions)}</p><p className="font-semibold">{money(Number(p.gross_pay)-Number(p.deductions))} {t("net")} · Paid {money(p.total_paid)} · Remaining {money(p.remaining_balance)} {Number(p.remaining_balance)<=0 ? "· Fully paid" : "· Balance due"}</p></div><div className="flex gap-2">{Number(p.remaining_balance)>0 && <button disabled={busy} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => cashoutPayroll(p)}>{t("Cash out")}</button>}<button disabled={busy || (p.payments || []).length>0} title={(p.payments || []).length>0 ? "Cannot delete a payroll record with payment history" : "Delete payroll record"} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40" onClick={() => deletePayroll(p)}>{t("Delete")}</button></div></div>{(p.payments || []).length>0 && <div className="mt-2 rounded-lg bg-neutral-50 p-2"><p className="mb-1 text-xs font-semibold text-neutral-600">Cash-out history</p>{p.payments.map((payment: any) => <p key={payment.id} className="text-xs text-neutral-600">{payment.payment_date} · {money(payment.amount)}{payment.notes ? " · "+payment.notes : ""}</p>)}</div>}</div>)}{data.payroll.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">No payroll records yet.</p>}</section>
    </div>}

    {role === "admin" && tab === "staff" && <section className={panel}>{heading("Staff attendance", "Clock staff in and out.")}<div className="flex flex-wrap gap-2"><select id="staff-clock" className={field + " max-w-sm"}><option value="">{t("Select staff")}</option>{data.staff.map((member: any) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select><button className={button} onClick={() => { const id = (document.getElementById("staff-clock") as HTMLSelectElement).value; if (id) run(() => api.post("/api/operations/staff/clock-in", { user_id: id }), "Clocked in."); }}>{t("Clock in")}</button></div>{data.attendance.map((a: any) => <div key={a.id} className="flex justify-between border-b py-3 text-sm"><span>{a.full_name} · {new Date(a.clock_in).toLocaleString()}</span>{!a.clock_out && <button className="text-brand" onClick={() => run(() => api.post("/api/operations/staff/" + a.id + "/clock-out"), "Clocked out.")}>{t("Clock out")}</button>}</div>)}</section>}

    {tab === "reservations" && <div className="grid gap-4 lg:grid-cols-[340px_1fr]"><section className={panel}>{heading("Book a table", "Create a future reservation.")}<form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/api/operations/reservations", { ...reservation, table_id: reservation.table_id || null, party_size: Number(reservation.party_size), reserved_for: new Date(reservation.reserved_for).toISOString() }), "Reservation created."); }}>{input("Customer name", reservation.customer_name, (v) => setReservation({ ...reservation, customer_name: v }))}{input("Phone", reservation.phone, (v) => setReservation({ ...reservation, phone: v }), "text", false)}{input("Party size", reservation.party_size, (v) => setReservation({ ...reservation, party_size: v }), "number")}{input("Date and time", reservation.reserved_for, (v) => setReservation({ ...reservation, reserved_for: v }), "datetime-local")}<label className="block text-xs">{t("Assign table (optional)")}<select className={field} value={reservation.table_id} onChange={(e) => setReservation({ ...reservation, table_id: e.target.value })}><option value="">{t("No table assigned")}</option>{data.tables.map((t: any) => <option key={t.id} value={t.id}>{t.name} · {t.capacity} seats</option>)}</select></label><button className={button}>{t("Create reservation")}</button></form></section><section className={panel}>{heading("Reservations", "Upcoming and recent bookings.")}{data.reservations.map((r: any) => <div key={r.id} className="flex flex-wrap justify-between border-b py-3 text-sm"><span>{r.customer_name} · {r.party_size} guests · {new Date(r.reserved_for).toLocaleString()}</span><select className="rounded border p-1" value={r.status} onChange={(e) => run(() => api.patch("/api/operations/reservations/" + r.id + "/status", null, { params: { status: e.target.value } }), "Reservation updated.")}><option value="booked">{t("Booked")}</option><option value="seated">{t("Seated")}</option><option value="completed">{t("Completed")}</option><option value="cancelled">{t("Cancelled")}</option></select></div>)}</section></div>}
  </div>;
}
