import { useEffect } from "react";

const DATA_REFRESH_EVENT = "store-management:data-refresh";

export const announceDataRefresh = (source) => {
  window.dispatchEvent(new CustomEvent(DATA_REFRESH_EVENT, { detail: { source } }));
};

export const useDataRefresh = (refresh, source) => {
  useEffect(() => {
    const listener = (event) => {
      if (source && event.detail?.source === source) return;
      refresh().catch(console.error);
    };

    window.addEventListener(DATA_REFRESH_EVENT, listener);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, listener);
  }, [refresh, source]);
};
