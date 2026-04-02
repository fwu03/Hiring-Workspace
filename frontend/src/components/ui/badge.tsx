import { HTMLAttributes } from 'react';

type Variant = 'default' | 'outline';

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  const v =
    variant === 'outline'
      ? 'border border-border bg-transparent text-foreground'
      : 'border-transparent bg-muted text-foreground';
  return (
    <div
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${v} ${className}`}
      {...props}
    />
  );
}
