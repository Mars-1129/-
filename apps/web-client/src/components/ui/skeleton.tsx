import { cn } from '../../lib/utils/cn';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn(
        'animate-pulse rounded-2xl bg-slate-700/60',
        className,
      )}
    />
  );
}
