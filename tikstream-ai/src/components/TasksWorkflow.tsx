import React, { useState } from "react";
import { 
  RefreshCw, CheckCircle2, AlertCircle, Terminal, Play, 
  Loader2, Cpu, Calendar, Clock, Download 
} from "lucide-react";
import { CreationTask } from "../types";

interface TasksWorkflowProps {
  tasks: CreationTask[];
  onRetryTask: (taskId: string) => Promise<any>;
}

export default function TasksWorkflow({
  tasks,
  onRetryTask
}: TasksWorkflowProps) {
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "FINISHED":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Finished
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-450 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" /> {status.replace("_", " ")}
          </span>
        );
    }
  };

  const handleRetry = async (taskId: string) => {
    setRetryingId(taskId);
    try {
      await onRetryTask(taskId);
    } catch (e) {
      console.error(e);
      alert("Retrying compilation workspaces.");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-200">Ad Compilation Queue</h3>
        <p className="text-[11px] text-slate-500">Track current rendering statuses, trace output logs, and reload failed stitching jobs.</p>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-slate-900/10 border border-slate-800/40 rounded-3xl p-16 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900/60 border border-slate-800 mx-auto flex items-center justify-center text-slate-600">
            <Terminal className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-300">Rendering pipeline is hollow</p>
            <p className="text-xs text-slate-550 max-w-sm mx-auto">No video rendering jobs have been created yet. Head back to the 'Create Ad' console and click 'Compile Full Ad' to activate.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => {
            const isCompleted = task.status === "FINISHED";
            const isFailed = task.status === "FAILED";
            const isProcessing = !isCompleted && !isFailed;

            return (
              <div 
                key={task.id}
                className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-4 sm:p-5 space-y-5"
              >
                {/* Header metrics */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-bold font-mono">TASK ID: {task.id}</span>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-950 border border-slate-850 px-2 py-0.5 rounded">
                        script_ctx: {task.scriptId.slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(task.createdAt).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(task.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div>
                    {getStatusBadge(task.status)}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Progress and compile assets preview (5 cols) */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Cloud Compilation Progress</span>
                        <span className="text-emerald-400 font-mono font-bold">{task.progress}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                        <div 
                          className={`h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300`} 
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    {isCompleted && task.videoUrl ? (
                      <div className="space-y-2 animate-fadeIn">
                        <span className="text-[10px] text-slate-550 font-mono uppercase tracking-widest block">Render Output Clip</span>
                        <div className="aspect-video w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-850 relative group flex items-center justify-center">
                          <video 
                            src={task.videoUrl} 
                            controls 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <a 
                          href={task.videoUrl}
                          download={`TikStream_${task.id}.mp4`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-200 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 font-semibold transition-all mt-2.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Final ad (H.264 MP4)
                        </a>
                      </div>
                    ) : isFailed ? (
                      <div className="p-4 bg-rose-950/20 border border-rose-900/60 rounded-xl space-y-2">
                        <div className="flex gap-2 text-rose-450 text-xs font-semibold">
                          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                          <span>Pipeline Interruption Diagnostic</span>
                        </div>
                        <p className="text-[11px] text-rose-300 leading-normal">
                          {task.error || "FFmpeg exit 1 error code: audio-stitching boundary overlap in scene 2. Safe zone constraint failed."}
                        </p>
                        <button
                          onClick={() => handleRetry(task.id)}
                          disabled={retryingId === task.id}
                          className="mt-1 flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 rounded-lg text-[11px] font-bold transition-all"
                        >
                          {retryingId === task.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Re-execute pipeline workspace
                        </button>
                      </div>
                    ) : (
                      <div className="p-8 border border-dashed border-slate-800 bg-slate-900/20 rounded-xl flex flex-col items-center justify-center text-center space-y-2.5">
                        <Cpu className="w-7 h-7 text-cyan-400 animate-spin" />
                        <div>
                          <p className="text-xs text-slate-350 font-bold">Stitching media layers...</p>
                          <p className="text-[10px] text-slate-550 mt-1">Caching frames. Assembling TTS audio streams dynamically.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Complete Terminal compile trace output logs (7 cols) */}
                  <div className="lg:col-span-12 xl:col-span-7 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono font-bold">
                      <Terminal className="w-3.5 h-3.5 text-slate-500" /> Terminal Stitch log
                    </div>
                    <div className="h-64 overflow-y-auto bg-slate-950 border border-slate-850 p-4 rounded-xl font-mono text-[10px] text-slate-400 leading-relaxed space-y-1.5 scroll-smooth">
                      {task.logs.map((log, index) => {
                        const isLight = log.includes("[AI") || log.includes("FINISHED");
                        return (
                          <div 
                            key={index}
                            className={`${isLight ? 'text-emerald-400' : 'text-slate-450'} hover:bg-slate-900/50 p-0.5 rounded transition-all`}
                          >
                            <span className="text-slate-600 mr-2">»</span>
                            {log}
                          </div>
                        );
                      })}
                      {isProcessing && (
                        <div className="flex items-center gap-2 text-cyan-400 animate-pulse pt-1">
                          <span className="text-slate-600 mr-2">»</span>
                          <span>[Stitcher runtime] Processing compiling thread, stand by...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
