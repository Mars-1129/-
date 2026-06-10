import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils/cn';

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ message, onRetry, className }: ErrorStateProps): JSX.Element {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
        </div>
        <p className="text-sm text-rose-300">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            重试
          </Button>
        )}
      </div>
    </div>
  );
}
