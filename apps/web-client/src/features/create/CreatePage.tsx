import { Player, type PlayerRef } from '@remotion/player';
import type { Creation, PreviewCompositionResponse, Script, ScriptShot, ShotRenderSummary, AudioMixConfig, SSEShotRenderEventPayload } from '@tikstream/shared-types';
import { Clapperboard, CheckCircle2, Download, GripVertical, Loader2, PanelRightClose, PanelRightOpen, Play, RefreshCw, Sparkles, Wand2, Video, Pencil, Check, X, Volume2, VolumeX, Globe, ChevronDown, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { MaterialSelector } from '../../components/material-selector/MaterialSelector';
import {
  createCreation,
  exportCreation,
  getCreation,
  getCreationHealth,
  getCreationPreview,
  listCreations,
  replaceCreationSlice,
  rerenderCreationShot,
  restitchCreation,
  retryCreation,
} from '../../lib/api/creations';
import { listScripts, getSubtitleDownloadUrl, getScriptTranslations, triggerScriptTranslation, generateQuickScript } from '../../lib/api/scripts';
import { patchScript } from '../../lib/api/scripts';
import { analyzeMaterialVision, type VisionAnalysisResult } from '../../lib/api/materials';
import { subscribeTaskEvents, type TaskStreamEvent } from '../../lib/api/tasks';
import { formatDateTime, formatDuration } from '../../lib/utils/cn';
import { CreationPreviewPlayer } from './components/CreationPreviewPlayer';
import { useScriptEditorShortcuts, ShortcutHints } from '../../hooks/useKeyboardShortcuts';
import { PreviewLoadingPlaceholder } from './components/PreviewLoadingPlaceholder';
import { CreationSkeleton } from '../../components/ui/content-skeleton';
import { AutoRetrySuggestion, type ErrorGuidance } from './components/AutoRetrySuggestion';
import { ShotComparisonPanel } from './components/ShotComparisonPanel';
import { useTtsPreview } from '../../hooks/useTtsPreview';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { useTimelineTouch } from '../../hooks/useTimelineTouch';
import { useBreakpoint } from '../../hooks/useBreakpoint';

import type { TFunction } from 'i18next';

const resolutionOptions = [
  { value: '1080x1920', label: '9:16 · 1080×1920', aspect: '9:16', maxH: 640 },
  { value: '1920x1080', label: '16:9 · 1920×1080', aspect: '16:9', maxH: 360 },
  { value: '720x1280', label: '9:16 · 720×1280', aspect: '9:16', maxH: 640 },
  { value: '1080x1080', label: '1:1 · 1080×1080', aspect: '1:1', maxH: 500 },
];

const exportFormatOptions = ['MP4', 'MOV', 'WEBM'] as const;

function upsertCreation(items: Creation[], next: Creation): Creation[] {
  const existing = items.find((item) => item.creation_id === next.creation_id);
  if (!existing) return [next, ...items];
  return items.map((item) => (item.creation_id === next.creation_id ? next : item));
}

function isTerminalStatus(status: Creation['status']): boolean {
  return status === 'FINISHED' || status === 'FAILED' || status === 'CANCELED';
}

// ========== localStorage 持久化：刷新页面后恢复长任务上下文 ==========

const STORAGE_SCRIPT_KEY = 'tikstream-web-client:active-script-id:';
const STORAGE_CREATION_KEY = 'tikstream-web-client:active-creation-id:';

function readPersistedScriptId(productId: string | null): string | null {
  if (typeof window === 'undefined' || !productId) return null;
  return window.localStorage.getItem(`${STORAGE_SCRIPT_KEY}${productId}`);
}

function persistScriptId(productId: string | null, scriptId: string | null): void {
  if (typeof window === 'undefined' || !productId) return;
  if (scriptId) {
    window.localStorage.setItem(`${STORAGE_SCRIPT_KEY}${productId}`, scriptId);
  } else {
    window.localStorage.removeItem(`${STORAGE_SCRIPT_KEY}${productId}`);
  }
}

function readPersistedCreationId(productId: string | null): string | null {
  if (typeof window === 'undefined' || !productId) return null;
  return window.localStorage.getItem(`${STORAGE_CREATION_KEY}${productId}`);
}

function persistCreationId(productId: string | null, creationId: string | null): void {
  if (typeof window === 'undefined' || !productId) return;
  if (creationId) {
    window.localStorage.setItem(`${STORAGE_CREATION_KEY}${productId}`, creationId);
  } else {
    window.localStorage.removeItem(`${STORAGE_CREATION_KEY}${productId}`);
  }
}

function getStatusTone(status: Creation['status']): string {
  if (status === 'FINISHED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'FAILED' || status === 'CANCELED') return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
  return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
}

function getErrorGuidance(errorCode: string | undefined, errorMessage: string | undefined, t: TFunction): ErrorGuidance {
  if (!errorCode) {
    return { label: errorMessage || t('common.unknownError'), suggestion: t('common.retry'), retryable: true };
  }
  const map: Record<string, ErrorGuidance> = {
    SEEDANCE_FAILED: {
      label: t('creation.seedanceError'),
      suggestion: t('creation.seedanceSuggestion'),
      retryable: true,
      autoFix: { action: 'retry', actionLabel: t('creation.autoFixRerender') },
    },
    TTS_FAILED: {
      label: t('creation.ttsError'),
      suggestion: t('creation.ttsSuggestion'),
      retryable: true,
      autoFix: { action: 'retry', actionLabel: t('creation.autoFixRerender') },
    },
    SEEDANCE_RATE_LIMITED: {
      label: t('creation.rateLimited'),
      suggestion: t('creation.rateLimitedSuggestion'),
      retryable: true,
      autoFix: { action: 'retry_delayed', delayMs: 5000, actionLabel: t('creation.retryDelayed5s') },
    },
    FFMPEG_STITCH_FAILED: {
      label: t('creation.ffmpegError'),
      suggestion: t('creation.ffmpegSuggestion'),
      retryable: true,
      autoFix: { action: 'retry', actionLabel: t('creation.autoFixRerender') },
    },
    NETWORK_ERROR: {
      label: t('creation.networkError'),
      suggestion: t('creation.networkErrorSuggestion'),
      retryable: true,
      autoFix: { action: 'retry', actionLabel: t('creation.autoFixRerender') },
    },
    SLICE_FALLBACK_EXHAUSTED: {
      label: t('creation.sliceFallback'),
      suggestion: t('creation.sliceFallbackSuggestion'),
      retryable: false,
    },
    COMPLIANCE_REJECTED: {
      label: t('creation.complianceRejected'),
      suggestion: t('creation.complianceSuggestion'),
      retryable: false,
    },
    PRODUCT_NOT_FOUND: {
      label: t('creation.productNotFound'),
      suggestion: t('creation.productNotFoundSuggestion'),
      retryable: false,
    },
    SCRIPT_NOT_FOUND: {
      label: t('creation.scriptNotFound'),
      suggestion: t('creation.scriptNotFoundSuggestion'),
      retryable: false,
    },
    BULLMQ_ENQUEUE_FAILED: {
      label: t('creation.queueBusy'),
      suggestion: t('creation.queueBusySuggestion'),
      retryable: true,
      autoFix: { action: 'retry_delayed', delayMs: 3000, actionLabel: t('creation.retryDelayed3s') },
    },
  };
  for (const [key, entry] of Object.entries(map)) {
    if (errorCode.startsWith(key.split(':')[0])) {
      return entry;
    }
  }
  return { label: errorMessage || t('creation.unknownErrorLabel', { code: errorCode }), suggestion: t('common.retry'), retryable: true };
}

/** 分镜渲染状态 → 图标 + 颜色 */
function getShotStatusMeta(status: string): { icon: string; colorClass: string; bgClass: string } {
  switch (status) {
    case 'FINISHED':
      return { icon: '\u2713', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/20' };
    case 'PROCESSING':
      return { icon: '\u25CB', colorClass: 'text-cyan-400', bgClass: 'bg-cyan-500/20' };
    case 'FAILED':
      return { icon: '\u2717', colorClass: 'text-rose-400', bgClass: 'bg-rose-500/20' };
    default:
      return { icon: '\u2014', colorClass: 'text-slate-500', bgClass: 'bg-slate-500/20' };
  }
}

interface SortableTimelineShotProps {
  shot: ScriptShot;
  isSelected: boolean;
  isEditing: boolean;
  isDragging: boolean;
  statusMeta: { icon: string; colorClass: string; bgClass: string };
  artifactUrl: string | undefined;
  renderPath: string | undefined;
  renderSummary: ShotRenderSummary | undefined;
  editShotFields: { visual_description: string; voiceover_text: string; camera_movement: string; duration: string } | null;
  updatingShotBusy: boolean;
  rerenderingShotIndex: number | null;
  activeScriptId: string | null;
  activeCreation: Creation | null;
  /** 时间轴缩放比例 */
  timelineScale: number;
  /** TTS 是否正在播放 */
  ttsSpeaking: boolean;
  /** 播放 TTS 旁白 */
  onTtsSpeak: (text: string) => void;
  /** 停止 TTS 播放 */
  onTtsStop: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditFieldChange: (field: string, value: string) => void;
  onRerender: () => void;
  onDownload: () => void;
}

const shotTimelineColors = [
  'from-cyan-950/80 to-cyan-900/40 border-cyan-800/50',
  'from-violet-950/80 to-violet-900/40 border-violet-800/50',
  'from-emerald-950/80 to-emerald-900/40 border-emerald-800/50',
  'from-amber-950/80 to-amber-900/40 border-amber-800/50',
  'from-pink-950/80 to-pink-900/40 border-pink-800/50',
  'from-blue-950/80 to-blue-900/40 border-blue-800/50',
  'from-teal-950/80 to-teal-900/40 border-teal-800/50',
  'from-orange-950/80 to-orange-900/40 border-orange-800/50',
];

function SortableTimelineShot({
  shot,
  isSelected,
  isEditing,
  isDragging,
  statusMeta,
  artifactUrl,
  renderPath,
  renderSummary,
  editShotFields,
  updatingShotBusy,
  rerenderingShotIndex,
  activeCreation,
  onSelect,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onEditFieldChange,
  onRerender,
  onDownload,
  timelineScale,
  ttsSpeaking,
  onTtsSpeak,
  onTtsStop,
}: SortableTimelineShotProps): JSX.Element {
  const { t } = useTranslation();
  const cameraOptions = useMemo(() => [
    { value: 'Static', label: t('creation.cameraStatic') },
    { value: 'Dolly_In_Fast', label: t('creation.cameraDollyIn') },
    { value: 'Dolly_Out', label: t('creation.cameraDollyOut') },
    { value: 'Pan_Left', label: t('creation.cameraPanLeft') },
    { value: 'Tilt_Up', label: t('creation.cameraTiltUp') },
  ] as const, [t]);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: shot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const colorScheme = shotTimelineColors[(shot.shot_index - 1) % shotTimelineColors.length];
  // Width proportional to duration; scaled by pinch-zoom
  const blockWidth = Math.max(120, Math.min(240, 100 + shot.duration * 28)) * timelineScale;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: blockWidth }}
      className={`flex-shrink-0 rounded-2xl border bg-gradient-to-br ${colorScheme} overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30 ${
        isDragging ? 'opacity-40 scale-95' : ''
      } ${isSelected ? 'ring-2 ring-cyan-400/60 shadow-[0_0_18px_rgba(34,211,238,0.18)] border-cyan-500/40 z-10' : 'border-white/[0.06]'} ${isEditing ? '' : 'cursor-pointer'}`}
      onClick={() => {
        if (isEditing) return;
        onSelect();
      }}
    >
      {/* 拖拽手柄 + 标题行 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab text-slate-500 hover:text-slate-300 active:cursor-grabbing shrink-0 transition-colors"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-bold text-white/90 tracking-wide">Shot {shot.shot_index}</span>
        <span className="ml-auto text-[10px] font-medium text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded-full">{formatDuration(shot.duration)}</span>
      </div>

      {/* 编辑模式 */}
      {isEditing && editShotFields ? (
        <div className="p-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-slate-400">{t('script.visualDescription')}</span>
            <Textarea
              value={editShotFields.visual_description}
              onChange={(e) => onEditFieldChange('visual_description', e.target.value)}
              rows={2}
              className="text-[10px] min-h-[44px] bg-slate-900/70 border-slate-700/60 focus:border-cyan-500/50 rounded-xl"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-slate-400">{t('script.voiceover')}</span>
            <Textarea
              value={editShotFields.voiceover_text}
              onChange={(e) => onEditFieldChange('voiceover_text', e.target.value)}
              rows={2}
              className="text-[10px] min-h-[44px] bg-slate-900/70 border-slate-700/60 focus:border-cyan-500/50 rounded-xl"
            />
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  if (ttsSpeaking) {
                    onTtsStop();
                  } else {
                    onTtsSpeak(editShotFields.voiceover_text);
                  }
                }}
                disabled={!editShotFields.voiceover_text.trim()}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-all ${
                  ttsSpeaking
                    ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                    : 'text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-slate-700/50 hover:border-cyan-500/20'
                } disabled:opacity-30`}
                title={ttsSpeaking ? t('creation.stopTrial') : t('creation.trialListen')}
              >
                {ttsSpeaking ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {ttsSpeaking ? t('creation.stopTrial') : t('creation.trialListen')}
              </button>
            </div>
          </label>
          <Select
            value={editShotFields.camera_movement}
            onChange={(e) => onEditFieldChange('camera_movement', e.target.value)}
          >
            {cameraOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <label className="space-y-1">
            <span className="text-[10px] font-medium text-slate-400">{t('script.durationSec')}</span>
            <input
              type="number"
              value={editShotFields.duration}
              onChange={(e) => onEditFieldChange('duration', e.target.value)}
              min={1}
              max={30}
              step={0.5}
              className="w-full rounded-xl border border-slate-700/60 bg-slate-900/70 px-2.5 py-1.5 text-[10px] text-slate-200 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="text-[10px] h-7 px-3 rounded-xl border-cyan-500/30 hover:border-cyan-500/60 hover:bg-cyan-500/10"
              disabled={updatingShotBusy}
              onClick={onSaveEdit}>
              {updatingShotBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" className="text-[10px] h-7 px-3 rounded-xl hover:bg-slate-800/60"
              onClick={onCancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 视频预览缩略图 */}
          <div className="relative overflow-hidden border-b border-white/[0.06]" style={{ height: 88 }}>
            {artifactUrl ? (
              <>
                <video
                  src={artifactUrl}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch((err: Error) => console.warn(`[CreatePage] 视频播放失败: ${err?.message || err}`))}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
                />
                {/* 渐变遮罩 + 播放图标提示 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[9px] text-white/70 pointer-events-none">
                  <Play className="h-2.5 w-2.5" />
                  Hover
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm">
                <span className="text-3xl opacity-20">{statusMeta.icon || '\u{1F3AC}'}</span>
              </div>
            )}
          </div>

          {/* 字幕预览 */}
          <div className="px-3 py-2.5 min-h-[44px]">
            <div className="text-[10px] text-slate-300 line-clamp-2 leading-relaxed font-medium">
              {shot.subtitle_text || t('script.noSubtitle')}
            </div>
          </div>

          {/* 状态 + 进度条 */}
          <div className="px-3 pb-2 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${statusMeta.colorClass} ${statusMeta.bgClass} border`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.colorClass.replace('text-', 'bg-').split(' ')[0] || 'bg-current'}`} />
                {renderSummary?.status ?? 'PENDING'}
              </span>
              {renderSummary?.source === 'RENDERED' && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 backdrop-blur-sm" title={renderSummary?.seedance_prompt || undefined}>
                  <Sparkles className="h-2.5 w-2.5" />I2V
                </span>
              )}
              {renderSummary?.retry_count !== undefined && renderSummary.retry_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-300 backdrop-blur-sm">
                  <RefreshCw className="h-2.5 w-2.5" />{renderSummary.retry_count}
                </span>
              )}
            </div>
            {renderSummary?.status === 'PROCESSING' && (
              <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded-full animate-pulse relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                </div>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="px-2.5 pb-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700/40 bg-slate-900/40 backdrop-blur-sm px-2 py-1 text-[9px] font-medium text-slate-400 hover:text-cyan-300 hover:border-cyan-600/50 hover:bg-cyan-500/5 transition-all"
              onClick={onEdit}
            >
              <Pencil className="h-2.5 w-2.5" />{t('common.edit')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-600/30 bg-cyan-500/5 backdrop-blur-sm px-2 py-1 text-[9px] font-medium text-cyan-400 hover:text-cyan-200 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!activeCreation || rerenderingShotIndex === shot.shot_index}
              onClick={onRerender}
            >
              {rerenderingShotIndex === shot.shot_index ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
              {t('creation.reRender')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-600/30 bg-emerald-500/5 backdrop-blur-sm px-2 py-1 text-[9px] font-medium text-emerald-400 hover:text-emerald-200 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={!renderPath}
              onClick={onDownload}
            >
              <Download className="h-2.5 w-2.5" />{t('common.download')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function CreatePage(): JSX.Element {
  const { t } = useTranslation();

  function getStageLabel(stage: string): string {
    const labels: Record<string, string> = {
      QUEUE_ALLOCATION: t('creation.stage_queue'),
      ASSET_MATCHING: t('creation.stage_asset'),
      AI_VIDEO_GENERATING: t('creation.stage_ai'),
      TTS_GENERATING: t('creation.stage_tts'),
      FFMPEG_STITCHING: t('creation.stage_ffmpeg'),
      LOUDNORM_COMPLIANCE: t('creation.stage_loudnorm'),
      FINISHED: t('creation.stage_finished'),
      FAILED: t('creation.stage_failed'),
      EXPORTED: t('creation.stage_exported'),
    };
    return labels[stage] || stage;
  }
  const products = useWorkspaceStore((state) => state.products);
  const selectedProductId = useWorkspaceStore((state) => state.selectedProductId);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const [searchParams, setSearchParams] = useSearchParams();

  const [scripts, setScripts] = useState<Script[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(
    searchParams.get('scriptId') || readPersistedScriptId(selectedProductId),
  );
  const [creations, setCreations] = useState<Creation[]>([]);
  const [creationsLoading, setCreationsLoading] = useState(false);
  const [creationsError, setCreationsError] = useState<string | null>(null);
  const [activeCreationId, setActiveCreationId] = useState<string | null>(
    readPersistedCreationId(selectedProductId),
  );
  const [activeCreation, setActiveCreation] = useState<Creation | null>(null);
  const [preview, setPreview] = useState<PreviewCompositionResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [targetResolution, setTargetResolution] = useState('1080x1920');
  const [exportFormat, setExportFormat] = useState<(typeof exportFormatOptions)[number]>('MP4');
  const [preferAiVideo, setPreferAiVideo] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [restitchBusy, setRestitchBusy] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [subtitleBusy, setSubtitleBusy] = useState<string | null>(null); // 正在处理的语言代码
  const subtitleMenuRef = useRef<HTMLDivElement>(null);

  // 点击字幕菜单外部时关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (subtitleMenuRef.current && !subtitleMenuRef.current.contains(event.target as Node)) {
        setShowSubtitleMenu(false);
      }
    }
    if (showSubtitleMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSubtitleMenu]);

  // BGM / 音频控制
  const [bgmStyle, setBgmStyle] = useState('auto_match');
  const [bgmVolume, setBgmVolume] = useState(25);
  const [voiceVolume, setVoiceVolume] = useState(75);

  // 音频轨道开关
  const [keepOriginalVideoAudio, setKeepOriginalVideoAudio] = useState(true);
  const [enableTtsVoiceover, setEnableTtsVoiceover] = useState(true);
  const [enableBgm, setEnableBgm] = useState(true);

  // 创作模式
  const [engineMode, setEngineMode] = useState<'SCRIPT_DRIVEN' | 'IMAGE_DRIVEN' | 'PROMPT_DRIVEN'>('SCRIPT_DRIVEN');
  // PROMPT_DRIVEN 模式
  const [productUrl, setProductUrl] = useState('');
  const [productTitle, setProductTitle] = useState('');
  const [productSellingPoints, setProductSellingPoints] = useState('');
  const [styleVibe, setStyleVibe] = useState('professional');
  // IMAGE_DRIVEN 模式
  const [materialId, setMaterialId] = useState('');
  const [visionResult, setVisionResult] = useState<VisionAnalysisResult | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [scriptGenBusy, setScriptGenBusy] = useState(false);
  const [scriptGenStep, setScriptGenStep] = useState<string>('');
  // 素材关联（所有模式）
  const [preferredMaterialIds, setPreferredMaterialIds] = useState<string[]>([]);
  const [sliceMatchStrategy, setSliceMatchStrategy] = useState<'AUTO' | 'MANUAL' | 'AUTO_WITH_PREFERRED'>('AUTO');
  const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null);
  const [compareShots, setCompareShots] = useState<[number, number] | null>(null);
  const [replacementSliceId, setReplacementSliceId] = useState('');
  const [rerenderingShotIndex, setRerenderingShotIndex] = useState<number | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** 预览模式：'full' = 完整导出视频；'shots' = Remotion 分镜组合预览；'single' = 单分镜独立视频预览 */
  const [previewMode, setPreviewMode] = useState<'full' | 'shots' | 'single'>('full');
  /** 右侧操作面板折叠状态 */
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [lastPollTime, setLastPollTime] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const userClickedShotRef = useRef(false);

  // 拖拽状态
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ttsPreview = useTtsPreview();
  const timelineTouch = useTimelineTouch({
    onSwipeRight: () => {
      if (selectedShotIndex !== null && activeScript && selectedShotIndex < activeScript.shots.length) {
        setSelectedShotIndex(selectedShotIndex + 1);
        userClickedShotRef.current = true;
      }
    },
    onSwipeLeft: () => {
      if (selectedShotIndex !== null && selectedShotIndex > 1) {
        setSelectedShotIndex(selectedShotIndex - 1);
        userClickedShotRef.current = true;
      }
    },
  });

  // 分镜编辑状态
  const [editingShotIndex, setEditingShotIndex] = useState<number | null>(null);
  const [editShotFields, setEditShotFields] = useState<{
    visual_description: string;
    voiceover_text: string;
    camera_movement: string;
    duration: string;
  } | null>(null);
  const [updatingShotBusy, setUpdatingShotBusy] = useState(false);

  // 撤销/重做
  const undoRedo = useUndoRedo<Script | null>({ initialState: null });

  function pushStateForUndo(): void {
    if (activeScript) {
      undoRedo.pushState(JSON.parse(JSON.stringify(activeScript)) as Script);
    }
  }

  // API Key 健康状态
  const [apiKeyStatus, setApiKeyStatus] = useState<{
    seedance: { ok: boolean; message: string; configured: boolean };
    worker: { ok: boolean; message: string; queue_waiting: number };
  } | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  const activeScript = useMemo(
    () => scripts.find((item) => item.script_id === activeScriptId) ?? null,
    [activeScriptId, scripts],
  );
  const scriptCreations = useMemo(
    () => creations.filter((item) => item.script_id === activeScriptId),
    [activeScriptId, creations],
  );
  const selectedShot = useMemo(
    () => activeScript?.shots.find((shot) => shot.shot_index === selectedShotIndex) ?? null,
    [activeScript, selectedShotIndex],
  );

  // 快捷键（依赖 activeScript，必须在 useMemo 之后）
  useScriptEditorShortcuts({
    onSave: () => {
      if (editingShotIndex !== null && editShotFields) {
        void saveEditShot();
      }
    },
    onDelete: () => {
      if (selectedShotIndex !== null && activeCreation) {
        void handleRerender(selectedShotIndex);
      }
    },
    onJumpToShot: (target: number) => {
      if (activeScript && activeScript.shots.some((s) => s.shot_index === target)) {
        setSelectedShotIndex(target);
        userClickedShotRef.current = true;
      }
    },
    onPrevShot: () => {
      if (selectedShotIndex !== null && selectedShotIndex > 1) {
        setSelectedShotIndex(selectedShotIndex - 1);
        userClickedShotRef.current = true;
      }
    },
    onNextShot: () => {
      if (selectedShotIndex !== null && activeScript && selectedShotIndex < activeScript.shots.length) {
        setSelectedShotIndex(selectedShotIndex + 1);
        userClickedShotRef.current = true;
      }
    },
    onUndo: () => {
      const prev = undoRedo.undo();
      if (prev && activeScriptId) {
        setScripts((current) =>
          current.map((s) => (s.script_id === activeScriptId ? prev : s)),
        );
      }
    },
    onRedo: () => {
      const next = undoRedo.redo();
      if (next && activeScriptId) {
        setScripts((current) =>
          current.map((s) => (s.script_id === activeScriptId ? next : s)),
        );
      }
    },
    maxShotCount: activeScript?.shots.length ?? 9,
  });

  // 获取分镜渲染路径，用于视频预览
  const getShotRenderPath = (shotIndex: number): string | undefined => {
    const render = activeCreation?.shot_renders?.find((r) => r.shot_index === shotIndex);
    return render?.render_path ?? undefined;
  };

  // 将本地路径或 localhost URL 转为浏览器可访问的路径（经 Vite 代理）
  const toArtifactUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    // 提取 /artifacts/xxx.mp4 路径段，统一走 Vite 代理避免 ORB 拦截
    const artifactsMatch = url.match(/\/artifacts\/([^/?#]+)/);
    if (artifactsMatch) return `/artifacts/${artifactsMatch[1]}`;
    // http/https 地址（不含 artifacts）直接透传
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // 本地文件路径：提取文件名走代理
    const fileName = url.split('/').pop() || url.split('\\').pop() || url;
    return `/artifacts/${fileName}`;
  };

  // 轮询刷新创建状态
  // 使用 ref 保持最新 activeCreationId，避免 setInterval 闭包过期
  const activeCreationIdRef = useRef(activeCreationId);
  activeCreationIdRef.current = activeCreationId;

  useEffect(() => {
    if (!activeCreation || isTerminalStatus(activeCreation.status)) {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    pollingTimerRef.current = setInterval(() => {
      const id = activeCreationIdRef.current;
      if (!id) return;
      void Promise.all([
        getCreation(id),
        getCreationPreview(id),
      ]).then(([creation, previewResponse]) => {
        setActiveCreation(creation);
        setPreview(previewResponse);
        setCreations((current) => upsertCreation(current, creation));
        setLastPollTime(Date.now());
      }).catch((err) => {
        console.warn(`[CreatePage] 定时轮询 creation 失败: ${(err as Error)?.message || err}`);
      });
    }, 3000);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [activeCreation?.status, activeCreationId]);

  // 已用时间计时器
  useEffect(() => {
    if (!activeCreation?.started_at || isTerminalStatus(activeCreation.status)) {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      if (!activeCreation?.started_at) {
        setElapsedSeconds(0);
      }
      return;
    }

    const started = new Date(activeCreation.started_at).getTime();
    setElapsedSeconds(Math.floor((Date.now() - started) / 1000));
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);

    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [activeCreation?.started_at, activeCreation?.status]);

  useEffect(() => {
    const urlScriptId = searchParams.get('scriptId');
    if (urlScriptId) setActiveScriptId(urlScriptId);
  }, [searchParams]);

  // 持久化 activeScriptId + activeCreationId 到 localStorage，供刷新恢复
  useEffect(() => {
    persistScriptId(selectedProductId, activeScriptId);
  }, [activeScriptId, selectedProductId]);

  useEffect(() => {
    persistCreationId(selectedProductId, activeCreationId);
  }, [activeCreationId, selectedProductId]);

  useEffect(() => {
    const productId = selectedProductId;
    if (!productId) {
      setScripts([]);
      setActiveScriptId(null);
      return;
    }

    let cancelled = false;
    setScriptsLoading(true);
    setScriptsError(null);

    void listScripts(productId, 1, 50)
      .then((response) => {
        if (cancelled) return;
        setScripts(response.items);
        const urlScriptId = searchParams.get('scriptId');
        const persistedScriptId = readPersistedScriptId(productId);
        setActiveScriptId(
          (urlScriptId && response.items.some((item) => item.script_id === urlScriptId))
            ? urlScriptId
            : (persistedScriptId && response.items.some((item) => item.script_id === persistedScriptId))
              ? persistedScriptId
              : response.items[0]?.script_id ?? null,
        );
      })
      .catch((error) => {
        if (!cancelled) setScriptsError(error instanceof Error ? error.message : t('creation.scriptListFailed'));
      })
      .finally(() => { if (!cancelled) setScriptsLoading(false); });

    return () => { cancelled = true; };
  }, [searchParams, selectedProductId]);

  useEffect(() => {
    if (!selectedProductId) {
      setCreations([]);
      setActiveCreationId(null);
      return;
    }
    let cancelled = false;
    setCreationsLoading(true);
    setCreationsError(null);
    void listCreations({ product_id: selectedProductId, limit: 50 })
      .then((response) => { if (!cancelled) setCreations(response.items); })
      .catch((error) => { if (!cancelled) setCreationsError(error instanceof Error ? error.message : t('creation.creationListFailed')); })
      .finally(() => { if (!cancelled) setCreationsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedProductId, lastPollTime]);

  useEffect(() => {
    if (!activeScriptId) { setActiveCreationId(null); return; }
    setActiveCreationId((current) => {
      if (current && scriptCreations.some((item) => item.creation_id === current)) return current;
      const persistedId = readPersistedCreationId(selectedProductId);
      if (persistedId && scriptCreations.some((item) => item.creation_id === persistedId)) return persistedId;
      return scriptCreations[0]?.creation_id ?? null;
    });
  }, [activeScriptId, scriptCreations]);

  useEffect(() => {
    if (!activeScript) { setSelectedShotIndex(null); return; }
    setSelectedShotIndex((current) =>
      current !== null && activeScript.shots.some((shot) => shot.shot_index === current)
        ? current
        : activeScript.shots[0]?.shot_index ?? null,
    );
  }, [activeScript]);

  useEffect(() => {
    if (!selectedShot) { setReplacementSliceId(''); return; }
    setReplacementSliceId(selectedShot.selected_slice_id ?? '');
  }, [selectedShot]);

  // SSE 进度订阅 —— 使用 activeCreationRef 避免闭包 stale
  const activeCreationRef = useRef(activeCreation);
  activeCreationRef.current = activeCreation;
  const sseReconnectRetriesRef = useRef(0);
  const sseReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeCreationId) { setActiveCreation(null); setPreview(null); setPreviewError(null); return; }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void Promise.all([getCreation(activeCreationId), getCreationPreview(activeCreationId)])
      .then(([creation, previewResponse]) => {
        if (cancelled) return;
        setActiveCreation(creation);
        setPreview(previewResponse);
      })
      .catch((error) => {
        if (!cancelled) { setPreviewError(error instanceof Error ? error.message : t('creation.creationDetailFailed')); setActiveCreation(null); setPreview(null); }
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [activeCreationId]);

  // 用于 SSE 进度刷新时的去重，避免同一进度重复请求预览
  const ssePreviewProgressRef = useRef(-1);

  useEffect(() => {
    const currentCreation = activeCreationRef.current;
    if (!currentCreation || isTerminalStatus(currentCreation.status)) return;

    const handleSseEvent = (event: TaskStreamEvent) => {
      sseReconnectRetriesRef.current = 0; // 连接成功，重置重试计数
      const current = activeCreationRef.current;
      if (!current) return;
      const { payload, type } = event;

      // 分镜级事件：直接更新 shot_renders，再触发预览刷新
      const isShotEvent = type === 'shot.render.completed' || type === 'shot.render.failed' || type === 'shot.render.processing';
      const shotPayload = isShotEvent ? (payload as SSEShotRenderEventPayload) : null;

      setActiveCreation((prev) => {
        if (!prev || prev.creation_id !== current.creation_id) return prev;
        let updated = {
          ...prev,
          status: payload.status,
          current_stage: payload.current_stage,
          progress: payload.progress,
          error_message: payload.message,
          trace_id: payload.trace_id,
          updated_at: payload.timestamp,
        };
        // 分镜事件：直接注入 render_path 和状态
        if (shotPayload && shotPayload.shot_index != null) {
          updated = {
            ...updated,
            shot_renders: prev.shot_renders.map((r) =>
              r.shot_index === shotPayload.shot_index
                ? {
                    ...r,
                    status: type === 'shot.render.completed' ? ('FINISHED' as const) : type === 'shot.render.failed' ? ('FAILED' as const) : r.status,
                    render_path: shotPayload.render_path ?? r.render_path,
                    error_message: shotPayload.error_message ?? r.error_message,
                  }
                : r,
            ),
          };
        }
        return updated;
      });
      setCreations((prev) =>
        prev.map((item) =>
          item.creation_id === current.creation_id
            ? { ...item, status: payload.status, current_stage: payload.current_stage, progress: payload.progress, error_message: payload.message, trace_id: payload.trace_id, updated_at: payload.timestamp }
            : item,
        ),
      );

      const shouldRefreshPreview = (() => {
        // 终态：强制刷新
        if (isTerminalStatus(payload.status)) return true;
        // 分镜事件：始终触发刷新以更新缩略图和预览
        if (isShotEvent) return true;
        // AI 视频生成阶段：进度有变化时刷新，让用户看到逐镜完成的视频
        if (payload.current_stage === 'AI_VIDEO_GENERATING' && payload.progress > ssePreviewProgressRef.current) {
          ssePreviewProgressRef.current = payload.progress;
          return true;
        }
        return false;
      })();

      if (shouldRefreshPreview && activeCreationId) {
        void Promise.all([getCreation(activeCreationId), getCreationPreview(activeCreationId)])
          .then(([creation, previewResponse]) => {
            setActiveCreation(creation);
            setPreview(previewResponse);
            setCreations((prev) => upsertCreation(prev, creation));
          })
          .catch((err) => {
            console.warn(`[CreatePage] SSE 更新 creation 失败: ${(err as Error)?.message || err}`);
          });
      }
      setPreviewError(null); // 连接恢复，清除错误
    };

    const scheduleSseReconnect = () => {
      const creation = activeCreationRef.current;
      if (!creation || isTerminalStatus(creation.status)) return;
      const retries = ++sseReconnectRetriesRef.current;
      const delay = Math.min(1000 * Math.pow(2, retries - 1), 30000);
      console.warn(`[CreatePage] SSE 将在 ${delay}ms 后重连（第 ${retries} 次）`);
      if (sseReconnectTimerRef.current) clearTimeout(sseReconnectTimerRef.current);
      sseReconnectTimerRef.current = setTimeout(() => {
        subscribeTaskEvents(creation.task_id, { onEvent: handleSseEvent, onError: scheduleSseReconnect });
      }, delay);
    };

    return subscribeTaskEvents(currentCreation.task_id, {
      onEvent: handleSseEvent,
      onError: () => {
        // SSE 断连由 EventSource 内置重连 + scheduleSseReconnect 双重保障，
        // 不向用户展示瞬态断连提示，避免无意义的错误闪烁。
        console.warn('[CreatePage] SSE connection error for creation', currentCreation.creation_id);
        scheduleSseReconnect();
      },
    });
  }, [activeCreationId]);

  useEffect(() => {
    let cancelled = false;
    async function checkHealth(): Promise<void> {
      setApiKeyLoading(true);
      try {
        const data = await getCreationHealth(selectedProductId ?? undefined);
        if (!cancelled) setApiKeyStatus({ seedance: data.seedance, worker: data.worker });
      } catch { if (!cancelled) setApiKeyStatus(null); }
      finally { if (!cancelled) setApiKeyLoading(false); }
    }
    void checkHealth();
    return () => { cancelled = true; };
  }, [selectedProductId]);

  // IMAGE_DRIVEN 模式：当选中素材时自动触发视觉分析
  useEffect(() => {
    if (!materialId || engineMode !== 'IMAGE_DRIVEN') {
      setVisionResult(null);
      return;
    }
    let cancelled = false;
    setVisionLoading(true);
    void analyzeMaterialVision(materialId)
      .then((result) => { if (!cancelled) setVisionResult(result); })
      .catch(() => { if (!cancelled) setVisionResult(null); })
      .finally(() => { if (!cancelled) setVisionLoading(false); });
    return () => { cancelled = true; };
  }, [materialId, engineMode]);

  // 点击分镜后跳转预览位置并自动播放
  useEffect(() => {
    if (selectedShotIndex === null || !preview || !userClickedShotRef.current) return;
    userClickedShotRef.current = false;

    const timelineIndex = preview.timeline.findIndex((s) => s.shot_index === selectedShotIndex);
    if (timelineIndex === -1) return;

    const startMs = preview.timeline
      .slice(0, timelineIndex)
      .reduce((sum, s) => sum + s.duration * 1000, 0);
    const startFrame = Math.floor(startMs / (1000 / 30));

    playerRef.current?.seekTo(startFrame);
    playerRef.current?.play();
  }, [selectedShotIndex, preview]);

  // ========== 拖拽排序 ==========
  function handleDragStart(event: DragStartEvent): void {
    setDraggingShotId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    setDraggingShotId(null);
    if (!over || !activeScript || !activeScriptId) return;
    if (active.id === over.id) return;

    const oldIndex = activeScript.shots.findIndex((s) => s.id === active.id);
    const newIndex = activeScript.shots.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const prevShots = [...activeScript.shots];
    const prevState = { ...activeScript, shots: prevShots };

    const newShots = [...activeScript.shots];
    const [removed] = newShots.splice(oldIndex, 1);
    newShots.splice(newIndex, 0, removed);

    const reindexed = newShots.map((shot, idx) => ({ ...shot, shot_index: idx + 1 }));
    // 保存状态到撤销历史
    pushStateForUndo();
    // 乐观更新本地状态
    setScripts((current) =>
      current.map((s) =>
        s.script_id === activeScriptId
          ? { ...s, shots: reindexed, video_duration: reindexed.reduce((sum, shot) => sum + shot.duration, 0) }
          : s,
      ),
    );

    patchScript(activeScriptId, [
      { op: 'move', from: `/shots/${oldIndex + 1}`, path: `/shots/${newIndex + 1}` },
    ])
      .then(() => {
        setActionMessage(t('creation.shotMoved', { from: oldIndex + 1, to: newIndex + 1 }));
        if (activeCreationId) {
          void Promise.all([
            getCreation(activeCreationId),
            getCreationPreview(activeCreationId),
          ]).then(([creation, previewResponse]) => {
            setActiveCreation(creation);
            setPreview(previewResponse);
            setCreations((current) => upsertCreation(current, creation));
          });
        }
      })
      .catch((error) => {
        // 回滚乐观更新：恢复拖拽前的分镜顺序
        setScripts((current) =>
          current.map((s) =>
            s.script_id === activeScriptId ? prevState : s,
          ),
        );
        setActionError(error instanceof Error ? error.message : t('creation.restitchFailed'));
      });
  }

  async function handleCreate(): Promise<void> {
    if (!selectedProductId) return;
    setCreateBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const baseParams = {
        product_id: selectedProductId,
        target_resolution: targetResolution,
        export_format: exportFormat,
        prefer_ai_video: preferAiVideo,
        voice_profile: 'default_female_zh',
        bgm_policy: 'auto_match',
        engine_mode: engineMode,
      };

      if (engineMode === 'SCRIPT_DRIVEN') {
        if (!activeScriptId) {
          setActionError(t('creation.selectScriptFirst'));
          setCreateBusy(false);
          return;
        }
        const result = await createCreation({
          ...baseParams,
          script_id: activeScriptId,
          ...(preferredMaterialIds.length > 0 ? {
            slice_match_strategy: sliceMatchStrategy,
            preferred_material_ids: preferredMaterialIds,
          } : {}),
        });
        setActionMessage(t('creation.taskCreated', { taskId: result.task_id }));
        const [creation, previewResponse] = await Promise.all([
          getCreation(result.creation_id),
          getCreationPreview(result.creation_id),
        ]);
        setCreations((current) => upsertCreation(current, creation));
        setActiveCreationId(result.creation_id);
        setActiveCreation(creation);
        setPreview(previewResponse);
      } else if (engineMode === 'IMAGE_DRIVEN') {
        if (!materialId) {
          setActionError(t('creation.selectMainImageFirst'));
          setCreateBusy(false);
          return;
        }
        const result = await createCreation({
          ...baseParams,
          material_id: materialId,
          style_vibe: styleVibe,
          aspect_ratio: targetResolution === '1920x1080' ? '16:9' : '9:16',
          ...(activeScriptId ? { script_id: activeScriptId } : {}),
          ...(preferredMaterialIds.length > 0 ? { preferred_material_ids: preferredMaterialIds } : {}),
        });
        setActionMessage(t('creation.taskCreatedImage', { taskId: result.task_id }));
        setActiveScriptId(result.script_id);
        const [creation, previewResponse] = await Promise.all([
          getCreation(result.creation_id),
          getCreationPreview(result.creation_id),
        ]);
        setCreations((current) => upsertCreation(current, creation));
        setActiveCreationId(result.creation_id);
        setActiveCreation(creation);
        setPreview(previewResponse);
      } else if (engineMode === 'PROMPT_DRIVEN') {
        const sellingPointsArray = productSellingPoints
          ? productSellingPoints.split(/[,;，；]/).map((s) => s.trim()).filter(Boolean)
          : undefined;
        const result = await createCreation({
          ...baseParams,
          product_url: productUrl || undefined,
          product_title: productTitle || undefined,
          product_selling_points: sellingPointsArray,
          style_vibe: styleVibe,
          aspect_ratio: targetResolution === '1920x1080' ? '16:9' : '9:16',
          ...(activeScriptId ? { script_id: activeScriptId } : {}),
        });
        setActionMessage(t('creation.taskCreatedLink', { taskId: result.task_id }));
        setActiveScriptId(result.script_id);
        const [creation, previewResponse] = await Promise.all([
          getCreation(result.creation_id),
          getCreationPreview(result.creation_id),
        ]);
        setCreations((current) => upsertCreation(current, creation));
        setActiveCreationId(result.creation_id);
        setActiveCreation(creation);
        setPreview(previewResponse);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setActionError(t('creation.createFailed') + ': ' + errMsg);
      setActionMessage(null); // Bug 17: 清除之前设置的成功消息，避免残留
    } finally { setCreateBusy(false); }
  }

  // IMAGE_DRIVEN: 仅生成剧本预览（不触发完整创作管线）
  async function handleGenerateScript(): Promise<void> {
    if (!selectedProductId || !materialId) return;
    setScriptGenBusy(true);
    setScriptGenStep('');
    setActionError(null);
    setActionMessage(null);
    try {
      // 步骤 1: AI 视觉分析（调用真实的多模态 LLM API）
      setScriptGenStep(t('creation.visionAnalyzing'));
      let imageAnalysis: string | undefined;
      try {
        const vision = await analyzeMaterialVision(materialId);
        setVisionResult(vision);

        // 构建 image_analysis 文本，匹配后端 Prompt 模板格式
        const parts: string[] = [];
        if (vision.product_features?.length) {
          parts.push(`商品视觉特征: ${vision.product_features.join('、')}`);
        }
        if (vision.style_tags?.length) {
          parts.push(`视觉风格: ${vision.style_tags.join('、')}`);
        }
        if (vision.quality_assessment) {
          parts.push(`画质: ${vision.quality_assessment.clarity}, 光线: ${vision.quality_assessment.lighting}, 构图: ${vision.quality_assessment.composition}`);
        }
        if (vision.shot_suggestions?.length) {
          const sorted = [...vision.shot_suggestions].sort((a, b) => b.priority - a.priority);
          parts.push(`推荐分镜类型: ${sorted.map(s => `${s.shot_type}(${s.description})`).join('; ')}`);
        }
        if (parts.length > 0) {
          imageAnalysis = parts.join('\n');
        }
      } catch (visionErr) {
        // 视觉分析失败不阻塞，仅 warn，继续生成剧本
        console.warn('[CreatePage] Vision analysis failed, proceeding without image_analysis:', visionErr);
      }

      // 步骤 2: LLM 生成剧本（传入 image_analysis 让 LLM 基于视觉特征生成更精准的剧本）
      setScriptGenStep(t('creation.scriptGenerating'));
      const sellingPoints = selectedProduct?.selling_points || [];
      const aspectRatio = targetResolution === '1920x1080' ? '16:9' as const : '9:16' as const;
      const result = await generateQuickScript({
        product_id: selectedProductId,
        title: selectedProduct?.title,
        selling_points: sellingPoints.length > 0 ? sellingPoints : ['品质可靠', '设计精良'],
        style_vibe: styleVibe,
        aspect_ratio: aspectRatio,
        language: 'zh-CN',
        material_ids: [materialId],
        image_analysis: imageAnalysis,
      });

      // 步骤 3: 加载生成的剧本到活跃剧本
      setScriptGenStep('');
      setActiveScriptId(result.script_id);
      persistScriptId(selectedProductId, result.script_id);
      setSearchParams({ scriptId: result.script_id });
      void listScripts(selectedProductId, 1, 50).then((response) => {
        setScripts(response.items);
      });
      setActionMessage(t('creation.scriptGenerated', { shots: result.shots.length }));
    } catch (error) {
      setScriptGenStep('');
      const errMsg = error instanceof Error ? error.message : String(error);
      setActionError(t('creation.scriptGenerateFailed') + ': ' + errMsg);
    } finally { setScriptGenBusy(false); }
  }

  // 下载完整视频
  async function handleDownloadFullVideo(): Promise<void> {
    if (!activeCreation?.video_url) return;
    const url = toArtifactUrl(activeCreation.video_url);
    if (!url) return;
    // 直接触发浏览器下载
    const a = document.createElement('a');
    a.href = url;
    a.download = `tikstream_${activeCreation.creation_id.slice(0, 8)}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionMessage(t('creation.downloadTriggered'));
  }

  // 下载分镜片段
  function handleDownloadShot(shotIndex: number): void {
    const renderPath = getShotRenderPath(shotIndex);
    const url = toArtifactUrl(renderPath);
    if (!url) {
      setActionError(t('creation.shotNotRendered'));
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `tikstream_shot_${shotIndex}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionMessage(t('creation.shotDownloadTriggered', { n: shotIndex }));
  }

  // 下载字幕文件
  const subtitleLanguages = [
    { code: 'en-US', label: 'English (US)' },
    { code: 'id-ID', label: 'Bahasa Indonesia' },
    { code: 'th-TH', label: 'ภาษาไทย' },
    { code: 'vi-VN', label: 'Tiếng Việt' },
    { code: 'ms-MY', label: 'Bahasa Melayu' },
  ];

  async function handleDownloadSubtitles(lang: string): Promise<void> {
    const scriptId = activeCreation?.script_id;
    if (!scriptId) return;
    setSubtitleBusy(lang);
    setActionError(null);
    setActionMessage(null);
    try {
      // 1. 检查是否已有翻译
      const translationsRes = await getScriptTranslations(scriptId);
      const existingTranslations = translationsRes?.shots || [];
      const hasLang = existingTranslations.some((t: { target_lang: string }) => t.target_lang === lang);

      if (!hasLang) {
        // 2. 触发翻译
        setActionMessage(t('creation.translating'));
        await triggerScriptTranslation(scriptId, { target_langs: [lang] });
        setActionMessage(null);
      }

      // 3. 通过 fetch 下载字幕文件（而非 <a> 点击，以便捕获错误）
      const url = getSubtitleDownloadUrl(scriptId, lang, 'srt');
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `tikstream_subtitle_${lang}.srt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      setShowSubtitleMenu(false);
      setActionMessage(t('creation.subtitleDownloaded', { lang }));
    } catch (error) {
      console.error('Subtitle download failed:', error);
      setActionError(t('creation.subtitleDownloadFailed', { error: error instanceof Error ? error.message : 'Unknown' }));
    } finally {
      setSubtitleBusy(null);
    }
  }

  // 触发导出（后端校验 FINISHED）
  async function handleTriggerExport(): Promise<void> {
    if (!activeCreation) return;
    setExportBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await exportCreation(activeCreation.creation_id);
      setActionMessage(t('creation.exportTriggered', { taskId: result.task_id }));
    } catch (error) {
      setActionError(t('creation.exportFailed'));
    } finally { setExportBusy(false); }
  }

  async function handleRetry(): Promise<void> {
    if (!activeCreation) return;
    setRetryBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await retryCreation(activeCreation.creation_id);
      setActionMessage(t('creation.retryTriggered', { taskId: result.task_id }));
      const [creation, previewResponse] = await Promise.all([
        getCreation(result.creation_id),
        getCreationPreview(result.creation_id),
      ]);
      setCreations((current) => upsertCreation(current, creation));
      setActiveCreation(creation);
      setPreview(previewResponse);
    } catch (error) {
      setActionError(t('creation.retryFailed'));
    } finally { setRetryBusy(false); }
  }

  async function handleRestitch(): Promise<void> {
    if (!activeCreation) return;
    setRestitchBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const audioMixConfig: AudioMixConfig = {
        keep_original_video_audio: keepOriginalVideoAudio,
        enable_tts_voiceover: enableTtsVoiceover,
        enable_bgm: enableBgm,
        bgm_volume: bgmVolume / 100,
        voiceover_volume: voiceVolume / 100,
      };
      const result = await restitchCreation(activeCreation.creation_id, audioMixConfig);
      setActionMessage(t('creation.restitchTriggered', { taskId: result.task_id }));
      const [creation, previewResponse] = await Promise.all([
        getCreation(result.creation_id),
        getCreationPreview(result.creation_id),
      ]);
      setCreations((current) => upsertCreation(current, creation));
      setActiveCreation(creation);
      setPreview(previewResponse);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setActionError(t('creation.restitchFailed') + ': ' + errMsg);
    } finally { setRestitchBusy(false); }
  }

  async function handleRerender(shotIndex: number): Promise<void> {
    if (!activeCreation) return;
    setRerenderingShotIndex(shotIndex);
    setActionError(null);
    setActionMessage(null);
    try {
      await rerenderCreationShot(activeCreation.creation_id, { shot_index: shotIndex, force_refresh: true });
      const [creation, previewResponse] = await Promise.all([
        getCreation(activeCreation.creation_id),
        getCreationPreview(activeCreation.creation_id),
      ]);
      setCreations((current) => upsertCreation(current, creation));
      setActiveCreation(creation);
      setPreview(previewResponse);
      setActionMessage(t('creation.rerenderTriggered', { n: shotIndex }));
    } catch (error) {
      setActionError(t('creation.rerenderFailed'));
    } finally { setRerenderingShotIndex(null); }
  }

  async function handleReplaceSlice(): Promise<void> {
    if (!activeCreation || selectedShotIndex === null || !replacementSliceId.trim()) return;
    setReplaceBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      await replaceCreationSlice(activeCreation.creation_id, { shot_index: selectedShotIndex, slice_id: replacementSliceId.trim() });
      const [creation, previewResponse] = await Promise.all([
        getCreation(activeCreation.creation_id),
        getCreationPreview(activeCreation.creation_id),
      ]);
      setCreations((current) => upsertCreation(current, creation));
      setActiveCreation(creation);
      setPreview(previewResponse);
      setActionMessage(t('creation.sliceReplaced', { n: selectedShotIndex, id: replacementSliceId.trim() }));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setActionError(t('creation.sliceReplaceFailed') + ': ' + errMsg);
    } finally { setReplaceBusy(false); }
  }

  // 分镜编辑：开始编辑
  function startEditShot(shot: ScriptShot): void {
    setEditingShotIndex(shot.shot_index);
    setEditShotFields({
      visual_description: shot.visual_description,
      voiceover_text: shot.voiceover_text,
      camera_movement: shot.camera_movement,
      duration: String(shot.duration),
    });
  }

  // 分镜编辑：取消
  function cancelEditShot(): void {
    setEditingShotIndex(null);
    setEditShotFields(null);
  }

  // 分镜编辑：保存并触发重渲染
  async function saveEditShot(): Promise<void> {
    if (!activeCreation || editingShotIndex === null || !editShotFields) return;
    pushStateForUndo();
    setUpdatingShotBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      // 通过 PATCH /api/v1/scripts/:script_id 更新分镜数据
      if (activeScriptId) {
        const patchOps = [
          { op: 'replace' as const, path: `/shots/${editingShotIndex}/visual_description`, value: editShotFields.visual_description },
          { op: 'replace' as const, path: `/shots/${editingShotIndex}/voiceover_text`, value: editShotFields.voiceover_text },
          { op: 'replace' as const, path: `/shots/${editingShotIndex}/camera_movement`, value: editShotFields.camera_movement },
          { op: 'replace' as const, path: `/shots/${editingShotIndex}/duration`, value: Number(editShotFields.duration) },
        ];
        await patchScript(activeScriptId, patchOps);
      }
      // 触发该分镜重渲染
      await rerenderCreationShot(activeCreation.creation_id, { shot_index: editingShotIndex, force_refresh: true });
      cancelEditShot();
      const [creation, previewResponse] = await Promise.all([
        getCreation(activeCreation.creation_id),
        getCreationPreview(activeCreation.creation_id),
      ]);
      setCreations((current) => upsertCreation(current, creation));
      setActiveCreation(creation);
      setPreview(previewResponse);
      setActionMessage(t('creation.shotUpdatedRender', { n: editingShotIndex }));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setActionError(t('creation.shotUpdateFailed') + ': ' + errMsg);
    } finally { setUpdatingShotBusy(false); }
  }

  const canExport = activeCreation?.status === 'FINISHED' && !!activeCreation?.video_url;
  const isProcessing = activeCreation?.status === 'PROCESSING';

  // 预览台自适应高度 + 移动端视口 auto-scale
  const playerMaxH = resolutionOptions.find((r) => r.value === targetResolution)?.maxH ?? 640;
  const isPortrait = targetResolution.includes('1920') ? false : true;
  const { isMobile: isMobileViewport } = useBreakpoint();
  const desktopMaxW = isPortrait ? 390 : 640;
  const phoneMaxW = isMobileViewport ? Math.min(window.innerWidth - 32, desktopMaxW) : desktopMaxW;

  return (
    <div className="space-y-6">
      {scriptsLoading && scripts.length === 0 ? (
        <CreationSkeleton />
      ) : (
        <>
        <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cyan-400" />
            {t('creation.workspace')}
          </CardTitle>
          {apiKeyLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs backdrop-blur-sm">
              <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
              <span className="text-slate-400">{t('creation.checkingSeedance')}</span>
            </div>
          ) : apiKeyStatus ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-medium backdrop-blur-sm ${
                apiKeyStatus.seedance.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' :
                apiKeyStatus.seedance.configured ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' :
                'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                <div className={`h-1.5 w-1.5 rounded-full ${apiKeyStatus.seedance.ok ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : apiKeyStatus.seedance.configured ? 'bg-amber-400' : 'bg-rose-400'}`} />
                <span>Seedance: {apiKeyStatus.seedance.message}</span>
              </div>
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-medium backdrop-blur-sm ${
                apiKeyStatus.worker.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' :
                'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                <div className={`h-1.5 w-1.5 rounded-full ${apiKeyStatus.worker.ok ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-rose-400'}`} />
                <span>Worker: {apiKeyStatus.worker.message}</span>
              </div>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 模式选择 Tab */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-900/60 backdrop-blur-sm p-1 border border-slate-800/60">
            {([
              { value: 'SCRIPT_DRIVEN', label: t('creation.modeScript'), desc: t('creation.modeScriptSub') },
              { value: 'IMAGE_DRIVEN', label: t('creation.modeImage'), desc: t('creation.modeImageSub') },
              { value: 'PROMPT_DRIVEN', label: t('creation.modeLink'), desc: t('creation.modeLinkSub') },
            ] as const).map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  setEngineMode(mode.value);
                  setActionError(null);
                  setActionMessage(null);
                }}
                className={`flex-1 rounded-lg px-3 py-2.5 text-center transition-all duration-200 ${
                  engineMode === mode.value
                    ? 'bg-gradient-to-b from-slate-700/80 to-slate-800/80 text-slate-100 shadow-md shadow-black/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-medium">{mode.label}</div>
                <div className="text-[10px] opacity-60">{mode.desc}</div>
              </button>
            ))}
          </div>

          {engineMode === 'SCRIPT_DRIVEN' ? (
            /* ---- 脚本驱动模式 ---- */
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1.2fr_0.9fr_auto]">
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-400">{t('creation.currentProduct')}</div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100">
                  {selectedProduct?.title ?? t('creation.selectProductFirst')}
                </div>
              </div>
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">{t('creation.script')}</span>
                <Select
                  value={activeScriptId ?? ''}
                  onChange={(event) => {
                    const nextScriptId = event.target.value || null;
                    setActiveScriptId(nextScriptId);
                    setSearchParams(nextScriptId ? { scriptId: nextScriptId } : {});
                  }}
                  disabled={!selectedProductId || scriptsLoading || scripts.length === 0}
                >
                  <option value="">{t('creation.selectScript')}</option>
                  {scripts.map((script) => (
                    <option key={script.script_id} value={script.script_id}>
                      {(script.title || t('creation.scriptIdLabel', { id: script.script_id.slice(0, 8) })) + ` · ${formatDuration(script.video_duration)}`}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-400">{t('creation.aspectRatio')}</span>
                  <Select value={targetResolution} onChange={(event) => setTargetResolution(event.target.value)}>
                    {resolutionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-400">{t('creation.exportFormat')}</span>
                  <Select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as typeof exportFormatOptions[number])}>
                    {exportFormatOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={preferAiVideo} onChange={(e) => setPreferAiVideo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500" />
                  <span className="text-xs font-medium text-slate-400">{preferAiVideo ? t('creation.aiMatching') : t('creation.aiMatchingOff')}</span>
                </label>
                <Button onClick={() => void handleCreate()} disabled={!selectedProductId || !activeScriptId || createBusy} className="w-full lg:w-auto">
                  {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                  {t('creation.oneClick')}
                </Button>
              </div>

              {/* 素材关联面板 */}
              {selectedProductId && (
                <div className="col-span-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">{t('creation.materialAssociate')}</span>
                    <Select
                      value={sliceMatchStrategy}
                      onChange={(e) => setSliceMatchStrategy(e.target.value as typeof sliceMatchStrategy)}
                      className="h-7 text-xs w-44"
                    >
                      <option value="AUTO">{t('creation.matchAuto')}</option>
                      <option value="AUTO_WITH_PREFERRED">{t('creation.matchPreferred')}</option>
                      <option value="MANUAL">{t('creation.matchManual')}</option>
                    </Select>
                  </div>
                  {sliceMatchStrategy !== 'AUTO' && (
                    <MaterialSelector
                      productId={selectedProductId}
                      mode="multiple"
                      maxSelect={8}
                      selectedIds={preferredMaterialIds}
                      onChange={(ids) => setPreferredMaterialIds(ids)}
                    />
                  )}
                </div>
              )}
            </div>
          ) : engineMode === 'IMAGE_DRIVEN' ? (
            /* ---- 上传主图模式 ---- */
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr_auto]">
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-400">{t('creation.currentProduct')}</div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100">
                  {selectedProduct?.title ?? t('creation.selectProductFirst')}
                </div>
              </div>
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">
                  {t('creation.productMainImageId')}
                  <span className="text-amber-400 ml-1">{t('creation.required')}</span>
                </span>
                {/* 显示已选素材 ID，点击图片自动填入 */}
                <input
                  type="text"
                  readOnly
                  value={materialId || ''}
                  placeholder={t('creation.productMainImageIdPlaceholder') || '点击下方图片素材自动填入'}
                  className="w-full h-9 rounded-xl border border-slate-700 bg-slate-900/60 px-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 cursor-default"
                />
                {selectedProductId ? (
                  <MaterialSelector
                    productId={selectedProductId}
                    mode="single"
                    typeFilter={['IMAGE']}
                    maxSelect={1}
                    selectedIds={materialId ? [materialId] : []}
                    onChange={(ids, _materials) => setMaterialId(ids[0] || '')}
                  />
                ) : (
                  <div className="text-xs text-slate-500 py-4 text-center rounded-2xl border border-dashed border-slate-800">
                    {t('creation.selectProductFirst')}
                  </div>
                )}
                <div className="text-[10px] text-slate-500">{t('creation.imageModeHint')}</div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-400">{t('creation.styleVibe')}</span>
                  <Select value={styleVibe} onChange={(e) => setStyleVibe(e.target.value)}>
                    <option value="professional">{t('creation.styleBusiness')}</option>
                    <option value="casual">{t('creation.styleCasual')}</option>
                    <option value="energetic">{t('creation.styleDynamic')}</option>
                    <option value="luxury">{t('creation.stylePremium')}</option>
                    <option value="minimalist">{t('creation.styleMinimal')}</option>
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-400">{t('creation.aspectRatio')}</span>
                  <Select value={targetResolution} onChange={(event) => setTargetResolution(event.target.value)}>
                    {resolutionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <Button
                    onClick={() => void handleGenerateScript()}
                    disabled={!selectedProductId || !materialId || scriptGenBusy || createBusy}
                    variant="outline"
                    className="flex-1"
                  >
                    {scriptGenBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {scriptGenBusy && scriptGenStep ? scriptGenStep : t('creation.generateScript')}
                  </Button>
                  <Button onClick={() => void handleCreate()} disabled={!selectedProductId || !materialId || createBusy || scriptGenBusy} className="flex-1">
                    {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t('creation.uploadAndCreate')}
                  </Button>
                </div>
                {scriptGenBusy && scriptGenStep && (
                  <div className="flex items-center gap-2 text-xs text-cyan-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {scriptGenStep}
                  </div>
                )}
              </div>

              {/* AI 视觉分析结果展示 */}
              {materialId && (
                <div className="col-span-full rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                  {visionLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('creation.visionAnalyzing')}
                    </div>
                  ) : visionResult ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-xs font-medium text-slate-300">{t('creation.visionResult')}</span>
                      </div>
                      {visionResult.product_features?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500">{t('creation.visionFeatures')}</span>
                          <div className="flex flex-wrap gap-1">
                            {visionResult.product_features.map((f, i) => (
                              <span key={i} className="inline-flex rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] text-cyan-300">{f}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {visionResult.style_tags?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500">{t('creation.visionStyle')}</span>
                          <div className="flex flex-wrap gap-1">
                            {visionResult.style_tags.map((s, i) => (
                              <span key={i} className="inline-flex rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {visionResult.visual_selling_points?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500">{t('creation.visionSellingPoints')}</span>
                          <div className="flex flex-wrap gap-1">
                            {visionResult.visual_selling_points.map((p, i) => (
                              <span key={i} className="inline-flex rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">{p}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {visionResult.shot_suggestions?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-500">{t('creation.visionShotSuggestions')}</span>
                          <div className="flex flex-wrap gap-1">
                            {[...visionResult.shot_suggestions]
                              .sort((a, b) => b.priority - a.priority)
                              .map((s, i) => (
                                <span key={i} className="inline-flex rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300" title={s.description}>
                                  {s.shot_type}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                      {visionResult.quality_assessment && (
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                          <span>{t('creation.visionClarity')}: <span className={
                            visionResult.quality_assessment.clarity === 'high' ? 'text-emerald-300' :
                            visionResult.quality_assessment.clarity === 'medium' ? 'text-amber-300' : 'text-slate-500'
                          }>{t(`creation.visionClarity${visionResult.quality_assessment.clarity === 'high' ? 'High' : visionResult.quality_assessment.clarity === 'medium' ? 'Medium' : 'Low'}`)}</span></span>
                          <span>{t('creation.visionLighting')}: {visionResult.quality_assessment.lighting}</span>
                          <span>{t('creation.visionComposition')}: {visionResult.quality_assessment.composition}</span>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            /* ---- 商品链接模式 ---- */
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_0.8fr_auto]">
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">{t('creation.productLink')}</span>
                <input
                  type="text"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder={t('creation.pasteProductLink')}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
                <div className="text-[10px] text-slate-500">{t('creation.linkModeHint')}</div>
              </label>
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-400">{t('creation.productDesc')}</div>
                <input
                  type="text"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  placeholder={t('creation.productName')}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
                <input
                  type="text"
                  value={productSellingPoints}
                  onChange={(e) => setProductSellingPoints(e.target.value)}
                  placeholder={t('creation.sellingPoints')}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-400">{t('creation.styleVibe')}</span>
                  <Select value={styleVibe} onChange={(e) => setStyleVibe(e.target.value)}>
                    <option value="professional">{t('creation.styleBusiness')}</option>
                    <option value="casual">{t('creation.styleCasual')}</option>
                    <option value="energetic">{t('creation.styleDynamic')}</option>
                    <option value="luxury">{t('creation.stylePremium')}</option>
                    <option value="minimalist">{t('creation.styleMinimal')}</option>
                  </Select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-400">{t('creation.aspectRatio')}</span>
                  <Select value={targetResolution} onChange={(event) => setTargetResolution(event.target.value)}>
                    {resolutionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => void handleCreate()} disabled={!selectedProductId || createBusy} className="w-full">
                  {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {t('creation.parseAndCreate')}
                </Button>
              </div>
            </div>
          )}

          {(scriptsError || creationsError || actionError || actionMessage) && (
            <div className="space-y-2 text-sm">
              {scriptsError && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 backdrop-blur-sm px-4 py-3 text-xs font-medium text-rose-300 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-400 shrink-0" />{scriptsError}
                </div>
              )}
              {creationsError && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 backdrop-blur-sm px-4 py-3 text-xs font-medium text-rose-300 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-400 shrink-0" />{creationsError}
                </div>
              )}
              {actionError && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 backdrop-blur-sm px-4 py-3 text-xs font-medium text-rose-300 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-400 shrink-0" />{actionError}
                </div>
              )}
              {actionMessage && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 backdrop-blur-sm px-4 py-3 text-xs font-medium text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />{actionMessage}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分镜时间轴（素材关联下方、预览上方） */}
      <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400/60" />
              {t('creation.timeline')}
            </CardTitle>
            <CardDescription>
              {activeScript
                ? `${t('creation.shotsSummary', { n: activeScript.shots.length })} · ${formatDuration(activeScript.video_duration)}`
                : t('creation.selectScriptToPreview')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeScript ? (
              <div className="rounded-2xl border border-dashed border-slate-700/50 bg-slate-950/60 p-8 text-center">
                <Clapperboard className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <div className="text-sm font-medium text-slate-400">{t('creation.noScriptAvailable')}</div>
                <div className="mt-1 text-xs text-slate-600">{t('creation.selectScriptToPreview')}</div>
              </div>
            ) : (
              <DndContext
                sensors={dragSensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={activeScript.shots.map((shot) => shot.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div
                    className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2 scrollbar-thin scrollbar-thumb-slate-600/50 scrollbar-track-transparent"
                    style={{ touchAction: 'pan-x' }}
                    {...timelineTouch.touchHandlers}
                  >
                    {activeScript.shots.map((shot) => {
                      const renderSummary = activeCreation?.shot_renders.find((r) => r.shot_index === shot.shot_index);
                      const renderPath = getShotRenderPath(shot.shot_index);
                      const artifactUrl = toArtifactUrl(renderPath);
                      const isSelected = shot.shot_index === selectedShotIndex;
                      const isEditing = shot.shot_index === editingShotIndex;
                      const isDragging = draggingShotId === shot.id;
                      const statusMeta = getShotStatusMeta(renderSummary?.status ?? 'PENDING');

                      return (
                        <SortableTimelineShot
                          key={shot.id}
                          shot={shot}
                          isSelected={isSelected}
                          isEditing={isEditing}
                          isDragging={isDragging}
                          statusMeta={statusMeta}
                          artifactUrl={artifactUrl}
                          renderPath={renderPath}
                          renderSummary={renderSummary}
                          editShotFields={editShotFields}
                          updatingShotBusy={updatingShotBusy}
                          rerenderingShotIndex={rerenderingShotIndex}
                          activeScriptId={activeScriptId}
                          activeCreation={activeCreation}
                          timelineScale={timelineTouch.scale}
                          ttsSpeaking={ttsPreview.speaking}
                          onTtsSpeak={(text: string) => ttsPreview.speak(text)}
                          onTtsStop={() => ttsPreview.stop()}
                          onSelect={() => {
                            userClickedShotRef.current = true;
                            if (selectedShotIndex !== null && selectedShotIndex !== shot.shot_index) {
                              // Shift+Click：加入对比模式
                              setCompareShots(
                                compareShots
                                  ? [compareShots[1], shot.shot_index] as [number, number]
                                  : [selectedShotIndex, shot.shot_index] as [number, number],
                              );
                            }
                            setSelectedShotIndex(shot.shot_index);
                          }}
                          onEdit={() => startEditShot(shot)}
                          onSaveEdit={() => void saveEditShot()}
                          onCancelEdit={cancelEditShot}
                          onEditFieldChange={(field, value) => {
                            if (editShotFields) {
                              setEditShotFields({ ...editShotFields, [field]: value });
                            }
                          }}
                          onRerender={() => void handleRerender(shot.shot_index)}
                          onDownload={() => handleDownloadShot(shot.shot_index)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {draggingShotId ? (
                    <div className="rounded-2xl border-2 border-cyan-400/50 bg-slate-800/95 backdrop-blur-md p-4 w-[170px] flex-shrink-0 shadow-2xl shadow-cyan-500/30">
                      {(() => {
                        const shot = activeScript.shots.find((s) => s.id === draggingShotId);
                        if (!shot) return null;
                        return (
                          <div className="flex items-center gap-3">
                            <GripVertical className="h-4 w-4 text-cyan-400/60" />
                            <div>
                              <span className="text-xs font-bold text-white">Shot {shot.shot_index}</span>
                              <span className="ml-2 text-[10px] text-cyan-300">{formatDuration(shot.duration)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </CardContent>
        </Card>

        {/* 预览 + 右侧面板 */}
        <div className={`grid gap-6 transition-all duration-300 ${rightPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-[1fr]'}`}>
        {/* 预览台 */}
        <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400/60" />
              {t('creation.preview')}
            </CardTitle>
            <CardDescription>
              {preview?.canvas
                ? `preview ${preview.preview_version.slice(0, 19)} · ${preview.canvas.width} × ${preview.canvas.height}`
                : t('creation.previewEmptyDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewLoading ? (
              <PreviewLoadingPlaceholder />
            ) : preview ? (
              <>
                {/* 预览模式切换 */}
                <Tabs value={previewMode} onValueChange={(v) => setPreviewMode(v as 'full' | 'shots' | 'single')}>
                  <TabsList className="w-full">
                    <TabsTrigger value="full" className="flex-1 text-xs">{t('creation.fullVideo')}</TabsTrigger>
                    <TabsTrigger value="shots" className="flex-1 text-xs">{t('creation.shotPreview')}</TabsTrigger>
                    <TabsTrigger value="single" className="flex-1 text-xs">{t('creation.singleShot')}</TabsTrigger>
                  </TabsList>
                </Tabs>

                {previewMode === 'full' ? (
                  /* 完整视频模式：使用原生 video 标签播放 video_url */
                  <div className="flex justify-center">
                    <div
                      className="overflow-hidden rounded-[2.5rem] border-[3px] border-slate-600/80 bg-black shadow-2xl shadow-purple-500/5 ring-1 ring-white/5"
                      style={{ maxWidth: phoneMaxW, width: '100%' }}
                    >
                      {activeCreation?.video_url ? (
                        <video
                          src={toArtifactUrl(activeCreation.video_url) ?? undefined}
                          controls
                          loop
                          autoPlay={false}
                          playsInline
                          preload="auto"
                          className="w-full"
                          style={{ maxHeight: playerMaxH }}
                          poster={undefined}
                        >
                          {t('creation.browserNoSupport')}
                        </video>
                      ) : (
                        <div className="flex min-h-[480px] flex-col items-center justify-center text-slate-400">
                          <Video className="mb-3 h-8 w-8 text-slate-500" />
                          <div className="text-sm">{t('creation.videoGenerating')}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {t('creation.videoStitchingHint')}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-center bg-black pb-2 pt-1">
                        <div className="h-1 w-24 rounded-full bg-slate-400" />
                      </div>
                    </div>
                  </div>
                ) : previewMode === 'single' ? (
                  /* 单分镜独立视频预览：播放选中分镜的渲染产物 */
                  <div className="flex justify-center">
                    <div
                      className="overflow-hidden rounded-[2.5rem] border-[3px] border-slate-600/80 bg-black shadow-2xl shadow-purple-500/5 ring-1 ring-white/5"
                      style={{ maxWidth: phoneMaxW, width: '100%' }}
                    >
                      {(() => {
                        const shotTrack = selectedShotIndex !== null
                          ? preview.video_tracks.find((t) => t.shot_index === selectedShotIndex)
                          : null;
                        const shotVideoUrl = toArtifactUrl(shotTrack?.render_path);
                        return shotVideoUrl ? (
                          <video
                            src={shotVideoUrl}
                            controls
                            loop
                            autoPlay={false}
                            playsInline
                            preload="auto"
                            className="w-full"
                            style={{ maxHeight: playerMaxH }}
                          />
                        ) : (
                          <div className="flex min-h-[480px] flex-col items-center justify-center text-slate-400">
                            <Video className="mb-3 h-8 w-8 text-slate-500" />
                            <div className="text-sm">
                              {selectedShotIndex !== null
                                ? t('creation.shotNoRender', { n: selectedShotIndex })
                                : t('creation.selectShotCardToPreview')}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {t('creation.selectShotCardPreviewHint')}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex justify-center bg-black pb-2 pt-1">
                        <div className="h-1 w-24 rounded-full bg-slate-400" />
                      </div>
                    </div>
                  </div>
                ) : preview?.canvas ? (
                  /* 分镜预览模式：Remotion Player */
                  <div className="flex justify-center">
                    <div
                      className="overflow-hidden rounded-[2.5rem] border-[3px] border-slate-600/80 bg-black shadow-2xl shadow-purple-500/5 ring-1 ring-white/5"
                      style={{ maxWidth: phoneMaxW, width: '100%' }}
                    >
                      <div className="flex items-center justify-between bg-black px-6 pt-2 pb-1">
                        <span className="text-[10px] font-medium text-white">9:41</span>
                        <div className="h-4 w-20 rounded-full bg-black" />
                        <div className="flex items-center gap-1 text-[10px] text-white">
                          <span>▮▮▮</span>
                          <span>WiFi</span>
                          <span>🔋</span>
                        </div>
                      </div>
                      <Player
                        ref={playerRef}
                        key={`${preview.preview_version}-${previewMode}`}
                        component={CreationPreviewPlayer}
                        durationInFrames={Math.max(45, Math.ceil(preview.total_duration_seconds * 30))}
                        compositionWidth={preview.canvas.width}
                        compositionHeight={preview.canvas.height}
                        fps={30}
                        controls
                        loop
                        autoPlay={false}
                        clickToPlay
                        acknowledgeRemotionLicense
                        style={{ width: '100%', maxHeight: playerMaxH }}
                        inputProps={{ preview, selectedShotIndex }}
                      />
                      <div className="flex justify-center bg-black pb-2 pt-1">
                        <div className="h-1 w-24 rounded-full bg-slate-400" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[480px] flex-col items-center justify-center text-slate-400">
                    <Video className="mb-3 h-8 w-8 text-slate-500" />
                    <div className="text-sm">{t('creation.previewEmptyDesc')}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-700/50 bg-gradient-to-b from-slate-950/80 to-slate-950/40 text-center">
                <div className="relative mb-4">
                  <div className="absolute inset-0 rounded-full bg-purple-500/10 blur-2xl" />
                  <Wand2 className="relative h-12 w-12 text-purple-400/70" />
                </div>
                <div className="text-base font-semibold text-slate-200">{t('creation.waitingTask')}</div>
                <div className="mt-2 max-w-xs text-sm text-slate-500">{t('creation.previewEmptyDesc')}</div>
              </div>
            )}
            {previewError ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {previewError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 右侧面板折叠按钮 */}
        {!rightPanelOpen && (
          <button
            type="button"
            onClick={() => setRightPanelOpen(true)}
            className="hidden xl:flex fixed right-4 top-1/2 -translate-y-1/2 z-30 items-center justify-center h-12 w-8 rounded-l-xl border border-r-0 border-slate-700 bg-slate-900/90 text-slate-400 hover:text-cyan-300 transition-colors shadow-lg"
            title={t('creation.showPanel')}
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}

        {/* 右侧：状态 + 操作 */}
        {rightPanelOpen && (
        <div className="space-y-6 relative">
          {/* 折叠按钮 */}
          <button
            type="button"
            onClick={() => setRightPanelOpen(false)}
            className="hidden xl:flex absolute -left-3 top-2 z-20 items-center justify-center h-8 w-6 rounded-l-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-cyan-300 transition-colors"
            title={t('creation.hidePanel')}
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
          {/* 当前创作状态 */}
          <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                {t('creation.currentCreation')}
              </CardTitle>
              <CardDescription>
                {activeCreation
                  ? `creation ${activeCreation.creation_id.slice(0, 8)} · task ${activeCreation.task_id.slice(0, 12)}`
                  : t('creation.noCreationDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeCreation ? (
                <>
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-sm shadow-sm ${getStatusTone(activeCreation.status)}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${activeCreation.status === 'FINISHED' ? 'bg-emerald-400' : activeCreation.status === 'PROCESSING' ? 'bg-cyan-400 animate-pulse' : activeCreation.status === 'FAILED' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                    {activeCreation.status} · {getStageLabel(activeCreation.current_stage)}
                  </div>

                  {/* LOUDNORM_COMPLIANCE 提示 */}
                  {activeCreation.current_stage === 'LOUDNORM_COMPLIANCE' && activeCreation.status === 'PROCESSING' && (
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                      {t('creation.loudnormHint')}
                    </div>
                  )}

                  {activeCreation.current_stage === 'QUEUE_ALLOCATION' && activeCreation.status === 'PENDING' && (
                    (() => {
                      const createdMs = new Date(activeCreation.created_at).getTime();
                      const elapsedSec = Math.round((Date.now() - createdMs) / 1000);
                      if (elapsedSec > 60) {
                        return (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            {t('creation.queueTimeout', { n: Math.floor(elapsedSec / 60), m: elapsedSec % 60 })}
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{t('creation.progress')}</span>
                      <span>{activeCreation.progress}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-800/80 shadow-inner shadow-black/30">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-700 ease-out relative"
                        style={{ width: `${activeCreation.progress}%` }}
                      >
                        {activeCreation.progress > 0 && activeCreation.progress < 100 && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 text-sm text-slate-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      {t('creation.startTime')}{formatDateTime(activeCreation.started_at)}
                    </div>
                    {isProcessing && elapsedSeconds > 0 ? (
                      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
                        {t('creation.elapsedTime')}{t('creation.timeFormat', { n: Math.floor(elapsedSeconds / 60), m: elapsedSeconds % 60 })}
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      {t('creation.updateTime')}{formatDateTime(activeCreation.updated_at)}
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      {t('creation.aspectRatioLabel')}{activeCreation.target_resolution} · {t('creation.formatLabel')}{activeCreation.export_format}
                    </div>
                  </div>
                  {(() => {
                    // 仅在明确失败时才展示错误引导，避免阶段进度消息被误判为错误
                    if (activeCreation.status !== 'FAILED') return null;
                    const errInfo = getErrorGuidance(
                      (activeCreation as unknown as Record<string, unknown>).error_code as string | undefined,
                      activeCreation.error_message,
                      t,
                    );
                    if (!errInfo.label && !activeCreation.error_message) return null;
                    return (
                      <AutoRetrySuggestion
                        guidance={errInfo}
                        errorMessage={activeCreation.error_message ?? undefined}
                        onRetry={() => handleRetry()}
                      />
                    );
                  })()}

                  {/* 导出按钮：根据状态显示不同 */}
                  <div className="grid gap-3">
                    {/* 完整视频下载按钮（仅 FINISHED 时可用） */}
                    <Button
                      onClick={() => void handleDownloadFullVideo()}
                      disabled={!canExport}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Video className="h-4 w-4 mr-2" />
                      {!activeCreation
                        ? t('creation.noCreation')
                        : activeCreation.status === 'FINISHED'
                          ? t('creation.downloadVideoSize', { size: activeCreation.file_size_bytes ? `${(activeCreation.file_size_bytes / 1_048_576).toFixed(1)} MB` : '?' })
                          : isProcessing
                            ? t('creation.generatingProgress', { progress: activeCreation.progress, stage: getStageLabel(activeCreation.current_stage) })
                            : t('creation.statusLabel', { status: activeCreation.status })}
                    </Button>

                    {/* 字幕下载按钮 */}
                    <div className="relative" ref={subtitleMenuRef}>
                      <Button
                        variant="secondary"
                        onClick={() => setShowSubtitleMenu((prev) => !prev)}
                        disabled={!activeCreation?.script_id || !(activeCreation?.status === 'FINISHED')}
                        className="w-full"
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        {t('creation.downloadSubtitles')}
                        <ChevronDown className="h-3 w-3 ml-auto" />
                      </Button>
                      {showSubtitleMenu && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800 border rounded-md shadow-lg py-1">
                          {subtitleLanguages.map((lang) => (
                            <button
                              key={lang.code}
                              onClick={() => handleDownloadSubtitles(lang.code)}
                              disabled={subtitleBusy !== null}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              {subtitleBusy === lang.code ? (
                                <span className="inline-flex items-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {t('creation.translating')}
                                </span>
                              ) : (
                                lang.label
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 触发导出（兼容旧行为） */}
                    <Button
                      variant="secondary"
                      onClick={() => void handleTriggerExport()}
                      disabled={exportBusy || activeCreation?.status !== 'FINISHED'}
                    >
                      {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {t('creation.triggerExport')}
                    </Button>

                    {/* 重试按钮 */}
                    <Button
                      variant="secondary"
                      onClick={() => void handleRetry()}
                      disabled={
                        retryBusy ||
                        (activeCreation.status !== 'FAILED' &&
                          activeCreation.status !== 'CANCELED' &&
                          !(activeCreation.current_stage === 'QUEUE_ALLOCATION' && activeCreation.status === 'PENDING'))
                      }
                    >
                      {retryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {t('creation.retryAfterFail')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
                  {t('creation.noCurrentCreation')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 分镜对比（选中两个分镜后出现） */}
          {compareShots && activeScript && (
            <ShotComparisonPanel
              shots={activeScript.shots}
              indices={compareShots}
              onClose={() => setCompareShots(null)}
            />
          )}

          {/* 分镜局部操作 */}
          <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400/60" />
                {t('creation.shotOperations')}
              </CardTitle>
              <CardDescription>
                {selectedShot ? t('creation.selectedShotLabel', { n: selectedShot.shot_index }) : t('creation.selectShotFromTimeline')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">{t('creation.replaceSliceId')}</span>
                <Input
                  value={replacementSliceId}
                  onChange={(event) => setReplacementSliceId(event.target.value)}
                  placeholder={t('creation.enterSliceId')}
                  disabled={!selectedShot || !activeCreation}
                  className="bg-slate-900/70 border-slate-700/60 focus:border-cyan-500/50 rounded-xl"
                />
              </label>
              <Button
                variant="outline"
                className="w-full"
                disabled={!selectedShot || !activeCreation || !replacementSliceId.trim() || replaceBusy}
                onClick={() => void handleReplaceSlice()}
              >
                {replaceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {t('creation.replaceAndRender')}
              </Button>
              {selectedShot ? (
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm p-4 text-sm space-y-2.5">
                  <div className="font-semibold text-slate-100 text-xs leading-relaxed">{selectedShot.subtitle_text}</div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-800/50 text-slate-400">{t('creation.materialSlice')}{selectedShot.selected_slice_id ?? t('creation.unbound')}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 leading-relaxed">{selectedShot.visual_description}</div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-400">
                    <span className="h-1 w-1 rounded-full bg-cyan-400" />{selectedShot.camera_movement}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* 音频控制 */}
          <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400/60" />
                {t('creation.audioControls')}
              </CardTitle>
              <CardDescription>
                {t('creation.audioControlDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">{t('creation.bgmStyle')}</span>
                <Select
                  value={bgmStyle}
                  onChange={(e) => setBgmStyle(e.target.value)}
                  className="w-full"
                >
                  <option value="auto_match">{t('creation.bgmAuto')}</option>
                  <option value="energetic-upbeat-01">{t('creation.bgmDynamic')}</option>
                  <option value="calm-relax-01">{t('creation.bgmRelaxing')}</option>
                  <option value="playful-cute-01">{t('creation.bgmCute')}</option>
                  <option value="dramatic-impact-01">{t('creation.bgmDramatic')}</option>
                  <option value="beauty-elegant-01">{t('creation.bgmBeauty')}</option>
                  <option value="fashion-trend-01">{t('creation.bgmTrendy')}</option>
                  <option value="inspirational-uplift-01">{t('creation.bgmInspiring')}</option>
                </Select>
              </label>

              <label className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">{t('creation.bgmVolume')}</span>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">{bgmVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-slate-700/80 cursor-pointer accent-cyan-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-500/30 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110"
                />
              </label>

              <label className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">{t('creation.voiceoverVolume')}</span>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">{voiceVolume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-slate-700/80 cursor-pointer accent-purple-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-purple-500/30 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110"
                />
              </label>

              {/* 音频轨道开关 */}
              <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm p-4">
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{t('creation.keepOriginalAudio', '保留原视频音频')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={keepOriginalVideoAudio}
                    onClick={() => setKeepOriginalVideoAudio((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${keepOriginalVideoAudio ? 'bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-md shadow-cyan-500/25' : 'bg-slate-600'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform ring-0 transition duration-300 ease-in-out ${keepOriginalVideoAudio ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{t('creation.enableTtsVoiceover', '启用 AI 旁白')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableTtsVoiceover}
                    onClick={() => setEnableTtsVoiceover((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${enableTtsVoiceover ? 'bg-gradient-to-r from-purple-500 to-cyan-400 shadow-md shadow-purple-500/25' : 'bg-slate-600'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform ring-0 transition duration-300 ease-in-out ${enableTtsVoiceover ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{t('creation.enableBgm', '启用背景音乐')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableBgm}
                    onClick={() => setEnableBgm((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-all duration-300 ease-in-out focus:outline-none ${enableBgm ? 'bg-gradient-to-r from-orange-500 to-rose-400 shadow-md shadow-orange-500/25' : 'bg-slate-600'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform ring-0 transition duration-300 ease-in-out ${enableBgm ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </label>
              </div>

              <Button
                variant="outline"
                className="w-full border-slate-700/60 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all"
                disabled={restitchBusy || !activeCreation || activeCreation.status === 'PROCESSING' || activeCreation.status === 'PENDING' || activeCreation.status === 'FAILED' || activeCreation.status === 'CANCELED'}
                onClick={() => void handleRestitch()}
              >
                {restitchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t('creation.restitch')}
              </Button>
            </CardContent>
          </Card>

          {/* 同剧本历史创作 */}
          <Card className="border-slate-800 bg-slate-950/70 backdrop-blur-sm shadow-lg shadow-black/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-400/60" />
                {t('creation.history')}
              </CardTitle>
              <CardDescription>
                {creationsLoading ? t('creation.loadingHistory') : t('creation.historyCount', { n: scriptCreations.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600/50 scrollbar-track-transparent">
              {scriptCreations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700/50 bg-slate-950/60 p-4 text-center">
                  <span className="text-xs text-slate-500">{t('creation.noCreationHistory')}</span>
                </div>
              ) : (
                scriptCreations.slice(0, 6).map((item) => (
                  <button
                    key={item.creation_id}
                    type="button"
                    onClick={() => setActiveCreationId(item.creation_id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                      item.creation_id === activeCreationId
                        ? 'border-cyan-400/50 bg-cyan-500/5 shadow-sm shadow-cyan-500/5'
                        : 'border-slate-800/60 bg-slate-950/40 hover:border-slate-700/60 hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-mono text-slate-400">{item.creation_id.slice(0, 8)}</span>
                      <span className={`text-[10px] font-semibold ${item.progress === 100 ? 'text-emerald-400' : 'text-cyan-400'}`}>{item.progress}%</span>
                    </div>
                    <div className="mt-1.5 text-xs font-medium text-slate-300">{item.status} · {getStageLabel(item.current_stage)}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{formatDateTime(item.created_at)}</div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
        )}
      </div>
      </>
        )}
      <div className="pt-2">
        <ShortcutHints hints={[
          { key: 'Ctrl/⌘ + S', actionKey: 'creation.saveEdit' },
          { key: 'Delete', actionKey: 'creation.rerenderCurrent' },
          { key: '← →', actionKey: 'keyboard.switchShot' },
          { key: '1-9', actionKey: 'keyboard.jumpToShot' },
          { key: 'Ctrl/⌘ + Enter', actionKey: 'keyboard.saveAndRerender' },
        ]} />
      </div>
    </div>
  );
}
