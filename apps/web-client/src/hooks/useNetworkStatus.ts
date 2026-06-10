import { useCallback, useEffect, useState } from 'react';

export type NetworkStatus = 'online' | 'offline' | 'slow';

type UseNetworkStatusReturn = {
  status: NetworkStatus;
  effectiveType: string | null;
};

function getEffectiveType(): string | null {
  if (typeof navigator === 'undefined') return null;

  const conn =
    (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;

  return conn?.effectiveType ?? null;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [effectiveType, setEffectiveType] = useState<string | null>(getEffectiveType());

  const handleOnline = useCallback(() => setOnline(true), []);
  const handleOffline = useCallback(() => setOnline(false), []);

  const handleConnectionChange = useCallback(() => {
    setEffectiveType(getEffectiveType());
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const conn =
      (navigator as Navigator & { connection?: { effectiveType?: string; addEventListener?: (type: string, cb: () => void) => void; removeEventListener?: (type: string, cb: () => void) => void } }).connection;

    if (conn?.addEventListener) {
      conn.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (conn?.removeEventListener) {
        conn.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [handleOnline, handleOffline, handleConnectionChange]);

  const status: NetworkStatus = !online
    ? 'offline'
    : effectiveType && (effectiveType === 'slow-2g' || effectiveType === '2g')
      ? 'slow'
      : 'online';

  return { status, effectiveType };
}
