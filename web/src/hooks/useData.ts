import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export function useData<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api.get<T>(path)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(load, [load]);
  return { data, loading, error, reload: load, setData };
}
