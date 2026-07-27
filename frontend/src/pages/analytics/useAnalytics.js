import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";

export default function useAnalytics(token) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dataByTab, setDataByTab] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadTab = useCallback(async () => {
    if (activeTab === "products") {
      setLoading(false);
      setError("");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const result = await api.getAnalytics(activeTab, token);
      setDataByTab((current) => ({ ...current, [activeTab]: result.data || {} }));
    } catch (err) {
      setError(err.message || "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, token]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  return {
    activeTab,
    setActiveTab,
    activeData: dataByTab[activeTab],
    loading,
    error,
    loadTab,
  };
}
