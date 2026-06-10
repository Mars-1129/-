/**
 * 水平分镜时间轴组件
 * 按分镜时长比例渲染水平条，支持点击选中、悬停预览、缩放
 * 移动端支持 pinch-zoom 缩放、tap-to-toggle tooltip、swipe 切换分镜
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScriptShot } from '@tikstream/shared-types';
import { formatDuration } from '../../../lib/utils/cn';
import { useTimelineTouch } from '../../../hooks/useTimelineTouch';
import { useBreakpoint } from '../../../hooks/useBreakpoint';

interface ShotTimelineProps {
  shots: ScriptShot[];
  selectedShotIndex: number | null;
  onSelectShot: (shotIndex: number) => void;
  totalDuration: number;
  /** 左滑切换到上一个分镜 */
  onPrevShot?: () => void;
  /** 右滑切换到下一个分镜 */
  onNextShot?: () => void;
}

const shotColors = [
  'bg-cyan-600/70',
  'bg-violet-600/70',
  'bg-emerald-600/70',
  'bg-amber-600/70',
  'bg-pink-600/70',
  'bg-blue-600/70',
  'bg-teal-600/70',
  'bg-orange-600/70',
  'bg-purple-600/70',
  'bg-lime-600/70',
  'bg-rose-600/70',
  'bg-sky-600/70',
];

export function ShotTimeline({
  shots,
  selectedShotIndex,
  onSelectShot,
  totalDuration,
  onPrevShot,
  onNextShot,
}: ShotTimelineProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredShotIndex, setHoveredShotIndex] = useState<number | null>(null);
  const [tappedShotIndex, setTappedShotIndex] = useState<number | null>(null);

  const { isMobile } = useBreakpoint();

  const { scale, setScale, touchHandlers } = useTimelineTouch({
    onSwipeLeft: () => onPrevShot?.(),
    onSwipeRight: () => onNextShot?.(),
    minScale: 0.5,
    maxScale: 3,
    swipeThreshold: 60,
  });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setScale((prev: number) => Math.max(0.5, Math.min(3, prev - e.deltaY * 0.001)));
    }
  }, [setScale]);

  const minBarWidth = 4; // px

  // 桌面端用 hover，移动端用 tap-to-toggle
  const activeTooltipIndex = isMobile ? tappedShotIndex : hoveredShotIndex;

  const handleShotClick = useCallback(
    (shotIndex: number) => {
      if (isMobile) {
        // 移动端：首次 tap 显示 tooltip，再次 tap 选中
        if (tappedShotIndex === shotIndex) {
          onSelectShot(shotIndex);
          setTappedShotIndex(null);
        } else {
          setTappedShotIndex(shotIndex);
        }
      } else {
        onSelectShot(shotIndex);
      }
    },
    [isMobile, tappedShotIndex, onSelectShot],
  );

  // 点击其他地方关闭移动端 tooltip
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile && e.target === containerRef.current) {
        setTappedShotIndex(null);
      }
    },
    [isMobile],
  );

  return (
    <div className={`space-y-1 ${isMobile ? 'shot-timeline-mobile' : ''}`}>
      {/* 缩放控制 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-slate-500">
          {shots.length} 镜 · {formatDuration(totalDuration)}
          {isMobile && scale !== 1 && (
            <span className="ml-1 text-cyan-400">{Math.round(scale * 100)}%</span>
          )}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <button
            type="button"
            className={`rounded hover:bg-slate-800 ${isMobile ? 'zoom-btn' : 'px-1.5 py-0.5'}`}
            onClick={() => setScale((s: number) => Math.min(3, s + 0.15))}
          >
            +
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className={`rounded hover:bg-slate-800 ${isMobile ? 'zoom-btn' : 'px-1.5 py-0.5'}`}
            onClick={() => setScale((s: number) => Math.max(0.5, s - 0.15))}
          >
            -
          </button>
        </div>
      </div>

      {/* 时间轴 */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        {...touchHandlers}
        onClick={handleContainerClick}
        className={`relative flex items-center rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden ${
          isMobile ? 'h-12' : 'h-10'
        }`}
        style={{ touchAction: 'pan-x' }}
      >
        {shots.map((shot, index) => {
          const widthPercent = totalDuration > 0 ? (shot.duration / totalDuration) * 100 : 0;
          const isSelected = shot.shot_index === selectedShotIndex;
          const isTooltipActive = shot.shot_index === activeTooltipIndex;
          const color = shotColors[index % shotColors.length];

          return (
            <div
              key={shot.id}
              className={`relative flex items-center justify-center h-full transition-all cursor-pointer border-r border-slate-900/60 ${color} shot-bar ${
                isSelected
                  ? 'ring-2 ring-cyan-400/80 z-10 brightness-125 saturate-150'
                  : isTooltipActive
                    ? 'brightness-110 z-10'
                    : ''
              } ${isSelected ? '' : isMobile ? '' : 'hover:brightness-110'}`}
              style={{
                width: `${Math.max(widthPercent * scale, minBarWidth)}%`,
                flex: widthPercent > 0 ? undefined : '0 0 auto',
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleShotClick(shot.shot_index);
              }}
              onMouseEnter={() => {
                if (!isMobile) setHoveredShotIndex(shot.shot_index);
              }}
              onMouseLeave={() => {
                if (!isMobile) setHoveredShotIndex(null);
              }}
            >
              {/* 分镜索引标签 */}
              {widthPercent * scale > 3 ? (
                <span className="text-[9px] font-bold text-white/90 drop-shadow-sm select-none pointer-events-none">
                  {shot.shot_index}
                </span>
              ) : null}

              {/* 时长标签（桌面端 hover 或移动端 tap 或选中时显示） */}
              {(isTooltipActive || isSelected) && (
                <div
                  className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-200 shadow-lg z-20 pointer-events-none ${
                    isMobile ? 'shot-tooltip' : '-top-7'
                  }`}
                >
                  Shot {shot.shot_index} · {formatDuration(shot.duration)}
                  {shot.camera_movement !== 'Static' && (
                    <span className="ml-1 text-slate-400">{shot.camera_movement}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 移动端：swipe 提示 */}
      {isMobile && onPrevShot && onNextShot && (
        <p className="text-[9px] text-slate-600 text-center">
          ← 左右滑动切换分镜 · 双指缩放 →
        </p>
      )}
    </div>
  );
}
