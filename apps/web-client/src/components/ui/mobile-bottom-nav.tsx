/**
 * 移动端底部导航组件
 * 4 项核心导航（素材/剧本/创作/任务）+ "更多"入口
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  Database,
  Sparkles,
  Video,
  ClipboardList,
  MoreHorizontal,
  TrendingUp,
  MessageSquare,
  Clock,
  Zap,
  Dna,
  BarChart3,
  LayoutTemplate,
  Shield,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils/cn';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MORE_ITEMS: NavItem[] = [
  { path: '/analytics', label: 'analytics', icon: TrendingUp },
  { path: '/comments', label: 'comments', icon: MessageSquare },
  { path: '/posting-time', label: 'postingTime', icon: Clock },
  { path: '/cold-start', label: 'coldStart', icon: Zap },
  { path: '/dna', label: 'dna', icon: Dna },
  { path: '/trend-tracker', label: 'trendTracker', icon: BarChart3 },
  { path: '/templates', label: 'templates', icon: LayoutTemplate },
  { path: '/compliance', label: 'compliance', icon: Shield },
];

export function MobileBottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useBreakpoint();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isMobile) {
    return null;
  }

  const navItems: NavItem[] = [
    { path: '/materials', label: t('nav.materials'), icon: Database },
    { path: '/scripts', label: t('nav.scripts'), icon: Sparkles },
    { path: '/create', label: t('nav.creations'), icon: Video },
    { path: '/tasks', label: t('nav.tasks'), icon: ClipboardList },
  ];

  return (
    <>
      {/* 更多菜单遮罩 */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 animate-fade-in"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        />
      )}

      {/* 更多菜单 — 底部面板 */}
      {moreOpen && (
        <div className="fixed bottom-[4.5rem] left-2 right-2 z-50 rounded-2xl border border-slate-700 bg-slate-900/98 p-3 shadow-xl backdrop-blur animate-fade-in">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-slate-400">{t('common.more')}</span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-center rounded-lg p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    setMoreOpen(false);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs transition-colors',
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-300'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] leading-tight">{t(`nav.${item.label}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <nav className="mobile-bottom-nav">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <div
              key={item.path}
              className={cn('mobile-bottom-nav-item', isActive && 'active')}
              onClick={() => {
                navigate(item.path);
                setMoreOpen(false);
              }}
              role="button"
              tabIndex={0}
              aria-label={item.label}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(item.path);
                }
              }}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs leading-none mt-0.5">{item.label}</span>
            </div>
          );
        })}

        {/* "更多"按钮 */}
        <div
          className={cn('mobile-bottom-nav-item', moreOpen && 'active')}
          onClick={() => setMoreOpen(!moreOpen)}
          role="button"
          tabIndex={0}
          aria-label={t('common.more')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setMoreOpen(!moreOpen);
            }
          }}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="text-xs leading-none mt-0.5">{t('common.more')}</span>
        </div>
      </nav>
    </>
  );
}

export { isMobileDevice, isTabletDevice, isDesktopDevice, getDeviceType } from '../../hooks/useBreakpoint';
