import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useSearchParams } from "react-router-dom";

import Button from "../components/Button";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

const inputClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export default function WarehouseBillingPage() {
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selection, setSelection] = useState("");
  const [customer, setCustomer] = useState({ name: "", address: "", phone: "", pan: "", remarks: "" });
  const [shipping, setShipping] = useState({ invoice_number: "", bilty_number: "", transport_name: "" });
  const [transportBillPhoto, setTransportBillPhoto] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStarting, setCameraStarting] = useState(false);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [rates, setRates] = useState({});
  const [companyIncreases, setCompanyIncreases] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrders(token, { include_items: 1, limit: 500, billing: 1 })
      .then((result) => setOrders(result.data || result || []))
      .finally(() => setLoading(false));
  }, [token]);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraStarting(false);
  };

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  const choices = useMemo(() => orders.flatMap((order) =>
    (order.warehouse_fulfillments || [])
      .filter((fulfillment) => Number(fulfillment.delivered_pairs || 0) > 0)
      .map((fulfillment) => ({ order, fulfillment, key: `${order.id}:${fulfillment.warehouse_id}` }))
  ), [orders]);

  const selected = choices.find((choice) => choice.key === selection);
  const allItems = useMemo(() => {
    if (!selected) return [];
    return (selected.order.items || []).flatMap((item) =>
      (item.warehouse_allocations || [])
        .filter((allocation) => Number(allocation.warehouse_id) === Number(selected.fulfillment.warehouse_id) && allocation.allocation_status === "DEDUCTED")
        .map((allocation) => ({
          key: `${item.id}:${allocation.id}`,
          finished_good_id: item.finished_good_id,
          product_name: item.product_name,
          article_code: item.article_code,
          size: item.size,
          quantity: Number(allocation.quantity || 0),
          unit: item.unit || "pairs",
          is_commission: Number(item.is_commission || 0) === 1,
          base_rate: Number(rates[`${item.id}:${allocation.id}`] ?? item.unit_price_snapshot ?? 0),
          company_increase: Number(companyIncreases[`${item.id}:${allocation.id}`] || 0),
        }))
    );
  }, [companyIncreases, rates, selected]);
  const percentageItems = useMemo(() => allItems.filter((item) => item.is_commission), [allItems]);
  const nonCommissionItems = useMemo(() => allItems.filter((item) => !item.is_commission), [allItems]);
  const items = allItems;

  const chooseBill = (value) => {
    setSelection(value);
    const choice = choices.find((entry) => entry.key === value);
    setCustomer({
      name: choice?.order.customer_name || "",
      address: choice?.order.customer_address || "",
      phone: choice?.order.customer_phone || "",
      pan: choice?.order.pan_number || "",
      remarks: "",
    });
    setRates({});
    setCompanyIncreases({});
    setShipping({
      invoice_number: "",
      bilty_number: "",
      transport_name: choice?.order.transport_name || "",
    });
    setTransportBillPhoto(null);
    setDiscountValue(0);
  };

  useEffect(() => {
    if (selection || !choices.length) return;
    const orderId = searchParams.get("order_id");
    const warehouseId = searchParams.get("warehouse_id");
    const requested = `${orderId}:${warehouseId}`;
    if (choices.some((choice) => choice.key === requested)) chooseBill(requested);
  }, [choices, searchParams, selection]);

  const getFinalRate = (item) => item.base_rate + (item.is_commission ? 0 : item.company_increase);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * getFinalRate(item), 0);
  const percentageProductSubtotal = items.reduce(
    (sum, item) => sum + (item.is_commission ? item.quantity * getFinalRate(item) : 0),
    0
  );
  const nonCommissionSubtotal = nonCommissionItems.reduce(
    (sum, item) => sum + item.quantity * getFinalRate(item),
    0
  );
  const normalizedDiscountPercent = Math.min(100, Math.max(0, Number(discountValue || 0)));
  const discount = percentageProductSubtotal * normalizedDiscountPercent / 100;
  const finalTotal = Math.max(0, subtotal - discount);

  const loadTransportBillPhoto = (file) => {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const source = new Image();
      source.onload = () => {
        const maximumSide = 1800;
        const scale = Math.min(1, maximumSide / Math.max(source.width, source.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        setTransportBillPhoto({
          name: file.name || `transport-bill-${Date.now()}.jpg`,
          dataUrl: canvas.toDataURL("image/jpeg", 0.86),
        });
      };
      source.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live camera is not supported here. Use HTTPS or localhost, or upload a photo.");
      return;
    }
    setCameraOpen(true);
    setCameraStarting(true);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      setCameraError(
        error?.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in the browser, then try again."
          : "The camera could not be opened. Use HTTPS or localhost, check the camera, or upload a photo."
      );
      stopCamera();
    } finally {
      setCameraStarting(false);
    }
  };

  const captureTransportBillPhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      setCameraError("The camera is still starting. Wait a moment and try again.");
      return;
    }
    const maximumSide = 1800;
    const scale = Math.min(1, maximumSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    setTransportBillPhoto({
      name: `transport-bill-${Date.now()}.jpg`,
      dataUrl: canvas.toDataURL("image/jpeg", 0.86),
    });
    stopCamera();
  };

  const buildWorkbook = () => {
    if (!selected || !items.length) return null;
    const baseBillNumber = selected.fulfillment.warehouse_slip_number || selected.fulfillment.delivery_note_number || `ORDER-${selected.order.id}`;
    const billNumber = baseBillNumber;
    const rows = [
      ["WAREHOUSE SALES BILL - PERCENTAGE AND NON-COMMISSION"],
      ["Bill Number", billNumber, "Date", new Date()],
      ["Invoice Number", shipping.invoice_number, "Bilty Number", shipping.bilty_number],
      ["Order", selected.order.id, "Warehouse", selected.fulfillment.name],
      ["Dealer", selected.order.created_by_name || "", "Dealer Email", selected.order.created_by_email || ""],
      ["Dealer Customer", customer.name, "Customer Phone", customer.phone],
      ["Customer Address", customer.address, "Customer PAN", customer.pan],
      ["Transport Name", shipping.transport_name, "Transport Bill Photo", transportBillPhoto?.name || "Not attached"],
      ["Remarks", customer.remarks],
      [],
      ["S.No", "FG.ID", "Particulars", "Product Type", "Qty", "Unit", "Base Rate", "Company Increase", "Final Rate", "Amount"],
      ...items.map((item, index) => [index + 1, item.finished_good_id, `${item.product_name}${item.size ? ` · ${item.size}` : ""}`, item.is_commission ? "Percentage" : "Non commission", item.quantity, item.unit, item.base_rate, item.is_commission ? 0 : item.company_increase, null, null]),
      [],
      ["", "", "", "", "Total Qty", null, "", "", "Subtotal", null],
      ["", "", "", "", "", "", "", "", "Percentage products", null],
      ["", "", "", "", "", "", "", "", "Discount %", normalizedDiscountPercent],
      ["", "", "", "", "", "", "", "", "Discount amount", null],
      ["", "", "", "", "", "", "", "", "Final total", null],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const firstItemRow = 12;
    const lastItemRow = firstItemRow + items.length - 1;
    items.forEach((_, index) => {
      const row = firstItemRow + index;
      sheet[`I${row}`] = { t: "n", f: `G${row}+H${row}` };
      sheet[`J${row}`] = { t: "n", f: `E${row}*I${row}` };
    });
    const summaryRow = lastItemRow + 2;
    sheet[`F${summaryRow}`] = { t: "n", f: `SUM(E${firstItemRow}:E${lastItemRow})` };
    sheet[`J${summaryRow}`] = { t: "n", f: `SUM(J${firstItemRow}:J${lastItemRow})` };
    sheet[`J${summaryRow + 1}`] = { t: "n", f: `SUMIF(D${firstItemRow}:D${lastItemRow},"Percentage",J${firstItemRow}:J${lastItemRow})` };
    sheet[`J${summaryRow + 3}`] = { t: "n", f: `J${summaryRow + 1}*J${summaryRow + 2}/100` };
    sheet[`J${summaryRow + 4}`] = { t: "n", f: `MAX(0,J${summaryRow}-J${summaryRow + 3})` };
    sheet["!cols"] = [{ wch: 7 }, { wch: 10 }, { wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }];
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 8, c: 1 }, e: { r: 8, c: 9 } }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Warehouse Bill");
    return { workbook, billNumber };
  };

  const recordBillCreation = async (outputType) => {
    const previousCount = Number(selected?.fulfillment?.billing_count || 0);
    if (previousCount > 0 && !window.confirm(`WARNING: A bill has already been created ${previousCount} time${previousCount === 1 ? "" : "s"} for this warehouse DN.\n\nContinue only if you are correcting a human error.`)) return false;
    await api.logWarehouseBilling(selected.order.id, { warehouse_id:selected.fulfillment.warehouse_id, delivery_note_number:selected.fulfillment.warehouse_slip_number || selected.fulfillment.delivery_note_number, output_type:outputType, invoice_number:shipping.invoice_number, final_total:finalTotal, confirm_rebill:previousCount>0 }, token);
    selected.fulfillment.billing_count = previousCount + 1;
    return true;
  };

  const exportExcel = async () => {
    const built = buildWorkbook();
    if (!built) return;
    if (!await recordBillCreation("EXCEL")) return;
    XLSX.writeFile(built.workbook, `${built.billNumber}-bill.xlsx`, { cellStyles: true });
  };

  const buildPdf = () => {
    if (!selected || !items.length) return null;
    const baseBillNumber = selected.fulfillment.warehouse_slip_number || selected.fulfillment.delivery_note_number || `ORDER-${selected.order.id}`;
    const billNumber = baseBillNumber;
    const document = new jsPDF({
      unit: "mm",
      format: "a4",
      compress: true,
      encryption: {
        ownerPassword: `${billNumber}-${selected.order.id}-warehouse-bill`,
        userPermissions: ["print"],
      },
    });
    document.setProperties({
      title: `${billNumber} Warehouse Bill`,
      subject: `Warehouse bill for order ${selected.order.id}`,
      author: "Store Management",
    });
    document.setFont("helvetica", "bold");
    document.setFontSize(16);
    document.text("WAREHOUSE SALES BILL", 105, 16, { align: "center" });
    document.setFontSize(10);
    document.text(`Percentage + Non-Commission | ${billNumber} | Order #${selected.order.id} | ${selected.fulfillment.name}`, 105, 23, { align: "center" });
    document.setDrawColor(203, 213, 225);
    document.line(14, 27, 196, 27);
    document.setFont("helvetica", "normal");
    const details = [
      [`Dealer: ${selected.order.created_by_name || "-"}`, `Dealer email: ${selected.order.created_by_email || "-"}`],
      [`Dealer customer: ${customer.name || "-"}`, `Customer phone: ${customer.phone || "-"}`],
      [`Customer address: ${customer.address || "-"}`, `Customer PAN: ${customer.pan || "-"}`],
      [`Invoice number: ${shipping.invoice_number || "-"}`, `Bilty number: ${shipping.bilty_number || "-"}`],
      [`Transport: ${shipping.transport_name || "-"}`, `Transport bill photo: ${transportBillPhoto ? "Attached" : "Not attached"}`],
      [`Warehouse: ${selected.fulfillment.name || "-"}`, `Date: ${new Date().toLocaleDateString()}`],
      [`Remarks: ${customer.remarks || "-"}`, ""],
    ];
    let detailY = 34;
    details.forEach(([left, right]) => {
      document.text(String(left), 14, detailY, { maxWidth: 112 });
      if (right) document.text(String(right), 132, detailY, { maxWidth: 64 });
      detailY += 6;
    });
    autoTable(document, {
      startY: detailY + 2,
      head: [["S.No", "FG.ID", "Particulars", "Type", "Qty", "Base", "+Company", "Rate", "Amount"]],
      body: items.map((item, index) => [
        index + 1,
        item.finished_good_id,
        `${item.product_name}${item.size ? ` - ${item.size}` : ""}`,
        item.is_commission ? "Percentage" : "Non commission",
        formatNumber(item.quantity),
        Number(item.base_rate).toFixed(2),
        Number(item.is_commission ? 0 : item.company_increase).toFixed(2),
        getFinalRate(item).toFixed(2),
        (item.quantity * getFinalRate(item)).toFixed(2),
      ]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, textColor: [15, 23, 42] },
      headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 15 },
        2: { cellWidth: 43 },
        3: { cellWidth: 23 },
        4: { cellWidth: 14, halign: "right" },
        5: { cellWidth: 19, halign: "right" },
        6: { cellWidth: 19, halign: "right" },
        7: { cellWidth: 19, halign: "right" },
        8: { cellWidth: 22, halign: "right" },
      },
    });
    let summaryY = document.lastAutoTable.finalY + 8;
    if (summaryY > 258) {
      document.addPage();
      summaryY = 20;
    }
    const summaryRows = [
      ["Percentage products subtotal", percentageProductSubtotal],
      ["Non-commission subtotal", nonCommissionSubtotal],
      ["Combined subtotal", subtotal],
      [`Discount (${normalizedDiscountPercent.toFixed(2)}%)`, discount],
      ["Final total", finalTotal],
    ];
    summaryRows.forEach(([label, value], index) => {
      document.setFont("helvetica", index === summaryRows.length - 1 ? "bold" : "normal");
      document.text(String(label), 145, summaryY + index * 7, { align: "right" });
      document.text(Number(value).toFixed(2), 196, summaryY + index * 7, { align: "right" });
    });
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor(100);
    document.text(
      "Static dealer copy. Discount applies only to Percentage products; non-commission products receive no discount.",
      14,
      summaryY + 32
    );
    if (transportBillPhoto?.dataUrl) {
      document.addPage();
      document.setTextColor(15, 23, 42);
      document.setFont("helvetica", "bold");
      document.setFontSize(14);
      document.text("TRANSPORT BILL ATTACHMENT", 105, 16, { align: "center" });
      document.setFont("helvetica", "normal");
      document.setFontSize(9);
      document.text(`Invoice: ${shipping.invoice_number || "-"} | Bilty: ${shipping.bilty_number || "-"} | Transport: ${shipping.transport_name || "-"}`, 105, 23, { align: "center", maxWidth: 180 });
      const imageProperties = document.getImageProperties(transportBillPhoto.dataUrl);
      const maximumWidth = 182;
      const maximumHeight = 250;
      const imageScale = Math.min(maximumWidth / imageProperties.width, maximumHeight / imageProperties.height);
      const imageWidth = imageProperties.width * imageScale;
      const imageHeight = imageProperties.height * imageScale;
      document.addImage(transportBillPhoto.dataUrl, "JPEG", (210 - imageWidth) / 2, 32, imageWidth, imageHeight, undefined, "FAST");
    }
    const blob = document.output("blob");
    return {
      billNumber,
      blob,
      file: new File([blob], `${billNumber}-bill.pdf`, { type: "application/pdf" }),
    };
  };

  const downloadPdf = async () => {
    const built = buildPdf();
    if (!built) return;
    if (!await recordBillCreation("PDF")) return;
    const url = URL.createObjectURL(built.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${built.billNumber}-bill.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shareBill = async () => {
    const built = buildPdf();
    if (!built) return;
    const shareData = {
      title: `${built.billNumber} warehouse bill`,
      text: `Warehouse bill ${built.billNumber} for order #${selected.order.id}.`,
      files: [built.file],
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error?.name !== "AbortError") throw error;
      }
      return;
    }
    downloadPdf();
    const message = encodeURIComponent(`Warehouse bill ${built.billNumber} for order #${selected.order.id}. Please see the PDF bill I am attaching.`);
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
  };

  const emailDealer = () => {
    if (!selected?.order?.created_by_email) return;
    const baseBillNumber = selected.fulfillment.warehouse_slip_number || selected.fulfillment.delivery_note_number || `ORDER-${selected.order.id}`;
    const billNumber = baseBillNumber;
    const subject = encodeURIComponent(`${billNumber} warehouse bill`);
    const body = encodeURIComponent(
      `Hello ${selected.order.created_by_name || "Dealer"},\n\nWarehouse bill ${billNumber} for order #${selected.order.id} is ready.\nInvoice: ${shipping.invoice_number || "-"}\nBilty: ${shipping.bilty_number || "-"}\nTransport: ${shipping.transport_name || "-"}\nWarehouse: ${selected.fulfillment.name}\nCustomer: ${customer.name}\nFinal total: ${finalTotal.toFixed(2)}\n\nPlease find the PDF bill attached.`
    );
    window.location.href = `mailto:${encodeURIComponent(selected.order.created_by_email)}?subject=${subject}&body=${body}`;
  };

  const renderProductRows = (productItems) => (
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-slate-50"><tr>{["FG.ID","Product","Type","Qty","Unit","Base rate","Company increase","Final rate","Amount"].map(h=><th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{productItems.map(item=><tr key={item.key} className="border-t"><td className="px-4 py-3">{item.finished_good_id}</td><td className="px-4 py-3 font-medium">{item.product_name}</td><td className="px-4 py-3"><span className={item.is_commission ? "font-semibold text-indigo-700" : "text-slate-500"}>{item.is_commission ? "Percentage" : "Non commission"}</span></td><td className="px-4 py-3">{formatNumber(item.quantity)}</td><td className="px-4 py-3">{item.unit}</td><td className="px-4 py-3"><input type="number" min="0" step="0.01" className={inputClass} value={item.base_rate} onChange={(e)=>setRates(r=>({...r,[item.key]:e.target.value}))}/></td><td className="px-4 py-3">{item.is_commission ? <span className="text-slate-400">Not applicable</span> : <select className={inputClass} value={item.company_increase} onChange={(e)=>setCompanyIncreases(current=>({...current,[item.key]:Number(e.target.value)}))}><option value={0}>Rs 0</option><option value={25}>+Rs 25</option><option value={50}>+Rs 50</option></select>}</td><td className="px-4 py-3 font-semibold">{formatNumber(getFinalRate(item))}</td><td className="px-4 py-3 font-semibold">{formatNumber(item.quantity*getFinalRate(item))}</td></tr>)}</tbody></table></div>
  );

  return <div className="space-y-5">
    <PageHeader eyebrow="Sales" title="Warehouse Billing" description="Create one bill from each warehouse DN. Billing does not change stock." icon="ledger" />
    <SectionCard title="Select delivered warehouse DN" icon="orders">
      <div className="p-5"><select className={inputClass} value={selection} onChange={(event) => chooseBill(event.target.value)} disabled={loading}>
        <option value="">{loading ? "Loading delivered DNs…" : "Choose order and warehouse DN"}</option>
        {choices.map(({ key, order, fulfillment }) => <option key={key} value={key}>Order #{order.id} · Dealer: {order.created_by_name || "Unknown"} · Customer: {order.customer_name || "Unknown"} · {fulfillment.warehouse_slip_number} · {fulfillment.name} · {formatNumber(fulfillment.delivered_pairs)} pairs</option>)}
      </select></div>
    </SectionCard>
    {selected ? <>
      <SectionCard title="Customer and bill details" subtitle="These edits apply only to this bill." icon="edit">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 md:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dealer / order created by</p><p className="mt-1 font-bold text-slate-950">{selected.order.created_by_name || "Unknown dealer"}</p><p className="text-sm text-slate-500">{selected.order.created_by_email || "No dealer email"}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dealer's customer</p><p className="mt-1 font-bold text-slate-950">{customer.name || "No customer name"}</p><p className="text-sm text-slate-500">{customer.address || "No customer address"}{customer.phone ? ` · ${customer.phone}` : ""}</p></div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {[['name','Customer name'],['address','Address'],['phone','Phone'],['pan','PAN']].map(([key,label]) => <label key={key} className="text-xs font-semibold text-slate-600">{label}<input className={`mt-1 ${inputClass}`} value={customer[key]} onChange={(e) => setCustomer((c) => ({...c,[key]:e.target.value}))}/></label>)}
          {[['invoice_number','Invoice number'],['bilty_number','Bilty number'],['transport_name','Transport name']].map(([key,label]) => <label key={key} className="text-xs font-semibold text-slate-600">{label}<input className={`mt-1 ${inputClass}`} value={shipping[key]} onChange={(e) => setShipping((current) => ({...current,[key]:e.target.value}))}/></label>)}
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">Remarks<textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm" value={customer.remarks} onChange={(e) => setCustomer((c) => ({...c,remarks:e.target.value}))}/></label>
        </div>
      </SectionCard>
      <SectionCard title="Transport bill photo" subtitle="Take a photo on mobile or upload an existing transport receipt. It will be added to the protected PDF." icon="image">
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_2fr]">
          <button type="button" onClick={startCamera} className="flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">Open camera</button>
          <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Upload photo<input type="file" accept="image/*" className="sr-only" onChange={(event) => { loadTransportBillPhoto(event.target.files?.[0]); event.target.value = ""; }}/></label>
          {transportBillPhoto ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><img src={transportBillPhoto.dataUrl} alt="Transport bill preview" className="max-h-52 w-full rounded-lg object-contain"/><div className="mt-2 flex items-center justify-between gap-3"><p className="truncate text-xs text-slate-500">{transportBillPhoto.name}</p><button type="button" className="text-xs font-semibold text-red-600" onClick={() => setTransportBillPhoto(null)}>Remove</button></div></div> : <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">No transport bill photo attached</div>}
        </div>
        {cameraError && !cameraOpen ? <p className="px-5 pb-5 text-sm font-semibold text-red-600">{cameraError}</p> : null}
      </SectionCard>
      {cameraOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label="Transport bill camera">
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h3 className="font-bold text-slate-950">Take transport bill photo</h3><p className="text-sm text-slate-500">Place the full receipt inside the camera frame.</p></div><button type="button" onClick={stopCamera} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Close</button></div>
          <div className="bg-black p-3"><video ref={videoRef} autoPlay muted playsInline className="mx-auto max-h-[65vh] w-full rounded-lg bg-black object-contain"/></div>
          {cameraError ? <p className="px-5 pt-4 text-sm font-semibold text-red-600">{cameraError}</p> : null}
          <div className="flex flex-wrap justify-end gap-3 p-5"><Button variant="secondary" onClick={stopCamera}>Cancel</Button><Button onClick={captureTransportBillPhoto} disabled={cameraStarting}>{cameraStarting ? "Starting camera…" : "Capture photo"}</Button></div>
        </div>
      </div> : null}
      <SectionCard title={`${selected.fulfillment.name} · Percentage Products`} subtitle="Percentage discount applies only to this section." icon="box">
        {percentageItems.length ? renderProductRows(percentageItems) : <p className="p-5 text-sm text-slate-500">No delivered percentage products in this warehouse DN.</p>}
        <div className="grid gap-3 border-t p-5 md:grid-cols-3"><label className="text-xs font-semibold">Discount percentage<input type="number" min="0" max="100" step="0.01" disabled={!percentageItems.length} className={`mt-1 ${inputClass}`} value={discountValue} onChange={e=>setDiscountValue(Math.min(100, Math.max(0, Number(e.target.value))))}/><span className="mt-1 block font-normal text-slate-500">Applied only to Percentage products.</span></label><div className="rounded-xl bg-slate-50 p-3"><p>Percentage subtotal: <b>{formatNumber(percentageProductSubtotal)}</b></p><p>Discount: <b>{formatNumber(discount)}</b></p></div><div className="rounded-xl bg-indigo-50 p-3"><p className="text-lg">Percentage total: <b>{formatNumber(Math.max(0, percentageProductSubtotal-discount))}</b></p></div></div>
      </SectionCard>
      <SectionCard title={`${selected.fulfillment.name} · Non-Commission Products`} subtitle="No discount. Company increase can be selected separately for each product." icon="box">
        {nonCommissionItems.length ? renderProductRows(nonCommissionItems) : <p className="p-5 text-sm text-slate-500">No delivered non-commission products in this warehouse DN.</p>}
        <div className="grid gap-3 border-t p-5 md:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><p>Non-commission product lines: <b>{nonCommissionItems.length}</b></p><p className="text-sm text-slate-500">Discount is not allowed.</p></div><div className="rounded-xl bg-indigo-50 p-3"><p className="text-lg">Non-commission total: <b>{formatNumber(nonCommissionSubtotal)}</b></p></div></div>
      </SectionCard>
      <SectionCard title="Combined warehouse bill total" subtitle="Both sections are included in one PDF and one Excel export." icon="ledger">
        <div className="grid gap-3 p-5 md:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Percentage subtotal</p><p className="text-lg font-bold">{formatNumber(percentageProductSubtotal)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Non-commission subtotal</p><p className="text-lg font-bold">{formatNumber(nonCommissionSubtotal)}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Percentage discount</p><p className="text-lg font-bold text-amber-900">-{formatNumber(discount)}</p></div><div className="rounded-xl bg-indigo-600 p-3 text-white"><p className="text-xs text-indigo-100">Combined final total</p><p className="text-xl font-black">{formatNumber(finalTotal)}</p></div></div>
      </SectionCard>
      <div className="flex flex-wrap gap-3">
        <Button onClick={shareBill} disabled={!items.length}>Share PDF on WhatsApp</Button>
        <Button variant="secondary" onClick={downloadPdf} disabled={!items.length}>Download protected PDF</Button>
        <Button variant="secondary" onClick={exportExcel} disabled={!items.length}>Export internal Excel</Button>
        <Button variant="secondary" onClick={emailDealer} disabled={!items.length || !selected.order.created_by_email}>Email {selected.order.created_by_name || "dealer"}</Button>
      </div>
      <p className="text-xs text-slate-500">The dealer copy is a protected, static PDF. On supported phones, the share button attaches it directly. On desktop, it downloads the PDF and opens WhatsApp Web; attach the downloaded PDF to the dealer chat. Dealer email: {selected.order.created_by_email || "No email is saved for the order creator."}</p>
    </> : null}
  </div>;
}
