import * as React from 'react';
import { cn } from '../../lib/utils/cn';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
