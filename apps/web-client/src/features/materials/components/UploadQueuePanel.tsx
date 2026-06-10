import { CheckCircle2, Loader2, Pause, Play, Trash2, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../../lib/utils/cn';
import type { UploadQueueItem } from '../../../hooks/useUploadQueue';

type UploadQueuePanelProps = {
  items: UploadQueueItem[];
  uploadingCount: number;
  pendingCount: number;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
};

function getStatusIcon(status: UploadQueueItem['status']): JSX.Element {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-rose-400" />;
    case 'uploading':
      return <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />;
    case 'paused':
      return <Pause className="h-4 w-4 text-amber-400" />;
    default:
      return <Loader2 className="h-4 w-4 text-slate-500" />;
  }
}

export function UploadQueuePanel({
  items,
  uploadingCount,
  pendingCount,
  onPause,
  onResume,
  onRemove,
  onClearCompleted,
}: UploadQueuePanelProps): JSX.Element | null {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  const hasCompleted = items.some((i) => i.status === 'completed');

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-200 font-medium">{t('common.uploadQueue')}</span>
          <span className="text-xs text-slate-500">
            {t('common.uploadQueueCount', { count: items.length })}
            {uploadingCount > 0 && ` · ${t('common.uploadQueueUploading', { count: uploadingCount })}`}
            {pendingCount > 0 && ` · ${t('common.uploadQueueWaiting', { count: pendingCount })}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasCompleted && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200 hover:bg-slate-800"
            >
              {t('common.clearCompleted')}
            </button>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div className="max-h-[320px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 border-b border-slate-800/50 px-4 py-3 last:border-b-0"
          >
            <div className="flex-shrink-0">{getStatusIcon(item.status)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-200" title={item.fileName}>
                  {item.fileName}
                </span>
                <span className="flex-shrink-0 text-xs text-slate-500">
                  {formatBytes(item.fileSize)}
                </span>
              </div>

              {/* 进度条 */}
              {(item.status === 'uploading' || item.status === 'paused') && (
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>{item.status === 'paused' ? t('common.paused') : t('common.uploading')}</span>
                    <span>{item.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.status === 'paused'
                          ? 'bg-amber-500/60'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {item.status === 'completed' && (
                <div className="mt-0.5 text-[10px] text-emerald-400">{t('common.uploadCompleted')}</div>
              )}

              {/* AI 分析结果（图片上传时返回） */}
              {item.status === 'completed' && item.denseCaption && (
                <div className="mt-1.5 rounded-lg bg-slate-800/50 px-2 py-1.5">
                  <p className="text-xs leading-relaxed text-slate-300 line-clamp-3">{item.denseCaption}</p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-700/60 px-1.5 py-0.5 text-[10px] text-cyan-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {item.status === 'error' && (
                <div className="mt-0.5 truncate text-[10px] text-rose-400">
                  {item.error || t('common.uploadFailed')}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-shrink-0 items-center gap-1">
              {item.status === 'uploading' && (
                <button
                  type="button"
                  onClick={() => onPause(item.id)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:text-amber-400 hover:bg-slate-800"
                  title={t('common.pause')}
                >
                  <Pause className="h-4 w-4" />
                </button>
              )}
              {item.status === 'paused' && (
                <button
                  type="button"
                  onClick={() => onResume(item.id)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:text-emerald-400 hover:bg-slate-800"
                  title={t('common.resume')}
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
              {(item.status === 'paused' || item.status === 'error' || item.status === 'completed') && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="rounded-lg p-1 text-slate-500 transition-colors hover:text-rose-400 hover:bg-slate-800"
                  title={t('common.remove')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
