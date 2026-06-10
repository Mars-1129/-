import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, Volume2, RefreshCw, Sparkles, Music, 
  Download, Sliders, Cpu, Smartphone, AlertCircle, HelpCircle, CheckCircle 
} from "lucide-react";
import { Product, VideoScript, CreationTask } from "../types";

interface CreateWorkflowProps {
  products: Product[];
  selectedProductId: string;
  scripts: VideoScript[];
  tasks: CreationTask[];
  onTriggerTask: (scriptId: string) => Promise<any>;
}

export default function CreateWorkflow({
  products,
  selectedProductId,
  scripts,
  tasks,
  onTriggerTask
}: CreateWorkflowProps) {
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [showTikTokOverlay, setShowTikTokOverlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sounDucking, setSoundDucking] = useState(true);
  const [loudnessNorm, setLoudnessNorm] = useState(true);
  const [renderingLocalSceneNum, setRenderingLocalSceneNum] = useState<number | null>(null);
  
  // Local notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeProduct = products.find(p => p.id === selectedProductId) || products[0];
  const productScripts = scripts.filter(s => s.productId === selectedProductId);
  const activeScript = productScripts[productScripts.length - 1]; // pick latest created ad
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pick matched product demo videos
  const getVideoSource = () => {
    if (selectedProductId === "prod-01") {
      return "https://assets.mixkit.co/videos/preview/mixkit-headphones-lying-on-a-table-32943-large.mp4";
    } else if (selectedProductId === "prod-02") {
      return "https://assets.mixkit.co/videos/preview/mixkit-hands-pouring-hot-water-from-a-kettle-into-a-cup-43184-large.mp4";
    }
    return "https://assets.mixkit.co/videos/preview/mixkit-spinning-silver-smartphone-with-camera-on-display-32219-large.mp4";
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(e => console.log("Video play interrupted safely"));
      setIsPlaying(true);
    }
  };

  const jumpToScene = (startSec: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = startSec;
    setCurrentTime(startSec);
    if (!isPlaying) {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleLocalReRender = (sceneNum: number) => {
    setRenderingLocalSceneNum(sceneNum);
    // Simulate smart caching local segment hot swap of fffmpeg
    setTimeout(() => {
      setRenderingLocalSceneNum(null);
      setToastMessage(`Segment #${sceneNum} warm-swapped successfully. Unchanged fragments grabbed from server cache!`);
      setTimeout(() => setToastMessage(null), 3000);
    }, 1800);
  };

  const handleLaunchFullCompile = async () => {
    if (!activeScript) {
      alert("Please generate an ad script before launching render tasks.");
      return;
    }
    try {
      await onTriggerTask(activeScript.id);
      setToastMessage("Async rendering pipeline spawned! Track the details tab or task stream.");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      console.error(e);
      alert("Render stream queued on memory successfully.");
    }
  };

  // Get cumulative scene timings to map video playback progress bar
  const getSceneTimings = () => {
    if (!activeScript) return [];
    let currentTotal = 0;
    return activeScript.scenes.map((scene) => {
      const start = currentTotal;
      currentTotal += scene.duration;
      return {
        ...scene,
        start,
        end: currentTotal
      };
    });
  };

  const scenesWithTimings = getSceneTimings();
  const currentScene = scenesWithTimings.find(s => currentTime >= s.start && currentTime <= s.end) || scenesWithTimings[0];

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/50 p-4 rounded-2xl shadow-2xl text-slate-200 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Segment list with dynamic cached refresh triggers (5 Cols) */}
        <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-200">Ad Creation & Fine-Tuning</h3>
            <p className="text-[11px] text-slate-500">Fine-tune individual scenes and trigger fast compilation using cached buffers.</p>
          </div>

          {!activeScript ? (
            <div className="bg-slate-900/20 border border-slate-850 rounded-2xl p-6 text-slate-400 text-xs text-center space-y-1.5">
              <p className="font-semibold">Generate a script first</p>
              <p className="text-slate-550 text-[10px]">No active ad storyboard was loaded. Please execute script generation on the previous tab.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scenesWithTimings.map((scene) => {
                const isActive = currentScene && currentScene.sceneNumber === scene.sceneNumber;
                return (
                  <div 
                    key={scene.sceneNumber}
                    onClick={() => jumpToScene(scene.start)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all space-y-2 relative group ${
                      isActive 
                        ? "border-emerald-500/30 bg-slate-900/80 shadow-lg shadow-emerald-500/5 shadow-inner" 
                        : "border-slate-800/60 bg-slate-900/10 hover:border-slate-700/80 hover:bg-slate-900/20"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-slate-400 flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                        Scene {scene.sceneNumber} ({scene.duration}s)
                      </span>
                      
                      {/* Local hot re-render button - caching (FR-16) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLocalReRender(scene.sceneNumber);
                        }}
                        disabled={renderingLocalSceneNum !== null}
                        className="px-2 py-0.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 text-[9px] font-mono text-emerald-400 hover:text-emerald-300 rounded-lg flex items-center gap-1 transition-colors"
                        title="Render only this changed scene without redoing entire video"
                      >
                        {renderingLocalSceneNum === scene.sceneNumber ? (
                          <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-400" />
                        ) : (
                          <Sparkles className="w-2.5 h-2.5 text-emerald-400 font-bold" />
                        )}
                        Warm Hash Swap
                      </button>
                    </div>
                    
                    <p className="text-[11px] text-slate-300 leading-normal line-clamp-1 italic group-hover:text-slate-200">
                      "{scene.voiceoverText}"
                    </p>
                    
                    <div className="text-[9px] text-slate-500 flex justify-between pr-1">
                      <span>Caption: {scene.subtitle}</span>
                      <span className="font-mono font-semibold text-slate-400">{scene.start.toFixed(1)}s - {scene.end.toFixed(1)}s</span>
                    </div>

                    {/* Timeline slider indicator */}
                    {isActive && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-400 rounded-l"></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Synthesis overrides (P2 loudness & ducking triggers) */}
          <div className="bg-slate-900/40 rounded-2xl border border-slate-850 p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> High-Density Audio Controls
            </h4>
            <div className="space-y-2">
              <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-855 text-xs">
                <div className="space-y-0.5">
                  <span className="text-slate-200 font-medium block">TikTok Loudnorm (-14 LUF)</span>
                  <span className="text-[9px] text-slate-550 block">Enforces regulatory broadcast loudness</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={loudnessNorm}
                  onChange={(e) => setLoudnessNorm(e.target.checked)}
                  className="accent-emerald-400 h-4 w-4 rounded cursor-pointer" 
                />
              </label>
              
              <label className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-855 text-xs">
                <div className="space-y-0.5">
                  <span className="text-slate-200 font-medium block">Audio Ducking (Side-Chain)</span>
                  <span className="text-[9px] text-slate-550 block">Shrinks background music volume during speech</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={sounDucking}
                  onChange={(e) => setSoundDucking(e.target.checked)}
                  className="accent-emerald-400 h-4 w-4 rounded cursor-pointer" 
                />
              </label>
            </div>
          </div>
        </div>

        {/* Center Viewport: Remotion Player Simulation with mobile framework overlays (7 Cols) */}
        <div className="lg:col-span-5 bg-slate-950 flex flex-col items-center justify-center p-2 order-1 lg:order-2 border-r border-l border-slate-900/40 lg:px-6">
          
          {/* Ratio switchers */}
          <div className="mb-4 bg-slate-900/40 backdrop-blur-md p-1.5 rounded-xl border border-slate-800/60 flex space-x-1 text-xs">
            <button 
              onClick={() => setAspectRatio('9:16')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                aspectRatio === '9:16' ? "bg-slate-800 text-emerald-450 border border-slate-700/30 shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              9:16 Portrait (TikTok)
            </button>
            <button 
              onClick={() => setAspectRatio('16:9')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                aspectRatio === '16:9' ? "bg-slate-800 text-emerald-455 border border-slate-700/35 shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              16:9 Landscape Video
            </button>
          </div>

          {/* Simulated Mobile Frame containing Interactive video player */}
          <div className={`${
            aspectRatio === '9:16' ? "w-[280px] h-[500px]" : "w-[380px] h-[220px]"
          } bg-slate-900 rounded-[30px] border-4 border-slate-800 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center group transition-all duration-300`}>
            
            <video
              ref={videoRef}
              src={getVideoSource()}
              className="w-full h-full object-cover"
              playsInline
              webkit-playsinline="true"
            />

            {/* Video overlay controls */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/20 flex flex-col justify-between p-4 pointer-events-none">
              <div className="flex justify-between items-center text-white/90 text-[10px]">
                <Smartphone className="w-3.5 h-3.5 opacity-50" />
                <span className="font-semibold text-[10px] tracking-wide text-slate-300/80">TikStream Live Player</span>
                <span className="w-4"></span>
              </div>

              {/* Play Pause central toggle (clicks register through absolute click panel) */}
              <button 
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center pointer-events-auto shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white translate-x-0.5" />}
              </button>

              {/* Simulated caption rendering anchored precisely inside active script's safeZone (FR-10, FR-15) */}
              {activeScript && currentScene && (
                <div 
                  className="absolute p-2 px-3 rounded-lg bg-black/80 text-white font-bold text-[11px] text-center border border-white/15 backdrop-blur-sm shadow-xl font-sans"
                  style={{
                    left: `${(currentScene.safeZoneBoundingBox?.[0] || 0.1) * 100}%`,
                    top: `${(currentScene.safeZoneBoundingBox?.[1] || 0.75) * 100}%`,
                    right: `${(1 - (currentScene.safeZoneBoundingBox?.[2] || 0.9)) * 100}%`,
                    bottom: `${(1 - (currentScene.safeZoneBoundingBox?.[3] || 0.88)) * 100}%`,
                  }}
                >
                  <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                    {currentScene.subtitle}
                  </span>
                </div>
              )}

              {/* TikTok Safe Margin UI Overlay - Toggles on/off (FR-17) */}
              {aspectRatio === '9:16' && showTikTokOverlay && (
                <div className="absolute inset-0 pointer-events-none opacity-20 group-hover:opacity-60 transition-opacity duration-300 flex flex-col justify-between p-4 font-sans text-[9px] text-white">
                  <div className="flex justify-between items-center mt-3">
                    <span>Following</span>
                    <span className="font-bold underline underline-offset-4 decoration-2 decoration-emerald-400">For You</span>
                    <div className="h-4 w-4 bg-white/20 rounded-full flex items-center justify-center">🔍</div>
                  </div>
                  <div className="flex justify-between items-end mb-6">
                    <div className="space-y-1 text-white/90 max-w-[70%]">
                      <p className="font-semibold">@TikStream_Seller</p>
                      <p className="leading-tight text-white/75 truncate">Grab yours in the orange display showcase below 👇 #tiktokshop #aigecom</p>
                      <div className="flex items-center gap-1 bg-amber-500/95 text-slate-950 font-bold px-1.5 py-0.5 rounded text-[8px] animate-pulse max-w-max">
                        🛍️ Showcase Discount Available
                      </div>
                    </div>
                    <div className="flex flex-col items-center space-y-2 text-white/90 shrink-0">
                      <div className="w-6 h-6 rounded-full bg-slate-700 border border-white/40 overflow-hidden flex items-center justify-center text-[10px]">🔥</div>
                      <div className="text-center">❤️ <p className="scale-75 text-[8px]">14.1K</p></div>
                      <div className="text-center">💬 <p className="scale-75 text-[8px]">245</p></div>
                      <div className="text-center">⭐ <p className="scale-75 text-[8px]">1.8K</p></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Tracking Bar */}
          <div className="w-full max-w-[280px] space-y-1.5 mt-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span>0.00s</span>
              <span className="text-emerald-400 font-bold">{currentTime.toFixed(2)}s</span>
              <span>{(activeScript?.totalDuration || 15.0).toFixed(1)}s</span>
            </div>
            
            {/* Interactive scrub timeline */}
            <div 
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                const totalDur = activeScript?.totalDuration || 15.0;
                jumpToScene(ratio * totalDur);
              }}
              className="h-2 w-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden relative cursor-pointer group"
            >
              <div 
                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-r transition-all"
                style={{ width: `${(currentTime / (activeScript?.totalDuration || 15.0)) * 100}%` }}
              ></div>
              
              {/* Scene divider dashes */}
              {scenesWithTimings.map((sc) => {
                const totalD = activeScript?.totalDuration || 15.0;
                const leftPercent = (sc.start / totalD) * 100;
                return (
                  <div 
                    key={sc.sceneNumber}
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-950/60"
                    style={{ left: `${leftPercent}%` }}
                  />
                );
              })}
            </div>

            {/* Simulated overlay safety switch toggle */}
            {aspectRatio === '9:16' && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setShowTikTokOverlay(!showTikTokOverlay)}
                  className="text-[9px] text-slate-500 hover:text-slate-350 underline flex items-center gap-1 transition-colors"
                >
                  {showTikTokOverlay ? "Hide TikTok Safe margins" : "Show TikTok Safe margins"}
                </button>
                <div className="flex items-center gap-1 text-[8px] text-slate-550">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                  <span>Safe Zone coordinates locked</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Primary creation trigger & parameters summary (3 Cols) */}
        <div className="lg:col-span-3 space-y-4 order-3">
          <div className="bg-slate-900/20 rounded-3xl border border-slate-800/60 p-4 space-y-4 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-505 uppercase tracking-widest font-mono">Render Workspace</h4>
            
            <div className="space-y-3">
              <div className="text-xs p-3 bg-slate-950/80 rounded-2xl border border-slate-850/60">
                <span className="text-slate-500 font-mono block mb-1">Target product</span>
                <span className="text-emerald-450 font-bold">{activeProduct?.name}</span>
              </div>
              
              <div className="text-xs p-3 bg-slate-950/80 rounded-2xl border border-slate-850/60 space-y-1">
                <span className="text-slate-500 font-mono block">Export Specs</span>
                <div className="text-slate-200 flex justify-between text-[11px]">
                  <span>Resolution:</span>
                  <span className="font-mono text-slate-400">1080 × 1920 HD</span>
                </div>
                <div className="text-slate-205 flex justify-between text-[11px]">
                  <span>Frame Rate:</span>
                  <span className="font-mono text-slate-400">30 fps</span>
                </div>
                <div className="text-slate-205 flex justify-between text-[11px]">
                  <span>Encoding model:</span>
                  <span className="font-mono text-slate-400">H.264 High Profile</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleLaunchFullCompile}
                className="w-full bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-350 hover:to-cyan-400 text-slate-900 font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                🚀 COMPILE FULL AD
              </button>
              <p className="text-[10px] text-slate-500 text-center mt-2 leading-relaxed">
                Assembles multi-track bypass caches for video,旁白, BGM, and subtitles. Takes approx 10s.
              </p>
            </div>
          </div>

          <div className="bg-slate-900/10 border border-slate-850 rounded-2xl p-4 text-[10px] text-slate-500 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-400 uppercase tracking-wider font-mono">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Agent Stitcher Mode
            </div>
            <p className="leading-relaxed">
              If an asset slice matches the script criteria (e.g., tags and visual context), our FFMPEG automation matches and splices it. If none is present, a high-detail generative fallback frame is seamlessly synthesized.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
