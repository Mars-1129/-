import React, { useState, useEffect } from "react";
import { 
  FolderLock, Database, Sparkles, Video, Terminal, 
  TrendingUp, Award, Compass, Layers, Menu, ShoppingBag 
} from "lucide-react";
import { Product, Material, VideoScript, CreationTask, TemplateStyle, VideoScene } from "./types";
import MaterialsWorkflow from "./components/MaterialsWorkflow";
import ScriptsWorkflow from "./components/ScriptsWorkflow";
import CreateWorkflow from "./components/CreateWorkflow";
import AnalyticsWorkflow from "./components/AnalyticsWorkflow";
import TasksWorkflow from "./components/TasksWorkflow";
import TemplatesWorkflow from "./components/TemplatesWorkflow";

export default function App() {
  const [activeTab, setActiveTab] = useState<'materials' | 'scripts' | 'create' | 'tasks' | 'analytics' | 'templates'>('materials');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [scripts, setScripts] = useState<VideoScript[]>([]);
  const [tasks, setTasks] = useState<CreationTask[]>([]);
  const [templates, setTemplates] = useState<TemplateStyle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const activeProduct = products.find(p => p.id === selectedProductId);

  // Load state on mount
  const loadWorkspaceState = async () => {
    try {
      const pRes = await fetch("/api/products");
      const pData = await pRes.json();
      setProducts(pData);
      if (pData.length > 0 && !selectedProductId) {
        setSelectedProductId(pData[0].id);
      }

      const tRes = await fetch("/api/templates");
      const tData = await tRes.json();
      setTemplates(tData);

      const mRes = await fetch("/api/materials");
      const mData = await mRes.json();
      setMaterials(mData);

      const sRes = await fetch("/api/scripts");
      const sData = await sRes.json();
      setScripts(sData);

      const tkRes = await fetch("/api/tasks");
      const tkData = await tkRes.json();
      setTasks(tkData);
    } catch (e) {
      console.error("Failed to load backend databases:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceState();
  }, []);

  // Poll tasks status regularly if any task is processing
  useEffect(() => {
    const activeRunningTask = tasks.some(t => t.status !== "FINISHED" && t.status !== "FAILED");
    if (!activeRunningTask) return;

    const interval = setInterval(async () => {
      try {
        const tkRes = await fetch("/api/tasks");
        const tkData = await tkRes.json();
        setTasks(tkData);
      } catch (e) {
        console.error("Poller background failure:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [tasks]);

  // ACTIONS FOR TRIGGERS

  const handleUploadMaterial = async (fileName: string, type: 'video' | 'image', base64Data: string) => {
    try {
      const res = await fetch("/api/materials/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          name: fileName,
          type,
          data: base64Data
        })
      });
      const newMaterial = await res.json();
      setMaterials(prev => [newMaterial, ...prev]);
      return newMaterial;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleGenerateScript = async (creatorStyle: 'quick' | 'remake' | 'template', templateId: string, remakeReferenceText?: string) => {
    try {
      const res = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          creatorStyle,
          templateId,
          remakeReferenceText
        })
      });
      const newScript = await res.json();
      setScripts(prev => [...prev.filter(s => s.id !== newScript.id), newScript]);
      setActiveTab('scripts'); // Redirect on write success
      return newScript;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleEditScene = async (scriptId: string, sceneNumber: number, updatedFields: Partial<VideoScene>) => {
    try {
      const res = await fetch("/api/scripts/edit-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId,
          sceneNumber,
          updatedFields
        })
      });
      if (res.status === 422) {
        const errJson = await res.json();
        throw new Error(errJson.warning);
      }
      const data = await res.json();
      if (data.success && data.script) {
        setScripts(prev => prev.map(s => s.id === scriptId ? data.script : s));
      }
      return data;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleTriggerTask = async (scriptId: string) => {
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId,
          productId: selectedProductId
        })
      });
      const taskMeta = await res.json();
      
      // reload lists manually
      const tkRes = await fetch("/api/tasks");
      const tkData = await tkRes.json();
      setTasks(tkData);
      
      setActiveTab('tasks'); // jump to compilation tab
      return taskMeta;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();
      if (data.success) {
        // refresh tasks
        const tkRes = await fetch("/api/tasks");
        const tkData = await tkRes.json();
        setTasks(tkData);
      }
      return data;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-mono text-slate-400 gap-3">
        <Layers className="w-8 h-8 text-emerald-400 animate-pulse" />
        <span className="text-sm">Boothing TikStream AI Workspaces...</span>
      </div>
    );
  }

  const navItems = [
    { id: "materials", label: "Asset Library", desc: "Structured Materials", icon: Database },
    { id: "scripts", label: "AI Copywriter", desc: "GenAI Scripting Hub", icon: Sparkles },
    { id: "create", label: "Create Ad", desc: "Interactive Player", icon: Video },
    { id: "tasks", label: "Render Queue", desc: "Pipeline Monitors", icon: Terminal },
    { id: "analytics", label: "Diagnostics", desc: "Conversion Metrics", icon: TrendingUp },
    { id: "templates", label: "Style Presets", desc: "Copy Formulas", icon: Compass }
  ] as const;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 flex flex-col md:flex-row font-sans antialiased overflow-x-hidden selection:bg-emerald-500/20 selection:text-emerald-300">
      
      {/* Sidebar navigation (Digital Minimalism - Sleek Interface style) */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800/60 bg-slate-900/20 flex flex-col shrink-0">
        
        {/* App Logo */}
        <div className="h-14 px-6 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Layers className="w-4 h-4 text-slate-950 font-bold" />
            </div>
            <div>
              <span className="text-sm font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight">TikStream AI</span>
            </div>
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse hidden md:block"></span>
        </div>

        {/* Tab triggers */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto bg-slate-900/5">
          <span className="text-[9px] font-bold text-slate-500 font-mono uppercase tracking-widest px-3 block mb-2">MODULE WORKSPACES</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between text-left p-2.5 rounded-xl transition-all relative cursor-pointer group ${
                  isActive 
                    ? "bg-slate-850 text-emerald-400 border border-slate-700/30 shadow-sm" 
                    : "text-slate-405 hover:text-white hover:bg-slate-900/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'} transition-colors`} />
                  <div>
                    <span className="text-xs font-semibold block leading-none">{item.label}</span>
                    <span className="text-[9px] text-slate-500 font-mono block mt-0.5">{item.desc}</span>
                  </div>
                </div>
                {isActive && (
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></div>
                )}
              </button>
            );
          })}
        </nav>

        {/* User context footer */}
        <div className="p-4 border-t border-slate-850 bg-slate-900/10 text-left space-y-1">
          <span className="text-[9px] text-slate-500 font-mono uppercase block tracking-wider">Account Node</span>
          <p className="text-[10px] font-bold text-slate-405 truncate">yimingzhao051@gmail.com</p>
          <div className="flex items-center gap-1.5 text-[8px] text-slate-500 font-mono mt-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Seller Stream Active</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top bar header */}
        <header className="h-14 px-6 border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">Workspace:</span>
            <span className="text-xs font-bold text-slate-200">
              {activeTab === 'materials' && "Materials Ingestion & slice models"}
              {activeTab === 'scripts' && "Intelligent Copywriter Editor"}
              {activeTab === 'create' && "Four-Track Composite Studio player"}
              {activeTab === 'tasks' && "Async rendering telemetry pipelines"}
              {activeTab === 'analytics' && "Retention Diagnostics & performance"}
              {activeTab === 'templates' && "Formula-based prompts library"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Agent Ready</span>
            </div>
          </div>
        </header>

        {/* Tab display zones (Scrollable content) */}
        <div className="flex-1 p-6 md:p-8 h-[calc(100vh-96px)] overflow-y-auto">
          {activeTab === 'materials' && (
            <MaterialsWorkflow 
              products={products}
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
              materials={materials}
              onUpload={handleUploadMaterial}
            />
          )}

          {activeTab === 'scripts' && (
            <ScriptsWorkflow 
              products={products}
              selectedProductId={selectedProductId}
              templates={templates}
              scripts={scripts}
              onGenerateScript={handleGenerateScript}
              onEditScene={handleEditScene}
            />
          )}

          {activeTab === 'create' && (
            <CreateWorkflow 
              products={products}
              selectedProductId={selectedProductId}
              scripts={scripts}
              tasks={tasks}
              onTriggerTask={handleTriggerTask}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsWorkflow 
              products={products}
              selectedProductId={selectedProductId}
              scripts={scripts}
              onEditScene={handleEditScene}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksWorkflow 
              tasks={tasks}
              onRetryTask={handleRetryTask}
            />
          )}

          {activeTab === 'templates' && (
            <TemplatesWorkflow 
              templates={templates}
              activeTemplateId={templates[0]?.id || ""}
              onApplyTemplate={setSelectedProductId} // quick mock binding
            />
          )}
        </div>

        {/* Bottom Status Bar */}
        <footer className="h-10 bg-slate-900 border-t border-slate-800/80 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 text-[10px] text-slate-500">
              <span className="font-bold">Product Context:</span>
              <span className="text-slate-300">{activeProduct?.name || "Initializing..."}</span>
            </div>
            <div className="flex items-center space-x-2 text-[10px] text-slate-500">
              <span className="font-bold">Target Demo:</span>
              <span className="text-slate-300 italic">{activeProduct?.demographics || "Analyzing..."}</span>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-[10px] font-mono">
            <span className="text-slate-500">Assets Cached: 128MB</span>
            <span className="text-emerald-400 uppercase tracking-widest">SSE Connection: STABLE</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
