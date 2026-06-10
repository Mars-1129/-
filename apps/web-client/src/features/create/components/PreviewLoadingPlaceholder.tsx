import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Loader2 } from 'lucide-react';

const INTERVAL_MS = 1800;

type PreviewLoadingPlaceholderProps = {
  className?: string;
};

export function PreviewLoadingPlaceholder({ className }: PreviewLoadingPlaceholderProps): JSX.Element {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  const STAGE_MESSAGES = [
    t('creation.loading1'),
    t('creation.loading2'),
    t('creation.loading3'),
    t('creation.loading4'),
    t('creation.loading5'),
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % STAGE_MESSAGES.length);
    }, INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={`flex min-h-[520px] flex-col items-center justify-center rounded-3xl border border-slate-800 bg-slate-950/80 ${className ?? ''}`}
    >
      {/* 手机屏幕外形 */}
      <div className="relative flex flex-col items-center">
        <div className="flex h-80 w-48 flex-col items-center justify-center rounded-[2.5rem] border-4 border-slate-700 bg-slate-900/80 shadow-2xl">
          {/* 顶部状态栏 */}
          <div className="flex w-full items-center justify-between px-5 pt-3 pb-1">
            <span className="text-[8px] text-slate-600">9:41</span>
            <div className="h-3 w-14 rounded-full bg-slate-800" />
            <Film className="h-2.5 w-2.5 text-slate-600" />
          </div>

          {/* 内容区 */}
          <div className="flex flex-1 flex-col items-center justify-center space-y-4 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            </div>
            <div className="h-4 w-20 animate-pulse rounded-full bg-slate-800" />
            <div className="h-2 w-28 animate-pulse rounded-full bg-slate-800/60" />
          </div>

          {/* 底部横条 */}
          <div className="mb-2 h-1 w-20 rounded-full bg-slate-700" />
        </div>
      </div>

      {/* 阶段文字切换 */}
      <div className="mt-6 text-center">
        <p
          key={index}
          className="animate-fade-in text-sm text-slate-400"
        >
          {STAGE_MESSAGES[index]}
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {STAGE_MESSAGES.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-4 bg-cyan-400' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
