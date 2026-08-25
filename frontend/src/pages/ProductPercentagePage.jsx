import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/Button";
import DataTable from "../components/DataTable";
import MultiSeriesFilter from "../components/MultiSeriesFilter";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { announceDataRefresh } from "../hooks/useDataRefresh";
import { api } from "../services/api";
import { getRoundedCartons } from "../utils/displayStock";
import { formatDate, formatNumber } from "../utils/format";
import {
  OFFER_PERCENTAGES_BY_EMAIL,
  getCartonAllocations,
  getPercentageAllocations,
} from "./offers/offerUtils";

const PAGE_SIZE = 18;
const formatPercentage = (value) =>
  formatNumber(Math.round(Number(value || 0) * 100) / 100);

export default function ProductPercentagePage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [allocationHistory, setAllocationHistory] = useState([]);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [historyMigration, setHistoryMigration] = useState("");
  const [legacyHistoryCount, setLegacyHistoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [seriesFilters, setSeriesFilters] = useState([]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [percentages, setPercentages] = useState({});
  const [cartonQuantities, setCartonQuantities] = useState({});
  const [pairQuantities, setPairQuantities] = useState({});
  const [divisionMode, setDivisionMode] = useState("PERCENTAGE");
  const [allocationScope, setAllocationScope] = useState("CONTROLLED");
  const [publicPairQuantity, setPublicPairQuantity] = useState(0);
  const [publicUsedQuantity, setPublicUsedQuantity] = useState(0);
  const [controlledUsedByUser, setControlledUsedByUser] = useState({});
  const [transferEditor, setTransferEditor] = useState(null);
  const [transferCartons, setTransferCartons] = useState({});
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        productResult,
        availabilityResult,
        userResult,
        allocationResult,
        historyResult,
      ] = await Promise.all([
        api.getFinishedGoods(token),
        api.getAvailability(token, { includeHidden: true }),
        api.getUsers(token),
        api.getProductPercentageAllocations(token),
        api.getProductPercentageAllocationHistory(token),
      ]);
      const availabilityById = new Map(
        (availabilityResult.data || []).map((product) => [
          Number(product.id),
          product,
        ])
      );
      setProducts(
        (productResult.data || []).map((product) => ({
          ...product,
          available_qty:
            availabilityById.get(Number(product.id))?.available_qty ??
            product.quantity,
          reserved_qty:
            availabilityById.get(Number(product.id))?.reserved_qty ?? 0,
        }))
      );
      setUsers(
        (userResult.data || []).filter(
          (user) => String(user.role || "").toUpperCase() === "USER"
        )
      );
      setAllocations(allocationResult.data || []);
      setAllocationHistory(historyResult.data || []);
      setHistoryAvailable(historyResult.history_available !== false);
      setHistoryMigration(historyResult.migration_required || "");
      setLegacyHistoryCount(Number(historyResult.legacy_count || 0));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load().catch((error) =>
      showToast({
        tone: "error",
        title: "Could not load percentage allocations",
        message: error.data?.message || error.message,
      })
    );
  }, [load, showToast]);

  const allocationsByProduct = useMemo(() => {
    const grouped = new Map();
    allocations.forEach((allocation) => {
      const productId = Number(allocation.finished_good_id);
      if (!grouped.has(productId)) grouped.set(productId, []);
      grouped.get(productId).push(allocation);
    });
    return grouped;
  }, [allocations]);

  const filteredProducts = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((product) => {
      const hasAllocation = (
        allocationsByProduct.get(Number(product.id)) || []
      ).length > 0;
      if (allocationFilter === "allocated" && !hasAllocation) return false;
      if (allocationFilter === "unallocated" && hasAllocation) return false;
      if (
        seriesFilters.length &&
        !seriesFilters.includes(String(product.sole_code || "").trim())
      ) {
        return false;
      }
      if (!terms.length) return true;
      const text = [
        product.id,
        product.name,
        product.article_code,
        product.sole_code,
        product.color,
        product.size,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [
    allocationFilter,
    allocationsByProduct,
    products,
    search,
    seriesFilters,
  ]);

  const seriesOptions = useMemo(
    () =>
      [
        ...new Set(
          products
            .map((product) => String(product.sole_code || "").trim())
            .filter(Boolean)
        ),
      ].sort((left, right) =>
        left.localeCompare(right, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      ),
    [products]
  );

  const allocationCounts = useMemo(() => {
    const allocated = products.filter(
      (product) =>
        (allocationsByProduct.get(Number(product.id)) || []).length > 0
    ).length;
    return {
      all: products.length,
      allocated,
      unallocated: Math.max(0, products.length - allocated),
    };
  }, [allocationsByProduct, products]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pageProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [allocationFilter, search, seriesFilters]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const openEditor = (product) => {
    const saved = allocationsByProduct.get(Number(product.id)) || [];
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    const savedScope = String(
      saved[0]?.allocation_scope || "CONTROLLED"
    ).toUpperCase();
    setEditing(product);
    setDivisionMode(savedScope === "CONTROLLED" ? "PAIRS" : "PERCENTAGE");
    setAllocationScope(savedScope);
    setPublicPairQuantity(Number(saved[0]?.public_quantity || 0));
    setPublicUsedQuantity(Number(saved[0]?.public_used_quantity || 0));
    setControlledUsedByUser(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          Number(target.ordered_quantity || 0),
        ])
      )
    );
    setSelectedUserIds(saved.map((target) => Number(target.user_id)));
    setPercentages(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          String(target.allocation_percentage),
        ])
      )
    );
    setCartonQuantities(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          pairsPerCarton > 0
            ? Math.floor(Number(target.allocation_quantity || 0) / pairsPerCarton)
            : 0,
        ])
      )
    );
    setPairQuantities(
      Object.fromEntries(
        saved.map((target) => [
          Number(target.user_id),
          Number(target.allocation_quantity || 0),
        ])
      )
    );
  };

  const percentageTargets = selectedUserIds.map((userId) => ({
    user_id: Number(userId),
    percentage: percentages[userId],
  }));
  const cartonTargets = selectedUserIds.map((userId) => ({
    user_id: Number(userId),
    cartons: cartonQuantities[userId],
  }));
  const pairTargets = selectedUserIds.map((userId) => ({
    user_id: Number(userId),
    pairs: pairQuantities[userId],
  }));
  const editorAvailablePairs = Number(
    editing?.available_qty ?? editing?.quantity ?? 0
  );
  const controlledUsedPairs = Object.values(controlledUsedByUser).reduce(
    (sum, quantity) => sum + Number(quantity || 0),
    Number(publicUsedQuantity || 0)
  );
  // A controlled allocation stores each user's lifetime allowance. Available
  // stock excludes pending orders and delivered stock, so add the recorded
  // controlled usage back when converting exact CTN/pairs to percentages.
  const editorAllocationBasePairs =
    allocationScope === "CONTROLLED"
      ? editorAvailablePairs + controlledUsedPairs
      : editorAvailablePairs;
  const calculatedAllocations = useMemo(
    () => {
      if (divisionMode === "CTN") {
        if (allocationScope === "CONTROLLED") {
          const pairsPerCarton = Number(
            editing?.inner_boxes_per_outer_box || 0
          );
          return new Map(
            cartonTargets
              .filter(
                (target) =>
                  Number(target.cartons) > 0 && pairsPerCarton > 0
              )
              .map((target) => {
                const cartons = Number(target.cartons);
                const pairs = Math.floor(cartons * pairsPerCarton);
                return [
                  Number(target.user_id),
                  {
                    user_id: Number(target.user_id),
                    cartons,
                    pairs,
                    percentage:
                      editorAllocationBasePairs > 0
                        ? (pairs / editorAllocationBasePairs) * 100
                        : 0,
                  },
                ];
              })
          );
        }
        return getCartonAllocations(editing, cartonTargets);
      }
      if (divisionMode === "PAIRS") {
        const pairsPerCarton = Number(
          editing?.inner_boxes_per_outer_box || 0
        );
        return new Map(
          pairTargets
            .filter((target) => Number(target.pairs) > 0)
            .map((target) => {
              const pairs = Math.floor(Number(target.pairs));
              return [
                Number(target.user_id),
                {
                  user_id: Number(target.user_id),
                  pairs,
                  cartons: pairsPerCarton > 0 ? pairs / pairsPerCarton : 0,
                  percentage:
                    editorAllocationBasePairs > 0
                      ? (pairs / editorAllocationBasePairs) * 100
                      : 0,
                },
              ];
            })
        );
      }
      return getPercentageAllocations(
        allocationScope === "CONTROLLED"
          ? { ...editing, available_qty: editorAllocationBasePairs }
          : editing,
        percentageTargets
      );
    },
    [
      allocationScope,
      cartonTargets,
      divisionMode,
      editing,
      editorAllocationBasePairs,
      pairTargets,
      percentageTargets,
    ]
  );
  const percentageTotal = [...calculatedAllocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.percentage || 0),
    0
  );
  const assignedCartons = [...calculatedAllocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.cartons || 0),
    0
  );
  const assignedPairs = [...calculatedAllocations.values()].reduce(
    (sum, allocation) => sum + Number(allocation.pairs || 0),
    0
  );
  const editorTotalPairs = editorAvailablePairs;
  const editorTotalCartons = getRoundedCartons(
    editorAllocationBasePairs,
    editing?.inner_boxes_per_outer_box
  );
  const unassignedPairs = Math.max(
    0,
    editorAllocationBasePairs - assignedPairs
  );
  const editorPairsPerCarton = Number(
    editing?.inner_boxes_per_outer_box || 0
  );
  const unassignedCartons =
    editorPairsPerCarton > 0 ? unassignedPairs / editorPairsPerCarton : 0;
  const hasInvalidAllocation = selectedUserIds.some(
    (userId) =>
      Number(calculatedAllocations.get(Number(userId))?.cartons || 0) <= 0
  );
  const controlledPersonalRemainingPairs = [...calculatedAllocations.entries()].reduce(
    (sum, [userId, allocation]) =>
      sum +
      Math.max(
        0,
        Number(allocation.pairs || 0) -
          Number(controlledUsedByUser[Number(userId)] || 0)
      ),
    0
  );
  const controlledPublicRemainingPairs = Math.max(
    0,
    Number(publicPairQuantity || 0) - Number(publicUsedQuantity || 0)
  );
  const controlledReleasedRemainingPairs =
    controlledPersonalRemainingPairs + controlledPublicRemainingPairs;
  const allocationBelowUsed =
    allocationScope === "CONTROLLED" &&
    [...calculatedAllocations.entries()].some(
      ([userId, allocation]) =>
        Number(allocation.pairs || 0) <
        Number(controlledUsedByUser[Number(userId)] || 0)
    );
  const allocationExceedsStock =
    allocationScope === "CONTROLLED"
      ? controlledReleasedRemainingPairs > editorTotalPairs
      : assignedPairs > editorTotalPairs;

  const changeDivisionMode = (nextMode) => {
    if (nextMode === divisionMode) return;
    if (nextMode === "CTN") {
      setCartonQuantities(
        Object.fromEntries(
          selectedUserIds.map((userId) => [
            Number(userId),
            Number(
              calculatedAllocations.get(Number(userId))?.cartons || 0
            ),
          ])
        )
      );
    } else if (nextMode === "PAIRS") {
      setPairQuantities(
        Object.fromEntries(
          selectedUserIds.map((userId) => [
            Number(userId),
            Number(calculatedAllocations.get(Number(userId))?.pairs || 0),
          ])
        )
      );
    } else {
      setPercentages(
        Object.fromEntries(
          selectedUserIds.map((userId) => [
            Number(userId),
            Number(
              calculatedAllocations.get(Number(userId))?.percentage || 0
            ).toFixed(2),
          ])
        )
      );
    }
    setDivisionMode(nextMode);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editing) return;
    const targets = selectedUserIds.map((userId) => {
      const allocation = calculatedAllocations.get(Number(userId));
      return {
        user_id: Number(userId),
        allocation_percentage:
          divisionMode === "PERCENTAGE"
            ? Number(percentages[userId])
            : Number(allocation?.percentage || 0),
        allocation_quantity: Number(allocation?.pairs || 0),
      };
    });
    try {
      setSaving(true);
      await api.saveProductPercentageAllocations(
        editing.id,
        targets,
        token,
        allocationScope,
        allocationScope === "CONTROLLED"
          ? Number(publicPairQuantity || 0)
          : 0
      );
      showToast({
        tone: "success",
        title: "Product quantity separated",
        message: `${editing.article_code || editing.name} was allocated to ${targets.length} users.`,
      });
      setEditing(null);
      await load();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not save percentages",
        message: error.data?.message || error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const removeAllocation = async (product) => {
    if (!window.confirm(`Remove percentage allocation from ${product.article_code || product.name}?`)) {
      return;
    }
    try {
      await api.saveProductPercentageAllocations(product.id, [], token);
      await load();
      announceDataRefresh("finished-goods");
      showToast({
        tone: "success",
        title: "Allocation removed",
        message: "The product now follows its normal user permissions.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not remove allocation",
        message: error.data?.message || error.message,
      });
    }
  };

  const openTransferEditor = (product, source, productTargets) => {
    const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
    if (pairsPerCarton <= 0) {
      showToast({
        tone: "error",
        title: "CTN size missing",
        message: "Set this product's pairs per CTN before transferring its balance.",
      });
      return;
    }
    setTransferEditor({ product, source, targets: productTargets });
    setTransferCartons({});
    setTransferReason("");
  };

  const closeTransferEditor = () => {
    if (transferring) return;
    setTransferEditor(null);
    setTransferCartons({});
    setTransferReason("");
  };

  const submitTransfer = async (event) => {
    event.preventDefault();
    if (!transferEditor) return;
    const pairsPerCarton = Number(
      transferEditor.product.inner_boxes_per_outer_box || 0
    );
    const transfers = Object.entries(transferCartons)
      .map(([userId, cartons]) => ({
        user_id: Number(userId),
        quantity: Math.floor(Number(cartons || 0)) * pairsPerCarton,
      }))
      .filter((transfer) => transfer.quantity > 0);
    const totalPairs = transfers.reduce(
      (sum, transfer) => sum + transfer.quantity,
      0
    );
    const availablePairs = Number(
      transferEditor.source.remaining_quantity || 0
    );

    if (!transfers.length) {
      showToast({
        tone: "error",
        title: "No quantity selected",
        message: "Enter the CTN to transfer to at least one destination dealer.",
      });
      return;
    }
    if (totalPairs > availablePairs) {
      showToast({
        tone: "error",
        title: "Transfer exceeds balance",
        message: `Only ${formatNumber(Math.floor(availablePairs / pairsPerCarton))} full CTN are unused and transferable.`,
      });
      return;
    }
    if (!transferReason.trim()) {
      showToast({
        tone: "error",
        title: "Reason required",
        message: "Enter why this allocation is being transferred.",
      });
      return;
    }

    try {
      setTransferring(true);
      const result = await api.transferProductPercentageBalance(
        transferEditor.product.id,
        {
          source_user_id: Number(transferEditor.source.user_id),
          transfers,
          reason: transferReason.trim(),
        },
        token
      );
      showToast({
        tone: "success",
        title: "Balance transferred",
        message: result.message || "The unused dealer balance was transferred.",
      });
      setTransferEditor(null);
      setTransferCartons({});
      setTransferReason("");
      await load();
      announceDataRefresh("finished-goods");
    } catch (error) {
      showToast({
        tone: "error",
        title: "Could not transfer balance",
        message: error.data?.message || error.message,
      });
    } finally {
      setTransferring(false);
    }
  };

  const transferPairsPerCarton = Number(
    transferEditor?.product?.inner_boxes_per_outer_box || 0
  );
  const transferAvailablePairs = Number(
    transferEditor?.source?.remaining_quantity || 0
  );
  const transferAvailableCartons =
    transferPairsPerCarton > 0
      ? Math.floor(transferAvailablePairs / transferPairsPerCarton)
      : 0;
  const transferLoosePairs =
    transferPairsPerCarton > 0
      ? transferAvailablePairs % transferPairsPerCarton
      : transferAvailablePairs;
  const transferTotalCartons = Object.values(transferCartons).reduce(
    (sum, cartons) => sum + Math.max(0, Math.floor(Number(cartons || 0))),
    0
  );
  const transferTargetByUser = new Map(
    (transferEditor?.targets || []).map((target) => [
      Number(target.user_id),
      target,
    ])
  );

  const exportAllocations = async () => {
    try {
      setExporting(true);
      const XLSX = await import("xlsx");
      const visibleProductIds = new Set(
        filteredProducts.map((product) => Number(product.id))
      );
      const productById = new Map(
        filteredProducts.map((product) => [Number(product.id), product])
      );
      const cartonValue = (pairs, pairsPerCarton) => {
        const size = Number(pairsPerCarton || 0);
        return size > 0
          ? Math.round((Number(pairs || 0) / size) * 1000) / 1000
          : 0;
      };

      const userRows = allocations
        .filter((allocation) =>
          visibleProductIds.has(Number(allocation.finished_good_id))
        )
        .map((allocation) => {
          const product = productById.get(Number(allocation.finished_good_id)) || {};
          const pairsPerCarton = Number(
            product.inner_boxes_per_outer_box || 0
          );
          const assignedPairs = Number(allocation.allocation_quantity || 0);
          const usedPairs = Number(allocation.ordered_quantity || 0);
          const remainingPairs = Number(allocation.remaining_quantity || 0);
          return {
            "FG.ID": Number(allocation.finished_good_id),
            Product: product.name || "",
            Article: product.article_code || "",
            Series: product.sole_code || "",
            Color: product.color || "",
            Size: product.size || "",
            "Allocation type": String(
              allocation.allocation_scope || "EXCLUSIVE"
            ).toUpperCase(),
            "Assigned person": allocation.user_name || "",
            Email: allocation.user_email || "",
            "Allocation started": allocation.allocation_started_at || "",
            "Allocation percentage": Number(
              allocation.allocation_percentage || 0
            ),
            "Pairs per CTN": pairsPerCarton,
            "Assigned CTN": cartonValue(assignedPairs, pairsPerCarton),
            "Assigned pairs": assignedPairs,
            "Ordered / used CTN": cartonValue(usedPairs, pairsPerCarton),
            "Ordered / used pairs": usedPairs,
            "Left for this person CTN": cartonValue(
              remainingPairs,
              pairsPerCarton
            ),
            "Left for this person pairs": remainingPairs,
          };
        })
        .sort(
          (left, right) =>
            String(left.Article || left.Product).localeCompare(
              String(right.Article || right.Product),
              undefined,
              { numeric: true, sensitivity: "base" }
            ) ||
            String(left.Color).localeCompare(String(right.Color), undefined, {
              numeric: true,
              sensitivity: "base",
            }) ||
            String(left["Assigned person"]).localeCompare(
              String(right["Assigned person"])
            )
        );

      const productRows = filteredProducts.map((product) => {
        const targets = allocationsByProduct.get(Number(product.id)) || [];
        const pairsPerCarton = Number(product.inner_boxes_per_outer_box || 0);
        const availablePairs = Number(
          product.available_qty ?? product.quantity ?? 0
        );
        const assignedPairs = targets.reduce(
          (sum, target) => sum + Number(target.allocation_quantity || 0),
          0
        );
        const usedPairs = targets.reduce(
          (sum, target) => sum + Number(target.ordered_quantity || 0),
          0
        );
        const personalRemainingPairs = targets.reduce(
          (sum, target) => sum + Number(target.remaining_quantity || 0),
          0
        );
        const publicPairs = Number(targets[0]?.public_quantity || 0);
        const publicUsedPairs = Number(
          targets[0]?.public_used_quantity || 0
        );
        const publicRemainingPairs = Number(
          targets[0]?.public_remaining_quantity || 0
        );
        const unreleasedPairs = Math.max(
          0,
          availablePairs - personalRemainingPairs - publicRemainingPairs
        );
        return {
          "FG.ID": Number(product.id),
          Product: product.name || "",
          Article: product.article_code || "",
          Series: product.sole_code || "",
          Color: product.color || "",
          Size: product.size || "",
          "Allocation type": targets.length
            ? String(targets[0]?.allocation_scope || "EXCLUSIVE").toUpperCase()
            : "NOT ALLOCATED",
          "Assigned people": targets.length,
          "Pairs per CTN": pairsPerCarton,
          "Current physical stock pairs": Number(product.quantity || 0),
          "Currently reserved pairs": Number(product.reserved_qty || 0),
          "Currently available pairs": availablePairs,
          "Total assigned CTN": cartonValue(assignedPairs, pairsPerCarton),
          "Total assigned pairs": assignedPairs,
          "Total ordered / used CTN": cartonValue(usedPairs, pairsPerCarton),
          "Total ordered / used pairs": usedPairs,
          "Personal balance left CTN": cartonValue(
            personalRemainingPairs,
            pairsPerCarton
          ),
          "Personal balance left pairs": personalRemainingPairs,
          "Public released CTN": cartonValue(publicPairs, pairsPerCarton),
          "Public released pairs": publicPairs,
          "Public used CTN": cartonValue(publicUsedPairs, pairsPerCarton),
          "Public used pairs": publicUsedPairs,
          "Public balance left CTN": cartonValue(
            publicRemainingPairs,
            pairsPerCarton
          ),
          "Public balance left pairs": publicRemainingPairs,
          "Unreleased / general balance CTN": cartonValue(
            unreleasedPairs,
            pairsPerCarton
          ),
          "Unreleased / general balance pairs": unreleasedPairs,
        };
      });

      const workbook = XLSX.utils.book_new();
      const userSheet = XLSX.utils.json_to_sheet(userRows);
      userSheet["!cols"] = Array.from({ length: 18 }, (_, index) => ({
        wch: [1, 2, 7, 8, 9].includes(index) ? 24 : 17,
      }));
      const productSheet = XLSX.utils.json_to_sheet(productRows);
      productSheet["!cols"] = Array.from({ length: 26 }, (_, index) => ({
        wch: [1, 2, 6].includes(index) ? 24 : 17,
      }));
      XLSX.utils.book_append_sheet(workbook, userSheet, "Person Allocations");
      XLSX.utils.book_append_sheet(workbook, productSheet, "Product Summary");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `product-allocations-${today}.xlsx`);
      showToast({
        tone: "success",
        title: "Allocation Excel exported",
        message: `${userRows.length} person allocation row${
          userRows.length === 1 ? "" : "s"
        } exported from ${productRows.length} matching product${
          productRows.length === 1 ? "" : "s"
        }.`,
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "Export failed",
        message: error.message || "Could not export product allocations.",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Product access"
        title="Product Percentage / CTN Allocation"
        description="Protect product quantities for selected users, or make a product exclusive to them. Allocate by percentage or whole cartons."
        icon="users"
      />

      <SectionCard
        title="Products"
        subtitle="Exclusive allocations hide the product from other users. Private allocations protect selected quantities while other permitted users share the remainder."
        icon="finishedGoods"
        actions={
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_180px_auto]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, article, series or color…"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <select
              value={allocationFilter}
              onChange={(event) => setAllocationFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">
                All products ({formatNumber(allocationCounts.all)})
              </option>
              <option value="allocated">
                Percentage divided ({formatNumber(allocationCounts.allocated)})
              </option>
              <option value="unallocated">
                Not divided ({formatNumber(allocationCounts.unallocated)})
              </option>
            </select>
            <MultiSeriesFilter
              options={seriesOptions}
              values={seriesFilters}
              onChange={setSeriesFilters}
              label=""
              buttonClassName="h-10"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon="download"
              onClick={exportAllocations}
              disabled={loading || exporting || !filteredProducts.length}
            >
              {exporting ? "Exporting…" : "🖨️"}
            </Button>
            {search || allocationFilter !== "all" || seriesFilters.length ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setAllocationFilter("all");
                  setSeriesFilters([]);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            Loading products…
          </div>
        ) : pageProducts.length ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageProducts.map((product) => {
              const targets =
                allocationsByProduct.get(Number(product.id)) || [];
              const pairsPerCarton = Number(
                product.inner_boxes_per_outer_box || 0
              );
              const totalCartons = getRoundedCartons(
                product.available_qty ?? product.quantity,
                pairsPerCarton
              );
              const assignedPairs = targets.reduce(
                (sum, target) =>
                  sum + Number(target.allocation_quantity || 0),
                0
              );
              const assignedCartons =
                pairsPerCarton > 0
                  ? Math.floor(assignedPairs / pairsPerCarton)
                  : 0;
              const savedAllocationScope = String(
                targets[0]?.allocation_scope || "EXCLUSIVE"
              ).toUpperCase();
              const personalRemainingPairs = targets.reduce(
                (sum, target) =>
                  sum + Number(target.remaining_quantity || 0),
                0
              );
              const publicRemainingPairs = Number(
                targets[0]?.public_remaining_quantity || 0
              );
              const currentlyAvailablePairs = Number(
                product.available_qty ?? product.quantity ?? 0
              );
              const unreleasedPairs = Math.max(
                0,
                currentlyAvailablePairs -
                  personalRemainingPairs -
                  publicRemainingPairs
              );
              return (
                <article
                  key={product.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        FG.ID {product.id}
                      </p>
                      <h3 className="mt-1 truncate text-base font-bold text-slate-950">
                        {product.article_code || product.name}
                      </h3>
                      <p className="truncate text-sm text-slate-500">
                        {product.sole_code || "No series"} ·{" "}
                        {product.color || "No color"} · {product.size || "-"}
                      </p>
                    </div>
                    <StatusBadge tone={targets.length ? "success" : "neutral"}>
                      {targets.length
                        ? `${targets.length} · ${
                            String(
                              targets[0]?.allocation_scope || "EXCLUSIVE"
                            ).toUpperCase() === "CONTROLLED"
                              ? "Controlled"
                              : String(
                                    targets[0]?.allocation_scope || "EXCLUSIVE"
                                  ).toUpperCase() === "PRIVATE"
                                ? "Private qty"
                                : "Exclusive"
                          }`
                        : "Not allocated"}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 px-2 py-2">
                      <p className="text-[10px] uppercase text-slate-400">Available</p>
                      <p className="font-bold text-slate-900">
                        {formatNumber(product.available_qty ?? product.quantity)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-indigo-50 px-2 py-2">
                      <p className="text-[10px] uppercase text-indigo-500">CTN</p>
                      <p className="font-bold text-indigo-800">
                        {formatNumber(totalCartons)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-2 py-2">
                      <p className="text-[10px] uppercase text-emerald-500">Assigned</p>
                      <p className="font-bold text-emerald-800">
                        {formatNumber(assignedCartons)} CTN
                      </p>
                      <p className="text-[10px] font-semibold text-emerald-700">
                        {formatNumber(assignedPairs)} pairs
                      </p>
                    </div>
                  </div>

                  {targets.length ? (
                    <div className="mt-3 divide-y divide-slate-200 rounded-xl bg-slate-50 px-3">
                      {targets.map((target) => {
                        const userAssignedPairs = Number(
                          target.allocation_quantity || 0
                        );
                        const userRemainingPairs = Number(
                          target.remaining_quantity || 0
                        );
                        const userAssignedCartons =
                          pairsPerCarton > 0
                            ? Math.floor(userAssignedPairs / pairsPerCarton)
                            : 0;
                        const userRemainingCartons =
                          pairsPerCarton > 0
                            ? Math.floor(userRemainingPairs / pairsPerCarton)
                            : 0;

                        return (
                          <div key={target.user_id} className="py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-xs font-semibold text-slate-800">
                                {target.user_name || target.user_email}
                              </span>
                              <span className="shrink-0 text-xs font-bold text-indigo-700">
                                {formatNumber(target.allocation_percentage)}%
                              </span>
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-400">Divided </span>
                                <span className="font-bold text-slate-700">
                                  {formatNumber(userAssignedCartons)} CTN
                                </span>
                                <span className="block text-slate-500">
                                  {formatNumber(userAssignedPairs)} pairs
                                </span>
                              </div>
                              <div className="border-l border-slate-200 pl-2">
                                <span className="text-slate-400">Left </span>
                                <span className="font-bold text-emerald-700">
                                  {formatNumber(userRemainingCartons)} CTN
                                </span>
                                <span className="block text-slate-500">
                                  {formatNumber(userRemainingPairs)} pairs
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={
                                  userRemainingPairs < pairsPerCarton ||
                                  pairsPerCarton <= 0
                                }
                                title={
                                  userRemainingPairs < pairsPerCarton
                                    ? "No full unused CTN is available to transfer"
                                    : "Transfer this dealer's unused allocation"
                                }
                                onClick={() =>
                                  openTransferEditor(product, target, targets)
                                }
                              >
                                Transfer balance
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {targets.length && savedAllocationScope === "CONTROLLED" ? (
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-violet-500">
                          Personal left
                        </p>
                        <p className="text-xs font-black text-violet-950">
                          {formatNumber(personalRemainingPairs)} pairs
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-violet-500">
                          Public left
                        </p>
                        <p className="text-xs font-black text-violet-950">
                          {formatNumber(publicRemainingPairs)} pairs
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-500">
                          Unreleased
                        </p>
                        <p className="text-xs font-black text-slate-950">
                          {formatNumber(unreleasedPairs)} pairs
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      icon="users"
                      onClick={() => openEditor(product)}
                    >
                      {targets.length ? "Edit allocation" : "Allocate product"}
                    </Button>
                    {targets.length ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => removeAllocation(product)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No matching products.
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <p className="text-sm text-slate-500">
              Page {page} of {pageCount}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Allocation history"
        subtitle="Every saved allocation keeps a snapshot of total product stock, assigned quantity, remaining quantity, selected users, and the person who changed it."
        icon="history"
      >
        {!historyAvailable ? (
          <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Allocation history requires {historyMigration || "the activity-log migration"}.
          </div>
        ) : allocationHistory.length ? (
          <>
            {legacyHistoryCount > 0 ? (
              <div className="mx-4 mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                {formatNumber(legacyHistoryCount)} older allocation actions are
                hidden because they were recorded before stock and per-user
                quantity snapshots existed.
              </div>
            ) : null}
            <DataTable
              rows={allocationHistory}
              wrapCells
              exportFilename="product-allocation-history"
              emptyTitle="No allocation history yet"
              columns={[
              {
                key: "created_at",
                label: "Date",
                render: (row) => formatDate(row.created_at),
              },
              {
                key: "product",
                label: "Product",
                exportValue: (row) =>
                  `${row.article_code || row.product_name || "Product"} / ${row.sole_code || ""} / ${row.color || ""}`,
                render: (row) => (
                  <div>
                    <strong>
                      {row.article_code || row.product_name || `FG.ID ${row.finished_good_id}`}
                    </strong>
                    <p className="text-xs text-slate-500">
                      {[row.sole_code, row.color].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                ),
              },
              {
                key: "total_quantity",
                label: "Total product",
                exportValue: (row) =>
                  row.has_snapshot
                    ? `${row.total_cartons} CTN / ${row.total_quantity} pairs`
                    : "Snapshot unavailable",
                render: (row) =>
                  row.has_snapshot ? (
                    <div>
                      <strong>{formatNumber(row.total_cartons)} CTN</strong>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.total_quantity)} pairs
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Legacy entry</span>
                  ),
              },
              {
                key: "assigned_quantity",
                label: "Assigned / protected",
                exportValue: (row) =>
                  row.has_snapshot
                    ? `${row.assigned_cartons} CTN / ${row.assigned_quantity} pairs / ${row.percentage_total}%`
                    : "Snapshot unavailable",
                render: (row) =>
                  row.has_snapshot ? (
                    <div>
                      <strong>{formatNumber(row.assigned_cartons)} CTN</strong>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.assigned_quantity)} pairs ·{" "}
                        {formatPercentage(row.percentage_total)}%
                      </p>
                      <p className="text-[10px] font-bold uppercase text-indigo-600">
                        {row.allocation_scope === "PRIVATE"
                          ? "Private quantity"
                          : "Exclusive users"}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not recorded</span>
                  ),
              },
              {
                key: "unassigned_quantity",
                label: "Left",
                exportValue: (row) =>
                  row.has_snapshot
                    ? `${row.unassigned_cartons} CTN / ${row.unassigned_quantity} pairs`
                    : "Snapshot unavailable",
                render: (row) =>
                  row.has_snapshot ? (
                    <div>
                      <strong>{formatNumber(row.unassigned_cartons)} CTN</strong>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.unassigned_quantity)} pairs
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not recorded</span>
                  ),
              },
              {
                key: "targets",
                label: "User allocation / usage",
                exportValue: (row) =>
                  (row.targets || [])
                    .map(
                      (target) =>
                        `${target.user_name || target.user_email || target.user_id}: assigned ${target.allocation_percentage}% / ${target.allocation_cartons} CTN / ${target.allocation_quantity} pairs; ordered ${target.ordered_cartons || 0} CTN / ${target.ordered_quantity || 0} pairs; left ${target.remaining_cartons || 0} CTN / ${target.remaining_quantity || 0} pairs`
                    )
                    .join("; "),
                render: (row) =>
                  row.targets?.length ? (
                    <div className="min-w-52 space-y-1">
                      {row.targets.map((target) => (
                        <div key={target.user_id} className="text-xs">
                          <strong>{target.user_name || target.user_email}</strong>
                          <span className="block text-slate-500">
                            Assigned: {formatPercentage(target.allocation_percentage)}% ·{" "}
                            {formatNumber(target.allocation_cartons)} CTN ·{" "}
                            {formatNumber(target.allocation_quantity)} pairs
                          </span>
                          <span className="block text-slate-500">
                            Ordered: {formatNumber(target.ordered_cartons)} CTN ·{" "}
                            {formatNumber(target.ordered_quantity)} pairs
                          </span>
                          <span className="block font-semibold text-emerald-700">
                            Left: {formatNumber(target.remaining_cartons)} CTN ·{" "}
                            {formatNumber(target.remaining_quantity)} pairs
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">No users</span>
                  ),
              },
              {
                key: "changed_by_name",
                label: "Changed by",
                render: (row) => (
                  <div>
                    <strong>{row.changed_by_name || "Unknown"}</strong>
                    <p className="text-xs text-slate-500">
                      {row.changed_by_email || "-"}
                    </p>
                  </div>
                ),
              },
              {
                key: "action",
                label: "Action",
                render: (row) => (
                  <StatusBadge
                    tone={
                      row.action === "REMOVE_PRODUCT_PERCENTAGE_ALLOCATION"
                        ? "danger"
                        : "success"
                    }
                  >
                    {row.action === "REMOVE_PRODUCT_PERCENTAGE_ALLOCATION"
                      ? "REMOVED"
                      : "SAVED"}
                  </StatusBadge>
                ),
              },
              ]}
            />
          </>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            <p>
              No complete allocation snapshots yet. The next saved or removed
              allocation will appear here with full quantities.
            </p>
            {legacyHistoryCount > 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                {formatNumber(legacyHistoryCount)} older actions were hidden
                because their quantities were never recorded.
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>

      {transferEditor ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4"
          onMouseDown={closeTransferEditor}
        >
          <form
            onSubmit={submitTransfer}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                Product allocation transfer
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Transfer {transferEditor.product.article_code || transferEditor.product.name}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Move only the source dealer&apos;s unused full cartons. Existing
                orders and deliveries remain with the original dealer.
              </p>
            </div>

            <div className="mt-4 grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <p className="text-[10px] font-bold uppercase text-amber-700">
                  From dealer
                </p>
                <p className="font-bold text-slate-950">
                  {transferEditor.source.user_name ||
                    transferEditor.source.user_email}
                </p>
                <p className="text-xs text-slate-500">
                  {transferEditor.source.user_email}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">
                  Assigned / ordered
                </p>
                <p className="text-sm font-black text-slate-900">
                  {formatNumber(
                    Math.floor(
                      Number(transferEditor.source.allocation_quantity || 0) /
                        transferPairsPerCarton
                    )
                  )}{" "}
                  / {formatNumber(
                    Math.floor(
                      Number(transferEditor.source.ordered_quantity || 0) /
                        transferPairsPerCarton
                    )
                  )}{" "}
                  CTN
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-700">
                  Transferable
                </p>
                <p className="text-lg font-black text-emerald-800">
                  {formatNumber(transferAvailableCartons)} CTN
                </p>
                <p className="text-xs text-emerald-700">
                  {formatNumber(transferAvailableCartons * transferPairsPerCarton)} pairs
                </p>
              </div>
            </div>

            {transferLoosePairs > 0 ? (
              <p className="mt-2 text-xs font-medium text-amber-700">
                {formatNumber(transferLoosePairs)} loose pairs stay with the
                source dealer because this transfer uses complete CTN.
              </p>
            ) : null}

            <div className="mt-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">
                    Destination dealers
                  </h3>
                  <p className="text-xs text-slate-500">
                    Enter CTN for one or several dealers.
                  </p>
                </div>
                <p
                  className={`text-sm font-black ${
                    transferTotalCartons > transferAvailableCartons
                      ? "text-red-600"
                      : "text-indigo-700"
                  }`}
                >
                  {formatNumber(transferTotalCartons)} /{" "}
                  {formatNumber(transferAvailableCartons)} CTN
                </p>
              </div>

              <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">
                {users
                  .filter(
                    (user) =>
                      Number(user.id) !==
                      Number(transferEditor.source.user_id)
                  )
                  .map((user) => {
                    const current = transferTargetByUser.get(Number(user.id));
                    const currentPairs = Number(
                      current?.allocation_quantity || 0
                    );
                    const currentCartons =
                      transferPairsPerCarton > 0
                        ? currentPairs / transferPairsPerCarton
                        : 0;
                    return (
                      <label
                        key={user.id}
                        className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-900">
                            {user.name || user.email}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {user.email}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-indigo-700">
                            Currently assigned: {formatNumber(currentCartons)} CTN
                          </span>
                        </span>
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Add CTN
                          <input
                            type="number"
                            min="0"
                            max={transferAvailableCartons}
                            step="1"
                            value={transferCartons[user.id] ?? ""}
                            onChange={(event) =>
                              setTransferCartons((currentValues) => ({
                                ...currentValues,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-900"
                          />
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <label className="mt-4 block text-xs font-bold uppercase text-slate-600">
              Transfer reason
              <textarea
                required
                maxLength={500}
                rows={3}
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
                placeholder="Example: Dealer did not take the remaining allocation"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case text-slate-900"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeTransferEditor}
                disabled={transferring}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                icon="check"
                disabled={
                  transferring ||
                  transferTotalCartons <= 0 ||
                  transferTotalCartons > transferAvailableCartons ||
                  !transferReason.trim()
                }
              >
                {transferring ? "Transferring" : "Transfer balance"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={() => setEditing(null)}
        >
          <form
            onSubmit={save}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Allocate {editing.article_code || editing.name}
                </h2>
                <p className="text-sm text-slate-500">
                  Choose whether this product is exclusive to selected users or
                  only protects their assigned quantity from other users.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 lg:grid-cols-3">
              <button
                type="button"
                onClick={() => setAllocationScope("CONTROLLED")}
                className={`rounded-xl border p-3 text-left transition ${
                  allocationScope === "CONTROLLED"
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="block text-sm font-bold text-slate-950">
                  Controlled release
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Everything starts hidden. Release exact personal quantities
                  now, add another user later, and release a shared public
                  balance only when you choose.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAllocationScope("PRIVATE")}
                className={`rounded-xl border p-3 text-left transition ${
                  allocationScope === "PRIVATE"
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="block text-sm font-bold text-slate-950">
                  Private quantity + public remainder
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Protect the assigned CTN/pairs for selected users. Other
                  permitted users can see and order only the quantity left
                  outside this private allocation.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAllocationScope("EXCLUSIVE")}
                className={`rounded-xl border p-3 text-left transition ${
                  allocationScope === "EXCLUSIVE"
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="block text-sm font-bold text-slate-950">
                  Exclusive selected users
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Current behaviour. The whole product is hidden from every
                  unselected user, regardless of the unassigned balance.
                </span>
              </button>
            </div>

            {allocationScope === "CONTROLLED" ? (
              <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-violet-950">
                      Public release
                    </p>
                    <p className="text-xs text-violet-700">
                      This balance is shared by every permitted user. Keep it at
                      zero while the remaining stock must stay hidden.
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-violet-700">
                    Already ordered publicly: {formatNumber(publicUsedQuantity)} pairs
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase text-violet-800">
                    Public CTN
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        editorPairsPerCarton > 0
                          ? Number(publicPairQuantity || 0) / editorPairsPerCarton
                          : 0
                      }
                      onChange={(event) =>
                        setPublicPairQuantity(
                          Math.max(0, Number(event.target.value || 0)) *
                            editorPairsPerCarton
                        )
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm"
                    />
                  </label>
                  <label className="text-xs font-bold uppercase text-violet-800">
                    Public pairs
                    <input
                      type="number"
                      min={publicUsedQuantity}
                      step="1"
                      value={publicPairQuantity}
                      onChange={(event) =>
                        setPublicPairQuantity(event.target.value)
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-indigo-50 p-3">
                <p className="text-[10px] font-bold uppercase text-indigo-500">
                  Total product
                </p>
                <p className="font-bold text-indigo-900">
                  {formatNumber(editorTotalCartons)} CTN
                </p>
                <p className="text-xs text-indigo-700">
                  {formatNumber(editorTotalPairs)} pairs
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[10px] font-bold uppercase text-emerald-600">
                  Assigned
                </p>
                <p className="font-bold text-emerald-900">
                  {formatNumber(assignedCartons)} CTN
                </p>
                <p className="text-xs text-emerald-700">
                  {formatNumber(assignedPairs)} pairs
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-600">
                  Left
                </p>
                <p className="font-bold text-amber-900">
                  {formatNumber(unassignedCartons)} CTN
                </p>
                <p className="text-xs text-amber-700">
                  {formatNumber(unassignedPairs)} pairs
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-1">
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => changeDivisionMode("PERCENTAGE")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "PERCENTAGE"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by percentage
                </button>
                <button
                  type="button"
                  onClick={() => changeDivisionMode("CTN")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "CTN"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by CTN
                </button>
                <button
                  type="button"
                  onClick={() => changeDivisionMode("PAIRS")}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                    divisionMode === "PAIRS"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Divide by pairs
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-[52vh] space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-2">
              {users.map((user) => {
                const userId = Number(user.id);
                const checked = selectedUserIds.includes(userId);
                const defaultPercentage =
                  OFFER_PERCENTAGES_BY_EMAIL[
                    String(user.email || "").trim().toLowerCase()
                  ];
                const percentage =
                  percentages[userId] ?? defaultPercentage ?? "";
                const allocation = calculatedAllocations.get(userId);
                return (
                  <div
                    key={user.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_110px] items-center gap-3 rounded-xl bg-white p-3"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedUserIds((current) =>
                          checked
                            ? current.filter((id) => Number(id) !== userId)
                            : [...current, userId]
                        );
                        if (!checked) {
                          setPercentages((current) => ({
                            ...current,
                            [userId]: current[userId] ?? defaultPercentage ?? "",
                          }));
                          setCartonQuantities((current) => ({
                            ...current,
                            [userId]: current[userId] || 1,
                          }));
                          setPairQuantities((current) => ({
                            ...current,
                            [userId]:
                              current[userId] ||
                              Number(editing.inner_boxes_per_outer_box || 1),
                          }));
                        }
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user.name || user.email}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {user.email}
                      </p>
                      {checked && allocation ? (
                        <p className="mt-1 text-xs font-bold text-indigo-700">
                          {formatPercentage(allocation.percentage)}% ·{" "}
                          {formatNumber(allocation.cartons)} CTN ·{" "}
                          {formatNumber(allocation.pairs)} pairs
                        </p>
                      ) : null}
                    </div>
                    <label className="text-[11px] font-semibold uppercase text-slate-500">
                      {divisionMode === "CTN"
                        ? "CTN"
                        : divisionMode === "PAIRS"
                          ? "Pairs"
                          : "Percentage"}
                      <input
                        type="number"
                        min={divisionMode === "PERCENTAGE" ? "0.01" : "1"}
                        max={
                          divisionMode === "CTN"
                            ? editorTotalCartons
                            : divisionMode === "PAIRS"
                              ? editorAllocationBasePairs
                              : "100"
                        }
                        step={divisionMode === "PERCENTAGE" ? "0.01" : "1"}
                        required={checked}
                        disabled={!checked}
                        value={
                          checked
                            ? divisionMode === "CTN"
                              ? cartonQuantities[userId] ?? ""
                              : divisionMode === "PAIRS"
                                ? pairQuantities[userId] ?? ""
                                : percentage
                            : ""
                        }
                        onChange={(event) => {
                          if (divisionMode === "CTN") {
                            setCartonQuantities((current) => ({
                              ...current,
                              [userId]: event.target.value,
                            }));
                          } else if (divisionMode === "PAIRS") {
                            setPairQuantities((current) => ({
                              ...current,
                              [userId]: event.target.value,
                            }));
                          } else {
                            setPercentages((current) => ({
                              ...current,
                              [userId]: event.target.value,
                            }));
                          }
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-100"
                      />
                    </label>
                  </div>
                );
              })}
            </div>

            <div
              className={`mt-4 rounded-xl px-3 py-3 text-sm font-semibold ${
                percentageTotal > 100 || allocationExceedsStock
                  ? "bg-red-50 text-red-700"
                  : "bg-indigo-50 text-indigo-700"
              }`}
            >
              <p>
                {allocationScope === "PRIVATE" ? "Total protected" : "Total assigned"}: {formatPercentage(percentageTotal)}% ·{" "}
                {formatNumber(assignedCartons)} CTN ·{" "}
                {formatNumber(assignedPairs)} pairs
              </p>
              <p className="mt-1">
                Total left:{" "}
                {formatPercentage(Math.max(0, 100 - percentageTotal))}%
                {" · "}
                {formatNumber(unassignedCartons)} CTN ·{" "}
                {formatNumber(unassignedPairs)} pairs
              </p>
              {allocationScope === "CONTROLLED" ? (
                <>
                  <p className="mt-2">
                    Public remaining: {formatNumber(controlledPublicRemainingPairs)} pairs
                  </p>
                  <p className="mt-1 font-bold">
                    Still unreleased / hidden: {formatNumber(
                      Math.max(0, editorTotalPairs - controlledReleasedRemainingPairs)
                    )} pairs
                  </p>
                </>
              ) : null}
            </div>
            {allocationExceedsStock ? (
              <p className="mt-2 text-sm font-medium text-red-600">
                Assigned CTN cannot exceed the total product CTN.
              </p>
            ) : null}
            {hasInvalidAllocation ? (
              <p className="mt-2 text-sm font-medium text-red-600">
                The stock is too small to give every selected user at least one
                full carton.
              </p>
            ) : null}
            {allocationBelowUsed ? (
              <p className="mt-2 text-sm font-medium text-red-600">
                A user allocation cannot be lower than what that user has
                already ordered.
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                icon="check"
                disabled={
                  saving ||
                  (!selectedUserIds.length &&
                    !(
                      allocationScope === "CONTROLLED" &&
                      Number(publicPairQuantity || 0) > 0
                    )) ||
                  percentageTotal <= 0 ||
                  percentageTotal > 100 ||
                  allocationExceedsStock ||
                  hasInvalidAllocation ||
                  allocationBelowUsed ||
                  (allocationScope === "CONTROLLED" &&
                    Number(publicPairQuantity || 0) < publicUsedQuantity)
                }
              >
                {saving ? "Saving" : "Save allocation"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
