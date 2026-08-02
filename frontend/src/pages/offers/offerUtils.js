import { getRoundedCartons } from "../../utils/displayStock";

export const OFFER_PERCENTAGES_BY_EMAIL = {
  "pramod.kathmandu@nepcha.com": 40,
  "ishwor.birtamod@nepcha.com": 30,
  "kamal.butwal@nepcha.com": 20,
  "ramesh.pokhara@nepcha.com": 5,
  "deepak@nepcha.com": 5,
};

export const OFFER_PRODUCTS_PER_PAGE = 12;
export const OFFER_STOCK_PRODUCTS_PER_PAGE = 5;
export const OFFER_REPORT_PRODUCTS_PER_PAGE = 5;

export const isActiveOffer = (item) =>
  Number(item.offer_enabled) === 1 &&
  (!item.offer_ends_at || new Date(item.offer_ends_at).getTime() >= Date.now());

export const getOfferGroupKey = (item) =>
  `${String(item.article_code || item.name || item.id).trim().toLowerCase()}::${String(item.sole_code || "").trim().toLowerCase()}`;

export const getSeriesName = (soleCode = "") =>
  String(soleCode)
    .replace(/[-_\s]*sole$/i, "")
    .trim();

export const getPercentageAllocations = (product, targets = []) => {
  const pairsPerCarton = Number(product?.inner_boxes_per_outer_box || 0);
  const totalCartons = getRoundedCartons(product?.quantity, pairsPerCarton);
  if (pairsPerCarton <= 0 || totalCartons <= 0) return new Map();

  const allocations = targets
    .filter((target) => Number(target.percentage) > 0)
    .map((target, index) => {
      const percentage = Number(target.percentage);
      const exactCartons = totalCartons * percentage / 100;
      const cartons = Math.floor(exactCartons);
      return {
        user_id: Number(target.user_id),
        percentage,
        cartons,
        remainder: exactCartons - cartons,
        index,
      };
    });
  const totalPercentage = allocations.reduce(
    (sum, allocation) => sum + allocation.percentage,
    0
  );
  const targetCartons = Math.min(
    totalCartons,
    Math.round(totalCartons * totalPercentage / 100)
  );
  let cartonsLeft =
    targetCartons -
    allocations.reduce((sum, allocation) => sum + allocation.cartons, 0);

  [...allocations]
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.index - right.index
    )
    .forEach((allocation) => {
      if (cartonsLeft <= 0) return;
      allocation.cartons += 1;
      cartonsLeft -= 1;
    });

  if (targetCartons >= allocations.length) {
    allocations
      .filter((allocation) => allocation.cartons === 0)
      .forEach((emptyAllocation) => {
        const donor = allocations
          .filter((allocation) => allocation.cartons > 1)
          .sort(
            (left, right) =>
              right.cartons - left.cartons ||
              right.percentage - left.percentage ||
              left.index - right.index
          )[0];
        if (donor) {
          donor.cartons -= 1;
          emptyAllocation.cartons = 1;
        }
      });
  }

  return new Map(
    allocations.map((allocation) => [
      allocation.user_id,
      {
        ...allocation,
        pairs: allocation.cartons * pairsPerCarton,
      },
    ])
  );
};

export const getCartonAllocations = (product, targets = []) => {
  const pairsPerCarton = Number(product?.inner_boxes_per_outer_box || 0);
  const totalCartons = getRoundedCartons(product?.quantity, pairsPerCarton);
  if (pairsPerCarton <= 0 || totalCartons <= 0) return new Map();

  return new Map(
    targets.map((target) => {
      const cartons = Math.max(
        0,
        Math.floor(Number(target.cartons || 0))
      );
      return [
        Number(target.user_id),
        {
          user_id: Number(target.user_id),
          cartons,
          pairs: cartons * pairsPerCarton,
          percentage: (cartons / totalCartons) * 100,
        },
      ];
    })
  );
};
