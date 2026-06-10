import { useState, useEffect, useCallback } from 'react';
import { listCreations } from '../../../lib/api/creations';
import type { Creation } from '@tikstream/shared-types';

interface UseProductionDataResult {
  creations: Creation[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProductionData(productId: string | undefined): UseProductionDataResult {
  const [creations, setCreations] = useState<Creation[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!productId) {
      setCreations([]);
      setTotalCount(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    listCreations({ product_id: productId, limit: 20 })
      .then((res) => {
        if (cancelled) return;
        setCreations(res.items);
        setTotalCount(res.page_info.total_count);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load production data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [productId, refreshKey]);

  return { creations, totalCount, loading, error, refresh };
}
