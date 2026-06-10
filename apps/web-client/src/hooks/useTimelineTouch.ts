import { useCallback, useRef, useState } from 'react';

/**
 * 时间轴触摸手势 Hook
 * 支持 pinch-zoom（缩放）和 swipe（快速切换分镜）
 */

type UseTimelineTouchOptions = {
  onScaleChange?: (scale: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minScale?: number;
  maxScale?: number;
  /** swipe 最小触发距离（px） */
  swipeThreshold?: number;
};

const initialTouchState = {
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  initialDistance: 0,
  initialScale: 1,
  isPinching: false,
  moved: false,
};

export function useTimelineTouch(options: UseTimelineTouchOptions = {}) {
  const {
    onScaleChange,
    onSwipeLeft,
    onSwipeRight,
    minScale = 0.5,
    maxScale = 3,
    swipeThreshold = 60,
  } = options;

  const [scale, setScale] = useState(1);
  const touchStateRef = useRef({ ...initialTouchState, initialScale: 1 });
  const scaleRef = useRef(1);
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches;
      touchStateRef.current.startX = touches[0].clientX;
      touchStateRef.current.startY = touches[0].clientY;
      touchStateRef.current.moved = false;

      if (touches.length === 2) {
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        touchStateRef.current.initialDistance = Math.hypot(dx, dy);
        touchStateRef.current.initialScale = scaleRef.current;
        touchStateRef.current.isPinching = true;
      } else {
        touchStateRef.current.isPinching = false;
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches;
      const state = touchStateRef.current;

      if (state.isPinching && touches.length === 2) {
        const dx = touches[1].clientX - touches[0].clientX;
        const dy = touches[1].clientY - touches[0].clientY;
        const distance = Math.hypot(dx, dy);

        if (state.initialDistance > 0) {
          const newScale = Math.max(
            minScale,
            Math.min(maxScale, state.initialScale * (distance / state.initialDistance)),
          );
          scaleRef.current = newScale;
          setScale(newScale);
          onScaleChangeRef.current?.(newScale);
        }
      } else {
        // 单指滑动
        const deltaX = touches[0].clientX - state.startX;
        const deltaY = Math.abs(touches[0].clientY - state.startY);

        // 仅水平滑动超过阈值且未被垂直滑动拦截时触发
        if (Math.abs(deltaX) > swipeThreshold && deltaY < 40) {
          state.moved = true;
        }
      }
    },
    [minScale, maxScale, swipeThreshold],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const state = touchStateRef.current;
      if (state.isPinching) {
        state.isPinching = false;
        state.initialDistance = 0;
        return;
      }

      if (state.moved) {
        const deltaX = (e.changedTouches[0]?.clientX ?? state.startX) - state.startX;
        if (deltaX > swipeThreshold) {
          onSwipeRight?.();
        } else if (deltaX < -swipeThreshold) {
          onSwipeLeft?.();
        }
        state.moved = false;
      }
    },
    [onSwipeLeft, onSwipeRight, swipeThreshold],
  );

  return {
    scale,
    setScale,
    scaleRef,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
