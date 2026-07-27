import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DataTable from "../../components/DataTable";
import SectionCard from "../../components/SectionCard";
import { formatDate, formatNumber } from "../../utils/format";
import {
  ChartFrame,
  ChartSummary,
  WorkflowTooltip,
  numberTooltip,
  productName,
  shortLabel,
  sumRows,
} from "./analyticsShared";

export default function ProductionAnalytics({ data }) {
  const [productionSearch, setProductionSearch] = useState("");
  const [productionSeries, setProductionSeries] = useState("");
  const latestProductionRows = data?.latest_product_production || [];
  const productionSeriesOptions = useMemo(() => [...new Set(latestProductionRows
    .map((row) => String(row.sole_code || "").replace(/[-_\s]*sole$/i, "").trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })), [latestProductionRows]);
  const filteredLatestProduction = useMemo(() => {
    const terms = productionSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return latestProductionRows.filter((row) => {
      const series = String(row.sole_code || "").replace(/[-_\s]*sole$/i, "").trim();
      if (productionSeries && series !== productionSeries) return false;
      const searchable = [row.name, row.article_code, row.sole_code, row.color, row.size]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return terms.every((term) => searchable.includes(term));
    });
  }, [latestProductionRows, productionSearch, productionSeries]);
  const latestProductionMatch = filteredLatestProduction[0];
  const productionUserRows = useMemo(
    () =>
      (data?.production_by_user || [])
        .slice()
        .sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0))
        .slice(0, 10)
        .map((row) => ({
          ...row,
          user_label: shortLabel(row.user_name),
          tooltip_label: row.user_name,
        })),
    [data?.production_by_user]
  );
  const producedProductRows = useMemo(
    () =>
      (data?.top_produced_products || [])
        .slice()
        .sort((a, b) => Number(b.total_quantity || 0) - Number(a.total_quantity || 0))
        .slice(0, 10)
        .map((row) => {
          const label = productName(row);
          return {
            ...row,
            product_label: shortLabel(label, 22),
            tooltip_label: label,
          };
        }),
    [data?.top_produced_products]
  );
  const productionUserChartHeight = Math.max(300, productionUserRows.length * 44 + 96);
  const producedProductChartHeight = Math.max(300, producedProductRows.length * 44 + 96);
  const monthlyProductionRows = data?.monthly_production_trend || [];
  const totalProducedQty = sumRows(monthlyProductionRows, "total_quantity");
  const totalProductionRuns = sumRows(monthlyProductionRows, "production_runs");
  const topProducedProduct = producedProductRows[0];
  const topProductionUser = productionUserRows[0];

  return (
    <div className="space-y-4">
      <SectionCard title="Latest Product Production" subtitle="Search a product and series to see its most recent production date." icon="production">
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_240px]">
          <label className="text-sm font-semibold text-slate-700">Product search
            <input value={productionSearch} onChange={(event) => setProductionSearch(event.target.value)} placeholder="Product, article, color or size..." className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Series
            <select value={productionSeries} onChange={(event) => setProductionSeries(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">
              <option value="">All series</option>
              {productionSeriesOptions.map((series) => <option key={series} value={series}>{series}</option>)}
            </select>
          </label>
        </div>
        {(productionSearch || productionSeries) && latestProductionMatch && (
          <div className="mx-4 mb-4 grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 sm:grid-cols-3">
            <div><p className="text-xs font-semibold uppercase text-indigo-500">Latest product</p><p className="mt-1 font-bold text-indigo-950">{productName(latestProductionMatch)}</p></div>
            <div><p className="text-xs font-semibold uppercase text-indigo-500">Production date</p><p className="mt-1 font-bold text-indigo-950">{formatDate(latestProductionMatch.latest_production_at)}</p></div>
            <div><p className="text-xs font-semibold uppercase text-indigo-500">Latest produced qty</p><p className="mt-1 font-bold text-indigo-950">{formatNumber(latestProductionMatch.latest_quantity)} {latestProductionMatch.unit || ""}</p></div>
          </div>
        )}
        <DataTable
          rows={filteredLatestProduction}
          emptyTitle="No matching production found"
          columns={[
            { key: "product", label: "Product", render: productName },
            { key: "sole_code", label: "Series", render: (row) => row.sole_code || "-" },
            { key: "latest_production_at", label: "Latest Production", render: (row) => formatDate(row.latest_production_at) },
            { key: "latest_quantity", label: "Latest Qty", render: (row) => `${formatNumber(row.latest_quantity)} ${row.unit || ""}` },
          ]}
        />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Monthly Production Trend" icon="production">
          <ChartSummary
            items={[
              { label: "Months", value: formatNumber(monthlyProductionRows.length) },
              { label: "Produced Qty", value: formatNumber(totalProducedQty) },
              { label: "Production Runs", value: formatNumber(totalProductionRuns) },
            ]}
          />
          <ChartFrame>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyProductionRows} margin={{ top: 8, right: 18, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                <Tooltip formatter={numberTooltip} />
                <Legend />
                <Line type="monotone" dataKey="total_quantity" name="Produced Qty" stroke="#4f46e5" strokeWidth={2} />
                <Line type="monotone" dataKey="production_runs" name="Runs" stroke="#059669" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </SectionCard>

        <SectionCard title="Production By User" icon="users">
          {productionUserRows.length ? (
            <>
              <ChartSummary
                items={[
                  { label: "Users", value: formatNumber(productionUserRows.length) },
                  { label: "Produced Qty", value: formatNumber(sumRows(productionUserRows, "total_quantity")) },
                  { label: "Runs", value: formatNumber(sumRows(productionUserRows, "production_runs")) },
                  { label: "Top User", value: topProductionUser?.user_name || "-" },
                ]}
              />
              <ChartFrame height={productionUserChartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={productionUserRows}
                    layout="vertical"
                    margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                    barCategoryGap={12}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="user_label"
                      width={118}
                      tick={{ fontSize: 12, fill: "#475569" }}
                      interval={0}
                    />
                    <Tooltip content={<WorkflowTooltip />} />
                    <Bar dataKey="total_quantity" name="Produced Qty" fill="#0f766e" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="total_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">No user production to chart yet.</div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top Produced Products Chart" subtitle="Products ranked by produced quantity." icon="finishedGoods">
        {producedProductRows.length ? (
          <>
            <ChartSummary
              items={[
                { label: "Products", value: formatNumber(producedProductRows.length) },
                { label: "Produced Qty", value: formatNumber(sumRows(producedProductRows, "total_quantity")) },
                { label: "Runs", value: formatNumber(sumRows(producedProductRows, "production_runs")) },
                { label: "Top Product", value: topProducedProduct?.tooltip_label || "-" },
              ]}
            />
            <ChartFrame height={producedProductChartHeight}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={producedProductRows}
                  layout="vertical"
                  margin={{ top: 8, right: 34, bottom: 8, left: 10 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={formatNumber} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="product_label"
                    width={150}
                    tick={{ fontSize: 12, fill: "#475569" }}
                    interval={0}
                  />
                  <Tooltip content={<WorkflowTooltip />} />
                  <Bar dataKey="total_quantity" name="Produced Qty" fill="#4f46e5" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="total_quantity" position="right" formatter={formatNumber} className="fill-slate-600 text-xs" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </>
        ) : (
          <div className="px-6 py-10 text-sm text-slate-500">No produced products to chart yet.</div>
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Top Produced Products" icon="finishedGoods">
          <DataTable
            rows={data?.top_produced_products || []}
            emptyTitle="No production yet"
            summaryColumns={[
              { key: "total_quantity", label: "Produced Qty" },
              { key: "production_runs", label: "Runs" },
            ]}
            columns={[
              { key: "product", label: "Product", render: productName },
              { key: "total_quantity", label: "Produced Qty", render: (row) => `${formatNumber(row.total_quantity)} ${row.unit || ""}` },
              { key: "production_runs", label: "Runs", render: (row) => formatNumber(row.production_runs) },
            ]}
          />
        </SectionCard>

        <SectionCard title="Raw Material Consumption" icon="materials">
          <DataTable
            rows={data?.raw_material_consumption || []}
            emptyTitle="No material consumption"
            summaryColumns={[
              { key: "total_consumed", label: "Consumed" },
            ]}
            columns={[
              { key: "name", label: "Material" },
              { key: "article_code", label: "Article" },
              { key: "category", label: "Category" },
              { key: "total_consumed", label: "Consumed", render: (row) => `${formatNumber(row.total_consumed)} ${row.unit || ""}` },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}

