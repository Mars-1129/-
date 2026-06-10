import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PageLoading(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-400" />
        <p className="mt-4 text-sm text-slate-400">{t('common.loadingPage')}</p>
      </div>
    </div>
  );
}
