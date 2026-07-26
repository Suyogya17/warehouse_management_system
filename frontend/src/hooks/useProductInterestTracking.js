import { useCallback, useEffect, useRef } from "react";
import { api } from "../services/api";

export const useProductInterestTracking = ({
  token,
  search,
  resultCount,
  surface,
}) => {
  const lastSearchRef = useRef("");

  useEffect(() => {
    const term = String(search || "").trim();
    if (!token || term.length < 2) return undefined;

    const signature = `${surface}:${term.toLowerCase()}:${Number(resultCount || 0)}`;
    const timer = window.setTimeout(() => {
      if (lastSearchRef.current === signature) return;
      lastSearchRef.current = signature;
      api.trackProductSearch(
        { search_term: term, result_count: Number(resultCount || 0), surface },
        token
      ).catch(() => {});
    }, 900);

    return () => window.clearTimeout(timer);
  }, [resultCount, search, surface, token]);

  return useCallback(
    (product) => {
      const productId = Number(product?.id ?? product?.finished_good_id);
      if (!token || !Number.isInteger(productId) || productId <= 0) return;
      api.trackProductInterest(
        {
          finished_good_id: productId,
          search_term: String(search || "").trim() || undefined,
          surface,
        },
        token
      ).catch(() => {});
    },
    [search, surface, token]
  );
};
