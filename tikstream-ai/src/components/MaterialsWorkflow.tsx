import React, { useState, useRef } from "react";
import { 
  Upload, Play, CheckCircle2, Tag, Video, Image as ImageIcon, 
  AlertTriangle, Scissors, Database, ArrowRight, Loader2, RefreshCw 
} from "lucide-react";
import { Product, Material } from "../types";

interface MaterialsWorkflowProps {
  products: Product[];
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  materials: Material[];
  onUpload: (fileName: string, type: 'video' | 'image', base64Data: string) => Promise<any>;
}

export default function MaterialsWorkflow({
  products,
  selectedProductId,
  setSelectedProductId,
  materials,
  onUpload
}: MaterialsWorkflowProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProduct = products.find(p => p.id === selectedProductId) || products[0];
  const filteredMaterials = materials.filter(m => m.productId === selectedProductId);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processUploadedFile = (file: File) => {
    if (!file) return;
    const isVideo = file.type.includes("video") || file.name.endsWith(".mp4");
    const isImage = file.type.includes("image") || file.name.endsWith(".jpg") || file.name.endsWith(".png") || file.name.endsWith(".webp");

    if (!isVideo && !isImage) {
      alert("Invalid format! Please upload an MP4 video or JPG/PNG/WebP image.");
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setUploadSuccess(false);

    // Simulate progress bars matching professional requirements
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 15;
      });
    }, 150);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        await onUpload(file.name, isVideo ? 'video' : 'image', base64Data);
        setUploadProgress(100);
        setUploadSuccess(true);
        setTimeout(() => {
          setUploading(false);
          setUploadSuccess(false);
        }, 1500);
      } catch (e) {
        console.error(e);
        alert("Upload failed. Moving to default mock representation.");
        setUploading(false);
      }
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Quick preset simulation to let developers quickly try uploading
  const handleMockUploadPreset = (type: 'video' | 'image') => {
    const presetName = type === 'video' 
      ? `Dynamic_Usage_Pitch_${activeProduct?.name.split(" ")[0]}.mp4` 
      : `High_Fidelity_Showcase_${activeProduct?.name.split(" ")[0]}.jpg`;
    
    // basic dummy base64 to prevent payload bloat
    const dummyBase64 = type === 'video'
      ? "data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAADpmcmVlAAAALW1kYXQ="
      : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    onUpload(presetName, type, dummyBase64);
  };

  return (
    <div className="space-y-6">
      {/* Product Selection Bar */}
      <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/60 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-black/20">
        <div>
          <span className="text-[10px] text-slate-500 font-mono tracking-widest block mb-1 font-bold">CURRENT ACTIVE CONTEXT</span>
          <h2 className="text-lg font-bold text-emerald-400 tracking-tight flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"></span>
            {activeProduct?.name}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl line-clamp-1">{activeProduct?.description}</p>
        </div>
        <div className="w-full sm:w-auto">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-550/30"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Drag Upload workspace & product details (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Draggable container box */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
            className={`cursor-pointer group relative border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[240px] max-w-full ${
              dragActive 
                ? "border-emerald-400 bg-emerald-950/20 shadow-lg shadow-emerald-500/10 scale-[0.99]" 
                : "border-slate-800 bg-slate-900/10 hover:border-slate-700/80 hover:bg-slate-900/20"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*,image/*"
              className="hidden"
            />
            {uploading ? (
              <div className="space-y-4 w-full px-6">
                <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                    AI Analyzing details & slicing...
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">Running Dense Captioning on server...</p>
              </div>
            ) : uploadSuccess ? (
              <div className="space-y-2 text-center">
                <div className="mx-auto w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-emerald-400">Asset Loaded & Structured!</p>
                <p className="text-[10px] text-slate-500">Video segments split automatically</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center text-slate-400 border border-slate-800 group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Drag & drop asset here, or click to browse</p>
                  <p className="text-[10px] text-slate-500 mt-1">Supports MP4, JPG, PNG, WebP up to 100MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Preset generator shortcuts */}
          <div className="bg-slate-900/20 rounded-2xl border border-slate-800/60 p-4 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5 font-mono">DEMO SHORTCUTS (AI simulation)</h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleMockUploadPreset('video')}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[11px] text-slate-350 rounded-xl transition-all font-mono hover:text-emerald-400 hover:border-slate-700 cursor-pointer"
              >
                <Scissors className="w-3.5 h-3.5 text-cyan-400" />
                + Mock Video
              </button>
              <button
                type="button"
                onClick={() => handleMockUploadPreset('image')}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-[11px] text-slate-350 rounded-xl transition-all font-mono hover:text-emerald-400 hover:border-slate-700 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                + Mock Image
              </button>
            </div>
            <p className="text-[9px] text-slate-500 mt-2.5 leading-relaxed">
              💡 Instantly inject simulated files for testing server-side multi-grain slice indexing if you don't have a file ready.
            </p>
          </div>

          {/* Product details info display block */}
          <div className="bg-slate-900/20 rounded-2xl border border-slate-800/60 p-4 space-y-3.5 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-550 tracking-widest uppercase font-mono">PRODUCT SPECIFICATIONS</h3>
            <div className="space-y-2">
              <div className="text-xs">
                <span className="text-slate-500 font-mono block">Selling Points Matrix</span>
                <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-350">
                  {activeProduct?.sellingPoints.map((sp, idx) => (
                    <li key={idx} className="leading-relaxed">{sp}</li>
                  ))}
                </ul>
              </div>
              <div className="text-xs grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/40">
                <div>
                  <span className="text-slate-500 font-mono block">Category</span>
                  <span className="text-slate-300 font-medium">{activeProduct?.category}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-mono block">Listed Price</span>
                  <span className="text-emerald-400 font-bold font-mono">{activeProduct?.price}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Multi-granular slice metadata layout (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <span>AIGC Sliced Assets Matrix</span>
              <span className="text-xs font-normal text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full font-mono">
                {filteredMaterials.reduce((acc, m) => acc + (m.slices?.length || 0), 0)} Slices Loaded
              </span>
            </h3>
          </div>

          {filteredMaterials.length === 0 ? (
            <div className="bg-slate-900/10 border border-slate-800/40 rounded-2xl p-12 text-center space-y-3 shadow-inner">
              <div className="w-10 h-10 rounded-full bg-slate-900/40 border border-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
                <Database className="w-5 h-5 text-emerald-500/80" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">No structured materials found for this product context</p>
                <p className="text-[10px] text-slate-550 mt-1">Upload a white-back image, video, or click shortcuts on the left to spawn slicing assets.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMaterials.map((material) => (
                <div key={material.id} className="bg-slate-900/20 border border-slate-800/60 rounded-2xl p-4 space-y-3.5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      {material.type === "video" ? (
                        <span className="p-1 px-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 text-[10px] border border-cyan-500/20 flex items-center gap-1 font-mono uppercase tracking-wider">
                          <Video className="w-3 h-3" /> MP4 Video
                        </span>
                      ) : (
                        <span className="p-1 px-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] border border-amber-500/20 flex items-center gap-1 font-mono uppercase tracking-wider">
                          <ImageIcon className="w-3 h-3" /> Image Asset
                        </span>
                      )}
                      <span className="text-xs text-slate-200 font-semibold truncate max-w-[200px] sm:max-w-xs">{material.name}</span>
                    </div>
                    <span className="text-[9.5px] font-mono text-slate-500">{new Date(material.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {/* Slices Loop */}
                  <div className="grid grid-cols-1 gap-3">
                    {material.slices?.map((slice: any) => (
                      <div 
                        key={slice.id} 
                        className="bg-slate-950/40 hover:bg-slate-950 border border-slate-850/60 hover:border-emerald-500/30 transition-all rounded-xl p-3 flex flex-col md:flex-row gap-4 items-start relative group shadow-sm hover:shadow-emerald-500/5"
                      >
                        {/* Slice Video visualizer mockup */}
                        <div className="w-full md:w-32 h-20 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center text-slate-500">
                          {material.type === 'video' ? (
                            <img 
                              className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform" 
                              src="https://images.unsplash.com/photo-1590658268037-6bf12165a8df?q=80&w=300&auto=format&fit=crop" 
                              alt="slice mock"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <img 
                              className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform" 
                              src={material.url} 
                              alt="image mock"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent flex items-end justify-between p-1.5">
                            <span className="text-[9px] font-mono text-slate-300 bg-slate-950/80 px-1 py-0.5 rounded tracking-tighter">
                              {slice.startTime.toFixed(1)}s - {slice.endTime.toFixed(1)}s
                            </span>
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded tracking-tighter">
                              {slice.duration.toFixed(1)}s Limit
                            </span>
                          </div>
                        </div>

                        {/* Text and tags (the granular results) */}
                        <div className="flex-1 space-y-2">
                          <p className="text-xs text-slate-300 leading-relaxed font-sans font-medium">
                            {slice.denseCaption}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {slice.tags.map((tag: string, tid: number) => (
                              <span 
                                key={tid} 
                                className="text-[10px] font-mono px-2 py-0.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-300 rounded border border-slate-800/80 flex items-center gap-1"
                              >
                                <Tag className="w-2.5 h-2.5 text-emerald-400" />
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
