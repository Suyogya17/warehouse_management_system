import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";
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
const toLocalDateValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const discountStorageKey = (dealerId, customerName) => {
  const normalizedName = String(customerName || "").trim().replace(/\s+/g, " ").toLowerCase();
  return dealerId && normalizedName ? `warehouse-billing-discount:${dealerId}:${normalizedName}` : "";
};
const rememberedDiscount = (dealerId, customerName) => {
  const key = discountStorageKey(dealerId, customerName);
  const value = key ? Number(window.localStorage.getItem(key)) : 0;
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

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
  const [loading, setLoading] = useState(true);
  const [billFilters, setBillFilters] = useState({ search: "", date: "", warehouse: "", dealer: "", status: "unbilled" });

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

  const warehouseOptions = useMemo(() => [...new Set(choices.map(({ fulfillment }) => fulfillment.name).filter(Boolean))].sort(), [choices]);
  const dealerOptions = useMemo(() => [...new Set(choices.map(({ order }) => order.created_by_name).filter(Boolean))].sort(), [choices]);
  const filteredChoices = useMemo(() => {
    const search = billFilters.search.trim().toLowerCase();
    return choices.filter(({ order, fulfillment, key }) => {
      if (key === selection) return true;
      const deliveredDate = toLocalDateValue(fulfillment.delivered_at);
      const billed = Number(fulfillment.billing_count || 0) > 0;
      if (billFilters.date && deliveredDate !== billFilters.date) return false;
      if (billFilters.warehouse && fulfillment.name !== billFilters.warehouse) return false;
      if (billFilters.dealer && order.created_by_name !== billFilters.dealer) return false;
      if (billFilters.status === "unbilled" && billed) return false;
      if (billFilters.status === "billed" && !billed) return false;
      if (search) {
        const searchable = [order.id, order.created_by_name, order.created_by_email, order.customer_name, order.customer_phone, fulfillment.warehouse_slip_number, fulfillment.delivery_note_number, fulfillment.name].join(" ").toLowerCase();
        if (!searchable.includes(search)) return false;
      }
      return true;
    });
  }, [billFilters, choices, selection]);
  const billedCount = choices.filter(({ fulfillment }) => Number(fulfillment.billing_count || 0) > 0).length;
  const resetBillFilters = () => setBillFilters({ search: "", date: "", warehouse: "", dealer: "", status: "unbilled" });

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
          rate: Number(item.unit_price_snapshot ?? 0),
        }))
    );
  }, [selected]);
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
    setShipping({
      invoice_number: "",
      bilty_number: "",
      transport_name: choice?.order.transport_name || "",
    });
    setTransportBillPhoto(null);
    setDiscountValue(rememberedDiscount(choice?.order.created_by, choice?.order.customer_name));
  };

  useEffect(() => {
    if (selection || !choices.length) return;
    const orderId = searchParams.get("order_id");
    const warehouseId = searchParams.get("warehouse_id");
    const requested = `${orderId}:${warehouseId}`;
    if (choices.some((choice) => choice.key === requested)) chooseBill(requested);
  }, [choices, searchParams, selection]);

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const percentageProductSubtotal = items.reduce(
    (sum, item) => sum + (item.is_commission ? item.quantity * item.rate : 0),
    0
  );
  const nonCommissionSubtotal = nonCommissionItems.reduce(
    (sum, item) => sum + item.quantity * item.rate,
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
    const deliveredDate = selected.fulfillment.delivered_at ? new Date(selected.fulfillment.delivered_at) : new Date();
    const rows = [
      ["WAREHOUSE SALES BILL - PERCENTAGE AND NON-COMMISSION"],
      ["Bill Number", billNumber, "Delivery Date", deliveredDate],
      ["Invoice Number", shipping.invoice_number, "Bilty Number", shipping.bilty_number],
      ["Order", selected.order.id, "Warehouse", selected.fulfillment.name],
      ["Dealer", selected.order.created_by_name || "", "Dealer Email", selected.order.created_by_email || ""],
      ["Dealer Customer", customer.name, "Customer Phone", customer.phone],
      ["Customer Address", customer.address, "Customer PAN", customer.pan],
      ["Transport Name", shipping.transport_name, "Transport Bill Photo", transportBillPhoto?.name || "Not attached"],
      ["Remarks", customer.remarks],
      [],
      ["S.No", "FG.ID", "Particulars", "Product Type", "Qty", "Unit", "Rate", "Amount"],
      ...items.map((item, index) => [index + 1, item.finished_good_id, `${item.product_name}${item.size ? ` · ${item.size}` : ""}`, item.is_commission ? "Percentage" : "Non commission", item.quantity, item.unit, item.rate, null]),
      [],
      ["", "", "", "", "Total Qty", null, "Subtotal", null],
      ["", "", "", "", "", "", "Percentage products", null],
      ["", "", "", "", "", "", "Discount %", normalizedDiscountPercent],
      ["", "", "", "", "", "", "Discount amount", null],
      ["", "", "", "", "", "", "Final total", null],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const firstItemRow = 12;
    const lastItemRow = firstItemRow + items.length - 1;
    items.forEach((_, index) => {
      const row = firstItemRow + index;
      sheet[`H${row}`] = { t: "n", f: `E${row}*G${row}` };
    });
    const summaryRow = lastItemRow + 2;
    sheet[`F${summaryRow}`] = { t: "n", f: `SUM(E${firstItemRow}:E${lastItemRow})` };
    sheet[`H${summaryRow}`] = { t: "n", f: `SUM(H${firstItemRow}:H${lastItemRow})` };
    sheet[`H${summaryRow + 1}`] = { t: "n", f: `SUMIF(D${firstItemRow}:D${lastItemRow},"Percentage",H${firstItemRow}:H${lastItemRow})` };
    sheet[`H${summaryRow + 3}`] = { t: "n", f: `H${summaryRow + 1}*H${summaryRow + 2}/100` };
    sheet[`H${summaryRow + 4}`] = { t: "n", f: `MAX(0,H${summaryRow}-H${summaryRow + 3})` };
    sheet["!cols"] = [{ wch: 7 }, { wch: 10 }, { wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, { s: { r: 8, c: 1 }, e: { r: 8, c: 7 } }];
    sheet["!rows"] = [{ hpt: 30 }, { hpt: 22 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 28 }, { hpt: 8 }, { hpt: 28 }];
    sheet["!freeze"] = { xSplit: 0, ySplit: 11 };
    sheet["!autofilter"] = { ref: `A11:H${lastItemRow}` };
    sheet["!margins"] = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 };
    sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 1, paperSize: 9 };
    const borderSide = { style: "thin", color: { rgb: "D7DEE8" } };
    const border = { top: borderSide, bottom: borderSide, left: borderSide, right: borderSide };
    const styleRange = (range, style) => {
      const decoded = XLSX.utils.decode_range(range);
      for (let rowIndex = decoded.s.r; rowIndex <= decoded.e.r; rowIndex += 1) {
        for (let columnIndex = decoded.s.c; columnIndex <= decoded.e.c; columnIndex += 1) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          if (!sheet[address]) sheet[address] = { t: "s", v: "" };
          sheet[address].s = { ...(sheet[address].s || {}), ...style };
        }
      }
    };
    styleRange("A1:H1", { fill: { fgColor: { rgb: "312E81" } }, font: { name: "Arial", sz: 16, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } });
    styleRange("A2:H9", { font: { name: "Arial", sz: 10, color: { rgb: "172033" } }, alignment: { vertical: "center", wrapText: true } });
    ["A2", "C2", "A3", "C3", "A4", "C4", "A5", "C5", "A6", "C6", "A7", "C7", "A8", "C8", "A9"].forEach((address) => {
      if (sheet[address]) sheet[address].s = { ...(sheet[address].s || {}), font: { name: "Arial", sz: 10, bold: true, color: { rgb: "475569" } } };
    });
    styleRange("A11:H11", { fill: { fgColor: { rgb: "4338CA" } }, font: { name: "Arial", sz: 10, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border });
    styleRange(`A${firstItemRow}:H${lastItemRow}`, { font: { name: "Arial", sz: 10, color: { rgb: "172033" } }, alignment: { vertical: "center" }, border });
    styleRange(`E${summaryRow}:H${summaryRow + 4}`, { fill: { fgColor: { rgb: "EEF2FF" } }, font: { name: "Arial", sz: 10, bold: true, color: { rgb: "1E1B4B" } }, border });
    sheet["D2"].z = "dd-mmm-yyyy";
    for (let row = firstItemRow; row <= lastItemRow; row += 1) {
      sheet[`E${row}`].z = "#,##0";
      sheet[`G${row}`].z = "#,##0.00";
      sheet[`H${row}`].z = "#,##0.00";
    }
    sheet[`H${summaryRow}`].z = "#,##0.00";
    sheet[`H${summaryRow + 1}`].z = "#,##0.00";
    sheet[`H${summaryRow + 2}`].z = "0.00";
    sheet[`H${summaryRow + 3}`].z = "#,##0.00";
    sheet[`H${summaryRow + 4}`].z = "#,##0.00";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Warehouse Bill");
    return { workbook, billNumber };
  };

  const recordBillCreation = async (outputType) => {
    const previousCount = Number(selected?.fulfillment?.billing_count || 0);
    if (previousCount > 0 && !window.confirm(`WARNING: A bill has already been created ${previousCount} time${previousCount === 1 ? "" : "s"} for this warehouse DN.\n\nContinue only if you are correcting a human error.`)) return false;
    const storageKey = discountStorageKey(selected.order.created_by, customer.name);
    if (storageKey) window.localStorage.setItem(storageKey, String(normalizedDiscountPercent));
    api.logWarehouseBilling(selected.order.id, { warehouse_id:selected.fulfillment.warehouse_id, delivery_note_number:selected.fulfillment.warehouse_slip_number || selected.fulfillment.delivery_note_number, output_type:outputType, invoice_number:shipping.invoice_number, final_total:finalTotal, confirm_rebill:previousCount>0 }, token)
      .then(() => { selected.fulfillment.billing_count = previousCount + 1; })
      .catch((error) => window.alert(`The file was created, but billing history could not be saved: ${error?.message || "Unknown error"}`));
    return true;
  };

  const exportExcel = async () => {
    const built = buildWorkbook();
    if (!built) return;
    if (!await recordBillCreation("EXCEL")) return;
    XLSX.writeFile(built.workbook, `${built.billNumber}-bill.xlsx`, { cellStyles: true });
  };

  const buildPdf = async () => {
    if (!selected || !items.length) return null;
    const baseBillNumber = selected.fulfillment.warehouse_slip_number || selected.fulfillment.delivery_note_number || `ORDER-${selected.order.id}`;
    const billNumber = baseBillNumber;
    const deliveredDate = selected.fulfillment.delivered_at ? new Date(selected.fulfillment.delivered_at) : new Date();
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
    document.text("SALES BILL", 105, 15, { align: "center" });
    document.setFontSize(10);
    document.text(`${billNumber} | Order #${selected.order.id} | ${selected.fulfillment.name}`, 105, 22, { align: "center" });
    document.setDrawColor(203, 213, 225);
    document.line(14, 32, 196, 32);
    autoTable(document, {
      startY: 36,
      body: [
        ["Dealer", selected.order.created_by_name || "-", "Dealer email", selected.order.created_by_email || "-"],
        ["Dealer customer", customer.name || "-", "Customer phone", customer.phone || "-"],
        ["Customer address", customer.address || "-", "Customer PAN", customer.pan || "-"],
        ["Invoice number", shipping.invoice_number || "-", "Bilty number", shipping.bilty_number || "-"],
        ["Transport", shipping.transport_name || "-", "Transport bill photo", transportBillPhoto ? "Attached" : "Not attached"],
        ["Warehouse", selected.fulfillment.name || "-", "Delivery date", deliveredDate.toLocaleDateString()],
        ["Remarks", customer.remarks || "-", "", ""],
      ],
      theme: "plain",
      margin: { left: 14, right: 14 },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.4, overflow: "linebreak", valign: "top" },
      columnStyles: {
        0: { cellWidth: 27, fontStyle: "bold", textColor: [71, 85, 105] },
        1: { cellWidth: 61 },
        2: { cellWidth: 31, fontStyle: "bold", textColor: [71, 85, 105] },
        3: { cellWidth: 63 },
      },
    });

    const addProductSection = (title, productItems, startY, fillColor) => {
      if (!productItems.length) return startY;
      if (startY > 265) {
        document.addPage();
        startY = 20;
      }
      document.setFont("helvetica", "bold");
      document.setFontSize(10);
      document.setTextColor(...fillColor);
      document.text(title, 14, startY);
      document.setTextColor(15, 23, 42);
      autoTable(document, {
        startY: startY + 3,
        head: [["S.No", "FG.ID", "Particulars", "Qty", "Rate", "Amount"]],
        body: productItems.map((item, index) => [
          index + 1,
          item.finished_good_id,
          `${item.product_name}${item.size ? ` - ${item.size}` : ""}`,
          formatNumber(item.quantity),
          Number(item.rate).toFixed(2),
          (item.quantity * item.rate).toFixed(2),
        ]),
        theme: "grid",
        margin: { left: 14, right: 14 },
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2.2, textColor: [15, 23, 42] },
        headStyles: { fillColor, textColor: 255, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 17 },
          2: { cellWidth: 83 },
          3: { cellWidth: 20, halign: "right" },
          4: { cellWidth: 24, halign: "right" },
          5: { cellWidth: 26, halign: "right" },
        },
      });
      return document.lastAutoTable.finalY + 8;
    };

    let nextSectionY = document.lastAutoTable.finalY + 8;
    nextSectionY = addProductSection("PERCENTAGE PRODUCTS", percentageItems, nextSectionY, [49, 46, 129]);
    addProductSection("NON-COMMISSION PRODUCTS", nonCommissionItems, nextSectionY, [71, 85, 105]);
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
    try {
      const built = await buildPdf();
      if (!built || !await recordBillCreation("PDF")) return;
      const url = URL.createObjectURL(built.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${built.billNumber}-bill.pdf`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(`The PDF could not be downloaded: ${error?.message || "Unknown error"}`);
    }
  };

  const shareBill = async () => {
    const built = await buildPdf();
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
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50"><tr>{["FG.ID","Product","Type","Qty","Unit","Rate","Amount"].map(h=><th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr></thead><tbody>{productItems.map(item=><tr key={item.key} className="border-t"><td className="px-4 py-3">{item.finished_good_id}</td><td className="px-4 py-3 font-medium">{item.product_name}</td><td className="px-4 py-3"><span className={item.is_commission ? "font-semibold text-indigo-700" : "text-slate-500"}>{item.is_commission ? "Percentage" : "Non commission"}</span></td><td className="px-4 py-3">{formatNumber(item.quantity)}</td><td className="px-4 py-3">{item.unit}</td><td className="px-4 py-3 font-semibold">{formatNumber(item.rate)}</td><td className="px-4 py-3 font-semibold">{formatNumber(item.quantity*item.rate)}</td></tr>)}</tbody></table></div>
  );

  return <div className="space-y-5">
    <PageHeader eyebrow="Sales" title="Sales Billing" description="Create one bill from each warehouse DN. Billing does not change stock." icon="ledger" />
    <SectionCard title="Find a delivered warehouse DN" subtitle="Start with ready-to-bill deliveries, or use the filters to find an older bill." icon="orders">
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivered DNs</p><p className="mt-1 text-2xl font-black text-slate-950">{formatNumber(choices.length)}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Ready to bill</p><p className="mt-1 text-2xl font-black text-emerald-900">{formatNumber(choices.length - billedCount)}</p></div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Already billed</p><p className="mt-1 text-2xl font-black text-indigo-950">{formatNumber(billedCount)}</p></div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-slate-600 xl:col-span-2">Search order, customer, phone or DN<input type="search" className={`mt-1 ${inputClass}`} value={billFilters.search} placeholder="Example: DN-2871 or Pramod" onChange={(event) => setBillFilters((current) => ({ ...current, search: event.target.value }))} /></label>
        <label className="text-xs font-semibold text-slate-600">Delivery date<input type="date" className={`mt-1 ${inputClass}`} value={billFilters.date} onChange={(event) => setBillFilters((current) => ({ ...current, date: event.target.value }))} /></label>
        <label className="text-xs font-semibold text-slate-600">Warehouse<select className={`mt-1 ${inputClass}`} value={billFilters.warehouse} onChange={(event) => setBillFilters((current) => ({ ...current, warehouse: event.target.value }))}><option value="">All warehouses</option>{warehouseOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Dealer<select className={`mt-1 ${inputClass}`} value={billFilters.dealer} onChange={(event) => setBillFilters((current) => ({ ...current, dealer: event.target.value }))}><option value="">All dealers</option>{dealerOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Billing status<select className={`mt-1 ${inputClass}`} value={billFilters.status} onChange={(event) => setBillFilters((current) => ({ ...current, status: event.target.value }))}><option value="unbilled">Ready to bill</option><option value="billed">Already billed</option><option value="all">All delivered DNs</option></select></label>
        <div className="flex items-end"><Button variant="secondary" onClick={resetBillFilters}>Clear filters</Button></div>
        <div className="flex items-end text-sm text-slate-500 md:col-span-2 xl:col-span-3">Showing <strong className="mx-1 text-slate-900">{filteredChoices.length}</strong> matching DN{filteredChoices.length === 1 ? "" : "s"}</div>
      </div>
      <div className="border-t border-slate-200 p-5"><label className="text-xs font-semibold text-slate-600">Delivered warehouse DN<select className={`mt-1 ${inputClass}`} value={selection} onChange={(event) => chooseBill(event.target.value)} disabled={loading}>
        <option value="">{loading ? "Loading delivered DNs…" : filteredChoices.length ? "Choose a matching warehouse DN" : "No delivered DNs match these filters"}</option>
        {filteredChoices.map(({ key, order, fulfillment }) => <option key={key} value={key}>{Number(fulfillment.billing_count || 0) > 0 ? "BILLED" : "READY"} · {toLocalDateValue(fulfillment.delivered_at) || "No date"} · {fulfillment.warehouse_slip_number || fulfillment.delivery_note_number || "No DN"} · {fulfillment.name} · Order #{order.id} · {order.created_by_name || "Unknown dealer"} · {order.customer_name || "Unknown customer"} · {formatNumber(fulfillment.delivered_pairs)} pairs</option>)}
      </select></label></div>
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
      <SectionCard title={`${selected.fulfillment.name} · Non-Commission Products`} subtitle="No discount. Rate is the price shown to the user when the order was placed." icon="box">
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
