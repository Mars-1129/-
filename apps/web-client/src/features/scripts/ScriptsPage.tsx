import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, Dna, Eye, GripVertical, Loader2, Music, Pencil, Plus, Save, Sparkles, Trash2, Wand2, RotateCcw, X, Shuffle, Shield, Bot } from 'lucide-react';
import type {
  AgentGenerateResponse,
  AutoAbRunResponse,
  AspectRatio,
  BgmSegment,
  CameraMovement,
  Script,
  ScriptBatchGenerateResponse,
  ScriptGenerateResponse,
  ScriptShot,
  ScriptValidateTimingResponse,
  SupportedLocale,
  TransitionType,
  ViralVideoAnalysis,
  ViralDNA,
} from '@tikstream/shared-types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { GenerationProgress } from '../../components/ui/generation-progress';
import { MaterialSelector } from '../../components/material-selector/MaterialSelector';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import {
  deleteScript,
  factorRemixScript,
  generateComposedScript,
  generateHybridScript,
  generateBatchScripts,
  generateQuickScript,
  generateTemplateScript,
  generateViralRewriteScript,
  getScript,
  listScripts,
  listTrashScripts,
  patchScript,
  permanentDeleteScript,
  restoreScript,
  saveScript,
  runAgentGeneration,
  getAgentStatus,
  runAutoAb,
  validateScriptTiming,
} from '../../lib/api/scripts';
import { createViralAnalysis, createViralFromMaterial, getDnaDetail, generateFromDna } from '../../lib/api/viral-analysis';
import { uploadMaterial } from '../../lib/api/materials';
import { ApiClientError } from '../../lib/api/http';
import { getTemplate, listTemplates } from '../../lib/api/templates';
import { formatDateTime, formatDuration } from '../../lib/utils/cn';
import { useScriptEditorShortcuts, ShortcutHints } from '../../hooks/useKeyboardShortcuts';
import { ShotTimeline } from './components/ShotTimeline';
import { ShotPreviewList } from './components/ShotPreview';
import { ScriptDetailSkeleton, ScriptListSkeleton } from '../../components/ui/content-skeleton';

const cameraMovements: CameraMovement[] = ['Static', 'Dolly_In_Fast', 'Dolly_Out', 'Pan_Left', 'Tilt_Up'];
const transitionTypes: TransitionType[] = ['None', 'Fade_In', 'Dissolve', 'Wipe'];
const aspectRatios: AspectRatio[] = ['9:16', '16:9'];
const viralPlatforms = ['tiktok', 'youtube', 'instagram', 'facebook', 'other', 'self_uploaded'] as const;

type GenerateMode = 'quick' | 'viral' | 'template' | 'dna' | 'composed' | 'hybrid' | 'batch' | 'agent' | 'auto-ab';

/** 默认 BGM 配置（兜底值，与后端 db 默认值对齐） */
const DEFAULT_BGM_SEGMENT: BgmSegment = { style: '', energy_level: 'mid', beat_pattern: '' };

/** 因子混重默认预设 — 列出全部可覆盖因子键，用户替换空值为目标描述即可 */
const DEFAULT_FACTOR_REMIX_PRESET: Record<string, string> = {
  bgm_style: '',
  camera_patterns: '',
  transition_preference: '',
  narrative_tone: '',
  hook_style: '',
  visual_style: '',
};

type DraftShot = {
  shot_index: number;
  duration: string;
  scene_description_query: string;
  visual_description: string;
  camera_movement: CameraMovement;
  transition_type: TransitionType;
  voiceover_text: string;
  subtitle_text: string;
  bgm_segment: BgmSegment;
};

function toDraftShot(shot: ScriptShot): DraftShot {
  return {
    shot_index: shot.shot_index,
    duration: String(shot.duration),
    scene_description_query: shot.scene_description_query,
    visual_description: shot.visual_description,
    camera_movement: shot.camera_movement,
    transition_type: shot.transition_type,
    voiceover_text: shot.voiceover_text,
    subtitle_text: shot.subtitle_text,
    bgm_segment: shot.bgm_segment ?? DEFAULT_BGM_SEGMENT,
  };
}

function splitConstraints(value: string): string[] | undefined {
  const items = value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function formatPatchError(error: unknown, fallback: string, t: TFunction): string {
  if (error instanceof ApiClientError) {
    const details = error.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { reason?: string; field?: string };
      if (typeof first.reason === 'string' && first.reason.length > 0) {
        return first.reason;
      }
    }

    if (error.message.includes('total duration exceeded')) {
      return t('script.durationExceeded');
    }
    if (error.message.includes('shot duration out of range')) {
      return t('script.shotDurationInvalid');
    }
    if (error.message.includes('voiceover timing exceeded')) {
      return t('script.voiceoverTooLong');
    }
    if (error.message.includes('duration exceeded')) {
      return t('script.timingFailed');
    }

    if (
      error.code === 'INTERNAL_SERVER_ERROR'
      && (error.message === '内部服务器错误' || error.message === 'INTERNAL_SERVER_ERROR')
    ) {
      return t('script.internalError');
    }

    if (error.code === 'MODEL_PROVIDER_FAILED') {
      return t('script.modelUnavailable');
    }

    if (error.code === 'PRODUCT_NOT_FOUND') {
      return t('script.productNotFound');
    }

    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

function upsertScript(items: Script[], next: Script | ScriptGenerateResponse): Script[] {
  const existing = items.find((item) => item.script_id === next.script_id);
  if (!existing) {
    return [next, ...items];
  }

  return items.map((item) => (item.script_id === next.script_id ? next : item));
}

interface SortableShotItemProps {
  shot: ScriptShot;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  isDragging: boolean;
}

function SortableShotItem({
  shot,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
  canRemove,
  isDragging,
}: SortableShotItemProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(event) => {
        // 点击整张卡片选中分镜（拖拽手柄和操作按钮已做 stopPropagation）
        event.stopPropagation();
        onSelect();
      }}
      className={`rounded-3xl border p-4 cursor-pointer ${
        isSelected ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className="cursor-grab text-slate-400 hover:text-slate-200 active:cursor-grabbing shrink-0"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100">Shot {shot.shot_index}</div>
            <div className="mt-1 text-xs text-slate-500">{formatDuration(shot.duration)} · {shot.camera_movement}</div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); onMoveUp(); }} disabled={!canMoveUp}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); onMoveDown(); }} disabled={!canMoveDown}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); onRemove(); }} disabled={!canRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-300 line-clamp-3">{shot.voiceover_text}</div>
    </div>
  );
}

export function ScriptsPage(): JSX.Element {
  const { t } = useTranslation();
  const products = useWorkspaceStore((state) => state.products);
  const selectedProductId = useWorkspaceStore((state) => state.selectedProductId);
  const setSelectedProductId = useWorkspaceStore((state) => state.setSelectedProductId);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // 从 URL 读取跳转时指定的 productId（如 DNA 页跳转过来）
  const urlProductId = searchParams.get('productId') || '';
  const navigate = useNavigate();

  const [scripts, setScripts] = useState<Script[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [scriptsError, setScriptsError] = useState<string | null>(null);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(searchParams.get('scriptId'));
  const [activeScript, setActiveScript] = useState<Script | ScriptGenerateResponse | null>(null);
  const [activeScriptLoading, setActiveScriptLoading] = useState(false);
  const [activeScriptError, setActiveScriptError] = useState<string | null>(null);
  const [mode, setMode] = useState<GenerateMode>(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'template') return 'template';
    if (modeParam === 'dna') return 'dna';
    return 'quick';
  });
  const [templates, setTemplates] = useState<Array<{ template_id: string; name: string; category: string; status: string }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => searchParams.get('templateId') || '');
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  // DNA 模式
  const [selectedDnaId, setSelectedDnaId] = useState(() => searchParams.get('dnaId') || '');
  const [dnaDetail, setDnaDetail] = useState<ViralDNA | null>(null);
  const [dnaLoading, setDnaLoading] = useState(false);
  const [dnaError, setDnaError] = useState<string | null>(null);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);
  const [generateProgress, setGenerateProgress] = useState<{ stage: string; message: string; progress: number } | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<ViralVideoAnalysis | null>(null);
  const [formTitle, setFormTitle] = useState(() => searchParams.get('title') || '');
  const [formLanguage, setFormLanguage] = useState('zh-CN');
  const [formStyleVibe, setFormStyleVibe] = useState('高转化 UGC');
  const [formAspectRatio, setFormAspectRatio] = useState<AspectRatio>('9:16');
  const [formConstraintInput, setFormConstraintInput] = useState(() => searchParams.get('constraint') || '');
  const [formSellingPoints, setFormSellingPoints] = useState('');
  const [viralSourceUrl, setViralSourceUrl] = useState('');
  const [viralPlatform, setViralPlatform] = useState<(typeof viralPlatforms)[number]>('tiktok');
  const [viralFile, setViralFile] = useState<File | null>(null);
  const [uploadingViralFile, setUploadingViralFile] = useState(false);
  const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null);
  const [draftShot, setDraftShot] = useState<DraftShot | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [patchMessage, setPatchMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [timingValidation, setTimingValidation] = useState<ScriptValidateTimingResponse | null>(null);
  const [timingLoading, setTimingLoading] = useState(false);
  const [timingError, setTimingError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [autoAbBusy, setAutoAbBusy] = useState(false);
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null);
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<Script[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashBusyIds, setTrashBusyIds] = useState<Set<string>>(new Set());
  const [apiKeyStatus, setApiKeyStatus] = useState<{ ok: boolean; message: string; configured: boolean } | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const lastInitProductIdRef = useRef<string | null>(null);
  const urlTitleRef = useRef(!!searchParams.get('title'));
  const urlConstraintRef = useRef(!!searchParams.get('constraint'));
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const agentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- NEW: composed/hybrid/batch generation states ----
  const [formAutoMatchViral, setFormAutoMatchViral] = useState(false);
  const [formFactorOverrides, setFormFactorOverrides] = useState('');
  const [formConstraintOverrides, setFormConstraintOverrides] = useState('');
  const [formUserStrategy, setFormUserStrategy] = useState('');
  const [formUserFactors, setFormUserFactors] = useState('');
  const [formUserConstraints, setFormUserConstraints] = useState('');
  const [formStyleVibesInput, setFormStyleVibesInput] = useState('');
  const [formEnableAiCompliance, setFormEnableAiCompliance] = useState(false);
  const [batchResult, setBatchResult] = useState<ScriptBatchGenerateResponse | null>(null);
  const [agentResult, setAgentResult] = useState<AgentGenerateResponse | null>(null);

  // ---- Auto AB state ----
  const [autoAbResult, setAutoAbResult] = useState<AutoAbRunResponse | null>(null);

  // ---- NEW: factor-remix dialog states ----
  const [factorRemixOpen, setFactorRemixOpen] = useState(false);
  const [factorRemixFactorOverrides, setFactorRemixFactorOverrides] = useState('');
  const [factorRemixPreserveVoiceover, setFactorRemixPreserveVoiceover] = useState(true);
  const [factorRemixExtraInstruction, setFactorRemixExtraInstruction] = useState('');
  const [factorRemixBusy, setFactorRemixBusy] = useState(false);
  const [factorRemixError, setFactorRemixError] = useState<string | null>(null);
  const [factorRemixSuccess, setFactorRemixSuccess] = useState<string | null>(null);
  const [factorRemixProgress, setFactorRemixProgress] = useState<{ stage: string; message: string; progress: number } | null>(null);

  // ---- preferences state ----
  const [preferences, setPreferences] = useState<Array<{ type: 'WINNER' | 'LOSER'; text: string }>>([]);
  const addPreference = () => setPreferences(prev => [...prev, { type: 'WINNER' as const, text: '' }]);
  const updatePreference = (idx: number, field: string, value: string) => {
    setPreferences(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const removePreference = (idx: number) => setPreferences(prev => prev.filter((_, i) => i !== idx));

  // Agent 轮询清理函数
  const stopAgentPolling = () => {
    if (agentPollRef.current) {
      clearInterval(agentPollRef.current);
      agentPollRef.current = null;
    }
  };

  // 组件卸载时清理 agent 轮询
  useEffect(() => {
    return () => stopAgentPolling();
  }, []);

  // 选中分镜时自动滚动详情面板到可见区域
  useEffect(() => {
    if (selectedShotIndex !== null && detailPanelRef.current) {
      detailPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedShotIndex]);

  // ========== 快捷键支持 ==========
  useScriptEditorShortcuts({
    onSave: () => {
      if (activeScriptId) {
        void handleSaveScript();
      }
    },
    onDelete: () => {
      if (selectedShotIndex !== null && activeScript) {
        void handleRemoveShot(selectedShotIndex);
      }
    },
    onMoveUp: () => {
      if (selectedShotIndex !== null && selectedShotIndex > 0 && activeScriptId) {
        void handleMoveShot(selectedShotIndex, -1);
      }
    },
    onMoveDown: () => {
      if (selectedShotIndex !== null && activeScript && selectedShotIndex < activeScript.shots.length - 1 && activeScriptId) {
        void handleMoveShot(selectedShotIndex, 1);
      }
    },
    onNewShot: () => {
      if (activeScriptId) {
        void handleAddShot('after');
      }
    },
    onJumpToShot: (shotIndex: number) => {
      if (activeScript && activeScript.shots.some((s) => s.shot_index === shotIndex)) {
        setSelectedShotIndex(shotIndex);
      }
    },
    onPrevShot: () => {
      if (selectedShotIndex !== null && selectedShotIndex > 1) {
        setSelectedShotIndex(selectedShotIndex - 1);
      }
    },
    onNextShot: () => {
      if (selectedShotIndex !== null && activeScript && selectedShotIndex < activeScript.shots.length) {
        setSelectedShotIndex(selectedShotIndex + 1);
      }
    },
    onSaveAndRerender: () => {
      if (activeScriptId && draftShot) {
        void handlePatchShot();
      }
    },
    maxShotCount: activeScript?.shots.length ?? 9,
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Drag handle function
  function handleDragStart(event: DragStartEvent) {
    setDraggingShotId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    setDraggingShotId(null);

    if (!over || !activeScript || !activeScriptId) {
      return;
    }

    if (active.id === over.id) {
      return;
    }

    const oldIndex = activeScript.shots.findIndex((shot) => shot.id === active.id);
    const newIndex = activeScript.shots.findIndex((shot) => shot.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const newShots = [...activeScript.shots];
    const [removed] = newShots.splice(oldIndex, 1);
    newShots.splice(newIndex, 0, removed);

    const reindexedShots = newShots.map((shot, idx) => ({
      ...shot,
      shot_index: idx + 1,
    }));

    const capturedShotIndex = selectedShotIndex;
    const activeScriptBefore = activeScript;

    setActiveScript({ ...activeScript, shots: reindexedShots });

    setPatchBusy(true);
    setPatchMessage(null);

    patchScript(activeScriptId, [{ op: 'move', from: `/shots/${oldIndex + 1}`, path: `/shots/${newIndex + 1}` }])
      .then(() => {
        setPatchMessage(t('script.shotMovedToPosition', { from: oldIndex + 1, to: newIndex + 1 }));
        void reloadActiveScript(reindexedShots[newIndex]?.shot_index ?? null);
      })
      .catch((error) => {
        // 回滚乐观更新：恢复到拖拽前的分镜顺序
        setActiveScript(activeScriptBefore);
        setPatchMessage(formatPatchError(error, t('script.shotReorderFailed'), t));
        void reloadActiveScript(capturedShotIndex);
      })
      .finally(() => {
        setPatchBusy(false);
      });
  }

  useEffect(() => {
    if (selectedProduct && selectedProduct.id !== lastInitProductIdRef.current) {
      lastInitProductIdRef.current = selectedProduct.id;
      setFormSellingPoints(selectedProduct.selling_points.join(', '));
      if (!urlTitleRef.current) setFormTitle('');
      if (!urlConstraintRef.current) setFormConstraintInput('');
      setViralSourceUrl('');
      setViralPlatform('tiktok');
      setLastAnalysis(null);
      setGenerateError(null);
      setGenerateSuccess(null);
      setFormFactorOverrides('');
      setFormConstraintOverrides('');
      setFormAutoMatchViral(false);
      setFormUserStrategy('');
      setFormUserFactors('');
      setFormUserConstraints('');
      setFormStyleVibesInput('');
      setBatchResult(null);
    }
  }, [selectedProduct]);

  // 检查 AI API Key 可用性
  useEffect(() => {
    let cancelled = false;
    async function checkHealth(): Promise<void> {
      setApiKeyLoading(true);
      try {
        const response = await fetch('/api/v1/scripts/health');
        const json = await response.json() as {
          success: boolean;
          data?: { doubao?: { ok: boolean; message: string; configured: boolean } };
        };
        if (!cancelled && json?.data?.doubao) {
          setApiKeyStatus(json.data.doubao);
        }
      } catch {
        if (!cancelled) {
          setApiKeyStatus({ ok: false, message: t('script.aiUnavailable'), configured: false });
        }
      } finally {
        if (!cancelled) {
          setApiKeyLoading(false);
        }
      }
    }
    void checkHealth();
    return () => { cancelled = true; };
  }, []);

  // SSE 失败后的同步回调（降级处理）
  async function handleGenerateFallback(
    commonPayload: {
      product_id: string;
      title?: string;
      language?: SupportedLocale;
      style_vibe?: string;
      aspect_ratio: AspectRatio;
      selling_points: string[];
      target_audience?: string;
      constraint_list?: string[];
    },
    mode: GenerateMode,
  ): Promise<void> {
    try {
      const payload = {
        product_id: commonPayload.product_id,
        title: commonPayload.title || '',
        language: commonPayload.language || 'zh-CN',
        style_vibe: commonPayload.style_vibe || '高转化 UGC',
        aspect_ratio: commonPayload.aspect_ratio,
        selling_points: commonPayload.selling_points,
        target_audience: commonPayload.target_audience || '',
        constraint_list: commonPayload.constraint_list || [],
      };
      let generateResponse: ScriptGenerateResponse;
      if (mode === 'template') {
        if (!selectedTemplateId) throw new Error(t('script.selectTemplate'));
        generateResponse = await generateTemplateScript({
          product_id: payload.product_id,
          template_id: selectedTemplateId,
          title: payload.title,
          language: payload.language,
          style_vibe: payload.style_vibe,
          aspect_ratio: payload.aspect_ratio,
          selling_points: payload.selling_points,
          target_audience: payload.target_audience,
          constraint_list: payload.constraint_list,
          preferences: preferences.filter(p => p.text.trim()),
          enable_ai_compliance: formEnableAiCompliance || undefined,
          ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
        });
      } else if (mode === 'viral') {
        // self_uploaded: 上传文件 → 创建分析 → 继续
        if (viralPlatform === 'self_uploaded') {
          if (!viralFile) {
            throw new Error(t('script.selectVideoFile'));
          }
          const { analysis_id } = await uploadAndCreateViralAnalysis();
          generateResponse = await generateViralRewriteScript({
            product_id: payload.product_id,
            viral_video_id: analysis_id,
            title: payload.title,
            language: payload.language,
            style_vibe: payload.style_vibe || '爆款仿写',
            aspect_ratio: payload.aspect_ratio,
            selling_points: payload.selling_points,
            target_audience: payload.target_audience,
            constraint_list: payload.constraint_list,
            preferences: preferences.filter(p => p.text.trim()),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
          });
        } else {
          if (!viralSourceUrl.trim()) throw new Error(t('script.enterViralUrl'));
          const analysisResponse = await createViralAnalysis({
            source_url: viralSourceUrl.trim(),
            source_platform: viralPlatform,
            product_id: selectedProductId!,
            declared_public_source: true,
          });
          const analysis = analysisResponse.analysis;
          setLastAnalysis(analysis);
          generateResponse = await generateViralRewriteScript({
            product_id: payload.product_id,
            viral_video_id: analysis.analysis_id,
            title: payload.title,
            language: payload.language,
            style_vibe: payload.style_vibe || '爆款仿写',
            aspect_ratio: payload.aspect_ratio,
            selling_points: payload.selling_points,
            target_audience: payload.target_audience,
            constraint_list: payload.constraint_list,
            preferences: preferences.filter(p => p.text.trim()),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
          });
        }
      } else {
        generateResponse = await generateQuickScript({
          product_id: payload.product_id,
          title: payload.title,
          language: payload.language,
          style_vibe: payload.style_vibe,
          aspect_ratio: payload.aspect_ratio,
          selling_points: payload.selling_points,
          target_audience: payload.target_audience,
          constraint_list: payload.constraint_list,
          preferences: preferences.filter(p => p.text.trim()),
          enable_ai_compliance: formEnableAiCompliance || undefined,
          ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
        });
      }

      // 兼容旧版返回格式
      const scriptId = typeof generateResponse === 'object' && 'script_id' in generateResponse
        ? (generateResponse as { script_id: string }).script_id
        : undefined;

      if (scriptId) {
        const script = await getScript(scriptId);
        setScripts((current) => upsertScript(current, script));
        setActiveScript(script);
        setActiveScriptId(script.script_id);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('scriptId', script.script_id);
          return next;
        });
        setGenerateSuccess(t('script.generateSuccessQuick', { id: script.script_id }));
        await refreshScripts(script.script_id);
      }
    } catch (error) {
      setGenerateError(formatPatchError(error, t('script.generateFailed'), t));
    } finally {
      setGenerateBusy(false);
    }
  }

  useEffect(() => {
    const urlScriptId = searchParams.get('scriptId');
    if (urlScriptId) {
      setActiveScriptId(urlScriptId);
    }
  }, [searchParams]);

  useEffect(() => {
    const productId = selectedProductId;
    if (!productId) {
      setScripts([]);
      setActiveScriptId(null);
      setActiveScript(null);
      return;
    }

    const resolvedProductId = productId;
    let cancelled = false;

    async function run(): Promise<void> {
      setScriptsLoading(true);
      setScriptsError(null);

      try {
        const response = await listScripts(resolvedProductId, 1, 50);
        if (cancelled) {
          return;
        }

        setScripts(response.items);
        const urlScriptId = searchParams.get('scriptId');
        const nextScriptId =
          urlScriptId && response.items.some((item) => item.script_id === urlScriptId)
            ? urlScriptId
            : response.items[0]?.script_id ?? null;
        setActiveScriptId(nextScriptId);
      } catch (error) {
        if (!cancelled) {
          setScriptsError(error instanceof Error ? error.message : t('script.listLoadFailed'));
        }
      } finally {
        if (!cancelled) {
          setScriptsLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchParams, selectedProductId]);

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setTemplatesLoading(true);
      try {
        const response = await listTemplates({ page: 1, page_size: 100, status: 'ACTIVE' });
        if (cancelled) {
          return;
        }
        let templateList = response.items;
        // If we have a preselected template from URL that's not in the paginated list, fetch it
        const preselectedId = searchParams.get('templateId');
        if (preselectedId && !templateList.some((t) => t.template_id === preselectedId)) {
          try {
            const detail = await getTemplate(preselectedId);
            if (!cancelled && detail) {
              templateList = [detail, ...templateList];
            }
          } catch {
            // ignore if can't fetch — still show the list we have
          }
        }
        setTemplates(templateList);
        setSelectedTemplateId((current) => current || templateList[0]?.template_id || '');
        setTemplatesError(null);
      } catch (error) {
        if (!cancelled) {
          setTemplates([]);
          setTemplatesError(error instanceof Error ? error.message : t('script.templateLoadFailed'));
        }
      } finally {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  // 【同步】从 DNA 页面跳转过来时，立即切换商品上下文并填充卖点
  useLayoutEffect(() => {
    const raw = sessionStorage.getItem('dna_nav_context');
    if (!raw) return;
    try {
      const ctx = JSON.parse(raw) as {
        productId: string;
        productTitle: string;
        sellingPoints: string[];
      };
      sessionStorage.removeItem('dna_nav_context');
      console.log('[DNA→Scripts] sessionStorage context:', ctx);

      // 1) 切换左侧边栏商品上下文
      if (ctx.productId && ctx.productId !== selectedProductId) {
        setSelectedProductId(ctx.productId);
      }

      // 2) 填充卖点框
      if (ctx.sellingPoints?.length) {
        setFormSellingPoints(ctx.sellingPoints.join(', '));
      } else if (ctx.productId) {
        // sessionStorage 中没有卖点，尝试从 products 中取
        const p = products.find((prod) => prod.id === ctx.productId);
        if (p?.selling_points?.length) {
          setFormSellingPoints(p.selling_points.join(', '));
        }
      }
    } catch {
      sessionStorage.removeItem('dna_nav_context');
    }
  }, []); // 仅在挂载时执行一次

  // Load DNA detail when in dna mode with a dnaId
  useEffect(() => {
    if (mode !== 'dna' || !selectedDnaId) {
      setDnaDetail(null);
      setDnaError(null);
      return;
    }

    let cancelled = false;

    async function run(): Promise<void> {
      setDnaLoading(true);
      setDnaError(null);
      try {
        const detail = await getDnaDetail(selectedDnaId);
        console.log('[DNA→Scripts] DNA detail loaded:', { dnaId: selectedDnaId, product_names: detail.product_names, urlProductId, selectedProductId, productsCount: products.length });
        if (!cancelled) {
          setDnaDetail(detail);

          // 自动匹配商品上下文并填充卖点
          // 1) 优先使用 URL 传入的 productId
          let targetProductId = urlProductId || '';

          // 2) 否则用 DNA 的 product_names 模糊匹配 workspace 商品
          if (!targetProductId && detail.product_names?.length > 0) {
            const matched = products.find(
              (p) => detail.product_names.some((dn) =>
                p.title.toLowerCase().includes(dn.toLowerCase()) ||
                dn.toLowerCase().includes(p.title.toLowerCase())
              )
            );
            if (matched) targetProductId = matched.id;
            console.log('[DNA→Scripts] Fuzzy match result:', { matched: matched?.title, targetProductId });
          }

          // 3) 自动切换 selectedProductId（触发左侧边栏商品上下文更新）
          if (targetProductId && targetProductId !== selectedProductId) {
            console.log('[DNA→Scripts] Switching product:', { from: selectedProductId, to: targetProductId });
            setSelectedProductId(targetProductId);
          }

          // 4) 填充卖点框：优先用匹配商品的 selling_points，兜底从 DNA 内容提取
          const matchedProduct = targetProductId
            ? products.find((p) => p.id === targetProductId)
            : selectedProduct;

          if (matchedProduct?.selling_points?.length) {
            const points = matchedProduct.selling_points.join(', ');
            console.log('[DNA→Scripts] Setting selling points from matched product:', points);
            setFormSellingPoints(points);
          } else {
            // 兜底：从 DNA 实际数据中提取卖点参考
            const insightParts: string[] = [];

            // LLM 标签（优先）
            if (detail.hook_label) insightParts.push(detail.hook_label);
            if (detail.style_label) insightParts.push(detail.style_label);
            if (detail.narrative_explanation) insightParts.push(detail.narrative_explanation);
            if (detail.success_reason) insightParts.push(detail.success_reason);

            // DNA 结构化数据兜底
            const firstHook = detail.hooks?.[0];
            if (firstHook) {
              if (firstHook.type) insightParts.push(firstHook.type);
              const emotions = firstHook.structure?.emotional_hooks;
              if (emotions?.length) insightParts.push(emotions.join('、'));
            }
            const firstStyle = detail.visual_styles?.[0];
            if (firstStyle?.style) insightParts.push(firstStyle.style);
            const ctaTemplates = detail.cta_styles?.flatMap((c) => c.text_templates ?? []) ?? [];
            if (ctaTemplates.length) insightParts.push(...ctaTemplates.slice(0, 2));
            const bgmGenres = detail.bgm_patterns?.map((b) => b.genre).filter(Boolean) ?? [];
            if (bgmGenres.length) insightParts.push(...bgmGenres.slice(0, 2));

            console.log('[DNA→Scripts] Setting selling points from DNA data:', insightParts);
            setFormSellingPoints(insightParts.join(', '));
          }
        }
      } catch (err) {
        console.error('[DNA→Scripts] Failed to load DNA detail:', err);
        if (!cancelled) {
          setDnaError(err instanceof Error ? err.message : t('script.dnaLoadFailed'));
        }
      } finally {
        if (!cancelled) {
          setDnaLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [mode, selectedDnaId, t, products, selectedProductId, selectedProduct, urlProductId, setSelectedProductId]);

  useEffect(() => {
    const scriptId = activeScriptId;
    if (!scriptId) {
      setActiveScript(null);
      setActiveScriptError(null);
      return;
    }

    const resolvedScriptId = scriptId;
    let cancelled = false;

    async function run(): Promise<void> {
      setActiveScriptLoading(true);
      setActiveScriptError(null);
      try {
        const script = await getScript(resolvedScriptId);
        if (cancelled) {
          return;
        }
        setActiveScript(script);
        setScripts((current) => upsertScript(current, script));
      } catch (error) {
        if (!cancelled) {
          setActiveScriptError(error instanceof Error ? error.message : t('script.detailLoadFailed'));
          setActiveScript(null);
        }
      } finally {
        if (!cancelled) {
          setActiveScriptLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeScriptId]);

  useEffect(() => {
    if (!activeScript) {
      setSelectedShotIndex(null);
      setDraftShot(null);
      setTimingValidation(null);
      setTimingError(null);
      return;
    }

    setSelectedShotIndex((current) => {
      if (current && activeScript.shots.some((shot) => shot.shot_index === current)) {
        return current;
      }
      return activeScript.shots[0]?.shot_index ?? null;
    });
  }, [activeScript]);

  useEffect(() => {
    if (!activeScript || selectedShotIndex === null) {
      setDraftShot(null);
      return;
    }

    const shot = activeScript.shots.find((item) => item.shot_index === selectedShotIndex);
    setDraftShot(shot ? toDraftShot(shot) : null);
  }, [activeScript, selectedShotIndex]);

  // 切换分镜时清除上一次的保存/操作消息
  useEffect(() => {
    setPatchMessage(null);
  }, [selectedShotIndex]);

  const activeScriptRef = useRef(activeScript);
  activeScriptRef.current = activeScript;

  const sseAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      sseAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!activeScriptId || !draftShot) {
      setTimingValidation(null);
      setTimingError(null);
      return;
    }

    const duration = Number(draftShot.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      setTimingValidation(null);
      return;
    }

    const script = activeScriptRef.current;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTimingLoading(true);
      setTimingError(null);
      void validateScriptTiming(activeScriptId, {
        shot_index: draftShot.shot_index,
        voiceover_text: draftShot.voiceover_text,
        duration,
        style_vibe: script?.style_vibe,
        language: script?.language,
      })
        .then((response) => {
          if (!cancelled) {
            setTimingValidation(response);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setTimingError(error instanceof Error ? error.message : t('script.timingCheckFailed'));
            setTimingValidation(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setTimingLoading(false);
          }
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeScriptId, draftShot?.duration, draftShot?.voiceover_text, draftShot?.shot_index]);

  async function refreshScripts(nextActiveId?: string | null): Promise<void> {
    if (!selectedProductId) {
      return;
    }

    setScriptsLoading(true);
    setScriptsError(null);
    try {
      const response = await listScripts(selectedProductId, 1, 50);
      setScripts(response.items);
      const resolvedActiveId = nextActiveId ?? activeScriptId;
      if (resolvedActiveId && response.items.some((item) => item.script_id === resolvedActiveId)) {
        setActiveScriptId(resolvedActiveId);
        getScript(resolvedActiveId).then((script) => {
          setActiveScript(script);
          setScripts((current) => upsertScript(current, script));
        }).catch((err) => {
          console.warn(`[ScriptsPage] getScript 失败: ${(err as Error)?.message || err}`);
        });
      } else {
        setActiveScriptId(response.items[0]?.script_id ?? null);
      }
    } catch (error) {
      setScriptsError(error instanceof Error ? error.message : t('script.listRefreshFailed'));
    } finally {
      setScriptsLoading(false);
    }
  }

  async function uploadAndCreateViralAnalysis(): Promise<{
    analysis_id: string;
    source_platform: string;
  }> {
    if (!viralFile) {
      throw new Error(t('script.selectVideoFile'));
    }

    setUploadingViralFile(true);
    try {
      const uploadResult = await uploadMaterial({
        file: viralFile,
        product_id: selectedProductId ?? undefined,
        type: 'VIDEO',
      });

      const analysisResult = await createViralFromMaterial({
        material_id: uploadResult.material_id,
        product_id: selectedProductId ?? undefined,
      });

      setLastAnalysis(analysisResult.analysis);

      return {
        analysis_id: analysisResult.analysis.analysis_id,
        source_platform: 'self_uploaded',
      };
    } finally {
      setUploadingViralFile(false);
    }
  }

  async function handleScriptGenerated(generateResponse: { script_id?: string }): Promise<Script | null> {
    const scriptId = generateResponse.script_id;
    if (!scriptId) return null;
    const script = await getScript(scriptId);
    setScripts((current) => upsertScript(current, script));
    setActiveScript(script);
    setActiveScriptId(script.script_id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('scriptId', script.script_id);
      return next;
    });
    await refreshScripts(script.script_id);
    return script;
  }

  async function handleGenerate(): Promise<void> {
    if (!selectedProductId || !selectedProduct) {
      setGenerateError(t('script.selectProductFirst'));
      return;
    }

    setGenerateBusy(true);
    setGenerateError(null);
    setGenerateSuccess(null);
    setPatchMessage(null);
    setSaveMessage(null);

    const userSellingPoints = splitConstraints(formSellingPoints) ?? selectedProduct.selling_points;

    const commonPayload = {
      product_id: selectedProductId,
      title: formTitle.trim() || undefined,
      language: (formLanguage.trim() || undefined) as SupportedLocale | undefined,
      style_vibe: formStyleVibe.trim() || undefined,
      aspect_ratio: formAspectRatio,
      selling_points: userSellingPoints,
      target_audience: selectedProduct.target_audience,
      constraint_list: splitConstraints(formConstraintInput),
    };

    let sseStarted = false;

    try {
      // ========== Agent 模式（异步轮询） ==========
      if (mode === 'agent') {
        setAgentBusy(true);
        setAgentResult(null);
        setGenerateError(null);
        setGenerateSuccess(null);
        setGenerateProgress({ stage: 'GENERATING', message: t('script.agentProgress'), progress: 10 });
        stopAgentPolling();

        try {
          // Step 1: 启动 Agent 任务（立即返回 runId）
          const accepted = await runAgentGeneration({
            product_id: selectedProductId,
            style_vibe: formStyleVibe.trim() || undefined,
            language: formLanguage.trim() || undefined,
            aspect_ratio: formAspectRatio,
            constraint_list: splitConstraints(formConstraintInput),
            preferences: preferences.filter(p => p.text.trim()).map(p => ({ type: p.type as 'WINNER' | 'LOSER', text: p.text })),
          });

          const runId = accepted.run_id;
          if (!runId) {
            throw new Error('Agent 启动失败：未返回 run_id');
          }

          setGenerateProgress({ stage: 'GENERATING', message: t('script.agentAccepted'), progress: 15 });
          setAgentResult(accepted);

          // Step 2: 轮询状态（每 2 秒）
          const POLL_INTERVAL_MS = 2000;
          const maxPolls = Math.ceil(10 * 60 * 1000 / POLL_INTERVAL_MS); // 最多轮询 10 分钟

          let pollCount = 0;
          let finalResult: AgentGenerateResponse | null = null;

          agentPollRef.current = setInterval(async () => {
            pollCount++;

            try {
              const status = await getAgentStatus(runId);

              if (!status) {
                // 运行记录还未就绪，继续等待
                return;
              }

              // 更新进度显示
              setAgentResult(status);

              if (status.status === 'ACCEPTED' || status.status === 'RUNNING') {
                const stepCount = status.step_log?.length || 0;
                const lastStep = status.step_log?.[status.step_log.length - 1];
                const progress = Math.min(15 + stepCount * 10, 90);
                setGenerateProgress({
                  stage: status.status,
                  message: lastStep?.reasoning || t('script.agentRunning'),
                  progress,
                });
                return;
              }

              // 终态：PASSED 或 FALLBACK
              stopAgentPolling();
              setGenerateProgress(null);
              setAgentResult(status);
              setAgentBusy(false);
              setGenerateBusy(false);

              // 加载生成的剧本
              if (status.final_script_id) {
                await handleScriptGenerated({ script_id: status.final_script_id }).catch(() => {});
              }

              const iterText = status.iterations > 1 ? `（${t('script.iterationsLabel', { n: status.iterations })}）` : '';
              setGenerateSuccess(t('script.agentGenerateSuccess', {
                status: status.status === 'PASSED' ? t('script.reviewPassed') : t('script.fallbackOutput'),
                iterations: iterText,
                scriptId: status.final_script_id || t('script.notSaved'),
              }));
              finalResult = status;
            } catch (pollErr) {
              // 单次轮询失败不中断，继续等待
              if (pollCount >= maxPolls) {
                stopAgentPolling();
                setGenerateProgress(null);
                setAgentBusy(false);
                setGenerateBusy(false);
                setGenerateError(t('script.agentTimeout'));
              }
            }
          }, POLL_INTERVAL_MS);
        } catch (err) {
          stopAgentPolling();
          setGenerateProgress(null);
          setAgentBusy(false);
          setGenerateBusy(false);
          setGenerateError(err instanceof Error ? err.message : t('script.agentFailed'));
        }
        return;
      }

      // ========== Auto A/B 模式 ==========
      if (mode === 'auto-ab') {
        // 需要在列表中选择一个已生成的剧本作为基准
        const baseScriptId = activeScriptId;
        if (!baseScriptId) {
          setGenerateError(t('script.selectBaseScript'));
          setGenerateBusy(false);
          return;
        }
        setAutoAbBusy(true);
        setAutoAbResult(null);
        setGenerateError(null);
        setGenerateSuccess(null);
        setGenerateProgress({ stage: 'GENERATING', message: t('script.autoAbProgress'), progress: 5 });
        try {
          const result = await runAutoAb({
            product_id: selectedProductId,
            script_id: baseScriptId,
          });
          setAutoAbResult(result);
          setGenerateProgress(null);
          if (result.status === 'COMPLETED') {
            setGenerateSuccess(t('script.abSuccessResult', { label: result.winner.label, count: result.variant_script_ids.length }));
          } else {
            setGenerateError(t('script.abPipelineFailed', { msg: result.step_log?.find(s => s.action === '管线执行失败')?.reasoning || t('common.unknownError') }));
          }
        } catch (err) {
          setGenerateProgress(null);
          setGenerateError(err instanceof Error ? err.message : t('script.autoAbFailed'));
        } finally {
          setAutoAbBusy(false);
          setGenerateBusy(false);
        }
        return;
      }

      // ========== DNA 模式（使用 REST API，无 SSE） ==========
      if (mode === 'dna') {
        if (!selectedDnaId) {
          setGenerateError(t('script.selectDna'));
          setGenerateBusy(false);
          return;
        }
        setGenerateProgress({ stage: 'GENERATING', message: t('script.dnaProgress'), progress: 10 });
        try {
          const dnaResp = await generateFromDna({
            dna_id: selectedDnaId,
            product_id: selectedProductId,
            style_vibe: formStyleVibe.trim() || undefined,
            aspect_ratio: formAspectRatio,
            language: formLanguage.trim() || undefined,
            material_ids: selectedMaterialIds.length > 0 ? selectedMaterialIds : undefined,
          });
          setGenerateProgress(null);
          await handleScriptGenerated(dnaResp);
          setGenerateSuccess(t('script.dnaGenerateSuccess', { id: dnaResp.script_id }));
        } catch (err) {
          setGenerateProgress(null);
          setGenerateError(err instanceof Error ? err.message : t('script.dnaFailed'));
        } finally {
          setGenerateBusy(false);
        }
        return;
      }

      // ========== composed/hybrid/batch 使用直接 API 调用 ==========
      if (mode === 'composed') {
        setGenerateProgress({ stage: 'GENERATING', message: t('script.composedProgress'), progress: 10 });
        try {
          const composedResp = await generateComposedScript({
            product_id: selectedProductId,
            template_id: selectedTemplateId || undefined,
            viral_video_id: lastAnalysis?.analysis_id,
            auto_match_viral: formAutoMatchViral || undefined,
            constraint_overrides: splitConstraints(formConstraintOverrides),
            factor_overrides: (() => { try { return JSON.parse(formFactorOverrides || '{}') as Record<string, unknown>; } catch { return undefined; } })(),
            style_vibe: formStyleVibe.trim() || undefined,
            preferences: preferences.filter(p => p.text.trim()),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            material_ids: selectedMaterialIds.length > 0 ? selectedMaterialIds : undefined,
          });
          const script = await handleScriptGenerated(composedResp);
          if (script) {
            setGenerateSuccess(t('script.composedGenerateSuccess', { id: script.script_id }));
          }
        } catch (err) {
          setGenerateError(err instanceof Error ? err.message : t('script.generateFailed'));
        } finally {
          setGenerateBusy(false);
          setGenerateProgress(null);
        }
        return;
      }

      if (mode === 'hybrid') {
        setGenerateProgress({ stage: 'GENERATING', message: t('script.hybridProgress'), progress: 10 });
        try {
          const hybridResp = await generateHybridScript({
            product_id: selectedProductId,
            template_id: selectedTemplateId || undefined,
            viral_video_id: lastAnalysis?.analysis_id,
            auto_match_viral: formAutoMatchViral || undefined,
            user_strategy_summary: formUserStrategy.trim() || undefined,
            user_factors: (() => { try { return JSON.parse(formUserFactors || '{}') as Record<string, unknown>; } catch { return undefined; } })(),
            user_constraints: splitConstraints(formUserConstraints),
            constraint_list: commonPayload.constraint_list,
            style_vibe: formStyleVibe.trim() || undefined,
            language: formLanguage.trim() || undefined,
            target_audience: selectedProduct?.target_audience,
            preferences: preferences.filter(p => p.text.trim()),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            material_ids: selectedMaterialIds.length > 0 ? selectedMaterialIds : undefined,
          });
          const script = await handleScriptGenerated(hybridResp);
          if (script) {
            setGenerateSuccess(t('script.hybridGenerateSuccess', { id: script.script_id }));
          }
        } catch (err) {
          setGenerateError(err instanceof Error ? err.message : t('script.generateFailed'));
        } finally {
          setGenerateBusy(false);
          setGenerateProgress(null);
        }
        return;
      }

      if (mode === 'batch') {
        const styleVibesList = formStyleVibesInput
          .split(/[\n,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (styleVibesList.length < 2) {
          setGenerateError(t('script.enterStyleBatch'));
          setGenerateBusy(false);
          return;
        }
        setGenerateProgress({ stage: 'GENERATING', message: t('script.batchProgressMessage', { styles: styleVibesList.length, templates: 0 }), progress: 15 });
        try {
          const batchResp = await generateBatchScripts({
            product_id: selectedProductId,
            batch_size: Math.min(styleVibesList.length, 5),
            style_variations: styleVibesList.slice(0, 5),
            constraint_list: splitConstraints(formConstraintInput),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            material_ids: selectedMaterialIds.length > 0 ? selectedMaterialIds : undefined,
          });
          setBatchResult(batchResp);
          setGenerateSuccess(t('script.batchGenerateSuccess', { total: batchResp.total, batchId: batchResp.batch_id }));
          setScripts((current) => {
            let updated = current;
            for (const s of batchResp.scripts) {
              updated = upsertScript(updated, s);
            }
            return updated;
          });
          if (batchResp.scripts.length > 0) {
            const firstScript = batchResp.scripts[0];
            setActiveScript(firstScript);
            setActiveScriptId(firstScript.script_id);
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('scriptId', firstScript.script_id);
              return next;
            });
          }
          await refreshScripts(batchResp.scripts[0]?.script_id);
        } catch (err) {
          setGenerateError(err instanceof Error ? err.message : t('script.generateFailed'));
        } finally {
          setGenerateBusy(false);
          setGenerateProgress(null);
        }
        return;
      }

      // ========== 所有三种模式都使用 SSE 流式进度 ==========
      const streamEndpoint =
        mode === 'quick' ? '/api/v1/scripts/generate/stream/quick' :
        mode === 'template' ? '/api/v1/scripts/generate/stream/template' :
        '/api/v1/scripts/generate/stream/viral-rewrite';

      // 构建各模式的 POST 数据
      let postData: Record<string, unknown>;
      if (mode === 'viral') {
        // self_uploaded: 上传文件 → 创建分析 → 继续
        if (viralPlatform === 'self_uploaded') {
          if (!viralFile) {
            throw new Error(t('script.selectVideoFile'));
          }
          setGenerateProgress({ stage: 'ANALYZING', message: t('script.viralUploadProgress'), progress: 5 });
          const { analysis_id } = await uploadAndCreateViralAnalysis();
          postData = {
            product_id: commonPayload.product_id,
            viral_video_id: analysis_id,
            title: commonPayload.title,
            language: commonPayload.language,
            style_vibe: commonPayload.style_vibe || '爆款仿写',
            aspect_ratio: commonPayload.aspect_ratio,
            selling_points: commonPayload.selling_points,
            target_audience: commonPayload.target_audience,
            constraint_list: commonPayload.constraint_list,
            preferences: preferences.filter(p => p.text.trim()),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
          };
        } else {
          if (!viralSourceUrl.trim()) {
            throw new Error(t('script.enterViralUrl'));
          }
          // 先同步创建爆款分析
          setGenerateProgress({ stage: 'ANALYZING', message: t('script.viralAnalyzeProgress'), progress: 5 });
          const analysisResponse2 = await createViralAnalysis({
            source_url: viralSourceUrl.trim(),
            source_platform: viralPlatform,
            product_id: selectedProductId,
            declared_public_source: true,
          });
          const analysis = analysisResponse2.analysis;
          setLastAnalysis(analysis);
          postData = {
            product_id: commonPayload.product_id,
            viral_video_id: analysis.analysis_id,
            title: commonPayload.title,
            language: commonPayload.language,
            style_vibe: commonPayload.style_vibe || '爆款仿写',
            aspect_ratio: commonPayload.aspect_ratio,
            selling_points: commonPayload.selling_points,
            target_audience: commonPayload.target_audience,
            constraint_list: commonPayload.constraint_list,
            preferences: preferences.filter(p => p.text.trim()),
            enable_ai_compliance: formEnableAiCompliance || undefined,
            ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
          };
        }
      } else if (mode === 'template') {
        if (!selectedTemplateId) {
          throw new Error(t('script.selectTemplate'));
        }
        postData = {
          product_id: commonPayload.product_id,
          template_id: selectedTemplateId,
          title: commonPayload.title,
          language: commonPayload.language,
          style_vibe: commonPayload.style_vibe,
          aspect_ratio: commonPayload.aspect_ratio,
          selling_points: commonPayload.selling_points,
          target_audience: commonPayload.target_audience,
          constraint_list: commonPayload.constraint_list,
          preferences: preferences.filter(p => p.text.trim()),
          enable_ai_compliance: formEnableAiCompliance || undefined,
          ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
        };
      } else {
        postData = {
          product_id: commonPayload.product_id,
          title: commonPayload.title,
          language: commonPayload.language,
          style_vibe: commonPayload.style_vibe || '高转化 UGC',
          aspect_ratio: commonPayload.aspect_ratio,
          selling_points: commonPayload.selling_points,
          target_audience: commonPayload.target_audience,
          constraint_list: commonPayload.constraint_list,
          preferences: preferences.filter(p => p.text.trim()),
          enable_ai_compliance: formEnableAiCompliance || undefined,
          ...(selectedMaterialIds.length > 0 ? { material_ids: selectedMaterialIds } : {}),
        };
      }

      // 使用 fetch 发送 POST 并读取 SSE 流式响应
      const abortController = new AbortController();
      sseAbortRef.current = abortController;
      sseStarted = true;
      void (async () => {
        try {
          const streamResponse = await fetch(
            streamEndpoint,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(postData),
              signal: abortController.signal,
            },
          );

          if (!streamResponse.ok) {
            throw new Error(`HTTP ${streamResponse.status}`);
          }

          const reader = streamResponse.body?.getReader();
          if (!reader) {
            throw new Error('Response body is not readable');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (data.type === 'progress') {
                    setGenerateProgress({
                      stage: data.stage,
                      message: data.message,
                      progress: data.progress,
                    });
                  } else if (data.type === 'complete') {
                    setGenerateProgress(null);
                    const resultScript = data.data;
                    if (resultScript) {
                      void (async () => {
                        const script = await getScript(resultScript.script_id);
                        setScripts((current) => upsertScript(current, script));
                        setActiveScript(script);
                        setActiveScriptId(script.script_id);
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set('scriptId', script.script_id);
                          return next;
                        });
                        setGenerateSuccess(t('script.generateSuccessQuick', { id: script.script_id }));
                        await refreshScripts(script.script_id);
                      })();
                    }
                    setGenerateBusy(false);
                  } else if (data.type === 'error') {
                    setGenerateProgress(null);
                    setGenerateError(data.message || t('script.generateFailed'));
                    setGenerateBusy(false);
                  }
                } catch {
                  // 忽略 JSON 解析错误
                }
              }
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setGenerateProgress(null);
          if (error instanceof Error && error.message === 'Failed to fetch') {
            setGenerateError(t('script.sseFallback'));
          } else {
            setGenerateError(error instanceof Error ? error.message : t('script.sseFallback'));
          }
          // SSE 失败时降级到同步调用
          // 使用 queueMicrotask 跳出当前 try-finally 作用域，避免外部 finally 覆盖降级调用的 busy 状态
          queueMicrotask(() => { void handleGenerateFallback(commonPayload, mode); });
        }
      })();

      // SSE 模式下不等待完成，状态由 SSE 回调管理
      return;
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t('script.generateFailed'));
    } finally {
      if (!sseStarted) {
        setGenerateBusy(false);
      }
    }
  }

  async function handleSaveScript(): Promise<void> {
    if (!activeScriptId) {
      return;
    }

    setSaveBusy(true);
    setSaveMessage(null);
    try {
      const response = await saveScript(activeScriptId, {
        save_message: 'web-client save',
        force_revalidate: true,
      });
      setSaveMessage(t('script.savedMessage', {
        id: response.script_id,
        schema: response.validation_summary.schema_valid ? t('common.pass') : t('common.fail'),
        timing: response.validation_summary.timing_valid ? t('common.pass') : t('common.fail'),
      }),
      );
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : t('script.saveFailed'));
    } finally {
      setSaveBusy(false);
    }
  }

  async function reloadActiveScript(nextSelectedShotIndex?: number | null): Promise<void> {
    if (!activeScriptId) {
      return;
    }

    const script = await getScript(activeScriptId);
    setActiveScript(script);
    setScripts((current) => upsertScript(current, script));
    if (nextSelectedShotIndex) {
      setSelectedShotIndex(nextSelectedShotIndex);
    }

    // 确保 draftShot 与当前选中分镜的服务器数据同步（兜底 useEffect L818）
    const targetIndex = nextSelectedShotIndex ?? selectedShotIndex;
    if (targetIndex != null) {
      const freshShot = script.shots.find((shot) => shot.shot_index === targetIndex);
      if (freshShot) {
        setDraftShot(toDraftShot(freshShot));
      }
    }
  }

  async function handleResetDraft(): Promise<void> {
    if (!activeScriptId || !draftShot) {
      return;
    }

    setPatchBusy(true);
    setPatchMessage(null);
    try {
      // 从服务器重新拉取最新数据
      const script = await getScript(activeScriptId);
      const serverShot = script.shots.find((shot) => shot.shot_index === draftShot.shot_index);
      if (serverShot) {
        setDraftShot(toDraftShot(serverShot));
      }
      setPatchMessage(t('script.resetDraftDone', '草稿已从服务器恢复'));
    } catch (error) {
      setPatchMessage(formatPatchError(error, t('script.resetDraftFailed', '重置草稿失败'), t));
    } finally {
      setPatchBusy(false);
    }
  }

  async function handlePatchShot(): Promise<void> {
    if (!activeScriptId || !activeScript || !draftShot) {
      return;
    }

    const original = activeScript.shots.find((shot) => shot.shot_index === draftShot.shot_index);
    if (!original) {
      setPatchMessage(t('script.shotEditFailed'));
      return;
    }

    const shotPathIndex = original.shot_index;
    const nextDuration = Number(draftShot.duration);
    const operations: Array<{ op: 'replace'; path: string; value: unknown }> = [];

    if (draftShot.scene_description_query !== original.scene_description_query) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/scene_description_query`, value: draftShot.scene_description_query });
    }
    if (draftShot.visual_description !== original.visual_description) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/visual_description`, value: draftShot.visual_description });
    }
    if (draftShot.voiceover_text !== original.voiceover_text) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/voiceover_text`, value: draftShot.voiceover_text });
    }
    if (draftShot.subtitle_text !== original.subtitle_text) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/subtitle_text`, value: draftShot.subtitle_text });
    }
    if (Number.isFinite(nextDuration) && nextDuration !== original.duration) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/duration`, value: nextDuration });
    }
    if (draftShot.camera_movement !== original.camera_movement) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/camera_movement`, value: draftShot.camera_movement });
    }
    if (draftShot.transition_type !== original.transition_type) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/transition_type`, value: draftShot.transition_type });
    }
    const origBgm = (original.bgm_segment ?? DEFAULT_BGM_SEGMENT) as BgmSegment;
    if (JSON.stringify(draftShot.bgm_segment) !== JSON.stringify(origBgm)) {
      operations.push({ op: 'replace', path: `/shots/${shotPathIndex}/local_factor_patch/bgm_segment`, value: draftShot.bgm_segment });
    }

    if (operations.length === 0) {
      setPatchMessage(t('script.noChanges'));
      return;
    }

    setPatchBusy(true);
    setPatchMessage(null);
    try {
      const response = await patchScript(activeScriptId, operations);

      // 从服务器重新拉取权威数据，确保 activeScript / scripts / draftShot 全部一致
      await reloadActiveScript(draftShot.shot_index);

      setPatchMessage(t('script.patchUpdated', { fields: response.updated_fields.join('、'), suggestion: response.timing_validation.suggestion }));
    } catch (error) {
      setPatchMessage(formatPatchError(error, t('script.shotEditFailed'), t));
    } finally {
      setPatchBusy(false);
    }
  }

  async function handleMoveShot(shotIndex: number, direction: -1 | 1): Promise<void> {
    if (!activeScriptId || !activeScript) {
      return;
    }

    const fromShot = activeScript.shots.find((shot) => shot.shot_index === shotIndex);
    if (!fromShot) {
      return;
    }

    const targetShotIndex = shotIndex + direction;
    const targetShot = activeScript.shots.find((shot) => shot.shot_index === targetShotIndex);
    if (!targetShot) {
      return;
    }

    setPatchBusy(true);
    setPatchMessage(null);
    try {
      await patchScript(activeScriptId, [{ op: 'move', from: `/shots/${shotIndex}`, path: `/shots/${targetShotIndex}` }]);
      await reloadActiveScript(targetShotIndex);
      setPatchMessage(t('script.shotMovedToPosition', { from: shotIndex, to: targetShotIndex }));
    } catch (error) {
      setPatchMessage(formatPatchError(error, t('script.shotReorderFailed'), t));
    } finally {
      setPatchBusy(false);
    }
  }

  async function handleRemoveShot(shotIndex: number): Promise<void> {
    if (!activeScriptId || !activeScript) {
      return;
    }

    if (activeScript.shots.length === 1) {
      setPatchMessage(t('script.minOneShot'));
      return;
    }

    if (!activeScript.shots.find((shot) => shot.shot_index === shotIndex)) {
      return;
    }

    setPatchBusy(true);
    setPatchMessage(null);
    try {
      await patchScript(activeScriptId, [{ op: 'remove', path: `/shots/${shotIndex}` }]);
      const remaining = activeScript.shots.filter((shot) => shot.shot_index !== shotIndex);
      await reloadActiveScript(remaining[0]?.shot_index ?? null);
      setPatchMessage(t('script.shotDeletedMsg', { index: shotIndex }));
    } catch (error) {
      setPatchMessage(formatPatchError(error, t('script.shotDeleteFailed'), t));
    } finally {
      setPatchBusy(false);
    }
  }

  async function handleAddShot(position: 'before' | 'after'): Promise<void> {
    if (!activeScriptId || !activeScript) {
      return;
    }

    // 无选中分镜时，默认在末尾追加
    const resolvedShotIndex = selectedShotIndex ?? activeScript.shots[activeScript.shots.length - 1]?.shot_index ?? null;
    if (resolvedShotIndex === null) {
      return;
    }

    const refShot = activeScript.shots.find((shot) => shot.shot_index === resolvedShotIndex);
    if (!refShot) {
      return;
    }

    const currentTotal = activeScript.shots.reduce((sum, shot) => sum + shot.duration, 0);
    if (currentTotal + 3 > 15) {
      setPatchMessage(t('script.insertExceeded'));
      return;
    }

    // 无选中时始终在末尾追加
    const effectivePosition = selectedShotIndex === null ? 'after' : position;
    const insertShotIndex = effectivePosition === 'after' ? refShot.shot_index + 1 : refShot.shot_index;

    setPatchBusy(true);
    setPatchMessage(null);
    try {
      const now = new Date().toISOString();
      const insertShot: ScriptShot = refShot
        ? {
            id: crypto.randomUUID(),
            shot_index: 0,
            scene_description_query: '',
            visual_description: '',
            voiceover_text: t('script.defaultVoiceover'),
            subtitle_text: '',
            duration: 3,
            camera_movement: refShot.camera_movement,
            transition_type: refShot.transition_type,
            safe_zone_bounding_box: refShot.safe_zone_bounding_box,
            local_factor_patch: {},
            compliance_status: refShot.compliance_status,
            created_at: now,
            updated_at: now,
          }
        : {
            id: crypto.randomUUID(),
            shot_index: 0,
            scene_description_query: '',
            visual_description: '',
            voiceover_text: t('script.defaultVoiceover'),
            subtitle_text: '',
            duration: 3,
            camera_movement: 'Static',
            transition_type: 'None',
            safe_zone_bounding_box: [0.05, 0.05, 0.03, 0.03] as [number, number, number, number],
            local_factor_patch: {},
            compliance_status: 'PENDING',
            created_at: now,
            updated_at: now,
          };

      await patchScript(activeScriptId, [{ op: 'add', path: `/shots/${insertShotIndex}`, value: insertShot }]);
      await reloadActiveScript(insertShotIndex);
      setPatchMessage(
        effectivePosition === 'after'
          ? t('script.shotInsertedAfterMsg', { shotIndex: resolvedShotIndex })
          : t('script.shotInsertedBeforeMsg', { shotIndex: resolvedShotIndex }),
      );
    } catch (error) {
      setPatchMessage(formatPatchError(error, t('script.shotInsertFailed'), t));
    } finally {
      setPatchBusy(false);
    }
  }

  function handleJumpToCreate(): void {
    if (!activeScriptId) {
      return;
    }
    navigate(`/create?scriptId=${activeScriptId}`);
  }

  async function handleDeleteScript(scriptId: string): Promise<void> {
    try {
      await deleteScript(scriptId);
      setScripts((current) => current.filter((s) => s.script_id !== scriptId));
      if (activeScriptId === scriptId) {
        setActiveScriptId(null);
        setActiveScript(null);
      }
    } catch (error) {
      console.error('Delete script failed:', error);
      setScriptsError(error instanceof Error ? error.message : 'Delete script failed');
    }
  }

  async function handleRestoreScript(scriptId: string): Promise<void> {
    setTrashError(null);
    setTrashBusyIds((prev) => new Set(prev).add(scriptId));
    try {
      await restoreScript(scriptId);
      setTrashItems((current) => current.filter((s) => s.script_id !== scriptId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('script.restoreFailed');
      setTrashError(msg);
    } finally {
      setTrashBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(scriptId);
        return next;
      });
    }
  }

  async function handlePermanentDeleteScript(scriptId: string): Promise<void> {
    setTrashError(null);
    setTrashBusyIds((prev) => new Set(prev).add(scriptId));
    try {
      await permanentDeleteScript(scriptId);
      setTrashItems((current) => current.filter((s) => s.script_id !== scriptId));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('script.permanentDeleteFailed');
      setTrashError(msg);
    } finally {
      setTrashBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(scriptId);
        return next;
      });
    }
  }

  async function handleBatchDelete(): Promise<void> {
    if (selectedScriptIds.size === 0) return;
    try {
      // Bug 18: 使用 Promise.all 并行执行删除，替代串行 for-await
      await Promise.all(
        Array.from(selectedScriptIds).map((scriptId) => deleteScript(scriptId)),
      );
      setScripts((current) => current.filter((s) => !selectedScriptIds.has(s.script_id)));
      if (activeScriptId && selectedScriptIds.has(activeScriptId)) {
        setActiveScriptId(null);
        setActiveScript(null);
      }
      setSelectedScriptIds(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error('Batch delete failed:', error);
      setScriptsError(error instanceof Error ? error.message : 'Batch delete failed');
    }
  }

  async function handleBatchRestore(): Promise<void> {
    if (selectedScriptIds.size === 0) return;
    try {
      // Bug 18: 使用 Promise.all 并行执行恢复，替代串行 for-await
      await Promise.all(
        Array.from(selectedScriptIds).map((scriptId) => restoreScript(scriptId)),
      );
      setTrashItems((current) => current.filter((s) => !selectedScriptIds.has(s.script_id)));
      setSelectedScriptIds(new Set());
      setIsSelectMode(false);
      await refreshScripts();
    } catch (error) {
      console.error('Batch restore failed:', error);
      setScriptsError(error instanceof Error ? error.message : 'Batch restore failed');
    }
  }

  async function handleBatchPermanentDelete(): Promise<void> {
    if (selectedScriptIds.size === 0) return;
    try {
      // Bug 18: 使用 Promise.all 并行执行永久删除，替代串行 for-await
      await Promise.all(
        Array.from(selectedScriptIds).map((scriptId) => permanentDeleteScript(scriptId)),
      );
      setTrashItems((current) => current.filter((s) => !selectedScriptIds.has(s.script_id)));
      setSelectedScriptIds(new Set());
      setIsSelectMode(false);
    } catch (error) {
      console.error('Batch permanent delete failed:', error);
      setScriptsError(error instanceof Error ? error.message : 'Batch permanent delete failed');
    }
  }

  function toggleScriptSelect(scriptId: string): void {
    setSelectedScriptIds((current) => {
      const next = new Set(current);
      if (next.has(scriptId)) {
        next.delete(scriptId);
      } else {
        next.add(scriptId);
      }
      return next;
    });
  }

  async function loadTrashItems(): Promise<void> {
    if (!selectedProductId) return;
    setTrashLoading(true);
    setTrashError(null);
    try {
      const response = await listTrashScripts(selectedProductId, 1, 100);
      setTrashItems(response.items);
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : t('script.trashLoadFailed'));
    } finally {
      setTrashLoading(false);
    }
  }

 function handleShowTrash(): void {
    setShowTrash(true);
    void loadTrashItems();
  }

  async function handleFactorRemix(): Promise<void> {
    if (!activeScriptId) return;

    // 提前解析 JSON 参数（同步骤校验）
    let factorOverrides: Record<string, unknown> = {};
    try {
      factorOverrides = JSON.parse(factorRemixFactorOverrides || '{}') as Record<string, unknown>;
    } catch {
      setFactorRemixError(t('script.factorJsonInvalid'));
      return;
    }

    // 过滤掉空值，只保留用户实际填写的因子
    const nonEmpty: Record<string, unknown> = {};
    for (const key of Object.keys(DEFAULT_FACTOR_REMIX_PRESET)) {
      const val = factorOverrides[key];
      if (val !== '' && val !== null && val !== undefined) {
        nonEmpty[key] = val;
      }
    }
    factorOverrides = nonEmpty;

    if (!factorOverrides || typeof factorOverrides !== 'object' || Object.keys(factorOverrides).length === 0) {
      setFactorRemixError(t('script.factorOverrideEmpty', '因子覆盖映射不能为空'));
      return;
    }

    // 立即关闭弹窗
    setFactorRemixOpen(false);
    setFactorRemixBusy(true);
    setFactorRemixError(null);
    setFactorRemixSuccess(null);
    setGenerateError(null);
    setGenerateSuccess(null);

    // 显示页面级进度
    setFactorRemixProgress({
      stage: 'REMIXING',
      message: t('script.factorRemixInProgress', '正在因子重混...'),
      progress: 20,
    });

    try {
      const result = await factorRemixScript(activeScriptId, {
        factor_overrides: factorOverrides,
        preserve_voiceover: factorRemixPreserveVoiceover,
        extra_instruction: factorRemixExtraInstruction.trim() || undefined,
      });

      // 进度完成
      setFactorRemixProgress({
        stage: 'DONE',
        message: t('script.factorRemixDone', '因子重混完成'),
        progress: 100,
      });

      // 将新剧本加入列表并选中
      await handleScriptGenerated(result);

      setFactorRemixSuccess(t('script.factorRemixComplete', '因子重混完成'));

      // 短暂展示完成后清除进度条
      setTimeout(() => setFactorRemixProgress(null), 2000);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t('script.factorRemixFailed'));
      setFactorRemixProgress(null);
    } finally {
      setFactorRemixBusy(false);
    }
  }

  function handleHideTrash(): void {
    setShowTrash(false);
    setTrashItems([]);
    setSelectedScriptIds(new Set());
    setIsSelectMode(false);
  }

  const activeShot = activeScript?.shots.find((shot) => shot.shot_index === selectedShotIndex) ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('script.generate')}</CardTitle>
            <CardDescription>{t('script.generateDesc')}</CardDescription>

            {/* API Key 状态指示器 */}
            {apiKeyLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs">
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                <span className="text-slate-400">{t('script.checkingAi')}</span>
              </div>
            ) : apiKeyStatus ? (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  apiKeyStatus.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : apiKeyStatus.configured
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    apiKeyStatus.ok ? 'bg-emerald-400' : apiKeyStatus.configured ? 'bg-amber-400' : 'bg-rose-400'
                  }`}
                />
                <span>{apiKeyStatus.message}</span>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-1">
              <Button variant={mode === 'quick' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('quick'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                {t('script.mode_quick')}
              </Button>
              <Button variant={mode === 'template' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('template'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                {t('script.mode_template')}
              </Button>
              <Button variant={mode === 'dna' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('dna'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                <Dna className="h-3.5 w-3.5 mr-1" />
                {t('script.mode_dna')}
              </Button>
              <Button variant={mode === 'viral' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('viral'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                {t('script.mode_viral')}
              </Button>
              <Button variant={mode === 'composed' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('composed'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                {t('script.mode_composed')}
              </Button>
              <Button variant={mode === 'hybrid' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('hybrid'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                {t('script.mode_hybrid')}
              </Button>
              <Button variant={mode === 'batch' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('batch'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                {t('script.mode_batch')}
                <span className="ml-1 rounded bg-indigo-500/20 px-1 text-[10px] text-indigo-300">BETA</span>
              </Button>
              <Button variant={mode === 'agent' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('agent'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }}>
                <Bot className="h-3.5 w-3.5 mr-1" />
                {t('script.mode_agent')}
                <span className="ml-1 rounded bg-cyan-500/20 px-1 text-[10px] text-cyan-300">NEW</span>
              </Button>
              <Button variant={mode === 'auto-ab' ? 'default' : 'ghost'} size="sm" onClick={() => { setMode('auto-ab'); setGenerateError(null); setGenerateSuccess(null); setGenerateProgress(null); setAgentResult(null); setAutoAbResult(null); setBatchResult(null); }} disabled={!activeScriptId}>
                <Shuffle className="h-3.5 w-3.5 mr-1" />
                {t('script.mode_auto_ab')}
                <span className="ml-1 rounded bg-purple-500/20 px-1 text-[10px] text-purple-300">NEW</span>
              </Button>
            </div>

            <Input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder={t('script.title')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={formLanguage} onChange={(event) => setFormLanguage(event.target.value)} placeholder="zh-CN" />
              <Select value={formAspectRatio} onChange={(event) => setFormAspectRatio(event.target.value as AspectRatio)}>
                {aspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </Select>
            </div>
            <Input value={formStyleVibe} onChange={(event) => setFormStyleVibe(event.target.value)} placeholder={t('script.styleVibePlaceholder')} />
            <Textarea
              value={formSellingPoints}
              onChange={(event) => setFormSellingPoints(event.target.value)}
              placeholder={t('script.sellingPointsPlaceholder')}
              className="min-h-[72px]"
            />
            <Textarea
              value={formConstraintInput}
              onChange={(event) => setFormConstraintInput(event.target.value)}
              placeholder={t('script.constraintPlaceholder')}
              className="min-h-[88px]"
            />

            {/* 素材关联（可选） */}
            {selectedProductId && (mode === 'quick' || mode === 'viral' || mode === 'template' || mode === 'dna' || mode === 'composed' || mode === 'hybrid' || mode === 'batch') && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">{t('script.linkMaterialTitle')}</span>
                  <span className="text-[10px] text-slate-500">{t('script.linkMaterialHint')}</span>
                </div>
                <MaterialSelector
                  productId={selectedProductId}
                  mode="multiple"
                  maxSelect={5}
                  selectedIds={selectedMaterialIds}
                  onChange={(ids) => setSelectedMaterialIds(ids)}
                />
              </div>
            )}

            {mode === 'template' && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">{t('script.template')}</div>
                {templatesError && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {templatesError}
                  </div>
                )}
                <Select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={templatesLoading || templates.length === 0}>
                  {templates.map((template) => (
                    <option key={template.template_id} value={template.template_id}>
                      {template.name} · {template.category}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {mode === 'dna' && (
              <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="flex items-center gap-2">
                  <Dna className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-medium text-cyan-200">{t('script.dnaMode')}</span>
                </div>
                {dnaLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" />{t('script.dnaLoading')}
                  </div>
                )}
                {dnaError && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {dnaError}
                  </div>
                )}
                {dnaDetail && (
                  <div className="space-y-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">{dnaDetail.category}</Badge>
                      <span>{t('dna.market')}: {dnaDetail.market}</span>
                      <span>{t('dna.compositeScore')}: {dnaDetail.composite_score?.toFixed(2)}</span>
                      <span>{t('dna.confidence')}: {Math.round(dnaDetail.confidence * 100)}%</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md bg-slate-900/60 px-2 py-1">
                        <span className="text-slate-500">Hooks</span>
                        <p className="text-slate-200 font-medium">{dnaDetail.hooks?.length || 0}</p>
                      </div>
                      <div className="rounded-md bg-slate-900/60 px-2 py-1">
                        <span className="text-slate-500">{t('dna.visualStyle')}</span>
                        <p className="text-slate-200 font-medium">{dnaDetail.visual_styles?.length || 0}</p>
                      </div>
                      <div className="rounded-md bg-slate-900/60 px-2 py-1">
                        <span className="text-slate-500">BGM</span>
                        <p className="text-slate-200 font-medium">{dnaDetail.bgm_patterns?.length || 0}</p>
                      </div>
                    </div>
                    {dnaDetail.product_names && dnaDetail.product_names.length > 0 && (
                      <p className="text-slate-500 truncate">{t('dna.productNames')}: {dnaDetail.product_names.join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Auto A/B 对比结果 — 独立于 mode 显示 */}
            {autoAbResult && (
              <div className="space-y-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-200">
                  <Shuffle className="h-4 w-4" />
                  {t('script.abResult')}
                  <Badge variant={autoAbResult.status === 'COMPLETED' ? 'success' : 'destructive'} className="text-[10px]">
                    {autoAbResult.status === 'COMPLETED' ? t('common.success') : t('common.error')}
                  </Badge>
                </div>

                {/* 优胜版本 */}
                {autoAbResult.winner.label && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-emerald-300">{t('script.winnerVersion')}</span>
                      <span className="text-sm font-semibold text-emerald-100">{autoAbResult.winner.label}</span>
                      <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-300">
                        {autoAbResult.winner.score.toFixed(1)} {t('common.score')}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* 排名 */}
                {autoAbResult.rankings.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-purple-300">{t('script.variantRanking')}</span>
                    {autoAbResult.rankings.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 rounded bg-slate-900/60 px-3 py-1.5 text-xs">
                        <span className="text-slate-400 w-4">#{r.rank}</span>
                        <span className="text-slate-200 flex-1">{r.label}</span>
                        <span className="text-slate-400 tabular-nums">{r.score.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI 洞察 */}
                {autoAbResult.insights.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-purple-300">{t('script.aiInsight')}</span>
                    {autoAbResult.insights.map((insight, i) => (
                      <div key={i} className="rounded bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300">
                        {insight}
                      </div>
                    ))}
                  </div>
                )}

                {/* {t("script.agentLog")} */}
                {autoAbResult.step_log.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-purple-300">{t('script.agentLog')}</span>
                    <div className="space-y-1 max-h-[240px] overflow-y-auto">
                      {autoAbResult.step_log.map((step, i) => (
                        <div key={i} className="rounded border border-slate-700/50 bg-slate-900/60 px-2.5 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="rounded bg-slate-700 px-1 py-0 text-[10px] text-slate-300 font-mono">{step.node}</span>
                            <span className="text-slate-200">{step.action}</span>
                          </div>
                          <p className="text-slate-400">{step.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 变体剧本 ID */}
                {autoAbResult.variant_script_ids.length > 0 && (
                  <div className="text-[10px] text-slate-500 pt-1 border-t border-purple-500/20 space-x-2">
                    <span>{t('script.variantScript')}</span>
                    {autoAbResult.variant_script_ids.map((sid, i) => (
                      <span key={i} className="font-mono">{sid.slice(0, 8)}...</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === 'viral' && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                {viralPlatform === 'self_uploaded' ? (
                  <div className="space-y-2">
                    <label className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-slate-600 bg-slate-900/40 p-6 text-center transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/5">
                      <input
                        type="file"
                        accept="video/mp4"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setViralFile(file);
                        }}
                      />
                      {viralFile ? (
                        <div className="space-y-1 text-sm">
                          <span className="text-indigo-300">{viralFile.name}</span>
                          <span className="block text-slate-500">
                            {(viralFile.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm text-slate-400">
                          <span className="block">{t("script.uploadHint")}</span>
                          <span className="text-xs text-slate-600">{t("script.uploadSubHint")}</span>
                        </div>
                      )}
                    </label>
                    {uploadingViralFile && (
                      <div className="flex items-center gap-2 text-xs text-indigo-300">
                        <Loader2 className="size-3 animate-spin" />
                        {t("script.viralUploadProgress")}
                      </div>
                    )}
                  </div>
                ) : (
                  <Input
                    value={viralSourceUrl}
                    onChange={(event) => setViralSourceUrl(event.target.value)}
                    placeholder={t("script.viralUrlPlaceholder")}
                  />
                )}
                <Select value={viralPlatform} onChange={(event) => {
                  const value = event.target.value as (typeof viralPlatforms)[number];
                  setViralPlatform(value);
                  if (value !== 'self_uploaded') {
                    setViralFile(null);
                  }
                }}>
                  {viralPlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </Select>
                {lastAnalysis && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    {t('script.lastAnalysis', { id: lastAnalysis.analysis_id, platform: lastAnalysis.source_platform })}
                  </div>
                )}
              </div>
            )}

            {mode === 'composed' && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">{t('script.templateOptional')}</div>
                  {templatesError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {templatesError}
                    </div>
                  )}
                  <Select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={templatesLoading || templates.length === 0}>
                    {templates.map((template) => (
                      <option key={template.template_id} value={template.template_id}>
                        {template.name} · {template.category}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">{t('script.viralVideoId')}</div>
                  <Input
                    value={lastAnalysis?.analysis_id || ''}
                    onChange={() => {}}
                    placeholder={t('script.viralIdHint')}
                    disabled
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={formAutoMatchViral}
                    onChange={(e) => setFormAutoMatchViral(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  {t('script.autoMatchViral')}
                </label>
                <Textarea
                  value={formConstraintOverrides}
                  onChange={(event) => setFormConstraintOverrides(event.target.value)}
                  placeholder={t('script.constraintOverride')}
                  className="min-h-[72px]"
                />
                <Textarea
                  value={formFactorOverrides}
                  onChange={(event) => setFormFactorOverrides(event.target.value)}
                  placeholder={t('script.factorOverridePlaceholder')}
                  className="min-h-[88px] font-mono text-xs"
                />
              </div>
            )}

            {mode === 'hybrid' && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">{t("script.templateOptional")}</div>
                  {templatesError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {templatesError}
                    </div>
                  )}
                  <Select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={templatesLoading || templates.length === 0}>
                    <option value="">{t("script.noTemplateOption")}</option>
                    {templates.map((template) => (
                      <option key={template.template_id} value={template.template_id}>
                        {template.name} · {template.category}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">{t("script.viralVideoId")}</div>
                  <Input
                    value={lastAnalysis?.analysis_id || ''}
                    onChange={() => {}}
                    placeholder={t("script.viralIdHint")}
                    disabled
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={formAutoMatchViral}
                    onChange={(e) => setFormAutoMatchViral(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  {t("script.autoMatchViral")}
                </label>
                <Textarea
                  value={formUserStrategy}
                  onChange={(event) => setFormUserStrategy(event.target.value)}
                  placeholder={t('script.strategyPlaceholder')}
                  className="min-h-[88px]"
                />
                <Textarea
                  value={formUserFactors}
                  onChange={(event) => setFormUserFactors(event.target.value)}
                  placeholder={t('script.factorPlaceholder')}
                  className="min-h-[88px] font-mono text-xs"
                />
                <Textarea
                  value={formUserConstraints}
                  onChange={(event) => setFormUserConstraints(event.target.value)}
                  placeholder={t('script.constraintUserPlaceholder')}
                  className="min-h-[72px]"
                />
              </div>
            )}

            {mode === 'batch' && (
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <Input
                  value={formStyleVibesInput}
                  onChange={(event) => setFormStyleVibesInput(event.target.value)}
                  placeholder={t("script.styleBatchPlaceholder")}
                />
                {batchResult && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    {t('script.batchResultInfo', { batchId: batchResult.batch_id, total: batchResult.total, count: batchResult.scripts.length })}
                  </div>
                )}
              </div>
            )}

            {/* Preferences Section */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">{t("script.preferences")}</label>
              {preferences.map((pref, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <select
                    value={pref.type}
                    onChange={e => updatePreference(idx, 'type', e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm shrink-0"
                  >
                    <option value="WINNER">{t("script.winnerExample")}</option>
                    <option value="LOSER">{t("script.loserExample")}</option>
                  </select>
                  <textarea
                    value={pref.text}
                    onChange={e => updatePreference(idx, 'text', e.target.value)}
                    placeholder={pref.type === 'WINNER' ? t('script.winnerPlaceholder') : t('script.loserPlaceholder')}
                    maxLength={300}
                    rows={2}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm resize-none"
                  />
                  <button onClick={() => removePreference(idx)} className="text-red-400 hover:text-red-300 shrink-0">✕</button>
                </div>
              ))}
              {preferences.length < 5 && (
                <button onClick={addPreference} className="text-sm text-blue-400 hover:text-blue-300">
                  {t("script.addPreference")}
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              <div className="text-xs text-slate-500">{t("script.productContext")}</div>
              <div className="mt-2 font-medium text-slate-100">{formTitle || (selectedProduct?.title ?? t('script.noProduct'))}</div>
              <div className="mt-2 text-xs text-slate-400">
                {formSellingPoints || selectedProduct?.selling_points.join(' · ') || t('script.noProductHint')}
              </div>
            </div>

            {generateError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{generateError}</div>}
            {generateSuccess && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{generateSuccess}</div>}

            {/* AI 合规二审开关 */}
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={formEnableAiCompliance}
                onChange={(e) => setFormEnableAiCompliance(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-cyan-500"
              />
              <div className="flex-1">
                <span className="text-sm text-slate-200">{t("script.aiComplianceCheck")}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{t("script.aiComplianceDesc")}</span>
              </div>
              <Shield className="h-4 w-4 text-slate-500" />
            </label>

            {/* 进度显示 */}
            {generateProgress && (
              <GenerationProgress
                stages={[t('script.stageAnalyzing'), t('script.stageGenerating')]}
                currentStage={generateProgress.stage === 'ANALYZING' ? 0 : 1}
                progress={generateProgress.progress}
                message={generateProgress.message}
              />
            )}

            {/* 因子重混进度 */}
            {factorRemixProgress && (
              <GenerationProgress
                stages={[t('script.factorRemixProgressLabel', '因子重混')]}
                currentStage={factorRemixProgress.stage === 'DONE' ? 1 : 0}
                progress={factorRemixProgress.progress}
                message={factorRemixProgress.message}
              />
            )}

            <Button className="w-full" onClick={() => void handleGenerate()} disabled={generateBusy || !selectedProductId}>
              {generateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generateProgress ? t('script.generating') : t('script.generateBtn')}
            </Button>

            {/* Agent 迭代日志 */}
            {agentResult && (
              <div className="space-y-2 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-cyan-200">
                  <Bot className="h-4 w-4" />
                  {t('script.agentLog')}
                  <Badge
                    variant={agentResult.status === 'PASSED' ? 'success' : agentResult.status === 'FALLBACK' ? 'warning' : 'info'}
                    className="text-[10px]"
                  >
                    {agentResult.status === 'PASSED'
                      ? t('script.reviewPassed')
                      : agentResult.status === 'ACCEPTED' || agentResult.status === 'RUNNING'
                        ? t('script.agentRunning')
                        : t('script.fallbackOutput')}
                  </Badge>
                  {agentResult.iterations > 0 && (
                    <span className="text-xs text-cyan-400 ml-auto">{agentResult.iterations} {t("script.iterationsLabel")}</span>
                  )}
                  {/* 取消按钮：仅在运行中显示 */}
                  {(agentResult.status === 'ACCEPTED' || agentResult.status === 'RUNNING') && (
                    <button
                      onClick={() => {
                        stopAgentPolling();
                        setAgentBusy(false);
                        setGenerateBusy(false);
                        setGenerateProgress(null);
                        setGenerateError(t('script.agentCancelled'));
                      }}
                      className="ml-auto text-xs text-rose-400 hover:text-rose-300 underline"
                    >
                      {t('script.cancel')}
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[320px] overflow-y-auto">
                  {agentResult.step_log.map((step, i) => (
                    <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{step.node}</span>
                        <span className="text-slate-200 font-medium">{step.action}</span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">{step.reasoning}</p>
                      {step.data && Object.keys(step.data).length > 0 && (
                        <div className="mt-1.5 rounded bg-slate-800/50 px-2 py-1 font-mono text-[10px] text-slate-500">
                          {JSON.stringify(step.data)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {agentResult.status === 'ACCEPTED' || agentResult.status === 'RUNNING' ? (
                  <div className="text-xs text-cyan-400 pt-1 border-t border-cyan-500/20 animate-pulse">
                    {t('script.agentRunning')}
                  </div>
                ) : agentResult.final_script_id ? (
                  <div className="text-xs text-emerald-300 pt-1 border-t border-cyan-500/20">
                    {t('script.scriptId')} {agentResult.final_script_id}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('script.scriptList')}</CardTitle>
              {!showTrash && (
                <Button variant="ghost" size="sm" onClick={() => handleShowTrash()}>
                  <Trash2 className="h-4 w-4" />
                  {t("script.trash")}
                </Button>
              )}
            </div>
            <CardDescription>{t('script.scriptListDesc')}</CardDescription>
            {/* 快捷键提示 */}
            <ShortcutHints className="border-t border-slate-800 pt-3 mt-3" />
          </CardHeader>
          <CardContent className="space-y-3">
            {showTrash ? (
              <>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{t("script.trashCount", { n: trashItems.length })}</span>
                  <div className="flex gap-2">
                    {isSelectMode && selectedScriptIds.size > 0 && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => void handleBatchPermanentDelete()}>
                          <X className="h-4 w-4" />
                          {t("script.batchPermanentDeleteCount", { n: selectedScriptIds.size })}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleBatchRestore()}>
                          <RotateCcw className="h-4 w-4" />
                          {t("script.batchRestoreCount", { n: selectedScriptIds.size })}
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setIsSelectMode(!isSelectMode)}>
                      {isSelectMode ? t('script.exitSelect') : t('script.select')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleHideTrash()}>
                      {t('script.backToList')}
                    </Button>
                  </div>
                </div>
                {trashLoading && <ScriptListSkeleton />}
                {!trashLoading && trashError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{trashError}</div>}
                {!trashLoading && trashItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                    {t('script.trashEmpty')}
                  </div>
                ) : (
                  trashItems.map((script) => (
                    <div
                      key={script.script_id}
                      onClick={() => {
                        if (isSelectMode) {
                          toggleScriptSelect(script.script_id);
                        }
                      }}
                      className={`rounded-3xl border p-4 text-left transition-colors cursor-pointer ${
                        selectedScriptIds.has(script.script_id)
                          ? 'border-cyan-500/40 bg-cyan-500/10'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedScriptIds.has(script.script_id)}
                            onChange={() => toggleScriptSelect(script.script_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">{script.title || script.script_id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {script.generation_mode} · {script.aspect_ratio} · {formatDuration(script.video_duration)}
                          </div>
                        </div>
                        <Badge variant="outline">{script.shots.length} shots</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                        <span>{formatDateTime(script.updated_at)}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={trashBusyIds.has(script.script_id)}
                            className="min-w-[72px]"
                            onClick={(e) => { e.stopPropagation(); void handleRestoreScript(script.script_id); }}
                          >
                            {trashBusyIds.has(script.script_id)
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <RotateCcw className="h-4 w-4" />}
                            {t("script.restore")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={trashBusyIds.has(script.script_id)}
                            className="min-w-[96px]"
                            onClick={(e) => { e.stopPropagation(); void handlePermanentDeleteScript(script.script_id); }}
                          >
                            {trashBusyIds.has(script.script_id)
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <X className="h-4 w-4" />}
                            {t("script.permanentDelete")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{t("script.scriptCount", { n: scripts.length })}</span>
                  <div className="flex gap-2">
                    {isSelectMode && selectedScriptIds.size > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => void handleBatchDelete()}>
                        <Trash2 className="h-4 w-4" />
                        {t("script.batchDeleteCount", { n: selectedScriptIds.size })}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setIsSelectMode(!isSelectMode)}>
                      {isSelectMode ? t('script.exitSelect') : t('script.select')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void refreshScripts()} disabled={scriptsLoading || !selectedProductId}>
                      {scriptsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                      {t('common.refresh')}
                    </Button>
                  </div>
                </div>
                {scriptsError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{scriptsError}</div>}
                {scripts.length === 0 && !scriptsLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                    {t('script.noScriptsYet')}
                  </div>
                ) : (
                  scripts.map((script) => (
                    <div
                      key={script.script_id}
                      onClick={() => {
                        if (!isSelectMode) {
                          setActiveScriptId(script.script_id);
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev);
                            next.set('scriptId', script.script_id);
                            return next;
                          });
                        } else {
                          toggleScriptSelect(script.script_id);
                        }
                      }}
                      className={`rounded-3xl border p-4 text-left transition-colors cursor-pointer ${
                        script.script_id === activeScriptId
                          ? 'border-cyan-500/40 bg-cyan-500/10'
                          : selectedScriptIds.has(script.script_id)
                            ? 'border-cyan-500/40 bg-cyan-500/10'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isSelectMode && (
                          <input
                            type="checkbox"
                            checked={selectedScriptIds.has(script.script_id)}
                            onChange={() => toggleScriptSelect(script.script_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium text-slate-100">{script.title || script.script_id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {script.generation_mode} · {script.aspect_ratio} · {formatDuration(script.video_duration)}
                          </div>
                        </div>
                        <Badge variant="outline">{script.shots.length} shots</Badge>
                        {!isSelectMode && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t("script.aiReview")}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/compliance?scriptId=${script.script_id}`);
                              }}
                            >
                              <Shield className="h-4 w-4 text-cyan-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteScript(script.script_id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      <div className="mt-3 text-xs text-slate-600">{formatDateTime(script.updated_at)}</div>
                    </div>
                  ))
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>{activeScript?.title || t('script.currentScript')}</CardTitle>
                <CardDescription>{t('script.editorDesc')}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeScript && <Badge variant="outline">{activeScript.generation_mode}</Badge>}
                {activeScript && <Badge variant="outline">{activeScript.aspect_ratio}</Badge>}
                <Button variant="outline" onClick={() => void handleJumpToCreate()} disabled={!activeScriptId}>
                  <Sparkles className="h-4 w-4" />
                  {t('script.goCreate')}
                </Button>
                <Button variant="outline" onClick={() => void handleSaveScript()} disabled={!activeScriptId || saveBusy}>
                  {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('script.saveScript')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeScriptLoading && <ScriptDetailSkeleton />}
            {activeScriptError && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{activeScriptError}</div>}
            {saveMessage && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {saveMessage}
              </div>
            )}

            {!activeScript && !activeScriptLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-10 text-center text-sm text-slate-500">
                {t('script.selectFromLeft')}
              </div>
            ) : activeScript ? (
              <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <ShotTimeline
                    shots={activeScript.shots}
                    selectedShotIndex={selectedShotIndex}
                    onSelectShot={setSelectedShotIndex}
                    totalDuration={activeScript.video_duration}
                    onPrevShot={() => {
                      if (selectedShotIndex !== null && selectedShotIndex > 1) {
                        setSelectedShotIndex(selectedShotIndex - 1);
                      }
                    }}
                    onNextShot={() => {
                      if (selectedShotIndex !== null && selectedShotIndex < activeScript.shots.length) {
                        setSelectedShotIndex(selectedShotIndex + 1);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {activeScript.shots.length} {t("script.shotsLabel")} · {t("script.totalDuration")} {activeScript.video_duration?.toFixed(1) ?? 0}s / 15s
                      {((activeScript.video_duration ?? 0) > 15) && (
                        <span className="ml-1 text-rose-400">({t("script.overLimit")} {(activeScript.video_duration! - 15).toFixed(1)}s)</span>
                      )}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleAddShot('before')}
                        disabled={patchBusy || selectedShotIndex === null}
                      >
                        <Plus className="h-3 w-3" />
                        {t('script.insertBefore')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleAddShot('after')}
                        disabled={patchBusy}
                      >
                        <Plus className="h-3 w-3" />
                        {t('script.insertAfter')}
                      </Button>
                    </div>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={activeScript.shots.map((shot) => shot.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {activeScript.shots.map((shot) => (
                        <SortableShotItem
                          key={shot.id}
                          shot={shot}
                          isSelected={shot.shot_index === selectedShotIndex}
                          onSelect={() => setSelectedShotIndex(shot.shot_index)}
                          onMoveUp={() => {
                            setSelectedShotIndex(shot.shot_index);
                            void handleMoveShot(shot.shot_index, -1);
                          }}
                          onMoveDown={() => {
                            setSelectedShotIndex(shot.shot_index);
                            void handleMoveShot(shot.shot_index, 1);
                          }}
                          onRemove={() => {
                            setSelectedShotIndex(shot.shot_index);
                            void handleRemoveShot(shot.shot_index);
                          }}
                          canMoveUp={!patchBusy && shot.shot_index !== 1}
                          canMoveDown={!patchBusy && shot.shot_index !== activeScript.shots.length}
                          canRemove={!patchBusy && activeScript.shots.length > 1}
                          isDragging={draggingShotId === shot.id}
                        />
                      ))}
                    </SortableContext>
                    <DragOverlay>
                      {draggingShotId ? (
                        <div className="rounded-3xl border border-cyan-500/40 bg-slate-800/90 p-4 opacity-90 shadow-lg shadow-cyan-500/20">
                          {(() => {
                            const shot = activeScript.shots.find((s) => s.id === draggingShotId);
                            if (!shot) return null;
                            return (
                              <div className="flex items-center gap-3">
                                <GripVertical className="h-4 w-4 text-slate-500" />
                                <span className="text-xs font-bold text-slate-400">{t('script.shotNumber', { n: shot.shot_index })}</span>
                                <span className="text-sm text-white truncate max-w-[200px]">
                                  {shot.visual_description || shot.scene_description_query || t('script.noDescription')}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                </div>

                <div className="space-y-4" ref={detailPanelRef}>
                  {/* 编辑/故事板 切换 */}
                  {activeShot && (
                    <Tabs value={previewMode ? 'preview' : 'edit'} onValueChange={(v) => setPreviewMode(v === 'preview')}>
                      <TabsList className="w-full">
                        <TabsTrigger value="edit" className="flex-1 text-xs">
                          <Pencil className="h-3.5 w-3.5 mr-1" />{t('common.edit')}
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="flex-1 text-xs">
                          <Eye className="h-3.5 w-3.5 mr-1" />{t('script.editBoard')}
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                  {activeShot && draftShot && !previewMode ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs text-slate-500">{t('script.shotSearchQuery')}</div>
                          <Textarea
                            value={draftShot.scene_description_query}
                            onChange={(event) => setDraftShot((current) => (current ? { ...current, scene_description_query: event.target.value } : current))}
                            className="min-h-[90px]"
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-xs text-slate-500">{t('script.visualDescription')}</div>
                          <Textarea
                            value={draftShot.visual_description}
                            onChange={(event) => setDraftShot((current) => (current ? { ...current, visual_description: event.target.value } : current))}
                            className="min-h-[90px]"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-xs text-slate-500">{t('script.voiceoverText')}</div>
                        <Textarea
                          value={draftShot.voiceover_text}
                          onChange={(event) => setDraftShot((current) => (current ? { ...current, voiceover_text: event.target.value } : current))}
                          className="min-h-[96px]"
                        />
                      </div>

                      <div>
                        <div className="mb-2 text-xs text-slate-500">{t('script.subtitleText')}</div>
                        <Textarea
                          value={draftShot.subtitle_text}
                          onChange={(event) => setDraftShot((current) => (current ? { ...current, subtitle_text: event.target.value } : current))}
                          className="min-h-[88px]"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <div className="mb-2 text-xs text-slate-500">{t('script.durationSec')}</div>
                          <Input value={draftShot.duration} onChange={(event) => setDraftShot((current) => (current ? { ...current, duration: event.target.value } : current))} />
                        </div>
                        <div>
                          <div className="mb-2 text-xs text-slate-500">{t('script.camera')}</div>
                          <Select
                            value={draftShot.camera_movement}
                            onChange={(event) =>
                              setDraftShot((current) =>
                                current ? { ...current, camera_movement: event.target.value as CameraMovement } : current,
                              )
                            }
                          >
                            {cameraMovements.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <div className="mb-2 text-xs text-slate-500">{t('script.transition')}</div>
                          <Select
                            value={draftShot.transition_type}
                            onChange={(event) =>
                              setDraftShot((current) =>
                                current ? { ...current, transition_type: event.target.value as TransitionType } : current,
                              )
                            }
                          >
                            {transitionTypes.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>

                      {/* BGM 风格 */}
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                          <Music className="h-3.5 w-3.5" />
                          {t('script.bgmSection')}
                        </div>
                        <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <div>
                            <div className="mb-1.5 text-[11px] text-slate-500">{t('script.bgmStyle')}</div>
                            <Input
                              value={draftShot.bgm_segment.style}
                              onChange={(event) =>
                                setDraftShot((current) =>
                                  current
                                    ? { ...current, bgm_segment: { ...current.bgm_segment, style: event.target.value } }
                                    : current,
                                )
                              }
                              placeholder={t('script.bgmStylePlaceholder')}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <div className="mb-1.5 text-[11px] text-slate-500">{t('script.bgmEnergy')}</div>
                            <Select
                              value={draftShot.bgm_segment.energy_level}
                              onChange={(event) =>
                                setDraftShot((current) =>
                                  current
                                    ? {
                                        ...current,
                                        bgm_segment: {
                                          ...current.bgm_segment,
                                          energy_level: event.target.value as BgmSegment['energy_level'],
                                        },
                                      }
                                    : current,
                                )
                              }
                              className="h-9 text-sm"
                            >
                              <option value="low">low</option>
                              <option value="mid">mid</option>
                              <option value="high">high</option>
                            </Select>
                          </div>
                          <div>
                            <div className="mb-1.5 text-[11px] text-slate-500">{t('script.bgmBeat')}</div>
                            <Input
                              value={draftShot.bgm_segment.beat_pattern}
                              onChange={(event) =>
                                setDraftShot((current) =>
                                  current
                                    ? {
                                        ...current,
                                        bgm_segment: { ...current.bgm_segment, beat_pattern: event.target.value },
                                      }
                                    : current,
                                )
                              }
                              placeholder={t('script.bgmBeatPlaceholder')}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-100">{t('script.timingCheck')}</div>
                          {timingLoading && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />}
                        </div>
                        {timingError && <div className="mt-3 text-sm text-rose-300">{timingError}</div>}
                        {timingValidation && (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
                              <div className="text-xs text-slate-500">{t('script.estimatedDuration')}</div>
                              <div className="mt-1 font-medium text-slate-100">{timingValidation.estimated_duration}s</div>
                            </div>
                            <div className="rounded-2xl bg-slate-900/70 p-4 text-sm text-slate-300">
                              <div className="text-xs text-slate-500">{t('script.currentShot')}</div>
                              <div className="mt-1 font-medium text-slate-100">{timingValidation.shot_duration}s</div>
                            </div>
                            <div className="sm:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                              <div className="flex items-center gap-2">
                                {timingValidation.valid ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Wand2 className="h-4 w-4 text-amber-300" />}
                                <span className="font-medium text-slate-100">{timingValidation.valid ? t('script.timingPass') : t('script.timingAdjust')}</span>
                              </div>
                              <div className="mt-2 text-slate-400">{timingValidation.suggestion}</div>
                              <div className="mt-2 text-xs text-slate-500">{t('script.wordCountExceeded', { n: timingValidation.overflow_words })}</div>
                            </div>
                          </div>
                        )}
                      </div>

                      {patchMessage && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                          {patchMessage}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => void handlePatchShot()} disabled={patchBusy}>
                          {patchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {t('script.saveCurrentShot')}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleResetDraft()}
                          disabled={patchBusy}
                        >
                          {t('script.resetDraft')}
                        </Button>
                        {activeScriptId && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setFactorRemixFactorOverrides(JSON.stringify(DEFAULT_FACTOR_REMIX_PRESET, null, 2));
                              setFactorRemixPreserveVoiceover(true);
                              setFactorRemixExtraInstruction('');
                              setFactorRemixError(null);
                              setFactorRemixSuccess(null);
                              setFactorRemixOpen(true);
                            }}
                          >
                            <Shuffle className="h-4 w-4" />{t('script.factorRemix')}</Button>
                        )}
                      </div>
                    </>
                  ) : activeShot && previewMode ? (
                    <ShotPreviewList
                      shots={activeScript!.shots}
                      selectedShotIndex={selectedShotIndex}
                      onSelectShot={setSelectedShotIndex}
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
                      {t('script.selectShotToEdit')}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Factor Remix Dialog */}
      {factorRemixOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">{t('script.factorRemix')}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFactorRemixOpen(false)}
                disabled={factorRemixBusy}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs text-slate-500">{t('script.factorOverride')}</div>
                <Textarea
                  value={factorRemixFactorOverrides}
                  onChange={(event) => setFactorRemixFactorOverrides(event.target.value)}
                  placeholder='{"bgm_style":"electronic","camera_patterns":"动态跟随"}'
                  className="min-h-[120px] font-mono text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={factorRemixPreserveVoiceover}
                  onChange={(e) => setFactorRemixPreserveVoiceover(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-800"
                />
                {t('script.keepVoiceover')}
              </label>

              <div>
                <div className="mb-2 text-xs text-slate-500">{t('script.extraInstruction')}</div>
                <Textarea
                  value={factorRemixExtraInstruction}
                  onChange={(event) => setFactorRemixExtraInstruction(event.target.value)}
                  placeholder={t('script.remixInstructionPlaceholder')}
                  className="min-h-[72px]"
                />
              </div>

              {factorRemixError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {factorRemixError}
                </div>
              )}
              {factorRemixSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {factorRemixSuccess}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setFactorRemixOpen(false)}
                  disabled={factorRemixBusy}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => void handleFactorRemix()}
                  disabled={factorRemixBusy}
                >
                  {factorRemixBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                  {t('script.executeRemix')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
