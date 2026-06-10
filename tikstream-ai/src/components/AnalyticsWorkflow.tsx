import React, { useState, useEffect } from "react";
import { 
  TrendingUp, Users, RefreshCw, BarChart2, Zap, ArrowRight, 
  Sparkles, CheckCircle2, ShieldAlert, Award, AlertCircle 
} from "lucide-react";
import { VideoScript, Product } from "../types";

interface AnalyticsWorkflowProps {
  products: Product[];
  selectedProductId: string;
  scripts: VideoScript[];
  onEditScene: (scriptId: string, sceneNumber: number, updatedFields: any) => Promise<any>;
}

export default function AnalyticsWorkflow({
  products,
  selectedProductId,
  scripts,
  onEditScene
}: AnalyticsWorkflowProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredSecond, setHoveredSecond] = useState<number | null>(null);
  const [selfHealingStatus, setSelfHealingStatus] = useState<'idle' | 'healing' | 'healed'>('idle');
  const [healedMessage, setHealedMessage] = useState('');

  const activeProduct = products.find(p => p.id === selectedProductId) || products[0];
  const productScripts = scripts.filter(s => s.productId === selectedProductId);
  const activeScript = productScripts[productScripts.length - 1];

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics");
      const result = await res.json();
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedProductId]);

  const handleSelfHeal = async () => {
    if (!activeScript) return;
    setSelfHealingStatus('healing');
    
    // Simulate high-level Generative AI optimization context (Loser Hook rewriting)
    setTimeout(async () => {
      const updatedHookText = "Stop scrolled scrolling. Look at this, if your neck is shouting at you, this 30-seconds fix is literally everything!";
      
      await onEditScene(activeScript.id, 1, {
        voiceoverText: updatedHookText,
        subtitle: "⚠️ Shouting Neck?"
      });

      setSelfHealingStatus('healed');
      setHealedMessage(`Resolved! Scene 1 Hook text optimized to boost first-3s retention from 65% up to 88% predicted!`);
      setTimeout(() => {
        setSelfHealingStatus('idle');
        setHealedMessage('');
      }, 5000);
    }, 2000);
  };

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-500 font-mono text-xs gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
        <span>Loading eCommerce diagnostic signals...</span>
      </div>
    );
  }

  // Interactive mouse events linkage: find scene associated with hovered second
  const activeSceneInfo = hoveredSecond !== null 
    ? data.retentionCurve.find((p: any) => p.second === hoveredSecond)
    : data.retentionCurve[4]; // Default showcase second 4 (the classic hook-switch drop-off)

  return (
    <div className="space-y-6">
      
      {/* Self-healing alert success toast */}
      {selfHealingStatus === 'healed' && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 rounded-2xl flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-sans font-medium">{healedMessage}</span>
        </div>
      )}

      {/* KPI Overview Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/20 border border-slate-800/60 p-4 rounded-2xl space-y-1 shadow-sm">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest block">PREDICTED CTR</span>
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-2xl font-bold text-emerald-400 font-mono">{data.metrics.averageCtr}</span>
            <span className="text-[9px] text-emerald-500 font-bold bg-emerald-950/20 px-1.5 rounded">▲ Shop Benchmark</span>
          </div>
        </div>

        <div className="bg-slate-900/20 border border-slate-800/60 p-4 rounded-2xl space-y-1 shadow-sm">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest block">15S COMPLETION</span>
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-2xl font-bold text-cyan-400 font-mono">{data.metrics.averageCompletionRate}</span>
            <span className="text-[9px] text-cyan-500 font-bold bg-cyan-950/20 px-1.5 rounded">▲ UGC Typical</span>
          </div>
        </div>

        <div className="bg-slate-900/20 border border-slate-800/60 p-4 rounded-2xl space-y-1 shadow-sm">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest block">ESTIMATED ROAS</span>
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-2xl font-bold text-amber-400 font-mono">{data.metrics.estimatedRoi}</span>
            <span className="text-[9px] text-amber-500 font-bold bg-amber-950/20 px-1.5 rounded">3.4x Target Return</span>
          </div>
        </div>

        <div className="bg-slate-900/20 border border-slate-800/60 p-4 rounded-2xl space-y-1 shadow-sm">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-widest block">EXPERIMENT MATRIX</span>
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-2xl font-bold text-slate-200 font-mono">{data.metrics.testedCount} clips</span>
            <span className="text-[9px] text-slate-500 font-bold bg-slate-900 border border-slate-800 px-1.5 rounded">A/B Matrix Flow</span>
          </div>
        </div>
      </div>

      {/* Main interactive sections: Retention Curve sync'd with Script Editor representation (Left 8 Cols, side diagnostic 4 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Retention graph container */}
        <div className="lg:col-span-8 bg-slate-900/20 rounded-3xl border border-slate-800/60 p-5 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-slate-250">Creative-Linked Retention Curve</h3>
              <p className="text-[11px] text-slate-500">Tracks simulator dropout percent across individual seconds mapped directly to scenes.</p>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-lg">
              <Users className="w-3 h-3 text-emerald-400" />
              <span>Simulated Cohort Feed: 25K Impressions</span>
            </div>
          </div>

          {/* Canvas SVG Rentention Area */}
          <div className="h-60 relative w-full bg-slate-950 rounded-2xl border border-slate-850/60 pt-4 px-2 select-none">
            
            {/* Grid Line lines */}
            <div className="absolute inset-0 flex flex-col justify-between p-4 px-8 pointer-events-none text-[8.5px] font-mono text-slate-700">
              <div className="border-b border-slate-900/50 pb-1 flex justify-between"><span>100% Retain</span><span></span></div>
              <div className="border-b border-slate-900/40 pb-1 flex justify-between"><span>70%</span><span></span></div>
              <div className="border-b border-slate-900/30 pb-1 flex justify-between"><span>40% Threshold</span><span></span></div>
              <div className="pb-1 mt-1 flex justify-between"><span>0s</span><span>15s Total Ad Duration</span></div>
            </div>

            {/* Simulated curve drawn via premium micro-paths */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full p-4 px-8" preserveAspectRatio="none">
              <defs>
                <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Shaded Area */}
              <path 
                d="M 0 0 C 15 2, 23 35, 33 42 C 45 44, 53 48, 66 50 C 76 51, 86 59, 100 65 L 100 100 L 0 100 Z" 
                fill="url(#curveGradient)"
                className="transition-all"
              />
              
              {/* Highlight path line */}
              <path 
                d="M 0 0 C 15 2, 23 35, 33 42 C 45 44, 53 48, 66 50 C 76 51, 86 59, 100 65" 
                fill="none" 
                stroke="url(#curveGradient)" 
                strokeWidth="2"
                className="stroke-emerald-400 transition-all"
              />

              {/* Hover highlight dot tracker */}
              {hoveredSecond !== null && (
                <circle 
                  cx={`${(hoveredSecond / 15) * 100}`} 
                  cy={`${100 - (data.retentionCurve[hoveredSecond]?.retention || 100)}`} 
                  r="3.5" 
                  fill="#34d399"
                  stroke="#020617"
                  strokeWidth="2"
                />
              )}
            </svg>

            {/* Invisible hover regions mapping 15 distinct seconds */}
            <div className="absolute inset-x-8 inset-y-4 flex justify-between z-10">
              {data.retentionCurve.map((point: any, sIdx: number) => (
                <div 
                  key={sIdx}
                  onMouseEnter={() => setHoveredSecond(point.second)}
                  onMouseLeave={() => setHoveredSecond(null)}
                  className={`h-full cursor-pointer transition-colors relative flex items-end justify-center ${
                    hoveredSecond === point.second ? "bg-emerald-500/5 border-x border-dashed border-emerald-500/20" : ""
                  }`}
                  style={{ width: `${100 / 16}%` }}
                >
                  {/* Miniature popup tooltips upon hover inside curve */}
                  {hoveredSecond === point.second && (
                    <div className="absolute bottom-full mb-2 bg-slate-900 border border-slate-800 p-2 rounded-lg shadow-xl text-[9px] text-slate-200 z-50 font-mono shrink-0 whitespace-nowrap">
                      <span className="text-emerald-400 font-bold">⏱️ Second {point.second}s</span>
                      <div className="text-slate-300 font-semibold">{point.retention}% Audience retained</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Interactive linking panel showing the segment matching the hovered timestamp (FR-22) */}
          <div className="p-4 bg-slate-950/80 backdrop-blur-sm rounded-2xl border border-slate-850/60 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between shadow-inner">
            <div className="space-y-1 flex-1">
              <span className="text-[9px] text-slate-500 font-mono uppercase block font-bold">Live Script Context under Second {activeSceneInfo?.second}s</span>
              <p className="text-xs font-semibold text-slate-200">
                📌 {activeSceneInfo?.scene}
              </p>
              <p className="text-[11px] text-slate-400 leading-normal italic">
                "{activeScript ? activeScript.scenes[activeSceneInfo?.second < 3.5 ? 0 : activeSceneInfo?.second < 7.5 ? 1 : activeSceneInfo?.second < 11.5 ? 2 : 3]?.voiceoverText : 'UGC content playing'}"
              </p>
            </div>

            {/* Shorter Hook dropout One-Click Self-Heal Optimizer button (P2) */}
            {activeScript && activeSceneInfo?.second >= 3 && activeSceneInfo?.second <= 5 && (
              <button
                onClick={handleSelfHeal}
                disabled={selfHealingStatus !== 'idle'}
                className="px-3.5 py-2 group hover:py-2.5 bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-350 hover:to-cyan-400 text-slate-900 text-xs font-bold rounded-xl transition-all shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/25 flex items-center gap-1.5 shrink-0 animate-bounce cursor-pointer font-mono"
              >
                {selfHealingStatus === 'healing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    AI Self-Healing Hook...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Fix scene 1 Hook drops
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right side: Factor Attribution & A/B testing matrix cards (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Factor attribution lists (FR-20) */}
          <div className="bg-slate-900/20 rounded-3xl border border-slate-800/60 p-4 space-y-3 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-500 tracking-widest font-mono uppercase flex items-center gap-1.5 animate-pulse">
              <Award className="w-4 h-4 text-emerald-400" /> Attribution Matrix
            </h4>
            <div className="space-y-2">
              {data.factorAttributes.map((fact: any, fid: number) => (
                <div key={fid} className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-850/60 space-y-2 text-xs shadow-inner">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-350">{fact.name}</span>
                    <span className="text-emerald-400 font-mono font-bold">{fact.score}% score</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-850/40">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                      style={{ width: `${fact.score}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* A/B Test Matrix layout (FR-23) */}
          <div className="bg-slate-900/20 rounded-3xl border border-slate-800/60 p-4 space-y-3 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-500 tracking-widest font-mono uppercase flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-cyan-400" /> A/B Ad Performance
            </h4>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-850/60 text-center space-y-1.5 shadow-inner">
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono">Style A</span>
                <p className="text-[11px] text-slate-300 font-semibold font-sans truncate">{data.abCompared.versionA.title}</p>
                <div className="text-[10px] space-y-0.5 pt-1.5 border-t border-slate-800/60 leading-normal">
                  <div className="text-slate-500">Conv Rate: <strong className="text-slate-300">{data.abCompared.versionA.conversionRate}</strong></div>
                  <div className="text-slate-500">Completion: <strong className="text-slate-300">{data.abCompared.versionA.completionRate}</strong></div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-850/60 text-center space-y-1.5 shadow-inner">
                <span className="text-[10px] text-slate-500 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded font-bold font-mono">Style B</span>
                <p className="text-[11px] text-slate-300 font-semibold font-sans truncate">{data.abCompared.versionB.title}</p>
                <div className="text-[10px] space-y-0.5 pt-1.5 border-t border-slate-800/60 leading-normal">
                  <div className="text-slate-500">Conv Rate: <strong className="text-slate-300">{data.abCompared.versionB.conversionRate}</strong></div>
                  <div className="text-slate-500">Completion: <strong className="text-slate-300">{data.abCompared.versionB.completionRate}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
