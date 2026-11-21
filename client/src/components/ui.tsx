import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-navy-800 text-white hover:bg-navy-700',
  gold: 'bg-gold-400 text-navy-950 hover:bg-gold-300 font-semibold',
  outline: 'border border-navy-200 bg-white text-navy-800 hover:bg-navy-50',
  ghost: 'text-navy-700 hover:bg-navy-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, type, ...p }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm', variants[variant], className)}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-xl border border-navy-100 bg-white shadow-card', className)} {...p} />;
export const CardHeader = ({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-50 px-5 py-4">
    <div>
      <h2 className="text-base font-semibold text-navy-900">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-navy-500">{description}</p>}
    </div>
    {actions}
  </div>
);

const field = 'w-full rounded-lg border border-navy-200 bg-white px-3 text-sm text-navy-900 placeholder:text-navy-300 disabled:bg-navy-50 disabled:text-navy-400';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-10', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[80px] py-2', className)} {...p} />);
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} className={cn(field, 'h-10', className)} {...p} />);
Select.displayName = 'Select';

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-medium text-navy-800">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : hint ? <span className="block text-xs text-navy-400">{hint}</span> : null}
    </label>
  );
}

const badgeTone = { navy: 'bg-navy-100 text-navy-800', gold: 'bg-gold-100 text-gold-700', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-700', gray: 'bg-slate-100 text-slate-600' };
export const Badge = ({ tone = 'navy', className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTone }) => (
  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeTone[tone], className)} {...p} />
);

export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-navy-400" role="status">
    <Loader2 className="size-4 animate-spin" /> {label}
  </div>
);
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
    <div className="flex-1">{message}</div>
    {onRetry && (
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="rounded-xl border border-dashed border-navy-200 bg-white/60 p-10 text-center">
    <p className="font-medium text-navy-800">{title}</p>
    {children && <div className="mt-1 text-sm text-navy-500">{children}</div>}
  </div>
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-navy-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export const StatCard = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'gold' }) => (
  <div className={cn('rounded-xl border p-4 shadow-card', tone === 'gold' ? 'border-gold-200 bg-gold-50' : 'border-navy-100 bg-white')}>
    <p className="text-xs font-medium uppercase tracking-wide text-navy-400">{label}</p>
    <p className="tabular mt-1 text-2xl font-bold text-navy-900">{value}</p>
    {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
  </div>
);

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('whitespace-nowrap border-b border-navy-100 bg-navy-50/50 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-navy-500', className)} {...p} />;
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('border-b border-navy-50 px-3 py-2.5 align-middle', className)} {...p} />;

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border border-navy-100 bg-white p-1 shadow-card">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn('whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', value === t.id ? 'bg-navy-800 text-white' : 'text-navy-600 hover:bg-navy-50')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4 text-sm text-navy-500">
      <span>
        {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 tabular">
          Page {page} / {pages}
        </span>
        <Button variant="outline" size="sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={cn(wide && 'max-w-3xl')}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
            <h2 id="modal-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button aria-label="Close" onClick={onClose} className="rounded-md p-1 text-navy-400 hover:bg-navy-50">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Delete', onConfirm }: { open: boolean; onClose: () => void; title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => Promise<unknown> | unknown }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="text-sm text-navy-600">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-navy-700' : 'bg-navy-200')}>
      <span className={cn('absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}
