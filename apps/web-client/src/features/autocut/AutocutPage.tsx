import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scissors, Play, Pause, Check, X, Loader2, AlertCircle, Video, Eye, Download } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Select } from '../../components/ui/select';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { listMaterials } from '../../lib/api/materials';
import { autocutApi, AutocutJob, TranscriptSegment } from '../../lib/api/autocut';
import { cn } from '../../lib/utils/cn';

type PageState = 'select' | 'transcribing' | 'editing' | 'cutting' | 'done';

export function AutocutPage(): JSX.Element {
  const { t } = useTranslation();
  const products = useWorkspaceStore((s) => s.products);
  const selectedProductId = useWorkspaceStore((s) => s.selectedProductId);

  const [materials, setMaterials] = useState<Array<{ id: string; fileName: string; durationSeconds?: number }>>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [loadingMaterials, setLoadingMaterials] = useState(false);

  const [state, setState] = useState<PageState>('select');
  const [jobId, setJobId] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [srtContent, setSrtContent] = useState('');
  const [language, setLanguage] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAll, setSelectedAll] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载产品下的素材列表
  useEffect(() => {
    if (!selectedProductId) return;
    setLoadingMaterials(true);
    listMaterials({ product_id: selectedProductId, type: 'VIDEO', limit: 100 })
      .then((res: any) => {
        const list = res?.materials || res?.data?.materials || [];
        setMaterials((list as any[]).map((m: any) => ({
          id: m.id,
          fileName: m.file_name || m.fileName,
          durationSeconds: m.duration_seconds ?? m.durationSeconds,
        })));
      })
      .catch(() => setMaterials([]))
      .finally(() => setLoadingMaterials(false));
  }, [selectedProductId]);

  // 轮询状态
  const startPoll = useCallback((id: string, targetStatus: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await autocutApi.getStatus(id);
        setProgress(res.progress ?? 0);
        if (res.status === targetStatus) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (targetStatus === 'READY_FOR_EDIT') {
            await loadTranscript(id);
          } else if (targetStatus === 'COMPLETED') {
            setOutputUrl(res.outputUrl ?? null);
            setState('done');
          }
        } else if (res.status === 'FAILED') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setError(res.error || 'Processing failed');
          setState('select');
        }
      } catch { /* retry */ }
    }, 2000);
  }, []);

  // 加载转录结果
  const loadTranscript = async (id: string) => {
    try {
      const res = await autocutApi.getTranscript(id);
      setSegments(res.segments || []);
      setSrtContent(res.srt_content || '');
      setLanguage(res.language || '');
      setVideoDuration(res.video_duration || 0);
      setSelectedAll((res.segments || []).every((s) => s.selected));
      setState('editing');
    } catch {
      setError('Failed to load transcript');
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // 提交转录
  const handleSubmit = async () => {
    if (!selectedMaterialId) return;
    setError(null);
    setState('transcribing');
    setProgress(0);
    try {
      const res = await autocutApi.submit(selectedMaterialId);
      setJobId(res.job_id);
      startPoll(res.job_id, 'READY_FOR_EDIT');
    } catch (e: any) {
      setError(e.message);
      setState('select');
    }
  };

  // 切换段选中
  const toggleSegment = async (index: number) => {
    const seg = segments.find((s) => s.index === index);
    if (!seg || !jobId) return;
    const newSelected = !seg.selected;
    // 乐观更新
    const updated = segments.map((s) => s.index === index ? { ...s, selected: newSelected } : s);
    setSegments(updated);
    setSelectedAll(updated.every((s) => s.selected));
    try {
      await autocutApi.updateSegments(jobId, [{ index, selected: newSelected }]);
    } catch {
      // 回滚
      setSegments(segments);
    }
  };

  // 全选/取消全选
  const toggleAll = async () => {
    if (!jobId) return;
    const newVal = !selectedAll;
    const updates = segments.map((s) => ({ index: s.index, selected: newVal }));
    setSegments(segments.map((s) => ({ ...s, selected: newVal })));
    setSelectedAll(newVal);
    try {
      await autocutApi.updateSegments(jobId, updates);
    } catch { /* ignore */ }
  };

  // 执行剪切
  const handleCut = async () => {
    if (!jobId) return;
    setState('cutting');
    setError(null);
    setProgress(0);
    try {
      const res = await autocutApi.executeCut(jobId);
      startPoll(jobId, 'COMPLETED');
    } catch (e: any) {
      setError(e.message);
      setState('editing');
    }
  };

  // 格式化时间
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const selectedCount = segments.filter((s) => s.selected).length;
  const totalDuration = segments.filter((s) => s.selected).reduce((a, s) => a + (s.end_sec - s.start_sec), 0);

  const statusBadge = (status: string) => {
    const map: Record<string, { color: string; label: string }> = {
      TRANSCRIBING: { color: 'bg-yellow-500/10 text-yellow-400', label: 'Transcribing' },
      READY_FOR_EDIT: { color: 'bg-green-500/10 text-green-400', label: 'Ready' },
      CUTTING: { color: 'bg-yellow-500/10 text-yellow-400', label: 'Cutting' },
      COMPLETED: { color: 'bg-green-500/10 text-green-400', label: 'Done' },
      FAILED: { color: 'bg-red-500/10 text-red-400', label: 'Failed' },
    };
    const info = map[status] || { color: 'bg-slate-500/10', label: status };
    return <Badge className={info.color}>{info.label}</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-bold">{t('autocut.title')}</h1>
        <p className="text-slate-400 mt-1">{t('autocut.subtitle')}</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Step 1: 选择视频 */}
      {state === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Video className="h-5 w-5" />{t('autocut.selectVideo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingMaterials ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-sm text-slate-400 mb-1 block">{t('autocut.selectVideoLabel')}</label>
                  <select
                    className="w-full h-10 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                  >
                    <option value="">{t('autocut.selectVideoPlaceholder')}</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fileName} {m.durationSeconds ? `(${fmt(m.durationSeconds)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={handleSubmit} disabled={!selectedMaterialId} className="shrink-0">
                  <Play className="h-4 w-4 mr-2" />{t('autocut.startTranscribe')}
                </Button>
              </div>
            )}
            {materials.length === 0 && !loadingMaterials && (
              <p className="text-sm text-slate-500">{t('autocut.noVideoMaterials')}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: 转写中 */}
      {state === 'transcribing' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />{t('autocut.transcribing')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-400">{t('autocut.transcribingDesc')}</p>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.max(progress, 5)}%` }} />
            </div>
            <p className="text-xs text-slate-500 text-right">{progress}%</p>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 编辑字幕 */}
      {state === 'editing' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Scissors className="h-5 w-5" />{t('autocut.editSegments')}</CardTitle>
              <p className="text-sm text-slate-400 mt-1">{t('autocut.editSegmentsDesc')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll}>
              {selectedAll ? t('autocut.deselectAll') : t('autocut.selectAll')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {segments.map((seg) => (
              <div
                key={seg.index}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                  seg.selected ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-slate-700/50 bg-slate-800/50 opacity-60',
                )}
                onClick={() => toggleSegment(seg.index)}
              >
                <div className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
                  seg.selected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-500',
                )}>
                  {seg.selected && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-indigo-400 font-mono">
                      {fmt(seg.start_sec)} – {fmt(seg.end_sec)}
                    </span>
                    <span className="text-xs text-slate-500">({(seg.end_sec - seg.start_sec).toFixed(1)}s)</span>
                  </div>
                  <p className="text-sm text-slate-200">{seg.text}</p>
                </div>
              </div>
            ))}

            {segments.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">未检测到语音内容</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 底部操作栏 */}
      {state === 'editing' && (
        <div className="sticky bottom-0 rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            已选 <span className="text-white font-semibold">{selectedCount}</span> / {segments.length} 段 ·
            总时长 <span className="text-white font-semibold">{fmt(totalDuration)}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setState('select'); setSegments([]); }}>
              返回
            </Button>
            <Button onClick={handleCut} disabled={selectedCount === 0}>
              <Scissors className="h-4 w-4 mr-2" />{t('autocut.exportCut')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: 剪切中 */}
      {state === 'cutting' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />{t('autocut.cutting')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-400">{t('autocut.cuttingDesc')}</p>
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.max(progress, 5)}%` }} />
            </div>
            <p className="text-xs text-slate-500 text-right">{progress}%</p>
          </CardContent>
        </Card>
      )}

      {/* Step 5: 完成 */}
      {state === 'done' && outputUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-400"><Check className="h-5 w-5" />剪辑完成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-700 overflow-hidden bg-black">
              <video src={outputUrl} controls className="w-full max-h-96" poster="" />
            </div>
            <div className="flex gap-3">
              <a href={outputUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button className="w-full" variant="outline">
                  <Download className="h-4 w-4 mr-2" />{t('autocut.downloadVideo')}
                </Button>
              </a>
              <Button onClick={() => { setState('select'); setOutputUrl(null); setSegments([]); setJobId(null); }}>
                {t('autocut.recut')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
