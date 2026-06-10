import type { ScriptShot } from '@tikstream/shared-types';
import { ArrowRight, Camera, Clock, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../../lib/utils/cn';

type ShotComparisonPanelProps = {
  shots: ScriptShot[];
  indices: [number, number] | null;
  onClose: () => void;
};

function diffHighlight(a: string, b: string): boolean {
  return a !== b;
}

export function ShotComparisonPanel({ shots, indices, onClose }: ShotComparisonPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const cameraLabels: Record<string, string> = {
    Static: t('creation.cameraStatic'),
    Dolly_In_Fast: t('creation.cameraDollyIn'),
    Dolly_Out: t('creation.cameraDollyOut'),
    Pan_Left: t('creation.cameraPanLeft'),
    Tilt_Up: t('creation.cameraTiltUp'),
  };

  if (!indices) return null;

  const shotA = shots.find((s) => s.shot_index === indices[0]);
  const shotB = shots.find((s) => s.shot_index === indices[1]);

  if (!shotA || !shotB) return null;

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/80 p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-cyan-300">
          {t('creation.shotCompare')} · Shot {indices[0]} vs Shot {indices[1]}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-0.5 text-xs text-slate-500 transition-colors hover:text-slate-300 hover:bg-slate-800"
        >
          {t('common.close')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[shotA, shotB].map((shot, i) => {
          const other = i === 0 ? shotB : shotA;
          return (
            <div
              key={shot.id}
              className={`rounded-xl border p-3 ${
                i === 0
                  ? 'border-violet-700/50 bg-violet-950/20'
                  : 'border-emerald-700/50 bg-emerald-950/20'
              }`}
            >
              <div className={`text-xs font-bold mb-2 ${i === 0 ? 'text-violet-300' : 'text-emerald-300'}`}>
                Shot {shot.shot_index}
              </div>

              {/* {t('creation.duration')} */}
              <div className="mb-2 flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3 text-slate-500" />
                <span className={`text-slate-300 ${diffHighlight(shot.duration.toString(), other.duration.toString()) ? 'font-medium' : ''}`}>
                  {formatDuration(shot.duration)}
                </span>
              </div>

              {/* {t('creation.cameraMovement')} */}
              <div className="mb-2 flex items-start gap-2 text-xs">
                <Camera className="h-3 w-3 text-slate-500 mt-0.5" />
                <span className={`${diffHighlight(shot.camera_movement, other.camera_movement) ? 'text-amber-300 font-medium' : 'text-slate-400'}`}>
                  {cameraLabels[shot.camera_movement] || shot.camera_movement}
                </span>
              </div>

              {/* {t('creation.voiceover')} */}
              <div className="mb-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <Mic className="h-3 w-3" />
                  <span>{t('creation.voiceover')}</span>
                </div>
                <div className={`rounded-lg px-2 py-1.5 text-[11px] leading-relaxed ${
                  diffHighlight(shot.voiceover_text, other.voiceover_text)
                    ? 'bg-amber-950/30 text-amber-200'
                    : 'bg-slate-900/50 text-slate-400'
                }`}>
                  {shot.voiceover_text || t('creation.noVoiceover')}
                </div>
              </div>

              {/* {t('creation.visualDescription')} */}
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <ArrowRight className="h-3 w-3" />
                  <span>{t('creation.visualDescription')}</span>
                </div>
                <div className={`rounded-lg px-2 py-1.5 text-[11px] leading-relaxed ${
                  diffHighlight(shot.visual_description, other.visual_description)
                    ? 'bg-amber-950/30 text-amber-200'
                    : 'bg-slate-900/50 text-slate-400'
                }`}>
                  {shot.visual_description || '(无视觉描述)'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
