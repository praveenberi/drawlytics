import { useState } from 'react';
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Game, GameInput } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Empty } from '@/components/ui/misc';
import { ConfirmDialog, InfoNote, PageHeader } from '@/components/common';
import { validateGame } from '@/lib/validation';
import { cn, fmtDate, nextDrawDates, WEEKDAYS } from '@/lib/utils';

const BLANK: GameInput = {
  name: '',
  country: '',
  provider: '',
  min_number: 1,
  max_number: 49,
  main_count: 6,
  bonus_count: 0,
  bonus_from_main_pool: false,
  bonus_min: 1,
  bonus_max: 10,
  draw_frequency: 'Weekly',
  draw_days: [],
  draw_time: '',
  rules: '',
  personal_notes: '',
};

const TEMPLATES: { label: string; game: Partial<GameInput> }[] = [
  { label: 'Singapore Toto', game: { name: 'Singapore Toto', country: 'Singapore', provider: 'Singapore Pools', min_number: 1, max_number: 49, main_count: 6, bonus_count: 1, bonus_from_main_pool: true, draw_frequency: 'Twice weekly', draw_days: [1, 4], draw_time: '18:30', rules: '6 numbers from 1–49 plus 1 additional number drawn from the same pool.' } },
  { label: 'Powerball (US)', game: { name: 'Powerball', country: 'United States', provider: 'Multi-State Lottery Association', min_number: 1, max_number: 69, main_count: 5, bonus_count: 1, bonus_from_main_pool: false, bonus_min: 1, bonus_max: 26, draw_frequency: 'Three times weekly', draw_days: [1, 3, 6], rules: '5 numbers from 1–69 plus 1 Powerball from 1–26 (current format).' } },
  { label: 'EuroMillions', game: { name: 'EuroMillions', country: 'Europe', provider: 'EuroMillions consortium', min_number: 1, max_number: 50, main_count: 5, bonus_count: 2, bonus_from_main_pool: false, bonus_min: 1, bonus_max: 12, draw_frequency: 'Twice weekly', draw_days: [2, 5], rules: '5 numbers from 1–50 plus 2 Lucky Stars from 1–12 (current format).' } },
  { label: 'Mega Millions', game: { name: 'Mega Millions', country: 'United States', provider: 'Mega Millions consortium', min_number: 1, max_number: 70, main_count: 5, bonus_count: 1, bonus_from_main_pool: false, bonus_min: 1, bonus_max: 24, draw_frequency: 'Twice weekly', draw_days: [2, 5], rules: '5 numbers from 1–70 plus 1 Mega Ball from 1–24 (format changed in April 2025; older draws used different ranges).' } },
  { label: 'UK Lotto', game: { name: 'UK National Lottery Lotto', country: 'United Kingdom', provider: 'Allwyn', min_number: 1, max_number: 59, main_count: 6, bonus_count: 1, bonus_from_main_pool: true, draw_frequency: 'Twice weekly', draw_days: [3, 6], rules: '6 numbers from 1–59 plus 1 bonus ball from the same pool.' } },
];

const FREQUENCIES = ['Daily', 'Weekly', 'Twice weekly', 'Three times weekly', 'Monthly', 'Irregular'];

function GameForm({ initial, onDone }: { initial: Game | null; onDone: () => void }) {
  const { saveGame, data } = useApp();
  const [g, setG] = useState<GameInput>(initial ? { ...initial } : { ...BLANK });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const drawCount = initial ? data.draws.filter((d) => d.game_id === initial.id).length : 0;
  const set = <K extends keyof GameInput>(k: K, v: GameInput[K]) => setG((p) => ({ ...p, [k]: v }));
  const num = (k: 'min_number' | 'max_number' | 'main_count' | 'bonus_count' | 'bonus_min' | 'bonus_max') => ({
    type: 'number' as const,
    value: Number.isNaN(g[k]) ? '' : g[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? NaN : parseInt(e.target.value, 10)),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateGame(g);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    const saved = await saveGame({ ...g, name: g.name.trim(), bonus_min: g.bonus_count ? g.bonus_min : 1, bonus_max: g.bonus_count ? g.bonus_max : 1 });
    setBusy(false);
    if (saved) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!initial && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Start from a template (optional)</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Button key={t.label} type="button" size="sm" variant="outline" onClick={() => setG({ ...BLANK, ...t.game } as GameInput)}>
                {t.label}
              </Button>
            ))}
          </div>
          <InfoNote>Templates only fill in the game format. Formats change over time — always check the rules with the official provider.</InfoNote>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lottery name *" className="sm:col-span-2">
          <Input value={g.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Singapore Toto" autoFocus />
        </Field>
        <Field label="Country">
          <Input value={g.country} onChange={(e) => set('country', e.target.value)} />
        </Field>
        <Field label="Lottery provider">
          <Input value={g.provider} onChange={(e) => set('provider', e.target.value)} />
        </Field>
        <Field label="Lowest number">
          <Input {...num('min_number')} />
        </Field>
        <Field label="Highest number">
          <Input {...num('max_number')} />
        </Field>
        <Field label="Main numbers drawn">
          <Input min={1} {...num('main_count')} />
        </Field>
        <Field label="Bonus / supplementary numbers">
          <Input min={0} {...num('bonus_count')} />
        </Field>
      </div>

      {g.bonus_count > 0 && (
        <div className="space-y-3 rounded-md border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={g.bonus_from_main_pool} onChange={(e) => set('bonus_from_main_pool', e.target.checked)} />
            Bonus numbers come from the same pool as the main numbers (e.g. Toto additional number)
          </label>
          {!g.bonus_from_main_pool && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bonus lowest number">
                <Input {...num('bonus_min')} />
              </Field>
              <Field label="Bonus highest number">
                <Input {...num('bonus_max')} />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Draw frequency">
          <Select value={g.draw_frequency} onChange={(e) => set('draw_frequency', e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field label="Usual draw time (optional)">
          <Input type="time" value={g.draw_time} onChange={(e) => set('draw_time', e.target.value)} />
        </Field>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Draw days</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const on = g.draw_days.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set('draw_days', on ? g.draw_days.filter((x) => x !== i) : [...g.draw_days, i].sort())}
                className={cn('rounded-md border px-3 py-1.5 text-sm', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              >
                {d}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Used to show upcoming draw dates on the dashboard.</p>
      </div>
      <Field label="Additional rules">
        <Textarea value={g.rules} onChange={(e) => set('rules', e.target.value)} placeholder="Prize tiers, format changes, special rules…" />
      </Field>

      {initial && drawCount > 0 && <InfoNote>This game has {drawCount} stored draws. Changing the number format does not rewrite them; edit or re-import draws that no longer fit.</InfoNote>}
      {errors.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {initial ? 'Save changes' : 'Create game'}
        </Button>
      </div>
    </form>
  );
}

function NotesDialog({ game, onClose }: { game: Game; onClose: () => void }) {
  const { saveGame } = useApp();
  const [text, setText] = useState(game.personal_notes);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Notes – ${game.name}`} description="Private notes about this lottery game.">
        <div className="space-y-3">
          <Textarea className="min-h-[180px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Observations, rule changes, reminders…" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const { id, created_at, ...rest } = game;
                if (await saveGame({ ...rest, id, personal_notes: text })) onClose();
              }}
            >
              Save notes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Games() {
  const { data, deleteGame, setGameId, game: selected, toast } = useApp();
  const [editing, setEditing] = useState<Game | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Game | null>(null);
  const [notes, setNotes] = useState<Game | null>(null);

  return (
    <>
      <PageHeader
        title="Lottery Games"
        description="Define any lottery format — number range, count, bonus numbers and draw schedule. Nothing is hardcoded."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Add game
          </Button>
        }
      />
      {data.games.length === 0 ? (
        <Empty title="No lottery games yet">
          <p>Add your first game to start recording results.</p>
          <Button className="mt-3" onClick={() => setEditing('new')}>
            <Plus /> Add game
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.games.map((g) => {
            const count = data.draws.filter((d) => d.game_id === g.id).length;
            const next = nextDrawDates(g, 1)[0];
            return (
              <Card key={g.id} className={cn(selected?.id === g.id && 'ring-2 ring-primary/40')}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>{g.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{[g.country, g.provider].filter(Boolean).join(' · ') || 'No provider set'}</p>
                  </div>
                  {selected?.id === g.id ? <Badge>Selected</Badge> : <Button size="sm" variant="outline" onClick={() => { setGameId(g.id); toast(`${g.name} selected`); }}>Select</Button>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="muted">
                      {g.main_count} from {g.min_number}–{g.max_number}
                    </Badge>
                    {g.bonus_count > 0 && <Badge variant="blue">{g.bonus_count} bonus {g.bonus_from_main_pool ? '(same pool)' : `from ${g.bonus_min}–${g.bonus_max}`}</Badge>}
                    <Badge variant="muted">{g.draw_frequency}</Badge>
                    {g.draw_days.length > 0 && <Badge variant="muted">{g.draw_days.map((d) => WEEKDAYS[d]).join(', ')}{g.draw_time && ` · ${g.draw_time}`}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {count} draws recorded{next && <> · next draw {fmtDate(next)}</>}
                  </p>
                  {g.rules && <p className="line-clamp-3 text-sm">{g.rules}</p>}
                  {g.personal_notes && <p className="line-clamp-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">{g.personal_notes}</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setEditing(g)}>
                      <Pencil /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNotes(g)}>
                      <NotebookPen /> Notes
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(g)}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'Add lottery game' : 'Edit lottery game'} className="max-w-2xl">
          {editing !== null && <GameForm initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      {notes && <NotesDialog game={notes} onClose={() => setNotes(null)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'game'}?`}
        message={
          <>
            This permanently deletes the game together with its{' '}
            <strong>{deleting ? data.draws.filter((d) => d.game_id === deleting.id).length : 0} draws</strong>, generated combinations and favourites. This cannot be undone — consider downloading a backup first.
          </>
        }
        onConfirm={async () => {
          if (deleting && (await deleteGame(deleting.id))) toast('Game deleted');
        }}
      />
    </>
  );
}
