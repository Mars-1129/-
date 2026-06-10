/**
 * 分阶段进度反馈组件
 * 用于 SSE 流式生成 / 轮询等异步操作的进度展示
 *
 * Props:
 *   stages       — 阶段名称列表 (如 ["分析素材", "生成剧本", "合成视频"])
 *   currentStage — 当前所在阶段索引
 *   progress     — 当前阶段内进度 (0–100)
 *   message      — 当前阶段描述文字
 */

import { CheckCircle2, Loader2, Circle } from 'lucide-react';
import { cn } from '../../lib/utils/cn';

export type GenerationProgressProps = {
  stages: string[];
  currentStage: number;
  progress?: number;
  message?: string;
  className?: string;
};

export function GenerationProgress({
  stages,
  currentStage,
  progress,
  message,
  className,
}: GenerationProgressProps): JSX.Element {
  return (
    <div className={cn('rounded-2xl border border-slate-800 bg-slate-950/70 p-6', className)}>
      {/* 阶段步骤条 */}
      <div className="flex items-center gap-2">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStage;
          const isActive = index === currentStage;
          const isPending = index > currentStage;

          return (
            <div key={stage} className="flex items-center gap-2 flex-1 last:flex-none">
              {/* 阶段指示器 */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                    isCompleted && 'border-emerald-500 bg-emerald-500/20 text-emerald-400',
                    isActive && 'border-cyan-500 bg-cyan-500/20 text-cyan-400',
                    isPending && 'border-slate-700 bg-slate-900 text-slate-600',
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>
                <span
                  className={cn(
                    'mt-1.5 text-[10px] text-center leading-tight max-w-[72px]',
                    isActive && 'text-cyan-300 font-medium',
                    isCompleted && 'text-emerald-300',
                    isPending && 'text-slate-600',
                  )}
                >
                  {stage}
                </span>
              </div>

              {/* 连接线 */}
              {index < stages.length - 1 && (
                <div className="flex-1 h-px mb-6">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      isCompleted ? 'bg-emerald-500/60' : 'bg-slate-800',
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 进度条 + 描述 */}
      {progress != null && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{message ?? stages[currentStage]}</span>
            <span className="text-slate-500 font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}

      {progress == null && message && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
          {message}
        </div>
      )}
    </div>
  );
}
