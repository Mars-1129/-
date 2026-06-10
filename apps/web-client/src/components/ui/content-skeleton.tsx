import { Skeleton } from './skeleton';

// =============================================================================
// 素材工作台骨架屏
// =============================================================================

export function MaterialListSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
          <Skeleton className="h-16 w-16 flex-shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
            <div className="flex gap-x-4 gap-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MaterialDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60">
        <Skeleton className="aspect-video w-full rounded-none" />
        <div className="space-y-4 p-5">
          <Skeleton className="h-5 w-2/3" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-24 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// 剧本编辑器骨架屏
// =============================================================================

export function ScriptListSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="mt-3 flex gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScriptDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40 rounded-xl" />
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 rounded-2xl border border-slate-800 bg-slate-950/60 p-3" style={{ width: 160 }}>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-12 ml-auto" />
            </div>
            <Skeleton className="mt-3 h-20 w-full rounded-xl" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  );
}

// =============================================================================
// 创作工作台骨架屏
// =============================================================================

export function CreationSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-4 lg:grid-cols-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
          </div>
          <Skeleton className="h-14 rounded-2xl" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 分析看板骨架屏
// =============================================================================

export function AnalyticsSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-16 rounded-xl" />
        </div>
        <div className="flex gap-1 rounded-xl bg-slate-900 p-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 flex-1 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

// =============================================================================
// 模板市场骨架屏
// =============================================================================

export function TemplatesSkeleton(): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <Skeleton className="h-1 w-full rounded-full" />
          <div className="mt-3 flex items-center gap-1.5">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-14 rounded-full" />
            <Skeleton className="h-4 w-8 rounded-full ml-auto" />
          </div>
          <Skeleton className="mt-3 h-5 w-3/4" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <div className="mt-4 flex items-center justify-between border-t border-slate-800/50 pt-3">
            <Skeleton className="h-4 w-12 rounded-full" />
            <div className="flex gap-1">
              <Skeleton className="h-7 w-14 rounded-lg" />
              <Skeleton className="h-7 w-14 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// 任务历史骨架屏
// =============================================================================

export function TasksSkeleton(): JSX.Element {
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-1 h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <Skeleton className="h-[360px] rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
