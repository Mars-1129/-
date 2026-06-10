import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Wifi, WifiOff, X } from 'lucide-react';
import { type NetworkStatus, useNetworkStatus } from '../../hooks/useNetworkStatus';

function getBarStyle(status: NetworkStatus): string {
  switch (status) {
    case 'offline':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
    case 'slow':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
    default:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
}

function getIcon(status: NetworkStatus): JSX.Element {
  switch (status) {
    case 'offline':
      return <WifiOff className="h-4 w-4" />;
    case 'slow':
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return <Wifi className="h-4 w-4" />;
  }
}

export function NetworkStatusBar(): JSX.Element | null {
  const { t } = useTranslation();
  const { status, effectiveType } = useNetworkStatus();
  const [dismissedRestored, setDismissedRestored] = useState(false);
  const [prevStatus, setPrevStatus] = useState<NetworkStatus>(status);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (prevStatus !== 'online' && status === 'online') {
      // 从离线/弱网恢复到在线，显示恢复提示
      setDismissedRestored(false);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 4000);
      setPrevStatus(status);
      return () => clearTimeout(timer);
    }
    setPrevStatus(status);
  }, [status, prevStatus]);

  // 在线且不是恢复提示，不显示
  if (status === 'online' && !showRestored) {
    return null;
  }

  // 恢复提示被手动关闭
  if (showRestored && dismissedRestored) {
    return null;
  }

  const barStyle = getBarStyle(showRestored ? 'online' : status);
  const icon = getIcon(showRestored ? 'online' : status);
  const message = showRestored
    ? t('common.networkRestored')
    : status === 'slow'
      ? `${t('common.networkSlow')} (${effectiveType ?? 'unknown'})`
      : status === 'offline'
        ? t('common.networkOffline')
        : t('common.networkRestored');

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2 text-center text-sm border-b ${barStyle}`}>
      <span className="flex-shrink-0">{icon}</span>
      <span>{message}</span>
      {showRestored && (
        <button
          type="button"
          onClick={() => setDismissedRestored(true)}
          className="ml-2 flex-shrink-0 rounded-lg p-0.5 transition-colors hover:bg-slate-800/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
