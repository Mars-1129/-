/**
 * 分镜占位预览组件（轻量级，无 Remotion 依赖）
 * 在剧本编辑阶段展示分镜故事板预览卡片
 */

import type { ScriptShot, CameraMovement, TransitionType } from '@tikstream/shared-types';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../../lib/utils/cn';

interface ShotPreviewProps {
  shot: ScriptShot;
  isSelected: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

export function ShotPreview({
  shot,
  isSelected,
  isFirst,
  isLast,
}: ShotPreviewProps): JSX.Element {
  const { t } = useTranslation();

  const cameraLabels: Record<string, string> = {
     Static: t('script.cameraStatic'),
     Dolly_In_Fast: t('script.cameraDollyIn'),
     Dolly_Out: t('script.cameraDollyOut'),
     Pan_Left: t('script.cameraPanLeft'),
     Tilt_Up: t('script.cameraTiltUp'),
   };

   const transitionLabels: Record<string, string> = {
     None: t('script.transitionNone'),
     Fade_In: t('script.transitionFadeIn'),
     Dissolve: t('script.transitionDissolve'),
     Wipe: t('script.transitionWipe'),
   };

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all ${
        isSelected
          ? 'border-cyan-400/60 shadow-[0_0_0_1px_rgba(34,211,238,0.2)] bg-slate-900/80'
          : isLast
            ? 'border-slate-800 bg-slate-950/60 border-dashed'
            : 'border-slate-800 bg-slate-950/60'
      }`}
    >
      {/* 顶部视觉预览区 */}
      <div className="relative h-28 bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 flex items-center justify-center">
        {/* 模拟视频画框 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-4">
            <div className="text-3xl mb-1 opacity-40">
              {shot.camera_movement === 'Static'
                ? '🎬'
                : shot.camera_movement === 'Dolly_In_Fast'
                  ? '🔍'
                  : shot.camera_movement === 'Dolly_Out'
                    ? '🔍'
                    : '🎞️'}
            </div>
            <div className="text-[10px] text-slate-500 line-clamp-2 leading-tight">
              {shot.visual_description || shot.scene_description_query || t('script.noVisualDescription')}
            </div>
          </div>
        </div>

        {/* 分镜编号角标 */}
        <div className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/80">
          {shot.shot_index}
        </div>

        {/* 时长角标 */}
        <div className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white/60">
          {formatDuration(shot.duration)}
        </div>

        {/* 运镜 + 转场标签 */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-[9px] text-cyan-300/70">
            {cameraLabels[shot.camera_movement] || shot.camera_movement}
          </span>
          {!isFirst && shot.transition_type !== 'None' && (
            <span className="rounded bg-violet-950/80 px-1.5 py-0.5 text-[9px] text-violet-300/70">
              {transitionLabels[shot.transition_type] || shot.transition_type}
            </span>
          )}
        </div>

        {/* 选中指示器 */}
        {isSelected && (
          <div className="absolute inset-0 ring-2 ring-cyan-400/40 pointer-events-none rounded-2xl" />
        )}
      </div>

      {/* 底部文案区 */}
      <div className="p-3 space-y-1.5">
        <div className="text-xs text-slate-200 line-clamp-2 leading-relaxed">
          {shot.subtitle_text || shot.voiceover_text || t('script.noSubtitle')}
        </div>
        {shot.voiceover_text && shot.voiceover_text !== shot.subtitle_text && (
          <div className="text-[10px] text-slate-500 line-clamp-1">
            {'\u{1F399}'} {shot.voiceover_text}
          </div>
        )}
      </div>
    </div>
  );
}

export function ShotPreviewList({
  shots,
  selectedShotIndex,
  onSelectShot,
}: {
  shots: ScriptShot[];
  selectedShotIndex: number | null;
  onSelectShot: (shotIndex: number) => void;
}): JSX.Element {
  const { t } = useTranslation();
  if (shots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-xs text-slate-500">
        {t('script.noShotData')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {shots.map((shot, index) => (
        <button
          key={shot.id}
          type="button"
          className="text-left w-full"
          onClick={() => onSelectShot(shot.shot_index)}
        >
          <ShotPreview
            shot={shot}
            isSelected={shot.shot_index === selectedShotIndex}
            isFirst={index === 0}
            isLast={index === shots.length - 1}
          />
        </button>
      ))}
    </div>
  );
}
