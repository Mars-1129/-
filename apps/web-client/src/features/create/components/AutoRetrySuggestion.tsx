import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw, Wand2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';

export type ErrorGuidance = {
  label: string;
  suggestion: string;
  retryable: boolean;
  autoFix?: {
    action: 'retry' | 'retry_delayed';
    delayMs?: number;
    actionLabel: string;
  };
};

type AutoRetrySuggestionProps = {
  guidance: ErrorGuidance;
  errorMessage?: string;
  onRetry: () => Promise<void>;
  /** 外部可选的额外操作，如跳转到素材页 */
  extraAction?: { label: string; onClick: () => void };
};

export function AutoRetrySuggestion({
  guidance,
  errorMessage,
  onRetry,
  extraAction,
}: AutoRetrySuggestionProps): JSX.Element {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  async function handleAutoRetry(): Promise<void> {
    setBusy(true);
    setResultMessage(null);
    setResultError(null);

    const delayMs = guidance.autoFix?.delayMs ?? 0;
    if (delayMs > 0) {
      setResultMessage(t('creation.retryCountdown', { n: Math.round(delayMs / 1000) }));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      await onRetry();
      setResultMessage(guidance.autoFix?.actionLabel
        ? `${guidance.autoFix.actionLabel}${t('common.success')}`
        : t('creation.retrySuccessMsg'));
    } catch (error) {
      setResultError(error instanceof Error ? error.message : t('creation.retryFailMsg'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 rounded-full bg-rose-500/20 p-1">
          <AlertCircle className="h-4 w-4 text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-rose-200">{guidance.label}</div>
          {errorMessage && (
            <div className="mt-1 text-xs text-rose-300/70 truncate">{errorMessage}</div>
          )}
          <div className="mt-2 text-slate-400">{guidance.suggestion}</div>

          {/* 操作按钮 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {guidance.retryable && guidance.autoFix && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleAutoRetry()}
                disabled={busy}
              >
                {busy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {guidance.autoFix.actionLabel || t('creation.autoFixBtn')}
              </Button>
            )}
            {extraAction && (
              <Button variant="ghost" size="sm" onClick={extraAction.onClick}>
                {extraAction.label}
              </Button>
            )}
          </div>

          {resultMessage && (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {resultMessage}
            </div>
          )}
          {resultError && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {resultError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
