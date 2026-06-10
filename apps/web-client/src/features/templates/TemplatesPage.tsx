import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, Check, Compass, Edit, Filter, Globe, Hash, Loader2, Plus, Search, Sparkles, Tag,
  Trash2, X, Clock, Camera, Music, Target, Type, MousePointer2, TrendingUp,
} from 'lucide-react';
import type { Template, TemplateDetail, TemplateFactorAssignment } from '@tikstream/shared-types';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { useWorkspaceStore } from '../../app/store/workspace-store';
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from '../../lib/api/templates';
import { TemplatesSkeleton } from '../../components/ui/content-skeleton';

// =============================================================================
// Constants
// =============================================================================

const ALLOWED_CATEGORIES = ['promo', 'unboxing', 'tutorial', 'review', 'story', 'comparison', 'custom'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  promo: 'templates.category_promo', unboxing: 'templates.category_unboxing', tutorial: 'templates.category_tutorial', review: 'templates.category_review', story: 'templates.category_story', comparison: 'templates.category_comparison', custom: 'templates.category_custom',
};

const CATEGORY_BADGE: Record<string, string> = {
  promo: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  unboxing: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  tutorial: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  review: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
  story: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  comparison: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
  custom: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

const CATEGORY_ACCENT_BG: Record<string, string> = {
  promo: 'bg-rose-400', unboxing: 'bg-amber-400', tutorial: 'bg-blue-400',
  review: 'bg-purple-400', story: 'bg-emerald-400', comparison: 'bg-cyan-400',
  custom: 'bg-slate-400',
};

const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', ID: '🇮🇩', TH: '🇹🇭', VN: '🇻🇳', PH: '🇵🇭', MY: '🇲🇾',
  BR: '🇧🇷', MX: '🇲🇽', JP: '🇯🇵', KR: '🇰🇷', UK: '🇬🇧', SG: '🇸🇬', GLOBAL: '🌍',
};

const COUNTRY_NAMES: Record<string, string> = {
  US: 'templates.country_us', ID: 'templates.country_id', TH: 'templates.country_th', VN: 'templates.country_vn', PH: 'templates.country_ph', MY: 'templates.country_my',
  BR: 'templates.country_br', MX: 'templates.country_mx', JP: 'templates.country_jp', KR: 'templates.country_kr', UK: 'templates.country_uk', SG: 'templates.country_sg', GLOBAL: 'templates.country_global',
};

const ALL_COUNTRIES = ['US', 'ID', 'TH', 'VN', 'PH', 'MY', 'BR', 'MX', 'JP', 'KR', 'UK', 'SG', 'GLOBAL'] as const;

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  beauty: 'templates.product_beauty', electronics: 'templates.product_digital', fashion: 'templates.product_fashion', home: 'templates.product_home',
  food: 'templates.product_food', fitness: 'templates.product_sports', pet: 'templates.product_pet', baby_kids: 'templates.product_baby', general: 'templates.product_general',
};

const FACTOR_LABELS: Record<string, string> = {
  optimal_shot_count: 'templates.factor_shotCount', optimal_total_duration: 'templates.factor_duration', camera_patterns: 'templates.factor_camera',
  transition_preference: 'templates.factor_transition', bgm_style: 'templates.factor_bgm', cta_placement: 'templates.factor_cta',
  hook_style: 'templates.factor_hook', narrative_tone: 'templates.factor_narrative', caption_density: 'templates.factor_subtitleDensity',
};

const FACTOR_ICONS: Record<string, JSX.Element> = {
  optimal_shot_count: <Hash className="h-3 w-3" />,
  optimal_total_duration: <Clock className="h-3 w-3" />,
  camera_patterns: <Camera className="h-3 w-3" />,
  transition_preference: <TrendingUp className="h-3 w-3" />,
  bgm_style: <Music className="h-3 w-3" />,
  cta_placement: <MousePointer2 className="h-3 w-3" />,
  hook_style: <Target className="h-3 w-3" />,
  narrative_tone: <Type className="h-3 w-3" />,
  caption_density: <Type className="h-3 w-3" />,
};

function getStatusVariant(status: string): 'success' | 'warning' | 'destructive' | 'default' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'warning';
  if (status === 'ARCHIVED') return 'destructive';
  return 'default';
}

function getStatusLabel(status: string, t: (key: string) => string): string {
  if (status === 'ACTIVE') return t('templates.status_enabled');
  if (status === 'INACTIVE') return t('templates.status_disabled');
  if (status === 'ARCHIVED') return t('templates.status_archived');
  return status;
}

function parseTemplateMeta(name: string): { country: string; productType: string } {
  try {
    const countryMatch = name.match(/^(US|ID|TH|VN|PH|MY|BR|MX|JP|KR|UK|SG|GLOBAL)\b/);
    const country = countryMatch ? countryMatch[1] : 'GLOBAL';

    const rest = name.replace(/^[A-Z]+\s+/, '');
    const ptMatch = rest.match(/\b(Beauty|Skincare|Makeup|Tech|Fashion|Home|Food|Fitness|Pets?|Kids?)\b/i);
    let productType = 'general';
    if (ptMatch) {
      const pt = ptMatch[1].toLowerCase();
      if (['beauty', 'skincare', 'makeup'].includes(pt)) productType = 'beauty';
      else if (['tech'].includes(pt)) productType = 'electronics';
      else if (['fashion'].includes(pt)) productType = 'fashion';
      else if (['home'].includes(pt)) productType = 'home';
      else if (['food'].includes(pt)) productType = 'food';
      else if (['fitness'].includes(pt)) productType = 'fitness';
      else if (['pet', 'pets'].includes(pt)) productType = 'pet';
      else if (['kid', 'kids'].includes(pt)) productType = 'baby_kids';
    }
    return { country, productType };
  } catch {
    return { country: 'GLOBAL', productType: 'general' };
  }
}

function formatFactorValue(key: string, value: unknown, t?: (k: string) => string): string {
  if (Array.isArray(value)) return value.join('、');
  if (typeof value === 'number') {
    if (key === 'optimal_total_duration') return `${value}s`;
    if (key === 'optimal_shot_count') return `${value}${t ? t('template.shotUnit') : '镜'}`;
  }
  return String(value ?? '—');
}

// =============================================================================
// Component
// =============================================================================

export function TemplatesPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const products = useWorkspaceStore((state) => state.products);
  const selectedProductId = useWorkspaceStore((state) => state.selectedProductId);
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  // --- i18n helpers ---
  const categoryLabel = useCallback((cat: string) => t(`template.category_${cat}` as any), [t]);
  const countryLabel = useCallback((code: string) => t(`templates.country_${code.toLowerCase()}` as any), [t]);

  const productTypeI18nKey: Record<string, string> = {
    beauty: 'template.product_beauty',
    electronics: 'template.product_digital',
    fashion: 'template.product_fashion',
    home: 'template.product_home',
    food: 'template.product_food',
    fitness: 'template.product_sports',
    pet: 'template.product_pet',
    baby_kids: 'template.product_baby',
    general: 'template.product_general',
  };
  const productTypeLabel = useCallback((pt: string) => t(productTypeI18nKey[pt] as any || pt), [t]);

  const statusLabel = useCallback((status: string) => {
    if (status === 'ACTIVE') return t('template.status_enabled');
    if (status === 'INACTIVE') return t('template.status_disabled');
    if (status === 'ARCHIVED') return t('template.status_archived');
    return status;
  }, [t]);

  // --- List State ---
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  // --- Filters ---
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [countryFilter, setCountryFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // --- Detail ---
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // --- CRUD ---
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('promo');
  const [formStrategy, setFormStrategy] = useState('');
  const [formFactorJson, setFormFactorJson] = useState('{\n  \n}');
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // =========================================================================
  // Template List Fetching
  // =========================================================================
  // Bug 16: useCallback 包装，避免每次渲染重建并作为 useEffect 依赖时触发多余请求

  const fetchTemplates = useCallback(async (pageNum: number, append: boolean): Promise<void> => {
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const response = await listTemplates({
        page: pageNum,
        page_size: 30,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        keyword: keyword || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (append) {
        setTemplates((prev) => [...prev, ...response.items]);
      } else {
        setTemplates(response.items);
      }
      setTotalCount(response.total);
      setHasMore(response.has_more);

      if (!append) {
        setSelectedTemplateId((current) => {
          if (current && response.items.some((item) => item.template_id === current)) return current;
          return response.items[0]?.template_id ?? null;
        });
      }
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : t('template.listLoadFailed'));
    } finally {
      setTemplatesLoading(false);
    }
  }, [categoryFilter, statusFilter, keyword, sortBy, sortOrder]);

  // Debounced keyword search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setKeyword(searchInput);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  // Hold latest fetchTemplates in ref to avoid stale closure issues
  const fetchTemplatesRef = useRef(fetchTemplates);
  fetchTemplatesRef.current = fetchTemplates;

  // Fetch on filter change
  useEffect(() => {
    setPage(1);
    void fetchTemplatesRef.current(1, false);
  }, [categoryFilter, statusFilter, keyword, sortBy, sortOrder]);

  // =========================================================================
  // Template Detail
  // =========================================================================

  useEffect(() => {
    const templateId = selectedTemplateId;
    if (!templateId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    const resolvedId = templateId;
    let cancelled = false;
    async function run(): Promise<void> {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const response = await getTemplate(resolvedId);
        if (!cancelled) setDetail(response);
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(error instanceof Error ? error.message : t('template.detailLoadFailed'));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    void run();
    return () => { cancelled = true; };
  }, [selectedTemplateId]);

  // =========================================================================
  // Client-side country & product type filters
  // =========================================================================

  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (countryFilter) {
      result = result.filter((t) => parseTemplateMeta(t.name).country === countryFilter);
    }
    if (productFilter) {
      result = result.filter((t) => parseTemplateMeta(t.name).productType === productFilter);
    }
    return result;
  }, [templates, countryFilter, productFilter]);

  // Derived filter options from ALL templates (not just current page)
  const availableCountries = useMemo(() => {
    const countries = new Set<string>();
    templates.forEach((t) => countries.add(parseTemplateMeta(t.name).country));
    return ALL_COUNTRIES.filter((c) => countries.has(c));
  }, [templates]);

  const availableProductTypes = useMemo(() => {
    const types = new Set<string>();
    templates.forEach((t) => types.add(parseTemplateMeta(t.name).productType));
    return Object.keys(PRODUCT_TYPE_LABELS).filter((k) => types.has(k));
  }, [templates]);

  // =========================================================================
  // Actions
  // =========================================================================

  async function loadMore(): Promise<void> {
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchTemplates(nextPage, true);
  }

  const refreshTemplates = useCallback(async (): Promise<void> => {
    setPage(1);
    await fetchTemplates(1, false);
  }, [categoryFilter, statusFilter, keyword, sortBy, sortOrder]);

  /**
   * 跳转到剧本模块，套用当前选中的模板生成剧本。
   * 参照 DNA 模块的设计：仅通过 URL 参数传递模板 ID，
   * 实际的剧本生成由 ScriptsPage 完成。
   */
  function handleApplyTemplate(): void {
    if (!selectedTemplateId) {
      console.warn('[TemplatesPage] handleApplyTemplate: no template selected');
      return;
    }
    navigate(`/scripts?mode=template&templateId=${encodeURIComponent(selectedTemplateId)}`);
  }

  async function handleCreateTemplate(): Promise<void> {
    setFormBusy(true);
    setFormError(null);
    try {
      let factorJson: Record<string, unknown>;
      try {
        factorJson = JSON.parse(formFactorJson);
      } catch {
        setFormError(t('template.factorJsonInvalid'));
        setFormBusy(false);
        return;
      }
      await createTemplate({
        name: formName.trim(),
        category: formCategory,
        strategy_summary: formStrategy.trim(),
        factor_json: factorJson,
        status: 'ACTIVE',
      });
      resetForm();
      await refreshTemplates();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('template.createFailed'));
    } finally {
      setFormBusy(false);
    }
  }

  function openEditForm(template: TemplateDetail): void {
    setEditingTemplateId(template.template_id);
    setShowCreateForm(true);
    setFormName(template.name);
    setFormCategory(template.category);
    setFormStrategy(template.strategy_summary);
    setFormFactorJson('{}');
  }

  async function handleUpdateTemplate(): Promise<void> {
    if (!editingTemplateId) return;
    setFormBusy(true);
    setFormError(null);
    try {
      let factorJson: Record<string, unknown> | undefined;
      try {
        factorJson = JSON.parse(formFactorJson);
      } catch {
        setFormError(t('template.factorJsonInvalid'));
        setFormBusy(false);
        return;
      }
      await updateTemplate(editingTemplateId, {
        name: formName.trim() || undefined,
        category: formCategory || undefined,
        strategy_summary: formStrategy.trim() || undefined,
        factor_json: factorJson,
      });
      resetForm();
      await refreshTemplates();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('template.updateFailed'));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDeleteTemplate(): Promise<void> {
    if (!deletingTemplateId) return;
    setDeleteBusy(true);
    try {
      await deleteTemplate(deletingTemplateId);
      setDeletingTemplateId(null);
      setSelectedTemplateId((current) => current === deletingTemplateId ? null : current);
      await refreshTemplates();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('template.deleteFailed'));
      setDeletingTemplateId(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function resetForm(): void {
    setShowCreateForm(false);
    setEditingTemplateId(null);
    setFormName('');
    setFormCategory('promo');
    setFormStrategy('');
    setFormFactorJson('{\n  \n}');
    setFormError(null);
    setFormBusy(false);
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* ===== Page Header ===== */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('template.market')}</h1>
          <p className="mt-1 text-sm text-slate-400">
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-center sm:block">
            <div className="text-lg font-bold text-slate-100">{totalCount}</div>
            <div className="text-[10px] text-slate-500">{t('template.totalCount')}</div>
          </div>
          <div className="hidden rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-center sm:block">
            <div className="text-lg font-bold text-emerald-300">{filteredTemplates.length}</div>
            <div className="text-[10px] text-slate-500">{t('template.currentMatch')}</div>
          </div>
          <Button
            onClick={() => { resetForm(); setShowCreateForm(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> {t('template.newTemplate')}
          </Button>
        </div>
      </div>

      {/* ===== Filter Bar ===== */}
      <div className="sticky top-0 z-30 -mx-1 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('template.searchPlaceholder')}
              className="h-9 pl-9 text-sm"
            />
            {searchInput && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
                onClick={() => setSearchInput('')}
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                !categoryFilter ? 'border-slate-400 bg-slate-400/20 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {t('template.filter_allCategory')}
            </button>
            {ALLOWED_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? `border-slate-400 bg-slate-400/20 text-slate-100`
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }`}
              >
                {categoryLabel(cat) || cat}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Country */}
          <Select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} className="h-9 w-auto min-w-[110px] text-xs">
            <option value="">🌍 {t('template.filter_allCountry')}</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>{COUNTRY_FLAGS[c]} {countryLabel(c)}</option>
            ))}
          </Select>

          {/* Product Type */}
          <Select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} className="h-9 w-auto min-w-[110px] text-xs">
            <option value="">📦 {t('template.filter_allProductType')}</option>
            {availableProductTypes.map((pt) => (
              <option key={pt} value={pt}>{productTypeLabel(pt)}</option>
            ))}
          </Select>

          {/* Status */}
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 w-auto min-w-[90px] text-xs">
            <option value="ACTIVE">✅ {t('template.status_enabled')}</option>
            <option value="INACTIVE">⏸️ {t('template.status_disabled')}</option>
            <option value="ARCHIVED">📁 {t('template.status_archived')}</option>
          </Select>

          {/* Sort */}
          <Select value={`${sortBy}-${sortOrder}`} onChange={(event) => {
            const [by, order] = event.target.value.split('-');
            setSortBy(by);
            setSortOrder(order);
          }} className="h-9 w-auto min-w-[130px] text-xs">
            <option value="createdAt-desc">🕐 {t('template.sort_newest')}</option>
            <option value="createdAt-asc">🕐 {t('template.sort_oldest')}</option>
            <option value="name-asc">🔤 {t('template.sort_nameAsc')}</option>
            <option value="name-desc">🔤 {t('template.sort_nameDesc')}</option>
            <option value="updatedAt-desc">📝 {t('template.sort_recentUpdate')}</option>
          </Select>
        </div>
      </div>

      {/* ===== Error Banner ===== */}
      {templatesError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {templatesError}
          <button className="ml-3 underline" onClick={() => void refreshTemplates()} type="button">{t('common.retry')}</button>
        </div>
      )}

      {/* ===== Main Content: Grid + Detail Sidebar ===== */}
      <div className="flex gap-5">
        {/* --- Template Grid --- */}
        <div className="min-w-0 flex-1">
          {templatesLoading && templates.length === 0 ? (
            <TemplatesSkeleton />
          ) : filteredTemplates.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 py-20 text-center">
              <Compass className="mx-auto h-10 w-10 text-slate-600" />
              <p className="mt-3 text-sm text-slate-500">
                {keyword || categoryFilter || countryFilter || productFilter ? t('template.noMatch') : t('template.noData')}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredTemplates.map((template) => {
                  const meta = parseTemplateMeta(template.name);
                  const isSelected = template.template_id === selectedTemplateId;
                  return (
                    <div
                      key={template.template_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTemplateId(template.template_id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTemplateId(template.template_id); } }}
                      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/50 ${
                        isSelected
                          ? 'border-slate-500 bg-slate-900/80 shadow-md'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      {/* Category accent top bar */}
                      <div className={`absolute inset-x-0 top-0 h-1 ${CATEGORY_ACCENT_BG[template.category] || 'bg-emerald-400'}`} />

                      {/* Badges row: category, product type, country */}
                      <div className="mb-3 flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${CATEGORY_BADGE[template.category] || ''}`}>
                          {categoryLabel(template.category) || template.category}
                        </Badge>
                        <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400">
                          {productTypeLabel(meta.productType) || meta.productType}
                        </span>
                        <span className="ml-auto rounded-full border border-slate-700 px-1.5 py-0.5 text-[11px] leading-none" title={countryLabel(meta.country)}>
                          {COUNTRY_FLAGS[meta.country]}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="truncate text-base font-semibold text-slate-100">{template.name}</h3>

                      {/* Strategy Summary */}
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-400">
                        {template.strategy_summary}
                      </p>

                      {/* Footer: status + actions */}
                      <div className="mt-4 flex items-center justify-between border-t border-slate-800/50 pt-3">
                        <Badge variant={getStatusVariant(template.status)} className="text-[10px]">
                          {statusLabel(template.status)}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200"
                            onClick={async (event) => {
                              event.stopPropagation();
                              try {
                                const td = await getTemplate(template.template_id);
                                openEditForm(td);
                              } catch { /* ignore */ }
                            }}
                          >
                            <Edit className="mr-1 h-3 w-3" /> {t('template.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-slate-400 hover:text-rose-400"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeletingTemplateId(template.template_id);
                            }}
                          >
                            <Trash2 className="mr-1 h-3 w-3" /> {t('template.delete')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={() => void loadMore()} disabled={templatesLoading}>
                    {templatesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('template.loadMore', { n: totalCount })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* --- Detail Sidebar --- */}
        {selectedTemplateId && (
          <div className="hidden w-[400px] shrink-0 lg:block">
            <div className="sticky top-[100px] space-y-5">
              {/* Detail Card */}
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                  <span className="text-xs font-medium text-slate-400">{t('template.detail')}</span>
                  <button onClick={() => setSelectedTemplateId(null)} className="rounded-lg p-1 text-slate-500 hover:text-slate-300" type="button" title={t('common.close')}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {detailLoading && (
                  <CardContent className="flex items-center gap-2 py-12">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-400">{t('template.loadingDetail')}</span>
                  </CardContent>
                )}
                {detailError && (
                  <CardContent className="py-8 text-center text-sm text-rose-400">{detailError}</CardContent>
                )}
                {detail && !detailLoading && (() => {
                  const meta = parseTemplateMeta(detail.name);
                  return (
                    <>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base">{detail.name}</CardTitle>
                            <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-xs">{COUNTRY_FLAGS[meta.country]} {countryLabel(meta.country)}</span>
                              <Badge variant="outline" className={`text-[10px] ${CATEGORY_BADGE[detail.category] || ''}`}>
                                {categoryLabel(detail.category) || detail.category}
                              </Badge>
                              <Badge variant={getStatusVariant(detail.status)} className="text-[10px]">
                                {statusLabel(detail.status)}
                              </Badge>
                            </CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <button className="rounded-lg p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800" title={t('template.edit')}
                              onClick={() => openEditForm(detail)} type="button"><Edit className="h-3.5 w-3.5" /></button>
                            <button className="rounded-lg p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800" title={t('template.delete')}
                              onClick={() => setDeletingTemplateId(detail.template_id)} type="button"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">{detail.strategy_summary}</p>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Factor Library */}
                        {detail.factors && detail.factors.length > 0 && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300">
                              <Tag className="h-3.5 w-3.5" /> {t('template.boundFactors')}
                            </div>
                            <div className="grid gap-2">
                              {detail.factors.map((assignment: TemplateFactorAssignment) => (
                                <div
                                  key={assignment.factor_id}
                                  className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                                >
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0.5 ${
                                      assignment.factor_category === 'NARRATIVE'
                                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/25'
                                        : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25'
                                    }`}
                                  >
                                    {assignment.factor_category === 'NARRATIVE' ? t('template.narrative') : t('template.parameter')}
                                  </Badge>
                                  <span className="text-[11px] text-slate-300 truncate flex-1">
                                    {assignment.factor_name}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-slate-500">
                                    {Object.values(assignment.value).join('、') || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Strategy Library */}
                        {detail.strategies && detail.strategies.length > 0 && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300">
                              <Target className="h-3.5 w-3.5" /> {t('template.boundStrategies')}
                            </div>
                            <div className="grid gap-2">
                              {detail.strategies.map((strategy) => (
                                <div
                                  key={strategy.strategy_id}
                                  className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-300 truncate">
                                      {strategy.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-slate-500 font-mono">
                                      {strategy.key}
                                    </span>
                                  </div>
                                  <p className="text-[10px] leading-relaxed text-slate-500 line-clamp-2">
                                    {strategy.summary}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Constraint Library */}
                        {detail.constraints && detail.constraints.length > 0 && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300">
                              <Filter className="h-3.5 w-3.5" /> {t('template.boundConstraints')}
                            </div>
                            <div className="grid gap-2">
                              {detail.constraints.map((constraint) => (
                                <div
                                  key={constraint.constraint_id}
                                  className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                                >
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 py-0.5 ${
                                      constraint.rule_type === 'HARD'
                                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/25'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                                    }`}
                                  >
                                    {constraint.rule_type === 'HARD' ? t('template.hardConstraint') : t('template.softConstraint')}
                                  </Badge>
                                  <span className="text-[11px] text-slate-300 truncate flex-1">
                                    {constraint.name}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-slate-500 font-mono">
                                    {constraint.key}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </>
                  );
                })()}
              </Card>

              {/* Apply Card */}
              {detail && detail.status === 'ACTIVE' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('template.applyPanel')}</CardTitle>
                    <CardDescription>{t('template.aiAutoGenerateDesc')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Current Product */}
                    {selectedProduct ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-emerald-500/20 p-1">
                            <Check className="h-3 w-3 text-emerald-400" />
                          </div>
                          <span className="text-[11px] text-emerald-400">{t('template.associatedProduct')}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-100">
                          {selectedProduct.title}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 line-clamp-1">
                          {selectedProduct.selling_points.join(' · ')}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-xs text-amber-300">{t('template.noProductHint')}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {t('template.noProductGuide')}
                        </p>
                      </div>
                    )}

                    <Button
                      className="w-full gap-2"
                      onClick={handleApplyTemplate}
                      disabled={!selectedTemplateId}
                    >
                      <Sparkles className="h-4 w-4" />
                      {t('template.applyAndGenerate')}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Workflow Hint */}
              <div className="rounded-2xl border border-dashed border-slate-700/50 bg-slate-950/40 p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <Compass className="h-3.5 w-3.5 text-emerald-400" /> {t('template.stepSelectTemplate')}
                  <ArrowRight className="h-3 w-3 text-slate-600" />
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> {t('template.stepGenerateScript')}
                  <ArrowRight className="h-3 w-3 text-slate-600" />
                  <Globe className="h-3.5 w-3.5 text-purple-400" /> {t('template.stepPublishVideo')}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Mobile Detail Drawer (shown on small screens) ===== */}
      {selectedTemplateId && detail && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTemplateId(null)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-slate-800 bg-slate-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">{detail.name}</h3>
              <button onClick={() => setSelectedTemplateId(null)} type="button" className="rounded-lg p-1 text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">{detail.strategy_summary}</p>
            <div className="mt-3 grid gap-2">
              {detail.factors && detail.factors.length > 0 ? (
                detail.factors.map((assignment) => (
                  <div key={assignment.factor_id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px]">
                    <span className="text-slate-500">{assignment.factor_name}</span>
                    <span className="ml-auto text-slate-300">
                      {assignment.factor_category === 'INSTRUCTION'
                        ? (assignment.value as Record<string, unknown>).instruction as string
                        : JSON.stringify(assignment.value)}
                    </span>
                  </div>
                ))
              ) : (
                <span className="text-[11px] text-slate-600">{t('template.noBoundFactors')}</span>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setSelectedTemplateId(null); setDeletingTemplateId(detail.template_id); }}>
                <Trash2 className="mr-1 h-3 w-3" /> {t('template.delete')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => openEditForm(detail)}>
                <Edit className="mr-1 h-3 w-3" /> {t('template.edit')}
              </Button>
              {detail.status === 'ACTIVE' && (
                <Button size="sm" className="flex-1" onClick={handleApplyTemplate}>
                  <Sparkles className="mr-1 h-3 w-3" /> {t('template.apply')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Create / Edit Modal ===== */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[6vh] backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">
                  {editingTemplateId ? t('template.editTemplate') : t('template.newTemplateTitle')}
                </h2>
                <button onClick={resetForm} className="rounded-lg p-1.5 text-slate-500 hover:text-slate-300" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs text-slate-400">{t('template.nameLabel')}</label>
                  <Input value={formName} onChange={(event) => setFormName(event.target.value)} placeholder={t('template.namePlaceholder')} className="text-sm" />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">{t('template.categoryLabel')}</label>
                  <Select value={formCategory} onChange={(event) => setFormCategory(event.target.value)} className="text-sm">
                    {ALLOWED_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat} ({categoryLabel(cat)})</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">{t('template.countryLabel')}</label>
                  <Input value="" placeholder={t('template.countryAuto')} disabled className="text-sm" />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs text-slate-400">{t('template.strategyLabel')}</label>
                  <Textarea
                    value={formStrategy}
                    onChange={(event) => setFormStrategy(event.target.value)}
                    placeholder={t('template.strategyPlaceholder')}
                    className="min-h-[70px] text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs text-slate-400">{t('template.factorLabel')}</label>
                    <span className="text-[10px] text-slate-600">
                      {`Available fields: ${Object.keys(FACTOR_LABELS).join(', ')}`}
                    </span>
                  </div>
                  <Textarea
                    value={formFactorJson}
                    onChange={(event) => setFormFactorJson(event.target.value)}
                    className="min-h-[180px] font-mono text-xs"
                  />
                </div>
              </div>

              {formError && (
                <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{formError}</div>
              )}

              <div className="mt-6 flex items-center justify-between">
                <div className="text-[11px] text-slate-600">
                  {t('template.nameHint')}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={resetForm} disabled={formBusy}>{t('common.cancel')}</Button>
                  <Button
                    onClick={() => {
                      if (editingTemplateId) void handleUpdateTemplate();
                      else void handleCreateTemplate();
                    }}
                    disabled={formBusy || !formName.trim() || !formStrategy.trim()}
                  >
                    {formBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : editingTemplateId ? t('template.saveEdit') : t('template.createTemplate')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Delete Confirm Modal ===== */}
      {deletingTemplateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">{t('template.confirmDeleteTitle')}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {t('template.confirmDeleteDesc')}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingTemplateId(null)} disabled={deleteBusy}>{t('common.cancel')}</Button>
              <Button variant="destructive" onClick={() => void handleDeleteTemplate()} disabled={deleteBusy}>
                {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('template.confirmDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
