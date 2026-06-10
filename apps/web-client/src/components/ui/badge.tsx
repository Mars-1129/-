import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils/cn';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-slate-700 bg-slate-900 text-slate-200',
      success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
      destructive: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
      outline: 'border-slate-700 text-slate-200',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
