import type { Creation, TaskSummary } from '@tikstream/shared-types';
import { AlertCircle, Bell, CheckCircle2, Loader2, RefreshCw, Square, Terminal, Trash2, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { cancelCreation, getCreation, retryCreation } from '../../lib/api/creations';
import { getTask, listTasks, subscribeTaskEvents, softDeleteTask, restoreTask, permanentDeleteTask, batchSoftDeleteTasks, listTrashTasks, emptyTrash } from '../../lib/api/tasks';
import { cn, formatBytes, formatDateTime } from '../../lib/utils/cn';
import { TasksSkeleton } from '../../components/ui/content-skeleton';
import { BatchProgressPanel } from './components/BatchProgressPanel';
import { useTaskNotification } from '../../hooks/useTaskNotification';
import { AutoRetrySuggestion } from '../create/components/AutoRetrySuggestion';
import { useTranslation } from 'react-i18next';

type TaskLogEntry = {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'error';
  message: string;
};

/**
 * 日志消息高亮渲染 — 解析结构化文本并应用语法着色
 * - key: value → key 青色, value 白色
 * - 百分比数字 (42%) → 琥珀色
 * - 错误关键词 (failed, error, timeout) → 玫瑰色
 * - 时间/频率 (Hz, s, ms, fps) → 紫色
 */
function HighlightedLogMessage({ message }: { message: string }): JSX.Element {
  // 分割以 · |  等分隔符
  const parts = message.split(/(\s[·|]\s)/g);

  return (
    <>
      {parts.map((part, i) => {
        // 分隔符直接渲染
        if (/^\s[·|]\s$/.test(part)) {
          return <span key={i} className="text-slate-600">{part}</span>;
        }

        // 解析 key: value 模式
        const kvMatch = part.match(/^([\w\s]+):\s(.+)$/);
        if (kvMatch) {
          return (
            <span key={i}>
              <span className="text-cyan-400">{kvMatch[1]}</span>
              <span className="text-slate-500">: </span>
              <HighlightedValue value={kvMatch[2]} />
            </span>
          );
        }

        // 普通文本段也检查值高亮
        return <HighlightedValue key={i} value={part} />;
      })}
    </>
  );
}

function HighlightedValue({ value }: { value: string }): JSX.Element {
  // 高亮百分比
  if (/^\d{1,3}(\.\d+)?%$/.test(value.trim())) {
    return <span className="text-amber-400">{value}</span>;
  }
  // 高亮错误/异常关键词
  if (/\b(failed|error|timeout|refused|denied|crash)\b/i.test(value)) {
    return <span className="text-rose-400">{value}</span>;
  }
  // 高亮成功/完成关键词
  if (/\b(completed|finished|success|done|ready|resolved)\b/i.test(value)) {
    return <span className="text-emerald-400">{value}</span>;
  }
  // 高亮时间/频率单位
  if (/\b\d+(\.\d+)?\s?(s|ms|fps|Hz|MB|GB|KB)\b/i.test(value)) {
    return <span className="text-violet-400">{value}</span>;
  }
  // 高亮 JSON 键名模式（被引号包裹的短字符串）
  if (/(["'][^"']{1,30}["'])/g.test(value)) {
    const segments = value.split(/(["'][^"']{1,30}["'])/g);
    return (
      <>
        {segments.map((seg, i) =>
          /^["']/.test(seg) ? (
            <span key={i} className="text-yellow-400/80">{seg}</span>
          ) : (
            <span key={i}>{seg}</span>
          ),
        )}
      </>
    );
  }
  return <span>{value}</span>;
}

const STORAGE_PREFIX = 'tikstream-web-client:selected-task-id:';

function readPersistedTaskId(productId: string | null): string | null {
  if (typeof window === 'undefined' || !productId) {
    return null;
  }

  return window.localStorage.getItem(`${STORAGE_PREFIX}${productId}`);
}

function persistTaskId(productId: string | null, taskId: string | null): void {
  if (typeof window === 'undefined' || !productId) {
    return;
  }

  if (taskId) {
    window.localStorage.setItem(`${STORAGE_PREFIX}${productId}`, taskId);
    return;
  }

  window.localStorage.removeItem(`${STORAGE_PREFIX}${productId}`);
}

function isTerminalStatus(status: TaskSummary['status']): boolean {
  return status === 'FINISHED' || status === 'FAILED' || status === 'CANCELED';
}

function upsertTask(items: TaskSummary[], next: TaskSummary): TaskSummary[] {
  const existing = items.find((item) => item.task_id === next.task_id);
  if (!existing) {
    return [next, ...items];
  }

  return items.map((item) => (item.task_id === next.task_id ? next : item));
}

function getLogLevel(status: TaskSummary['status']): TaskLogEntry['level'] {
  if (status === 'FAILED' || status === 'CANCELED') {
    return 'error';
  }

  if (status === 'FINISHED') {
    return 'success';
  }

  return 'info';
}

function getStatusTone(status: TaskSummary['status']): string {
  if (status === 'FINISHED') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }

  if (status === 'FAILED' || status === 'CANCELED') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  }

  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
}

export function TasksPage(): JSX.Element {
  const { t } = useTranslation();
  const products = useWorkspaceStore((state) => state.products);
  const selectedProductId = useWorkspaceStore((state) => state.selectedProductId);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(readPersistedTaskId(selectedProductId));
  const [activeTask, setActiveTask] = useState<TaskSummary | null>(null);
  const [activeCreation, setActiveCreation] = useState<Creation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [logsByTaskId, setLogsByTaskId] = useState<Record<string, TaskLogEntry[]>>({});
  // 批量管理
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  // 回收站
  const [activeTab, setActiveTab] = useState<'all' | 'trash'>('all');
  const [trashTasks, setTrashTasks] = useState<TaskSummary[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const taskNotification = useTaskNotification();
  const notifyRef = useRef(taskNotification.notify);
  notifyRef.current = taskNotification.notify;
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;

  function appendLog(taskId: string, entry: TaskLogEntry): void {
    setLogsByTaskId((current) => {
      const existing = current[taskId] ?? [];
      if (existing.some((item) => item.id === entry.id)) {
        return current;
      }

      return {
        ...current,
        [taskId]: [entry, ...existing].slice(0, 120),
      };
    });
  }

  function syncTaskSnapshot(task: TaskSummary): void {
    setTasks((current) => upsertTask(current, task));
    setActiveTask((current) => (current?.task_id === task.task_id || current === null ? task : current));
    appendLog(task.task_id, {
      id: `${task.task_id}:${task.updated_at}:${task.status}:${task.progress}`,
      timestamp: task.updated_at,
      level: getLogLevel(task.status),
      message: `${task.current_stage} · ${task.progress}%${task.message ? ` · ${task.message}` : ''}`,
    });
  }

  useEffect(() => {
    setActiveTaskId(readPersistedTaskId(selectedProductId));
  }, [selectedProductId]);

  useEffect(() => {
    persistTaskId(selectedProductId, activeTaskId);
  }, [activeTaskId, selectedProductId]);

  useEffect(() => {
    const productId = selectedProductId;
    if (!productId) {
      setTasks([]);
      setActiveTaskId(null);
      setActiveTask(null);
      setActiveCreation(null);
      return;
    }

    let cancelled = false;
    setTasksLoading(true);
    setTasksError(null);

    void listTasks({ product_id: productId, page: 1, page_size: 30 })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setTasks(response.items);
        const persistedTaskId = readPersistedTaskId(productId);
        const nextTaskId =
          persistedTaskId && response.items.some((item) => item.task_id === persistedTaskId)
            ? persistedTaskId
            : response.items[0]?.task_id ?? null;
        setActiveTaskId(nextTaskId);
      })
      .catch((error) => {
        if (!cancelled) {
          setTasksError(error instanceof Error ? error.message : t('task.listLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTasksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  useEffect(() => {
    const taskId = activeTaskId;
    if (!taskId) {
      setActiveTask(null);
      setActiveCreation(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    void getTask(taskId)
      .then(async (task) => {
        if (cancelled) {
          return;
        }

        syncTaskSnapshot(task);
        const creation = await getCreation(task.biz_id);
        if (!cancelled) {
          setActiveCreation(creation);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : t('task.detailLoadFailed'));
          setActiveTask(null);
          setActiveCreation(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTaskId]);

  useEffect(() => {
    if (!activeTaskId) {
      return;
    }

    const currentTask = activeTaskRef.current;
    if (!currentTask || currentTask.task_id !== activeTaskId || isTerminalStatus(currentTask.status)) {
      return;
    }

    return subscribeTaskEvents(activeTaskId, {
      onEvent: (event) => {
        const latestTask = activeTaskRef.current;
        if (!latestTask || latestTask.task_id !== event.payload.task_id) {
          return;
        }

        // 后台进度通知
        if (event.type === 'task.completed') {
          notifyRef.current({ title: t('task.completedTitle'), body: t('task.completedNotification', { taskId: latestTask.task_id }) });
        } else if (event.type === 'task.failed') {
          notifyRef.current({ title: t('task.failedTitle'), body: `${latestTask.task_id}: ${event.payload.message || t('task.executionFailed')}` });
        }

        const nextTask: TaskSummary = {
          task_id: event.payload.task_id,
          biz_type: latestTask.biz_type,
          biz_id: latestTask.biz_id,
          status: event.payload.status,
          current_stage: event.payload.current_stage,
          progress: event.payload.progress,
          message: event.payload.message,
          trace_id: event.payload.trace_id,
          created_at: latestTask.created_at,
          updated_at: event.payload.timestamp,
        };

        syncTaskSnapshot(nextTask);
        appendLog(nextTask.task_id, {
          id: `${event.type}:${event.payload.timestamp}`,
          timestamp: event.payload.timestamp,
          level: nextTask.status === 'FINISHED' ? 'success' : nextTask.status === 'FAILED' ? 'error' : 'info',
          message: `${event.type} · ${event.payload.message}`,
        });

        void getCreation(latestTask.biz_id)
          .then((creation) => {
            setActiveCreation(creation);
          })
          .catch((err) => {
            console.warn(`[TasksPage] getCreation 失败: ${(err as Error)?.message || err}`);
          });
      },
      onError: () => {
        // EventSource will auto-reconnect; log for diagnostics
        console.warn('[TasksPage] SSE connection error for task', activeTaskId);
      },
    });
  // activeTaskRef 已在每次渲染时同步最新值，onEvent 中通过 ref 读取保证无 stale closure
  }, [activeTaskId]);

  async function handleCancel(): Promise<void> {
    if (!activeTask) {
      return;
    }

    setCancelBusy(true);
    setActionError(null);
    setActionMessage(null);

    try {
      await cancelCreation(activeTask.biz_id);
      const [task, creation] = await Promise.all([getTask(activeTask.task_id), getCreation(activeTask.biz_id)]);
      syncTaskSnapshot(task);
      setActiveCreation(creation);
      setActionMessage(t('task.taskCanceled', { taskId: activeTask.task_id }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('task.cancelFailed'));
    } finally {
      setCancelBusy(false);
    }
  }

  async function handleRetry(): Promise<void> {
    if (!activeTask) {
      return;
    }

    setRetryBusy(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await retryCreation(activeTask.biz_id);
      const [task, creation] = await Promise.all([getTask(result.task_id), getCreation(result.creation_id)]);
      syncTaskSnapshot(task);
      setActiveCreation(creation);
      setActiveTaskId(result.task_id);
      setActionMessage(t('task.taskRetried', { taskId: result.task_id }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('task.retryFailed'));
    } finally {
      setRetryBusy(false);
    }
  }

  // ========== 批量操作 ==========

  function toggleTaskSelect(taskId: string): void {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function selectAllTasks(): void {
    setSelectedTaskIds(new Set(tasks.map((t) => t.task_id)));
  }

  function deselectAllTasks(): void {
    setSelectedTaskIds(new Set());
  }

  async function handleBatchCancel(): Promise<void> {
    if (selectedTaskIds.size === 0) return;
    setBatchBusy(true);
    setBatchMessage(null);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const taskId of selectedTaskIds) {
        const task = tasks.find((t) => t.task_id === taskId);
        if (!task || task.status === 'FINISHED' || task.status === 'FAILED' || task.status === 'CANCELED') {
          continue;
        }
        try {
          await cancelCreation(task.biz_id);
          successCount++;
          // Refresh task state
          try {
            const updated = await getTask(task.task_id);
            syncTaskSnapshot(updated);
          } catch { /* ignore */ }
        } catch {
          failCount++;
        }
      }
      setBatchMessage(t('task.batchCancelResult', { success: successCount, fail: failCount }));
      setSelectedTaskIds(new Set());
    } catch {
      setBatchMessage(t('task.batchCancelException'));
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleBatchRetry(): Promise<void> {
    if (selectedTaskIds.size === 0) return;
    setBatchBusy(true);
    setBatchMessage(null);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const taskId of selectedTaskIds) {
        const task = tasks.find((t) => t.task_id === taskId);
        if (!task || (task.status !== 'FAILED' && task.status !== 'CANCELED')) {
          continue;
        }
        try {
          await retryCreation(task.biz_id);
          successCount++;
          try {
            const updated = await getTask(task.task_id);
            syncTaskSnapshot(updated);
          } catch { /* ignore */ }
        } catch {
          failCount++;
        }
      }
      setBatchMessage(t('task.batchRetryResult', { success: successCount, fail: failCount }));
      setSelectedTaskIds(new Set());
    } catch {
      setBatchMessage(t('task.batchRetryException'));
    } finally {
      setBatchBusy(false);
    }
  }

  // ========== 删除/回收站操作 ==========

  async function handleDelete(task: TaskSummary): Promise<void> {
    setDeleteBusy(true);
    try {
      await softDeleteTask(task.task_id);
      setActionMessage(t('task.movedToTrash', { taskId: task.task_id }));
      // 刷新列表
      if (selectedProductId) {
        const response = await listTasks({ product_id: selectedProductId, page: 1, page_size: 30 });
        setTasks(response.items);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('task.deleteFailed'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleRestore(task: TaskSummary): Promise<void> {
    setDeleteBusy(true);
    try {
      await restoreTask(task.task_id);
      setActionMessage(t('task.taskRestored', { taskId: task.task_id }));
      await loadTrashTasks();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('task.restoreFailed'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handlePermanentDelete(task: TaskSummary): Promise<void> {
    setDeleteBusy(true);
    try {
      await permanentDeleteTask(task.task_id);
      setActionMessage(t('task.taskPermanentlyDeleted', { taskId: task.task_id }));
      await loadTrashTasks();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('task.permanentDeleteFailed'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleBatchDelete(): Promise<void> {
    if (selectedTaskIds.size === 0) return;
    setBatchBusy(true);
    setBatchMessage(null);
    try {
      const result = await batchSoftDeleteTasks(Array.from(selectedTaskIds));
      const msg = `成功删除 ${result.deleted_count} 个` + (result.skipped_count > 0 ? `，${result.skipped_count} 个跳过（处理中或不存在）` : '');
      setBatchMessage(msg);
      setSelectedTaskIds(new Set());
      if (selectedProductId) {
        const response = await listTasks({ product_id: selectedProductId, page: 1, page_size: 30 });
        setTasks(response.items);
      }
    } catch {
      setBatchMessage(t('task.batchDeleteException'));
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleEmptyTrash(): Promise<void> {
    setDeleteBusy(true);
    try {
      const result = await emptyTrash(selectedProductId ?? undefined);
      setActionMessage(t('task.trashEmptied', { count: result.deleted_count }));
      setTrashTasks([]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('task.emptyTrashFailed'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function loadTrashTasks(): Promise<void> {
    if (!selectedProductId) return;
    setTrashLoading(true);
    try {
      const response = await listTrashTasks({ product_id: selectedProductId, page: 1, page_size: 30 });
      setTrashTasks(response.items);
    } catch {
      setTrashTasks([]);
    } finally {
      setTrashLoading(false);
    }
  }

  // 加载回收站数据
  useEffect(() => {
    if (activeTab === 'trash' && selectedProductId) {
      void loadTrashTasks();
    }
  }, [activeTab, selectedProductId]);

  const activeLogs = activeTask ? logsByTaskId[activeTask.task_id] ?? [] : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('task.taskHistory')}</CardTitle>
          <CardDescription>{t('task.taskHistoryDesc')}</CardDescription>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as 'all' | 'trash'); setIsSelectMode(false); setSelectedTaskIds(new Set()); }}>
            <TabsList>
              <TabsTrigger value="all">{t('task.all')}</TabsTrigger>
              <TabsTrigger value="trash">{t('task.trash')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-slate-200">
            {`${t('task.currentProduct')}${selectedProduct?.title ?? t('task.selectProductFirst')}`}
          </div>
          {tasksError ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">{tasksError}</div> : null}
          {detailError ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">{detailError}</div> : null}
          {actionError ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">{actionError}</div> : null}
          {actionMessage ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200">{actionMessage}</div> : null}
          {batchMessage ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{batchMessage}</div> : null}
          {taskNotification.permission !== 'granted' && (
            <button
              type="button"
              onClick={() => void taskNotification.requestPermission()}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-200 hover:bg-slate-800"
            >
              <Bell className="h-3.5 w-3.5" />
              {t('task.enableNotification')}
            </button>
          )}
          <BatchProgressPanel tasks={tasks} selectedTaskIds={selectedTaskIds} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        {tasksLoading && tasks.length === 0 ? (
          <div className="xl:col-span-2"><TasksSkeleton /></div>
        ) : (
          <>
          <Card className="border-slate-800 bg-slate-950/70">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{t('task.list')}</CardTitle>
                <CardDescription>{tasksLoading ? t('task.loadingTaskList') : t('task.taskRecords', { count: tasks.length })}</CardDescription>
              </div>
              <div className="flex gap-1">
                {isSelectMode ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={selectAllTasks}>
                      {t('common.selectAll')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={deselectAllTasks}>
                      {t('common.cancel')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setIsSelectMode(false); setSelectedTaskIds(new Set()); }}>
                      {t('task.exitSelect')}
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setIsSelectMode(true)} disabled={tasks.length === 0}>
                    {t('task.batchSelectBtn')}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 批量操作消息 */}
            {batchMessage && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{batchMessage}</div>
            )}
            {activeTab === 'trash' ? (
              // ========== 回收站列表 ==========
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">{trashLoading ? t('common.loading') : t('task.trashLoadCount', { count: trashTasks.length })}</span>
                  {trashTasks.length > 0 && (
                    <Button variant="destructive" size="sm" onClick={() => { if (window.confirm(t('task.emptyTrashConfirm'))) { void handleEmptyTrash(); } }} disabled={deleteBusy}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t('task.emptyTrash')}
                    </Button>
                  )}
                </div>
                {trashTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">{t('task.trashEmpty')}</div>
                ) : (
                  trashTasks.map((task) => (
                    <div key={task.task_id} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium text-slate-300">{task.task_id}</span>
                            <span className="text-slate-500">{formatDateTime(task.deleted_at ?? task.updated_at)}</span>
                          </div>
                          <div className="mt-2 text-sm text-slate-400">{task.status} · {task.current_stage}</div>
                          <div className="mt-1 text-xs text-slate-500">删除时间：{formatDateTime(task.deleted_at ?? task.updated_at)}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => handleRestore(task)} disabled={deleteBusy}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />{t('task.restoreBtn')}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => { if (window.confirm(t('task.permanentDeleteConfirm', { id: task.task_id }))) { void handlePermanentDelete(task); } }} disabled={deleteBusy}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            ) : (
              // ========== 全部任务列表 ==========
              <>
            {tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">{t('task.noTasksYet')}</div>
            ) : (
              tasks.map((task) => {
                const isSelected = selectedTaskIds.has(task.task_id);
                return (
                  <button
                    key={task.task_id}
                    type="button"
                    onClick={() => {
                      if (isSelectMode) {
                        toggleTaskSelect(task.task_id);
                      } else {
                        setActiveTaskId(task.task_id);
                      }
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      task.task_id === activeTaskId && !isSelectMode
                        ? 'border-cyan-400/60 bg-slate-900 text-slate-100'
                        : isSelected && isSelectMode
                          ? 'border-cyan-500 bg-cyan-500/10 text-slate-100'
                          : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isSelectMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => { e.stopPropagation(); toggleTaskSelect(task.task_id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium">{task.task_id}</span>
                          <span>{task.progress}%</span>
                        </div>
                        <div className="mt-2 text-sm font-medium">{task.status} · {task.current_stage}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(task.updated_at)}</div>
                      </div>
                      {!isSelectMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                          disabled={deleteBusy || task.status === 'PROCESSING' || task.status === 'PENDING'}
                          onClick={(e) => { e.stopPropagation(); void handleDelete(task); }}
                          title={task.status === 'PROCESSING' || task.status === 'PENDING' ? t('task.processingWarning') : t('task.moveToTrash')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </button>
                );
              })
            )}

            {/* 批量操作浮动栏 */}
            {isSelectMode && selectedTaskIds.size > 0 && (
              <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-700 bg-slate-900 px-6 py-3 shadow-lg">
                <span className="text-sm text-slate-300">{t('task.selectedCount', { count: selectedTaskIds.size })}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleBatchCancel()}
                  disabled={batchBusy}
                >
                  {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  {t('task.batchCancelBtn')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleBatchRetry()}
                  disabled={batchBusy}
                >
                  {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('task.batchRetryBtn')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleBatchDelete()}
                  disabled={batchBusy}
                >
                  {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t('task.batchDeleteBtn')}
                </Button>
              </div>
            )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-800 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-base">{t('task.taskDetail')}</CardTitle>
              <CardDescription>{activeTask ? `task ${activeTask.task_id}` : t('task.selectTaskFromLeft')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailLoading ? (
                <div className="flex items-center rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-10 text-slate-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t('task.loadingTaskDetail')}
                </div>
              ) : !activeTask ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
                  {t('task.noTaskSelected')}
                </div>
              ) : (
                <>
                  <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(activeTask.status)}`}>
                    {activeTask.status} · {activeTask.current_stage}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{t('task.progress')}</span>
                      <span>{activeTask.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                      <div className="h-full bg-cyan-400 transition-all" style={{ width: `${activeTask.progress}%` }} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 text-sm text-slate-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">{t('task.createdTime')}{formatDateTime(activeTask.created_at)}</div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">{t('task.updatedTime')}{formatDateTime(activeTask.updated_at)}</div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">creation_id：{activeTask.biz_id}</div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">trace_id：{activeTask.trace_id ?? '--'}</div>
                  </div>
                  {activeTask.message ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
                      {t('task.latestMessage')}{activeTask.message}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => void handleCancel()}
                      disabled={cancelBusy || activeTask.status === 'FINISHED' || activeTask.status === 'FAILED' || activeTask.status === 'CANCELED'}
                    >
                      {cancelBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                      {t('task.cancelTaskBtn')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void handleRetry()}
                      disabled={retryBusy || (activeTask.status !== 'FAILED' && activeTask.status !== 'CANCELED')}
                    >
                      {retryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {t('task.retryAfterFail')}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-base">{t('task.outputResult')}</CardTitle>
              <CardDescription>{activeCreation ? `creation ${activeCreation.creation_id}` : t('task.waitingForTask')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!activeCreation ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
                  {t('task.noOutput')}
                </div>
              ) : activeCreation.video_url ? (
                <>
                  <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
                    <video
                      src={activeCreation.video_url}
                      controls
                      className="w-full bg-black object-contain"
                      style={{
                        aspectRatio: activeCreation.target_resolution === '1920x1080'
                          ? '16/9'
                          : activeCreation.target_resolution === '1080x1080'
                            ? '1/1'
                            : '9/16',
                        maxHeight: '75vh',
                      }}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 text-sm text-slate-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">{t('task.fileSizeLabel')}{formatBytes(activeCreation.file_size_bytes)}</div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">{t('task.finishedTime')}{formatDateTime(activeCreation.finished_at)}</div>
                  </div>
                  <a
                    href={activeCreation.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
                  >
                    {t('task.openExport')}
                  </a>
                </>
              ) : activeTask && activeTask.status === 'FAILED' ? (
                <AutoRetrySuggestion
                  guidance={{
                    label: activeCreation?.error_message ?? activeTask.message ?? '任务执行失败',
                    suggestion: '请检查错误信息后重试',
                    retryable: true,
                    autoFix: { action: 'retry', actionLabel: '重试任务' },
                  }}
                  errorMessage={activeCreation?.error_message ?? activeTask.message ?? undefined}
                  onRetry={() => handleRetry()}
                />
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
                  {t('task.outputPending')}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-base">{t('task.taskLog')}</CardTitle>
              <CardDescription>{t('task.taskLogDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[360px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/90 p-4 font-mono text-xs">
                {activeLogs.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    <Terminal className="mr-2 h-4 w-4" />
                    {t('task.noLogEvents')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeLogs.map((entry) => (
                      <div key={entry.id} className={cn(
                        'rounded-xl border px-3 py-2 transition-colors',
                        entry.level === 'error'
                          ? 'border-rose-500/20 bg-rose-500/5'
                          : entry.level === 'success'
                            ? 'border-emerald-500/20 bg-emerald-500/5'
                            : 'border-slate-800 bg-slate-950/70',
                      )}>
                        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                          {entry.level === 'success' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          ) : entry.level === 'error' ? (
                            <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                          ) : (
                            <Loader2 className="h-3.5 w-3.5 text-cyan-400" />
                          )}
                          {formatDateTime(entry.timestamp)}
                        </div>
                        <div className={cn(
                          'font-mono text-xs leading-relaxed',
                          entry.level === 'error' ? 'text-rose-200' : entry.level === 'success' ? 'text-emerald-200' : 'text-slate-200',
                        )}>
                          <HighlightedLogMessage message={entry.message} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
