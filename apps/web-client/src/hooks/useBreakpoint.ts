import { useSyncExternalStore, useCallback } from 'react';

/**
 * SSR 安全的响应式断点检测 Hook
 * 使用 matchMedia + useSyncExternalStore，支持窗口 resize 实时响应
 */

const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
} as const;

function createMatchMediaStore(query: string) {
  return function subscribe(onStoreChange: () => void) {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return () => {}; // SSR: 无操作
    }
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  };
}

function getMatchMediaSnapshot(query: string) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false; // SSR: 默认返回 false
  }
  return window.matchMedia(query).matches;
}

const isMobileQuery = `(max-width: ${BREAKPOINTS.mobile}px)`;
const isTabletQuery = `(min-width: ${BREAKPOINTS.mobile + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`;

const mobileSubscribe = createMatchMediaStore(isMobileQuery);
const tabletSubscribe = createMatchMediaStore(isTabletQuery);
const mobileSnapshot = () => getMatchMediaSnapshot(isMobileQuery);
const tabletSnapshot = () => getMatchMediaSnapshot(isTabletQuery);

export interface BreakpointInfo {
  /** 是否移动端 (≤640px) */
  isMobile: boolean;
  /** 是否平板 (641px ~ 1024px) */
  isTablet: boolean;
  /** 是否桌面端 (>1024px) */
  isDesktop: boolean;
  /** 是否为触控设备 (navigator.maxTouchPoints > 0) */
  isTouchDevice: boolean;
}

export function useBreakpoint(): BreakpointInfo {
  const isMobile = useSyncExternalStore(mobileSubscribe, mobileSnapshot, () => false);
  const isTablet = useSyncExternalStore(tabletSubscribe, tabletSnapshot, () => false);

  const isTouchDevice = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    return navigator.maxTouchPoints > 0;
  }, []);

  return {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    isTouchDevice: isTouchDevice(),
  };
}

// ---- 向后兼容的静态辅助函数（同步检测，不响应 resize） ----

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= BREAKPOINTS.mobile;
}

export function isTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth > BREAKPOINTS.mobile && window.innerWidth <= BREAKPOINTS.tablet;
}

export function isDesktopDevice(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth > BREAKPOINTS.tablet;
}

export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (isMobileDevice()) return 'mobile';
  if (isTabletDevice()) return 'tablet';
  return 'desktop';
}

export function isTouchDeviceStatic(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0;
}
