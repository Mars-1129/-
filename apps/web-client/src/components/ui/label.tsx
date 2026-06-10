import * as React from 'react';
import { cn } from '../../lib/utils/cn';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, children, ...props }: LabelProps): JSX.Element {
  return (
    <label
      className={cn(
        'text-sm font-medium text-slate-200',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}
