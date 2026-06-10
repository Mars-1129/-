import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, AlertCircle, Loader2, XCircle } from 'lucide-react';
import type { TaskSummary } from '@tikstream/shared-types';

type BatchProgressPanelProps = {
  tasks: TaskSummary[];
  selectedTaskIds: Set<string>;
};

function countByStatus(tasks: TaskSummary[]) {
  let finished = 0;
  let failed = 0;
  let canceled = 0;
  let processing = 0;
  let pending = 0;

  for (const task of tasks) {
    switch (task.status) {
      case 'FINISHED':
        finished++;
        break;
      case 'FAILED':
        failed++;
        break;
      case 'CANCELED':
        canceled++;
        break;
      case 'PROCESSING':
        processing++;
        break;
      default:
        pending++;
        break;
    }
  }

  return { finished, failed, canceled, processing, pending };
}

function computeAggregateProgress(tasks: TaskSummary[]): number {
  if (tasks.length === 0) return 0;
  const sum = tasks.reduce((acc, t) => acc + (t.progress || 0), 0);
  return Math.round(sum / tasks.length);
}

export function BatchProgressPanel({ tasks, selectedTaskIds }: BatchProgressPanelProps): JSX.Element {
  const { t } = useTranslation();
  const selectedTasks = useMemo(
    () => tasks.filter((t) => selectedTaskIds.has(t.task_id)),
    [tasks, selectedTaskIds],
  );

  if (selectedTasks.length === 0) return <></>;

  const stats = countByStatus(selectedTasks);
  const total = selectedTasks.length;
  const aggregateProgress = computeAggregateProgress(selectedTasks);

  const hasActive = stats.processing > 0 || stats.pending > 0;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-100">
          {t('tasks.batchProgress')} · {t('tasks.batchProgressCount', { count: total })}
        </span>
        {hasActive && (
          <span className="flex items-center gap-1 text-xs text-cyan-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('tasks.activeCount', { count: stats.processing + stats.pending })}
          </span>
        )}
      </div>

      {/* 聚合进度条 */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>{t('tasks.overallProgress')}</span>
          <span>{aggregateProgress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
            style={{ width: `${aggregateProgress}%` }}
          />
        </div>
      </div>

      {/* 状态统计 */}
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col items-center rounded-xl bg-slate-900/60 p-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 mb-1" />
          <span className="text-lg font-bold text-emerald-400">{stats.finished}</span>
          <span className="text-[10px] text-slate-500">{t('common.completed')}</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-slate-900/60 p-2">
          <Clock className="h-4 w-4 text-cyan-400 mb-1" />
          <span className="text-lg font-bold text-cyan-400">{stats.processing + stats.pending}</span>
          <span className="text-[10px] text-slate-500">{t('common.inProgress')}</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-slate-900/60 p-2">
          <AlertCircle className="h-4 w-4 text-rose-400 mb-1" />
          <span className="text-lg font-bold text-rose-400">{stats.failed}</span>
          <span className="text-[10px] text-slate-500">{t('common.failed')}</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-slate-900/60 p-2">
          <XCircle className="h-4 w-4 text-slate-500 mb-1" />
          <span className="text-lg font-bold text-slate-400">{stats.canceled}</span>
          <span className="text-[10px] text-slate-500">{t('common.canceled')}</span>
        </div>
      </div>

      {/* 内联任务进度列表 */}
      {selectedTasks.length <= 8 && (
        <div className="mt-3 space-y-1.5">
          {selectedTasks.map((task) => (
            <div key={task.task_id} className="flex items-center gap-2 text-xs">
              <span className="w-20 truncate text-slate-500">{task.task_id.slice(0, 8)}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    task.status === 'FINISHED' ? 'bg-emerald-400' :
                    task.status === 'FAILED' ? 'bg-rose-400' :
                    'bg-cyan-400'
                  }`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <span className={`w-8 text-right ${
                task.status === 'FINISHED' ? 'text-emerald-400' :
                task.status === 'FAILED' ? 'text-rose-400' :
                'text-slate-400'
              }`}>{task.progress}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
