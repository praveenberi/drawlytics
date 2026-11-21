import { cn } from '@/lib/utils';

export function NumberBall({ n, bonus, size = 'md', muted }: { n: number; bonus?: boolean; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  return (
    <span
      title={bonus ? `Bonus ${n}` : `${n}`}
      className={cn(
        'tabular inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        size === 'sm' ? 'size-6 text-[11px]' : size === 'md' ? 'size-8 text-sm' : 'size-11 text-base',
        muted ? 'bg-muted text-foreground' : bonus ? 'bg-[hsl(var(--ball-bonus))]' : 'bg-[hsl(var(--ball-main))]',
      )}
    >
      {n}
    </span>
  );
}

export function Balls({ main, bonus, size }: { main: number[]; bonus?: number[]; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {main.map((n) => (
        <NumberBall key={'m' + n} n={n} size={size} />
      ))}
      {bonus && bonus.length > 0 && <span className="px-0.5 text-muted-foreground">+</span>}
      {bonus?.map((n) => (
        <NumberBall key={'b' + n} n={n} size={size} bonus />
      ))}
    </span>
  );
}
