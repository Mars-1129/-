import React from "react";
import { Compass, BookOpen, Clock, Tag, Sparkles, ArrowRight } from "lucide-react";
import { TemplateStyle } from "../types";

interface TemplatesWorkflowProps {
  templates: TemplateStyle[];
  activeTemplateId: string;
  onApplyTemplate: (templateId: string) => void;
}

export default function TemplatesWorkflow({
  templates,
  activeTemplateId,
  onApplyTemplate
}: TemplatesWorkflowProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-200">Formulaic Copywriting Library</h3>
          <p className="text-[11px] text-slate-500">Industry-proven conversion framework presets that enforce structured script formatting automatically.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 px-3 py-1 rounded-full shrink-0">
          <Compass className="w-3.5 h-3.5 animate-spin-slow" />
          <span>High-CTR Hook Formulas</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {templates.map((temp) => {
          const isActive = activeTemplateId === temp.id;
          return (
            <div 
              key={temp.id}
              className={`p-5 rounded-3xl border text-left flex flex-col justify-between space-y-5 transition-all relative overflow-hidden group ${
                isActive 
                  ? "border-emerald-500/30 bg-slate-900/80 shadow-lg shadow-emerald-500/5 shadow-inner" 
                  : "border-slate-800/60 bg-slate-905/15 hover:border-slate-705/80 hover:bg-slate-900/25"
              }`}
            >
              {/* Highlight ribbon */}
              {isActive && (
                <div className="absolute right-0 top-0 h-16 w-16 bg-gradient-to-br from-emerald-400 to-cyan-400 opacity-20 blur-xl"></div>
              )}

              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">{temp.name}</h4>
                    <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest block font-medium">Formula Standard</span>
                  </div>
                  {isActive && (
                    <span className="text-[9px] font-mono text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-full font-bold">
                      ACTIVE FORMULA
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-350 leading-relaxed font-sans font-medium line-clamp-3">
                  {temp.description}
                </p>

                {/* Timeline split guide */}
                <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-850/60 space-y-1.5 font-mono text-[9.5px] leading-relaxed shadow-inner">
                  <span className="text-slate-500 font-bold uppercase tracking-wider block">⏱️ 15s Timeline Split:</span>
                  <p className="text-slate-355 leading-normal">{temp.formula}</p>
                </div>

                {/* Style tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {temp.tags.map((tag, idx) => (
                    <span 
                      key={idx}
                      className="text-[9.5px] font-mono px-2 py-0.5 bg-slate-950/40 text-slate-450 rounded-md border border-slate-850/50"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  onApplyTemplate(temp.id);
                  alert(`Template style '${temp.name}' applied beautifully! Access 'AI Script generator' to write your script.`);
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isActive 
                    ? "bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-350 hover:to-cyan-400 text-slate-905 shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/25" 
                    : "bg-slate-950/80 hover:bg-slate-900/60 text-slate-300 border border-slate-850/60 hover:border-slate-800"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isActive ? "Active Preset Style" : "Apply Formulation"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
