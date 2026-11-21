import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import type { Favourite, Game } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Badge, Empty, Table, Td, Th } from '@/components/ui/misc';
import { Balls } from '@/components/NumberBall';
import { ConfirmDialog, Disclaimer, PageHeader } from '@/components/common';
import { exportFavourites } from '@/lib/exports';
import { strategyLabel } from '@/lib/generator';
import { validateNumbers } from '@/lib/validation';
import { fmtDate, fmtDateTime, parseNumberList } from '@/lib/utils';

function FavForm({ game, initial, onDone }: { game: Game; initial: Favourite | null; onDone: () => void }) {
  const { saveFavourite } = useApp();
  const [main, setMain] = useState(initial?.numbers.join(' ') ?? '');
  const [bonus, setBonus] = useState(initial?.bonus.join(' ') ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const numbers = parseNumberList(main).sort((a, b) => a - b);
    const b = parseNumberList(bonus).sort((a, c) => a - c);
    const errs = validateNumbers(game, numbers, b);
    setErrors(errs);
    if (errs.length) return;
    if (await saveFavourite({ id: initial?.id, game_id: game.id, numbers, bonus: b, strategy: initial?.strategy ?? '', label: label.trim(), note: note.trim() })) onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Numbers" hint={`${game.main_count} different numbers, ${game.min_number}–${game.max_number}`}>
        <Input value={main} onChange={(e) => setMain(e.target.value)} disabled={!!initial} />
      </Field>
      {game.bonus_count > 0 && (
        <Field label="Bonus numbers" hint={`${game.bonus_count} number(s)`}>
          <Input value={bonus} onChange={(e) => setBonus(e.target.value)} disabled={!!initial} />
        </Field>
      )}
      <Field label="Label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Family birthdays" />
      </Field>
      <Field label="Note">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {errors.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

export default function Favourites() {
  const { data, game, deleteFavourite, toast } = useApp();
  const [editing, setEditing] = useState<Favourite | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Favourite | null>(null);

  const bestMatches = useMemo(() => {
    const out = new Map<string, { best: number; date: string; num: string; exact: number }>();
    for (const f of data.favourites) {
      let best = 0;
      let date = '';
      let num = '';
      let exact = 0;
      const set = new Set(f.numbers);
      for (const d of data.draws) {
        if (d.game_id !== f.game_id) continue;
        const m = d.main_numbers.filter((n) => set.has(n)).length;
        if (m === f.numbers.length && m === d.main_numbers.length) exact++;
        if (m > best || (m === best && d.draw_date > date)) {
          best = m;
          date = d.draw_date;
          num = d.draw_number;
        }
      }
      out.set(f.id, { best, date, num, exact });
    }
    return out;
  }, [data.favourites, data.draws]);

  const gameName = (id: string) => data.games.find((g) => g.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        title="My Favourites"
        description="Combinations you saved from the generator or entered yourself."
        actions={
          <>
            <Button variant="outline" disabled={!data.favourites.length} onClick={() => exportFavourites(data.favourites, data.games)}>
              <Download /> Download CSV
            </Button>
            <Button disabled={!game} onClick={() => setEditing('new')}>
              <Plus /> Add combination
            </Button>
          </>
        }
      />
      <div className="mb-4">
        <Disclaimer />
      </div>
      {data.favourites.length === 0 ? (
        <Empty title="No favourites yet">
          <p>Star a combination in the generator, or add your own numbers.</p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/generator">Open generator</Link>
          </Button>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <Table>
              <thead>
                <tr>
                  <Th>Numbers</Th>
                  <Th>Game</Th>
                  <Th>Label / note</Th>
                  <Th>Best past match</Th>
                  <Th>Saved</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.favourites.map((f) => {
                  const m = bestMatches.get(f.id)!;
                  return (
                    <tr key={f.id}>
                      <Td>
                        <Balls main={f.numbers} bonus={f.bonus} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        {gameName(f.game_id)}
                        <div>{f.strategy ? <Badge variant="blue">{strategyLabel(f.strategy)}</Badge> : <Badge variant="muted">Manual</Badge>}</div>
                      </Td>
                      <Td className="max-w-[16rem]">
                        <p className="font-medium">{f.label || '—'}</p>
                        {f.note && <p className="line-clamp-2 text-xs text-muted-foreground">{f.note}</p>}
                      </Td>
                      <Td className="whitespace-nowrap text-xs">
                        {m.best > 0 ? (
                          <>
                            <strong>
                              {m.best}/{f.numbers.length}
                            </strong>{' '}
                            on {m.num ? `#${m.num} · ` : ''}
                            {fmtDate(m.date)}
                            {m.exact > 0 && <span> · exact ×{m.exact}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">no history</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(f.created_at)}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="icon" aria-label="Edit favourite" onClick={() => setEditing(f)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete favourite" className="text-destructive" onClick={() => setDeleting(f)}>
                          <Trash2 />
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'Add favourite combination' : 'Edit favourite'} description={editing === 'new' ? game?.name : 'Numbers cannot be changed — delete and re-add instead.'}>
          {editing !== null && (editing === 'new' ? game : data.games.find((g) => g.id === editing.game_id)) && (
            <FavForm game={(editing === 'new' ? game : data.games.find((g) => g.id === editing.game_id))!} initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete favourite?"
        message="This combination will be removed from your favourites."
        onConfirm={async () => {
          if (deleting && (await deleteFavourite(deleting.id))) toast('Favourite deleted');
        }}
      />
    </>
  );
}
