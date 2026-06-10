import { cn } from '../../lib/utils/cn';

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <div className="text-center max-w-sm">
        {icon && (
          <div className="mx-auto mb-4 text-slate-600">
            {icon}
          </div>
        )}
        <p className="text-sm font-medium text-slate-400">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
        {action && (
          <div className="mt-4">{action}</div>
        )}
      </div>
    </div>
  );
}
