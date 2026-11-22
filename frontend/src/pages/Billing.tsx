import React, { useEffect, useState } from "react";
import { api } from "../api/client";

interface OpenOrder { id: string; order_number: string; table_id?: string; table_name: string; subtotal: string; grand_total: string; tax_amount: string; tax_percent: string; service_charge_amount: string; service_charge_percent: string; cabin_fee?: string; service_type?: string; customer_name?: string | null; phone?: string | null; delivery_address?: string | null; delivery_fee?: string; items: Array<{ name: string; quantity: number; unit_price: string; total: string }>; }
interface Customer { id: string; name: string; phone?: string | null; }

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default function Billing() {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orderId, setOrderId] = useState("");
  const [mergeOrderIds, setMergeOrderIds] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [loyaltyPoints, setLoyaltyPoints] = useState("0");
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [pointValue, setPointValue] = useState(1);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const [preview, setPreview] = useState<{ order: OpenOrder; discountPercentAmount: string; fixedDiscountAmount: string; loyaltyDiscount: string; loyaltyPoints: string; totalDiscountAmount: string; taxAmount: string; serviceAmount: string; grandTotal: string; amountReceived: string; remainingCredit: string; changeDue: string } | null>(null);
  const [error, setError] = useState("");
  const [paymentQr, setPaymentQr] = useState("");
  const [showPaymentQr, setShowPaymentQr] = useState(false);

  const loadData = async () => {
    const [orderResponse, customerResponse, loyaltyResponse] = await Promise.all([
      api.get("/api/orders/open"),
      api.get("/api/customers"),
      api.get("/api/admin/loyalty/settings"),
    ]);
    setOrders(orderResponse.data);
    setCustomers(customerResponse.data);
    setLoyaltyEnabled(!!loyaltyResponse.data.enabled);
    setPointValue(Number(loyaltyResponse.data.point_value || 0));
    return orderResponse.data as OpenOrder[];
  };

  useEffect(() => {
    loadData().catch(() => setError("Could not load open orders and customers."));
  }, []);
  useEffect(() => {
    api.get("/api/settings/payment-qr")
      .then(response => setPaymentQr(response.data.qr_image_path || ""))
      .catch(() => setPaymentQr(""));
  }, []);

  useEffect(() => {
    if (!customerId) { setLoyaltyBalance(0); setLoyaltyPoints("0"); setPreview(null); return; }
    api.get(`/api/admin/loyalty/customers/${customerId}`)
      .then((response) => setLoyaltyBalance(Number(response.data.points_balance || 0)))
      .catch(() => setLoyaltyBalance(0));
  }, [customerId]);

  const toggleMergeOrder = (id: string) => {
    setMergeOrderIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) {
        setError("You can merge a maximum of three tables.");
        return current;
      }
      setError("");
      return [...current, id];
    });
  };

  const mergeTables = async () => {
    if (mergeOrderIds.length < 2 || mergeOrderIds.length > 3) {
      setError("Select two or three occupied tables to merge.");
      return;
    }
    setMerging(true);
    setError("");
    try {
      const primaryOrderId = mergeOrderIds[0];
      const combinedAmount = orders
        .filter((order) => mergeOrderIds.includes(order.id))
        .reduce((total, order) => total + Number(order.grand_total || 0), 0);
      await api.post("/api/orders/merge", { order_ids: mergeOrderIds });
      const refreshedOrders = await loadData();
      const mergedOrder = refreshedOrders.find((order) => order.id === primaryOrderId);
      setOrderId(primaryOrderId);
      setAmount(method === "credit" ? "0" : (mergedOrder?.grand_total || roundMoney(combinedAmount).toFixed(2)));
      setMergeOrderIds([]);
      setPreview(null);
      setResult(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not merge the selected tables.");
    } finally {
      setMerging(false);
    }
  };

  const selectOrder = (id: string) => {
    setOrderId(id);
    const order = orders.find((candidate) => candidate.id === id);
    setAmount(method === "credit" ? "0" : (order?.grand_total || ""));
    setResult(null);
    setPreview(null);
  };

  const previewBill = () => {
    setError("");
    const selectedOrder = orders.find((order) => order.id === orderId);
    const percent = Number(discountPercent || 0);
    if (!selectedOrder || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Select an open order and enter a valid discount between 0% and 100%.");
      return;
    }
    const subtotal = Number(selectedOrder.subtotal);
    const taxRate = Number(selectedOrder.tax_percent || 0);
    const serviceRate = Number(selectedOrder.service_charge_percent || 0);
    const percentDiscountAmount = roundMoney(subtotal * percent / 100);
    const fixedDiscountAmount = Number(discountAmount || 0);
    if (!Number.isFinite(fixedDiscountAmount) || fixedDiscountAmount < 0) {
      setError("Enter a valid fixed discount amount.");
      return;
    }
    const points = Number(loyaltyPoints || 0);
    if (!Number.isFinite(points) || points < 0 || (points > 0 && (!loyaltyEnabled || !customerId || points > loyaltyBalance))) {
      setError("Check the customer, loyalty status and available points before redeeming.");
      return;
    }
    const loyaltyDiscount = roundMoney(points * pointValue);
    const totalDiscountAmount = roundMoney(percentDiscountAmount + fixedDiscountAmount + loyaltyDiscount);
    if (totalDiscountAmount > subtotal) {
      setError("Discounts and loyalty redemption cannot exceed the subtotal.");
      return;
    }
    const taxableSubtotal = roundMoney(subtotal - totalDiscountAmount);
    const taxAmount = roundMoney(taxableSubtotal * taxRate / 100);
    const serviceAmount = roundMoney(taxableSubtotal * serviceRate / 100);
    const grandTotal = roundMoney(taxableSubtotal + taxAmount + serviceAmount);
    let amountReceived = method === "credit" ? 0 : Number(amount || 0);
    if (!Number.isFinite(amountReceived) || amountReceived < 0) {
      setError("Enter a valid amount received.");
      return;
    }
    // When a pre-discount amount is still in the payment field, automatically
    // adjust non-cash tenders to the discounted bill total instead of treating
    // the stale amount as an attempted QR overpayment.
    if (amountReceived > grandTotal && method !== "cash") {
      amountReceived = grandTotal;
      setAmount(grandTotal.toFixed(2));
    }
    const remainingCredit = Math.max(0, grandTotal - amountReceived);
    const changeDue = Math.max(0, amountReceived - grandTotal);
    if (remainingCredit > 0.001 && !customerId) {
      setError("Select a customer so the remaining amount can be added to Credit.");
      return;
    }
    setPreview({ order: selectedOrder, discountPercentAmount: percentDiscountAmount.toFixed(2), fixedDiscountAmount: fixedDiscountAmount.toFixed(2), loyaltyDiscount: loyaltyDiscount.toFixed(2), loyaltyPoints: points.toFixed(0), totalDiscountAmount: totalDiscountAmount.toFixed(2),
      taxAmount: taxAmount.toFixed(2), serviceAmount: serviceAmount.toFixed(2),
      grandTotal: grandTotal.toFixed(2), amountReceived: amountReceived.toFixed(2),
      remainingCredit: remainingCredit.toFixed(2), changeDue: changeDue.toFixed(2) });
  };

  const addCustomer = async () => {
    if (!newCustomerName.trim()) return;
    try {
      const response = await api.post("/api/customers", { name: newCustomerName, phone: newCustomerPhone || null });
      setCustomers((current) => [...current, response.data]);
      setCustomerId(response.data.id);
      setNewCustomerName("");
      setNewCustomerPhone("");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not save customer.");
    }
  };

  const submit = async () => {
    setError("");
    setResult(null);
    try {
      const selectedOrder = orders.find((order) => order.id === orderId);
      if (!preview || !selectedOrder || (method !== "credit" && (!amount || Number(amount) <= 0))) {
        setError("Preview the bill before generating it.");
        return;
      }
      if (!selectedOrder || (method !== "credit" && (!amount || Number(amount) <= 0))) {
        setError("Select an open order and enter the amount received.");
        return;
      }
      if (method === "credit" && !customerId) {
        setError("Select a customer for a credit sale.");
        return;
      }
      const res = await api.post("/api/bills", {
        order_id: orderId,
        customer_id: customerId || null,
        discount_percent: Number(discountPercent || 0),
        discount_amount: Number(discountAmount || 0),
        loyalty_points_redeemed: Number(loyaltyPoints || 0),
        payments: [{ method, amount: method === "credit" ? 0 : Number(amount) }],
      });
      setResult(res.data);
      setPreview(null);
      setLoyaltyPoints("0");
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to create bill");
    }
  };

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const matchingCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.phone || ""}`.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const updateCustomerSearch = (value: string) => {
    setCustomerSearch(value);
    setPreview(null);
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      setCustomerId("");
      return;
    }
    const exact = customers.find((customer) =>
      [customer.name, customer.phone || ""].some((field) => field.trim().toLowerCase() === normalized)
    );
    setCustomerId(exact ? exact.id : "");
  };

  const printBill = () => window.print();

  return (
    <div className="billing-page mx-auto max-w-6xl space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#9b7957]">Front of house / Checkout</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight">Billing</h1><p className="mt-1 text-sm text-neutral-500">Select an order, take payment and issue a clean receipt.</p></div>
        <span className="rounded-full border border-[#e7ded4] bg-white px-3 py-2 text-xs font-bold text-[#75665a]">{orders.length} open orders</span>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-sm">
            <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-[#9b7957]">01 / Order</p><h2 className="mt-1 text-base font-extrabold">Choose an open order</h2></div>
            <select className="w-full rounded-xl border px-3 py-3 text-sm" value={orderId} onChange={e=>selectOrder(e.target.value)}><option value="">Select an open order</option>{orders.map(o=><option key={o.id} value={o.id}>{o.service_type&&o.service_type!=="dine_in"?o.table_name:"Table "+o.table_name} · {o.order_number} · NPR {o.grand_total}</option>)}</select>
            {orderId&&orders.find(o=>o.id===orderId)&&<div className="mt-3 rounded-xl bg-[#f8f5f0] p-4"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold text-[#8c6b49]">{orders.find(o=>o.id===orderId)?.order_number}</p><p className="mt-1 text-sm font-extrabold text-[#352a23]">{orders.find(o=>o.id===orderId)?.table_name}</p></div><b className="text-lg text-[#74352e]">NPR {orders.find(o=>o.id===orderId)?.grand_total}</b></div><div className="mt-3 space-y-2 border-t border-[#e8ded2] pt-3">{orders.find(o=>o.id===orderId)?.items.map((item,i)=><div key={i} className="flex justify-between text-xs"><span>{item.quantity} × {item.name}</span><b>NPR {item.total}</b></div>)}</div></div>}
            <details className="mt-3 rounded-xl border border-[#eee7df] px-3 py-3"><summary className="cursor-pointer text-xs font-bold text-[#6c5544]">Merge tables</summary><p className="mt-2 text-xs text-neutral-500">Select two or three occupied dine-in tables.</p><div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{orders.filter(o=>!o.service_type||o.service_type==="dine_in").map(o=><label key={o.id} className="flex justify-between gap-3 rounded-lg px-2 py-2 text-xs"><span>{o.table_name} · {o.order_number}</span><span className="flex items-center gap-2">NPR {o.grand_total}<input type="checkbox" checked={mergeOrderIds.includes(o.id)} onChange={()=>toggleMergeOrder(o.id)} disabled={merging||(!mergeOrderIds.includes(o.id)&&mergeOrderIds.length>=3)}/></span></label>)}</div><button type="button" onClick={mergeTables} disabled={merging||mergeOrderIds.length<2} className="mt-2 rounded-lg bg-[#342923] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{merging?"Merging…":"Merge selected tables"}</button></details>
          </section>
          <section className="rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-sm">
            <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-widest text-[#9b7957]">02 / Payment</p><h2 className="mt-1 text-base font-extrabold">Payment details</h2></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-neutral-600">Payment method<select className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" value={method} onChange={e=>{setMethod(e.target.value);setPreview(null);const selected=orders.find(o=>o.id===orderId);setAmount(e.target.value==="credit"?"0":(selected?.grand_total||""));}}><option value="cash">Cash</option><option value="qr">QR payment</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="credit">Customer credit</option></select></label><label className="block text-xs font-bold text-neutral-600">Amount received (NPR)<input type="number" min="0" step="0.01" disabled={method==="credit"} className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm disabled:opacity-50" value={amount} onChange={e=>{setAmount(e.target.value);setPreview(null);}}/></label></div>
            <p className="mt-2 text-[11px] text-neutral-500">{method==="cash"?"Cash overpayment is returned as change.":method==="credit"?"This bill is recorded against the customer's credit balance.":"Non-cash payment cannot exceed the bill total."}</p>
            <div className="mt-3 rounded-xl border border-[#e8ded2] bg-[#faf7f3] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-[#594638]">Restaurant payment QR</p><p className="mt-1 text-[11px] text-neutral-500">{paymentQr ? "Show the saved restaurant QR for customers to scan." : "No QR uploaded yet. An admin can add it in Admin Controls → Business Settings."}</p></div>
                <button type="button" onClick={() => setShowPaymentQr(v => !v)} className="shrink-0 rounded-lg bg-[#342923] px-4 py-2.5 text-xs font-bold text-white">{showPaymentQr ? "Hide QR" : "Show QR"}</button>
              </div>
              {showPaymentQr && (paymentQr ? <div className="mt-3 rounded-lg border border-[#eee7df] bg-white p-3 text-center"><img src={paymentQr} alt="Royal Skye payment QR code" className="mx-auto max-h-64 max-w-full object-contain" /><p className="mt-2 text-[10px] text-neutral-500">Customer can scan using a supported banking or wallet app. Verify payment in your merchant account before completing the bill.</p></div> : <p className="mt-3 rounded-lg bg-white p-3 text-xs text-[#8a5941]">QR image not configured. Upload the restaurant QR in Admin Controls → Business Settings, then save the settings.</p>)}
            </div>
            <div className="mt-4 border-t border-[#eee7df] pt-4"><label className="block text-xs font-bold text-neutral-600">Customer for credit / partial payment<input className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" placeholder="Search customer by name or phone" value={customerSearch} onChange={e=>updateCustomerSearch(e.target.value)}/></label>
              {customerSearch&&<div className="mt-2 max-h-32 overflow-y-auto rounded-xl border">{matchingCustomers.map(customer=><button type="button" key={customer.id} onClick={()=>{setCustomerId(customer.id);setCustomerSearch(customer.name);setPreview(null);}} className={"block w-full border-b px-3 py-2 text-left text-xs "+(customer.id===customerId?"bg-[#f4eee5] font-bold":"hover:bg-[#faf7f3]")}>{customer.name}{customer.phone?" · "+customer.phone:""}</button>)}{matchingCustomers.length===0&&<p className="p-3 text-xs text-neutral-500">No customer found.</p>}</div>}
              {selectedCustomer&&<p className="mt-2 text-xs font-semibold text-[#55735a]">Selected: {selectedCustomer.name}</p>}
              <details className="mt-3 rounded-xl border border-[#eee7df] px-3 py-3"><summary className="cursor-pointer text-xs font-bold text-[#6c5544]">Add new customer</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Customer name" value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)}/><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" value={newCustomerPhone} onChange={e=>setNewCustomerPhone(e.target.value)}/></div><button type="button" onClick={addCustomer} className="mt-2 rounded-lg border border-[#b99a78] px-3 py-2 text-xs font-bold text-[#76583d]">Save customer</button></details>
            </div>
          </section>
          <section className="rounded-2xl border border-[#e9dfd5] bg-white p-5 shadow-sm"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-widest text-[#9b7957]">03 / Optional</p><h2 className="mt-1 text-base font-extrabold">Discounts & loyalty</h2></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-neutral-600">Discount (%)<input type="number" min="0" max="100" step="0.01" className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" value={discountPercent} onChange={e=>{setDiscountPercent(e.target.value);setPreview(null);}}/></label><label className="block text-xs font-bold text-neutral-600">Fixed discount (NPR)<input type="number" min="0" step="0.01" className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" value={discountAmount} onChange={e=>{setDiscountAmount(e.target.value);setPreview(null);}}/></label></div><details className="mt-3 rounded-xl border border-[#eee7df] px-3 py-3"><summary className="cursor-pointer text-xs font-bold text-[#6c5544]">Redeem loyalty points</summary><input type="number" min="0" step="1" disabled={!customerId||!loyaltyEnabled} className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm" value={loyaltyPoints} onChange={e=>{setLoyaltyPoints(e.target.value);setPreview(null);}}/><p className="mt-1 text-xs text-neutral-500">{!customerId?"Select a customer first.":loyaltyEnabled?"Available: "+loyaltyBalance+" points · NPR "+pointValue+" per point":"Loyalty is disabled."}</p></details></section>
        </div>
        <aside className="space-y-4 xl:sticky xl:top-24"><section className="rounded-2xl border border-[#e2d6c9] bg-[#f9f6f1] p-5 shadow-sm"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#9b7957]">Checkout summary</p><h2 className="mt-1 text-lg font-extrabold text-[#332821]">Bill total</h2>{orderId&&orders.find(o=>o.id===orderId)?<div className="mt-4 flex justify-between text-sm"><span className="text-[#77685c]">Current order total</span><b>NPR {orders.find(o=>o.id===orderId)?.grand_total}</b></div>:<p className="mt-4 rounded-xl border border-dashed p-4 text-center text-xs text-neutral-500">Select an order to begin.</p>}<button type="button" onClick={previewBill} disabled={!orderId} className="mt-5 w-full rounded-xl bg-[#7b2926] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40">Preview final bill</button>
          {preview&&<div className="mt-4 rounded-xl border border-[#e7dbce] bg-white p-4"><div className="border-b border-dashed pb-3 text-center"><p className="text-[10px] font-bold uppercase tracking-widest text-[#9b7957]">Bill preview</p><p className="mt-1 text-sm font-extrabold">{preview.order.order_number}</p><p className="text-[10px] text-neutral-500">Not yet recorded as a sale</p></div><div className="space-y-2 py-3 text-xs">{preview.order.items.map((item,i)=><div key={i} className="flex justify-between gap-2"><span>{item.quantity} × {item.name}</span><b>NPR {item.total}</b></div>)}</div><div className="space-y-2 border-t pt-3 text-xs"><p className="flex justify-between"><span>Subtotal</span><span>NPR {preview.order.subtotal}</span></p>{Number(preview.totalDiscountAmount)>0&&<p className="flex justify-between text-[#a0443e]"><span>Discount</span><span>− NPR {preview.totalDiscountAmount}</span></p>}{Number(preview.taxAmount)>0&&<p className="flex justify-between"><span>Tax</span><span>NPR {preview.taxAmount}</span></p>}{Number(preview.serviceAmount)>0&&<p className="flex justify-between"><span>Service charge</span><span>NPR {preview.serviceAmount}</span></p>}<p className="flex justify-between border-t pt-3 text-base font-extrabold"><span>Total due</span><span>NPR {preview.grandTotal}</span></p><p className="flex justify-between"><span>Amount received</span><b>NPR {preview.amountReceived}</b></p>{Number(preview.changeDue)>0&&<p className="flex justify-between font-bold text-[#477453]"><span>Change</span><span>NPR {preview.changeDue}</span></p>}{Number(preview.remainingCredit)>0&&<p className="flex justify-between font-bold text-[#a36c32]"><span>Credit balance</span><span>NPR {preview.remainingCredit}</span></p>}</div><button type="button" onClick={submit} className="mt-4 w-full rounded-xl bg-[#342923] px-4 py-3 text-sm font-extrabold text-white">Confirm payment & generate bill</button></div>}
        </section>
        {result&&<section id="printable-bill" className="receipt-print rounded-2xl border border-[#e9dfd5] bg-white p-5 text-sm text-[#241f1b] shadow-sm"><div className="text-center"><img src="/images/logo.jpg" alt="Royal Skye logo" className="mx-auto mb-3 h-16 max-w-[150px] object-contain"/><p className="text-base font-extrabold">{result.restaurant?.name||"Royal Skye"}</p><p className="mt-1 text-xs text-neutral-600">{result.restaurant?.address||""}</p>{result.restaurant?.phone&&<p className="text-xs text-neutral-600">{result.restaurant.phone}</p>}{result.restaurant?.pan&&<p className="text-xs text-neutral-600">PAN: {result.restaurant.pan}</p>}<div className="mt-3 border-y border-dashed py-2 text-xs"><p className="font-bold">{result.bill_number}</p><p>{result.service_type&&result.service_type!=="dine_in"?result.table_name:"Table "+result.table_name}</p><p>{new Date().toLocaleString()}</p></div>{result.customer_name&&<p className="mt-2 text-left text-xs">Customer: {result.customer_name} {result.phone||""}</p>}{result.delivery_address&&<p className="mt-1 text-left text-xs">Delivery: {result.delivery_address}</p>}</div><div className="mt-3 space-y-2">{result.items?.map((item:any,i:number)=><div key={i} className="flex justify-between gap-3 text-xs"><span>{item.quantity} × {item.name}<small className="block text-neutral-500">NPR {item.unit_price} each</small></span><b>NPR {item.total}</b></div>)}</div>{Number(result.cabin_fee||0)>0&&<p className="flex justify-between text-xs"><span>Cabin fee</span><span>NPR {result.cabin_fee}</span></p>}{Number(result.delivery_fee||0)>0&&<p className="flex justify-between text-xs"><span>Delivery fee</span><span>NPR {result.delivery_fee}</span></p>}<div className="mt-3 space-y-1.5 border-t border-dashed pt-3 text-xs"><p className="flex justify-between"><span>Subtotal</span><span>NPR {result.subtotal}</span></p>{Number(result.discount_amount||0)>0&&<p className="flex justify-between"><span>Discount</span><span>− NPR {result.discount_amount}</span></p>}{Number(result.tax_amount||0)>0&&<p className="flex justify-between"><span>Tax</span><span>NPR {result.tax_amount}</span></p>}{Number(result.service_charge_amount||0)>0&&<p className="flex justify-between"><span>Service charge</span><span>NPR {result.service_charge_amount}</span></p>}<p className="flex justify-between border-t pt-2 text-sm font-extrabold"><span>Grand total</span><span>NPR {result.grand_total}</span></p>{(result.payments||[]).map((payment:any,i:number)=><p key={i} className="flex justify-between"><span>Paid · {payment.method}</span><span>NPR {payment.amount}</span></p>)}{Number(result.change_due||0)>0&&<p className="flex justify-between font-bold"><span>Change</span><span>NPR {result.change_due}</span></p>}{Number(result.outstanding_amount||0)>0&&<p className="flex justify-between font-bold"><span>Balance due</span><span>NPR {result.outstanding_amount}</span></p>}</div><p className="mt-4 text-center text-xs text-neutral-600">{result.restaurant?.receipt_footer||"Thank you for visiting Royal Skye."}</p><div className="print:hidden mt-4 flex gap-2"><button type="button" onClick={printBill} className="flex-1 rounded-xl bg-[#342923] px-3 py-2.5 text-xs font-bold text-white">Print receipt</button><button type="button" onClick={()=>setResult(null)} className="rounded-xl border px-3 py-2.5 text-xs font-bold">New bill</button></div></section>}
        </aside>
      </div>
      {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
