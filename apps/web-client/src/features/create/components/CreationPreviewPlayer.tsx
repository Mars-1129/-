import { AbsoluteFill, OffthreadVideo, Sequence, Audio, useCurrentFrame, spring, interpolate } from 'remotion';
import type { PreviewCompositionResponse } from '@tikstream/shared-types';
import { useTranslation } from 'react-i18next';

interface Props {
  preview: PreviewCompositionResponse;
  selectedShotIndex: number | null;
}

function toHttpUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  // 提取 /artifacts/xxx.mp4 路径段，统一走 Vite 代理避免 ORB 拦截
  const artifactsMatch = path.match(/\/artifacts\/([^/?#]+)/);
  if (artifactsMatch) return `/artifacts/${artifactsMatch[1]}`;
  // http/https 地址（不含 artifacts）直接透传
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // 本地文件路径：提取文件名走代理
  const fileName = path.split('/').pop() || path.split('\\').pop() || path;
  return `/artifacts/${fileName}`;
}

// --- TikTok 互动元素（在视频层之上） ---

const TikTokHeader: React.FC<{ frame: number; canvasWidth: number }> = ({ frame, canvasWidth }) => {
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: '0 12px',
      opacity,
      pointerEvents: 'none',
    }}>
      <span style={{ color: '#fff', fontSize: Math.round(canvasWidth * 0.04), fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>Following</span>
      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: Math.round(canvasWidth * 0.04), fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>For You</span>
    </div>
  );
};

const TikTokSidebar: React.FC<{ frame: number; canvasWidth: number; canvasHeight: number }> = ({ frame, canvasWidth, canvasHeight }) => {
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const iconSize = Math.round(canvasWidth * 0.08);
  const fontSize = Math.round(canvasWidth * 0.03);
  const right = Math.round(canvasWidth * 0.02);

  return (
    <div style={{
      position: 'absolute',
      right,
      bottom: Math.round(canvasHeight * 0.22),
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: Math.round(canvasHeight * 0.03),
      pointerEvents: 'none',
      opacity,
    }}>
      {/* 头像 */}
      <div style={{
        width: Math.round(canvasWidth * 0.12),
        height: Math.round(canvasWidth * 0.12),
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.8)',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #d946ef)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: iconSize * 0.6, fontWeight: 700, color: '#fff' }}>+</span>
      </div>
      {/* 点赞 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: iconSize, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>❤️</span>
        <span style={{ color: '#fff', fontSize, fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>12.4k</span>
      </div>
      {/* 评论 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: iconSize, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>💬</span>
        <span style={{ color: '#fff', fontSize, fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>1.2k</span>
      </div>
      {/* 分享 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: iconSize, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>↗️</span>
        <span style={{ color: '#fff', fontSize, fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>Share</span>
      </div>
      {/* 收藏 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: iconSize, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>⭐</span>
        <span style={{ color: '#fff', fontSize, fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>8.5k</span>
      </div>
      {/* 音乐旋转图标 */}
      <div style={{
        width: Math.round(canvasWidth * 0.1),
        height: Math.round(canvasWidth * 0.1),
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
        border: '2px solid rgba(255,255,255,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `rotate(${frame * 12}deg)`,
      }}>
        <span style={{ fontSize: Math.round(canvasWidth * 0.04), color: '#fff' }}>🎵</span>
      </div>
    </div>
  );
};

const TikTokBottom: React.FC<{ frame: number; canvasWidth: number; canvasHeight: number }> = ({ frame, canvasWidth, canvasHeight }) => {
  const opacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const safeBottom = Math.round(canvasHeight * 0.92);
  const bottomPadding = canvasHeight - safeBottom;

  return (
    <div style={{
      position: 'absolute',
      bottom: bottomPadding + Math.round(canvasHeight * 0.02),
      left: Math.round(canvasWidth * 0.04),
      right: Math.round(canvasWidth * 0.24),
      display: 'flex',
      flexDirection: 'column',
      gap: Math.round(canvasHeight * 0.015),
      opacity,
      pointerEvents: 'none',
    }}>
      {/* 用户名 */}
      <div style={{ fontSize: Math.round(canvasWidth * 0.04), fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
        @TikStream_Store
      </div>
      {/* 标题/描述 */}
      <div style={{ fontSize: Math.round(canvasWidth * 0.035), color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.6)', lineHeight: 1.3 }}>
        🔥 Summer sale 2025 — trending product
      </div>
      {/* 购物车卡片 */}
      <div style={{
        background: 'rgba(255,255,255,0.15)',
        backdropFilter: 'blur(10px)',
        borderRadius: 8,
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
        border: '1px solid rgba(255,255,255,0.2)',
      }}>
        <span style={{ fontSize: Math.round(canvasWidth * 0.04) }}>🛒</span>
        <span style={{ fontSize: Math.round(canvasWidth * 0.03), color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Shop Now</span>
      </div>
    </div>
  );
};

// --- 主组件 ---

export const CreationPreviewPlayer: React.FC<Props> = ({ preview, selectedShotIndex }) => {
  const { t } = useTranslation();
  const frame = useCurrentFrame();
  const currentTimeMs = (frame / 30) * 1000;

  // 防御：API 偶发不返回 canvas 字段时避免整页崩溃
  if (!preview?.canvas) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8', fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>{t('creation.previewEmptyDesc')}</div>
      </AbsoluteFill>
    );
  }

  let activeShotIndex = 0;
  let accumulatedMs = 0;
  for (const shot of preview.timeline) {
    const shotEnd = accumulatedMs + shot.duration * 1000;
    if (currentTimeMs < shotEnd) {
      activeShotIndex = shot.shot_index;
      break;
    }
    accumulatedMs = shotEnd;
  }

  const safeZone = preview.canvas.safe_zone || [0.1, 0.72, 0.9, 0.92];
  const safeLeft = safeZone[0] * preview.canvas.width;
  const safeTop = safeZone[1] * preview.canvas.height;
  const safeRight = safeZone[2] * preview.canvas.width;
  const safeBottom = safeZone[3] * preview.canvas.height;
  const safeWidth = safeRight - safeLeft;
  const safeHeight = safeBottom - safeTop;
  const isCurrentShotSelected = selectedShotIndex !== null && selectedShotIndex === activeShotIndex;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* ========== 音频层：BGM ========== */}
      {preview.audio_tracks.bgm_track.url && (
        <Audio src={preview.audio_tracks.bgm_track.url} volume={0.25} />
      )}
      {/* ========== 视频层 ========== */}
      {preview.timeline.map((shot, index) => {
        const shotStartMs = preview.timeline.slice(0, index).reduce((sum, s) => sum + s.duration * 1000, 0);
        const shotStartFrame = Math.floor(shotStartMs / (1000 / 30));
        const shotDurationFrames = Math.ceil(shot.duration * 30);
        const trackInfo = preview.video_tracks.find((t) => t.shot_index === shot.shot_index);
        const videoUrl = toHttpUrl(trackInfo?.render_path);

        return (
          <Sequence key={shot.shot_index} from={shotStartFrame} durationInFrames={shotDurationFrames}>
            {videoUrl ? (
              <AbsoluteFill>
                <OffthreadVideo src={videoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </AbsoluteFill>
            ) : (
              <AbsoluteFill style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a, #1e1b4b)' }}>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  color: '#94a3b8', fontSize: 14, fontFamily: 'system-ui, sans-serif', textAlign: 'center', opacity: 0.8,
                }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>{trackInfo?.source === 'CACHE_HIT' ? '\u{1F39E}' : '\u{1F3AC}'}</div>
                  <div style={{ fontWeight: 600, color: '#e2e8f0' }}>Shot {shot.shot_index}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {trackInfo?.source === 'CACHE_HIT' ? t('creation.cacheHit') : t('creation.noRenderResult')}
                  </div>
                </div>
              </AbsoluteFill>
            )}
          </Sequence>
        );
      })}

      {/* ========== 字幕层 ========== */}
      {preview.subtitle_track.entries.map((entry, index) => {
        const entryStartMs = entry.start_sec * 1000;
        const entryDurationMs = (entry.end_sec - entry.start_sec) * 1000;
        const isInSelectedShot = selectedShotIndex !== null &&
          preview.timeline.find((s) => {
            const sEnd = preview.timeline.slice(0, preview.timeline.indexOf(s) + 1).reduce((sum, t) => sum + t.duration * 1000, 0);
            return entryStartMs < sEnd;
          })?.shot_index === selectedShotIndex;

        return (
          <Sequence
            key={index}
            from={Math.floor(entryStartMs / (1000 / 30))}
            durationInFrames={Math.ceil(entryDurationMs / (1000 / 30))}
          >
            <div style={{
              position: 'absolute',
              bottom: preview.canvas.height - safeBottom,
              left: safeLeft,
              width: safeWidth,
              textAlign: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{
                display: 'inline-block',
                backgroundColor: isInSelectedShot ? 'rgba(34,211,238,0.85)' : 'rgba(0,0,0,0.72)',
                color: '#fff',
                fontSize: Math.round(Math.min(safeWidth * 0.06, 48)),
                fontWeight: 600,
                padding: '8px 20px',
                borderRadius: 12,
                fontFamily: 'system-ui, sans-serif',
                lineHeight: 1.4,
                maxWidth: safeWidth * 0.9,
                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
              }}>
                {entry.text}
              </span>
            </div>
          </Sequence>
        );
      })}

      {/* ========== TikTok 风格 overlay ========== */}
      <TikTokHeader frame={frame} canvasWidth={preview.canvas.width} />
      <TikTokSidebar frame={frame} canvasWidth={preview.canvas.width} canvasHeight={preview.canvas.height} />
      <TikTokBottom frame={frame} canvasWidth={preview.canvas.width} canvasHeight={preview.canvas.height} />

      {/* ========== 安全区框线 (半透明) ========== */}
      <div style={{
        position: 'absolute',
        top: safeTop,
        left: safeLeft,
        width: safeWidth,
        height: safeHeight,
        border: `2px dashed ${isCurrentShotSelected ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 4,
        pointerEvents: 'none',
      }} />
    </AbsoluteFill>
  );
};
