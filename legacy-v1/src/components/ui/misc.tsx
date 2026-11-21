import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary',
      blue: 'bg-secondary text-secondary-foreground',
      muted: 'bg-muted text-muted-foreground',
      warn: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
      danger: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});
export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ variant }), className)} {...p} />
);

export function Tabs({ tabs, value, onChange, className }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('no-print flex gap-1 overflow-x-auto rounded-lg border bg-muted p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors', value === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full text-sm', className)} {...p} />
  </div>
);
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('whitespace-nowrap border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)} {...p} />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('border-b px-3 py-2 align-middle', className)} {...p} />;

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
