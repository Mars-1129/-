import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Constraint, ConstraintRuleType, CreateConstraintRequest, UpdateConstraintRequest, ScriptComplianceReviewResponse } from '@tikstream/shared-types';
import { Plus, Trash2, Edit3, Loader2, X, Search, Filter, AlertTriangle, Shield, CheckCircle, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import {
  listConstraints,
  createConstraint,
  updateConstraint,
  deleteConstraint,
} from '../../lib/api/constraints';
import { reviewScriptCompliance, reviewScriptComplianceStream } from '../../lib/api/scripts';
import { ApiClientError } from '../../lib/api/http';
import { formatDateTime } from '../../lib/utils/cn';

const categories = ['all', 'compliance', 'creative', 'branding', 'platform'] as const;
const ruleTypes = ['all', 'HARD', 'SOFT'] as const;

function formatRuleConfigPreview(config: Record<string, unknown> | null | undefined): string {
  if (!config) return '—';
  const keys = Object.keys(config);
  if (keys.length === 0) return '—';
  const firstKey = keys[0];
  const firstVal = config[firstKey];
  const valStr = typeof firstVal === 'string' ? firstVal : JSON.stringify(firstVal);
  const preview = valStr.length > 40 ? `${valStr.slice(0, 40)}...` : valStr;
  if (keys.length === 1) return `${firstKey}: ${preview}`;
  return `${firstKey}: ${preview} (+${keys.length - 1} more)`;
}

export function CompliancePage(): JSX.Element {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'rules' | 'ai-review'>(
    searchParams.get('scriptId') ? 'ai-review' : 'rules',
  );

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterRuleType, setFilterRuleType] = useState<string>('all');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  // 350ms debounce on keyword input to avoid excessive API calls
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilterKeyword(keywordInput), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [keywordInput]);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(null);
  const [formKey, setFormKey] = useState('');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('compliance');
  const [formRuleType, setFormRuleType] = useState<ConstraintRuleType>('SOFT');
  const [formDescription, setFormDescription] = useState('');
  const [formRuleConfig, setFormRuleConfig] = useState('{}');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Constraint | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // AI Review
  const [aiScriptId, setAiScriptId] = useState(searchParams.get('scriptId') || '');
  const [aiProductCategory, setAiProductCategory] = useState('');
  const [aiReviewing, setAiReviewing] = useState(false);
  const [aiReviewResult, setAiReviewResult] = useState<ScriptComplianceReviewResponse | null>(null);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);
  // 实时进度
  const [aiReviewProgress, setAiReviewProgress] = useState<{
    stage: string;
    message: string;
    progress: number;
    data?: Record<string, unknown>;
  } | null>(null);
  // 进度历史（记录所有步骤，用于管道展示）
  const [progressHistory, setProgressHistory] = useState<
    Array<{ stage: string; message: string; progress: number; data?: Record<string, any> }>
  >([]);

  // 审查管道阶段定义
  const reviewStages = [
    { key: 'init', label: '初始化', icon: '⚡' },
    { key: 'basic_check_start', label: '基础检查', icon: '🔍' },
    { key: 'basic_check_applying_regex', label: '正则规则', icon: '📋' },
    { key: 'basic_check_applying_nlp', label: 'NLP 分析', icon: '🧠' },
    { key: 'basic_check_applying_sensitivity', label: '敏感词扫描', icon: '🛡️' },
    { key: 'basic_check_applying_db_rules', label: '自定义规则', icon: '🗄️' },
    { key: 'basic_check_done', label: '检查完成', icon: '✅' },
    { key: 'ai_review_start', label: 'AI 审核', icon: '🤖' },
    { key: 'ai_review_building_prompt', label: '构建提示词', icon: '📝' },
    { key: 'ai_review_llm_connected', label: '连接 API', icon: '🔗' },
    { key: 'ai_review_sending', label: '发送请求', icon: '📤' },
    { key: 'ai_review_waiting_response', label: '等待响应', icon: '⏳' },
    { key: 'ai_review_received', label: '接收结果', icon: '📥' },
    { key: 'ai_review_parsing', label: '解析判定', icon: '🔬' },
    { key: 'ai_review_done', label: 'AI 审核完成', icon: '✅' },
    { key: 'synthing_verdict', label: '生成报告', icon: '📊' },
    { key: 'complete', label: '完成', icon: '🎉' },
  ];

  const fetchConstraints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listConstraints({
        category: filterCategory !== 'all' ? filterCategory : undefined,
        rule_type: filterRuleType !== 'all' ? filterRuleType : undefined,
        keyword: filterKeyword.trim() || undefined,
      });
      setConstraints(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('compliance.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterRuleType, filterKeyword]);

  useEffect(() => {
    void fetchConstraints();
  }, [fetchConstraints]);

  function openCreateModal(): void {
    setModalMode('create');
    setEditingConstraint(null);
    setFormKey('');
    setFormName('');
    setFormCategory('compliance');
    setFormRuleType('SOFT');
    setFormDescription('');
    setFormRuleConfig('{}');
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(constraint: Constraint): void {
    setModalMode('edit');
    setEditingConstraint(constraint);
    setFormKey(constraint.key);
    setFormName(constraint.name);
    setFormCategory(constraint.category);
    setFormRuleType(constraint.rule_type);
    setFormDescription(constraint.description || '');
    setFormRuleConfig(JSON.stringify(constraint.rule_config, null, 2));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal(): void {
    setModalOpen(false);
    setEditingConstraint(null);
    setFormBusy(false);
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    if (!formKey.trim() || !formName.trim()) {
      setFormError(t('compliance.keyNameRequired'));
      return;
    }
    let ruleConfig: Record<string, unknown>;
    try {
      ruleConfig = JSON.parse(formRuleConfig);
    } catch {
      setFormError(t('compliance.ruleConfigInvalid'));
      return;
    }

    setFormBusy(true);
    try {
      if (modalMode === 'create') {
        const body: CreateConstraintRequest = {
          key: formKey.trim(),
          name: formName.trim(),
          category: formCategory,
          rule_type: formRuleType,
          rule_config: ruleConfig,
          description: formDescription.trim() || undefined,
        };
        await createConstraint(body);
      } else if (editingConstraint) {
        const body: UpdateConstraintRequest = {
          name: formName.trim(),
          category: formCategory,
          rule_type: formRuleType,
          rule_config: ruleConfig,
          description: formDescription.trim() || undefined,
        };
        await updateConstraint(editingConstraint.constraint_id, body);
      }
      closeModal();
      await fetchConstraints();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : (err instanceof Error ? err.message : t('common.operationFailed'));
      setFormError(msg);
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteConstraint(deleteTarget.constraint_id);
      setDeleteTarget(null);
      await fetchConstraints();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : (err instanceof Error ? err.message : t('compliance.deleteFailed'));
      setDeleteError(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleAiReview(): Promise<void> {
    if (!aiScriptId.trim()) {
      setAiReviewError(t('compliance.scriptIdRequired'));
      return;
    }
    setAiReviewing(true);
    setAiReviewError(null);
    setAiReviewResult(null);
    setAiReviewProgress(null);
    setProgressHistory([]);

    try {
      const result = await reviewScriptComplianceStream(
        aiScriptId.trim(),
        {
          enable_ai_review: true,
          product_category: aiProductCategory.trim() || undefined,
        },
        (event) => {
          setAiReviewProgress(event);
          setProgressHistory((prev) => [...prev, event]);
        },
      );
      setAiReviewResult(result);
      setAiReviewProgress(null);
    } catch (err) {
      setAiReviewError(err instanceof Error ? err.message : t('compliance.aiReviewFailed'));
      setAiReviewProgress(null);
    } finally {
      setAiReviewing(false);
    }
  }

  const filteredConstraints = constraints;

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{t('compliance.title')}</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">
            {activeTab === 'rules' ? t('compliance.ruleConfigTitle') : t('compliance.aiReviewTitle')}
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-800/60 p-1">
          <button
            onClick={() => setActiveTab('rules')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'rules'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('compliance.ruleConfig')}
          </button>
          <button
            onClick={() => setActiveTab('ai-review')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'ai-review'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            {t('compliance.aiReview')}
          </button>
        </div>
      </div>

      {activeTab === 'ai-review' ? (
        /* ========== AI 合规审查面板 ========== */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-indigo-400" />
              {t('compliance.aiReviewSubtitle')}
            </CardTitle>
            <p className="text-xs text-slate-400">
              {t('compliance.aiReviewDesc')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('compliance.scriptId')}</label>
                <Input
                  value={aiScriptId}
                  onChange={(e) => setAiScriptId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000001"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('compliance.productCategory')}</label>
                <Input
                  value={aiProductCategory}
                  onChange={(e) => setAiProductCategory(e.target.value)}
                  placeholder={t('compliance.categoryPlaceholder')}
                />
              </div>
              <Button onClick={() => void handleAiReview()} disabled={aiReviewing}>
                {aiReviewing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t('compliance.startReview')}
              </Button>
            </div>

            {aiReviewError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {aiReviewError}
              </div>
            )}

            {/* 实时审查进度管道 */}
            {aiReviewing && aiReviewProgress && (
              <div className="space-y-3">
                {/* 当前进度条 */}
                <div className="flex items-center gap-2 text-sm text-indigo-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{aiReviewProgress.message}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${aiReviewProgress.progress}%` }}
                  />
                </div>

                {/* 步骤历史管道 */}
                {progressHistory.length > 0 && (
                  <div className="rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3">
                    <div className="mb-2 text-xs font-medium text-slate-400">审查进度详情</div>
                    <div className="space-y-1.5">
                      {progressHistory.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="mt-0.5 text-indigo-400 shrink-0">
                            {i === progressHistory.length - 1 && aiReviewing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle className="h-3 w-3 text-emerald-400" />
                            )}
                          </span>
                          <span className="text-slate-300">{h.message}</span>
                          {h.data?.candidate_count !== undefined && (
                            <span className="text-slate-500">({h.data.candidate_count} 条候选)</span>
                          )}
                          {h.data?.prompt_length !== undefined && (
                            <span className="text-slate-500">({h.data.prompt_length} 字)</span>
                          )}
                          {h.data?.llm_latency_ms !== undefined && (
                            <span className="text-amber-400">耗时 {((h.data.llm_latency_ms as number) / 1000).toFixed(1)}s</span>
                          )}
                          {h.data?.llm_response_length !== undefined && (
                            <span className="text-slate-500">响应 {h.data.llm_response_length} 字符</span>
                          )}
                          {h.data?.blocked_count !== undefined && (
                            <span className="text-red-400">拦截 {h.data.blocked_count} 警告 {h.data.warn_count as number ?? 0}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {aiReviewResult && (
              <div className="space-y-3">
                {/* Review Summary */}
                {aiReviewResult.review_summary && (
                  <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
                    <div className="flex items-start gap-2">
                      <Shield className={`h-4 w-4 mt-0.5 shrink-0 ${aiReviewResult.compliance_passed ? 'text-emerald-400' : 'text-red-400'}`} />
                      <p className="text-sm text-slate-200 leading-relaxed">{aiReviewResult.review_summary}</p>
                    </div>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="flex items-center gap-4 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Shield className={`h-4 w-4 ${aiReviewResult.compliance_passed ? 'text-emerald-400' : 'text-red-400'}`} />
                    <span className="text-sm font-medium text-white">
                      {aiReviewResult.compliance_passed ? t('compliance.verdict_pass') : t('compliance.verdict_violation')}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">|
                    <span className="text-red-400 ml-1">{t('compliance.verdict_block')} {aiReviewResult.blocked_count}</span>
                    <span className="text-slate-500 mx-1">·</span>
                    <span className="text-amber-400">{t('compliance.verdict_warn')} {aiReviewResult.warn_count}</span>
                    <span className="text-slate-500 mx-1">·</span>
                    <span className="text-emerald-400">{t('compliance.verdict_falsePositive')} {aiReviewResult.false_positive_count}</span>
                  </span>
                  {/* Call details extracted from progress history */}
                  {progressHistory.length > 0 && progressHistory.some(h => h.data?.llm_latency_ms) && (
                    <span className="text-xs text-slate-500">
                      总审查耗时 {((aiReviewResult as any)._latency || progressHistory.find(h => h.data?.llm_latency_ms)?.data?.llm_latency_ms as number / 1000)?.toFixed(1)}s
                    </span>
                  )}
                </div>

                {/* Results Table */}
                {aiReviewResult.review_results.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60">
                          <th className="px-3 py-2 text-left font-medium text-slate-400">{t('compliance.column_shot')}</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">审查维度</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">{t('compliance.column_keyword')}</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">{t('compliance.column_pattern')}</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">{t('compliance.column_aiResult')}</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">严重度</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">{t('compliance.column_aiReason')}</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-400">{t('compliance.column_suggestion')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiReviewResult.review_results.map((r, i) => (
                          <tr key={i} className={`border-b border-slate-800/60 hover:bg-slate-800/30 ${r.ai_verdict === 'BLOCK' ? 'bg-red-500/5' : r.ai_verdict === 'WARN' ? 'bg-amber-500/5' : ''}`}>
                            <td className="px-3 py-2 text-slate-300">{r.shot_index}</td>
                            <td className="px-3 py-2">
                              <span className="text-slate-500 text-[10px]">
                                {r.original_reason?.includes('促销') ? '促销合规' :
                                 r.original_reason?.includes('风险') ? '语境风险' :
                                 r.original_reason?.startsWith('[') ? '敏感词' :
                                 r.original_reason?.includes('虚假') || r.original_reason?.includes('宣传') ? '虚假宣传' :
                                 r.original_reason?.includes('操控') ? '情感操控' :
                                 '广告法'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-medium text-white">{r.violated_word || t('compliance.empty')}</td>
                            <td className="px-3 py-2 text-slate-400 max-w-[180px] truncate">{r.original_reason}</td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={r.ai_verdict === 'BLOCK' ? 'destructive' : r.ai_verdict === 'WARN' ? 'warning' : 'default'}
                                className={`text-[10px] ${r.ai_verdict === 'FALSE_POSITIVE' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : ''}`}
                              >
                                {r.ai_verdict === 'BLOCK' ? t('compliance.verdict_block') :
                                 r.ai_verdict === 'WARN' ? t('compliance.verdict_warn') :
                                 r.ai_verdict === 'FALSE_POSITIVE' ? t('compliance.verdict_falsePositive') :
                                 '未判定'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {r.severity !== undefined && (
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-8 h-1.5 rounded-full ${
                                    r.severity >= 7 ? 'bg-red-500' : r.severity >= 4 ? 'bg-amber-500' : 'bg-slate-600'
                                  }`}>
                                    <div className="h-full rounded-full bg-current" style={{ width: `${(r.severity / 10) * 100}%` }} />
                                  </div>
                                  <span className={`text-[10px] font-mono ${
                                    r.severity >= 7 ? 'text-red-400' : r.severity >= 4 ? 'text-amber-400' : 'text-slate-400'
                                  }`}>{r.severity}/10</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate">{r.ai_reason}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate">{r.suggestion || t('compliance.empty')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>

      {/* Filter Bar */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? t('compliance.filter_allCategory') : `${cat} · ${t(`compliance.category_${cat}`)}`}
                  </option>
                ))}
              </Select>
            </div>
            <Select value={filterRuleType} onChange={(e) => setFilterRuleType(e.target.value)}>
              {ruleTypes.map((rt) => (
                <option key={rt} value={rt}>
                  {rt === 'all' ? t('compliance.filter_allRuleType') : rt}
                </option>
              ))}
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder={t('compliance.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              {t('compliance.newRule')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          <span className="text-sm text-slate-400">{t('compliance.loading')}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredConstraints.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-12 text-center">
          <Shield className="mx-auto h-10 w-10 text-slate-600" />
          <p className="mt-4 text-sm text-slate-400">{t('compliance.noData')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('compliance.noDataHint')}</p>
          <Button className="mt-4" onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            {t('compliance.newRule')}
          </Button>
        </div>
      )}

      {/* Constraint List */}
      {!loading && !error && filteredConstraints.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500">{t('compliance.count', { n: filteredConstraints.length })}</div>
          {filteredConstraints.map((constraint) => (
            <div
              key={constraint.constraint_id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition-colors hover:border-slate-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-slate-100 truncate">{constraint.name}</h3>
                    {constraint.is_builtin && (
                      <Badge variant="outline" className="text-[10px]">{t('compliance.badge_builtin')}</Badge>
                    )}
                    <Badge
                      variant={constraint.rule_type === 'HARD' ? 'destructive' : 'warning'}
                      className="text-[10px]"
                    >
                      {constraint.rule_type === 'HARD' ? t('compliance.badge_hard') : t('compliance.badge_soft')}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {constraint.category}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 font-mono">{constraint.key}</div>
                  {constraint.description && (
                    <div className="mt-2 text-xs text-slate-400 line-clamp-2">{constraint.description}</div>
                  )}
                  <div className="mt-2 text-xs text-slate-500 font-mono">
                    {formatRuleConfigPreview(constraint.rule_config)}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{formatDateTime(constraint.updated_at)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(constraint)}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleteTarget(constraint);
                      setDeleteError(null);
                    }}
                    disabled={constraint.is_builtin}
                    title={constraint.is_builtin ? t('common.builtinCannotDelete') : t('common.delete')}
                  >
                    <Trash2 className={`h-4 w-4 ${constraint.is_builtin ? 'text-slate-600' : 'text-rose-400'}`} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">
                {modalMode === 'create' ? t('compliance.newRule') : t('compliance.editRule')}
              </h3>
              <Button variant="ghost" size="sm" onClick={closeModal} disabled={formBusy}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t('compliance.keyLabel')}</div>
                <Input
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder={t('compliance.keyPlaceholder')}
                  disabled={modalMode === 'edit' || formBusy}
                />
              </div>

              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t('compliance.nameLabel')}</div>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('compliance.namePlaceholder')}
                  disabled={formBusy}
                />
              </div>

              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t('compliance.categoryLabel')}</div>
                <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} disabled={formBusy}>
                  {categories.filter(c => c !== 'all').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} · {t(`compliance.category_${cat}`)}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t('compliance.ruleTypeLabel')}</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormRuleType('HARD')}
                    disabled={formBusy}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      formRuleType === 'HARD'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    HARD
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormRuleType('SOFT')}
                    disabled={formBusy}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      formRuleType === 'SOFT'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <CheckCircle className="h-4 w-4" />
                    SOFT
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t('compliance.descriptionLabel')}</div>
                <Textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t('compliance.descriptionPlaceholder')}
                  className="min-h-[72px]"
                  disabled={formBusy}
                />
              </div>

              <div>
                <div className="mb-1.5 text-xs text-slate-500">{t('compliance.ruleConfigLabel')}</div>
                <Textarea
                  value={formRuleConfig}
                  onChange={(e) => setFormRuleConfig(e.target.value)}
                  placeholder={t('compliance.ruleConfigPlaceholder')}
                  className="min-h-[120px] font-mono text-xs"
                  disabled={formBusy}
                />
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={closeModal} disabled={formBusy}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void handleSubmit()} disabled={formBusy}>
                  {formBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {modalMode === 'create' ? t('compliance.createRule') : t('compliance.saveRule')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100">{t('compliance.deleteTitle')}</h3>
            <p className="mt-2 text-sm text-slate-400">
              {t('compliance.deleteDesc', { name: deleteTarget.name })}
            </p>
            {deleteTarget.is_builtin && (
              <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {t('compliance.builtinCannotDelete')}
              </div>
            )}
            {deleteError && (
              <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {deleteError}
              </div>
            )}
            <div className="mt-4 flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={deleteBusy || deleteTarget.is_builtin}
              >
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
      </>
    )}
    </div>
  );
}
