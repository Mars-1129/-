import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  Clock,
  Database,
  Dna,
  LayoutTemplate,
  MessageSquare,
  RefreshCw,
  Scissors,
  Shield,
  Sparkles,
  TrendingUp,
  Video,
  Zap,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Select } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { API_BASE_URL } from '../../lib/api/http';
import { cn } from '../../lib/utils/cn';
import { useWorkspaceStore } from '../store/workspace-store';
import { MobileBottomNav } from '../../components/ui/mobile-bottom-nav';
import { NetworkStatusBar } from '../../components/ui/network-status-bar';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

// ================================================================
// 导航分组定义
// ================================================================
type NavGroup = {
  label: string;
  items: NavItem[];
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function AppShell(): JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const products = useWorkspaceStore((state) => state.products);
  const loading = useWorkspaceStore((state) => state.loading);
  const error = useWorkspaceStore((state) => state.error);
  const selectedProductId = useWorkspaceStore((state) => state.selectedProductId);
  const setSelectedProductId = useWorkspaceStore((state) => state.setSelectedProductId);
  const initialize = useWorkspaceStore((state) => state.initialize);
  const refreshProducts = useWorkspaceStore((state) => state.refreshProducts);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const navGroups = useMemo<NavGroup[]>(() => [
    {
      label: t('nav.groupCoreWorkflow'),
      items: [
        { href: '/materials', label: t('nav.materials'), description: t('nav.materialsDesc'), icon: Database },
        { href: '/scripts', label: t('nav.scripts'), description: t('nav.scriptsDesc'), icon: Sparkles },
        { href: '/create', label: t('nav.creations'), description: t('nav.creationsDesc'), icon: Video },
        { href: '/tasks', label: t('nav.tasks'), description: t('nav.tasksDesc'), icon: ClipboardList },
      ],
    },
    {
      label: t('nav.groupDataAnalytics'),
      items: [
        { href: '/analytics', label: t('nav.analytics'), description: t('nav.analyticsDesc'), icon: TrendingUp },
        { href: '/comments', label: t('nav.comments'), description: t('nav.commentsDesc'), icon: MessageSquare },
        { href: '/posting-time', label: t('nav.postingTime'), description: t('nav.postingTimeDesc'), icon: Clock },
        { href: '/cold-start', label: t('nav.coldStart'), description: t('nav.coldStartDesc'), icon: Zap },
      ],
    },
    {
      label: t('nav.groupAiEnhance'),
      items: [
        { href: '/dna', label: t('nav.dna'), description: t('nav.dnaDesc'), icon: Dna },
        { href: '/trend-tracker', label: t('nav.trendTracker'), description: t('nav.trendTrackerDesc'), icon: BarChart3 },
        { href: '/templates', label: t('nav.templates'), description: t('nav.templatesDesc'), icon: LayoutTemplate },
        { href: '/autocut', label: 'AutoCut', description: t('nav.autocutDesc'), icon: Scissors },
        { href: '/compliance', label: t('nav.compliance'), description: t('nav.complianceDesc'), icon: Shield },
      ],
    },
  ], [t]);

  // 扁平化用于面包屑查找
  const flatNavigation = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);

  const currentSection = useMemo(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
    return flatNavigation.find((item) => normalizedPath.startsWith(item.href)) ?? flatNavigation[0];
  }, [location.pathname]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId) ?? null;
  }, [products, selectedProductId]);

  if (loading && products.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
            <Boxes className="h-6 w-6 animate-pulse" />
          </div>
          <h1 className="text-lg font-semibold">{t('common.loadingWorkspace')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('common.loadingWorkspaceDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <NetworkStatusBar />
      {/* 桌面端侧边栏 */}
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-800 bg-slate-900/60 lg:w-72 lg:border-b-0 lg:border-r hide-mobile">
          <div className="border-b border-slate-800 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-wide">TikStream AI</div>
                <div className="text-xs text-slate-400">{t('common.appSubtitle')}</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="success">{t('common.realApi')}</Badge>
              <span className="text-xs text-slate-500">{API_BASE_URL || t('common.proxyMode')}</span>
            </div>
          </div>

          <nav className="space-y-1 p-4">
            {navGroups.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? 'mt-4' : ''}>
                {/* 分组标题 + 分隔线 */}
                <div className="mb-1 flex items-center gap-2 px-4">
                  <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500">{group.label}</span>
                  <div className="flex-1 border-t border-slate-800" />
                </div>

                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between rounded-2xl border px-4 py-3 transition-all group/sidebar-item',
                          isActive
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                            : 'border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{item.label}</div>
                            <div
                              className={cn(
                                'text-xs text-slate-500 truncate transition-all',
                                isActive
                                  ? 'max-h-4 opacity-100'
                                  : 'max-h-0 opacity-0 group-hover/sidebar-item:max-h-4 group-hover/sidebar-item:opacity-100',
                              )}
                            >
                              {item.description}
                            </div>
                          </div>
                        </div>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-800 p-4 space-y-3">
            {/* 产品选择器 */}
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-500">{t('common.productContext')}</div>
              <Select
                value={selectedProductId ?? ''}
                onChange={(event) => setSelectedProductId(event.target.value)}
                disabled={products.length === 0}
              >
                {products.length === 0 && <option value="">{t('common.noProduct')}</option>}
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </Select>
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void refreshProducts()} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
                {t('common.refreshContext')}
              </Button>
            </div>

            {/* 产品上下文信息 */}
            {selectedProduct && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="text-xs font-medium text-slate-300 truncate">{selectedProduct.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">{selectedProduct.category} · {selectedProduct.sku_code}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedProduct.selling_points.slice(0, 3).map((point) => (
                    <span key={point} className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] text-slate-400">
                      {point}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 语言切换器 */}
            <LanguageSwitcher />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur">
            <nav className="flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
              <span>{t('common.appName')}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-cyan-400">{currentSection.label}</span>
            </nav>
            <h1 className="mt-0.5 text-xl font-semibold text-white">{currentSection.description}</h1>
            {error && <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">{error}</div>}
          </header>

          <main className="flex-1 px-6 py-6 main-content-with-bottom-nav">
            <Outlet />
          </main>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <MobileBottomNav />
    </div>
  );
}
