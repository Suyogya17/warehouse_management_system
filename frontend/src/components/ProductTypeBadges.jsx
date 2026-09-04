import {
  getCommissionLabel,
  getProductNClassification,
  isCommissionProduct,
} from "../utils/commission";

export default function ProductTypeBadges({ product, className = "" }) {
  const nClassification = getProductNClassification(product);

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`.trim()}>
      <span
        className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
          isCommissionProduct(product)
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {getCommissionLabel(product)}
      </span>
      {nClassification ? (
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${
            nClassification === "N1"
              ? "bg-blue-100 text-blue-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {nClassification}
        </span>
      ) : null}
    </div>
  );
}
