import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GitCompare, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { SOURCE_LABEL, type DataSource, type Draw, type DrawInput, type Game } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, Empty, Table, Td, Th } from '@/components/ui/misc';
import { Balls, NumberBall } from '@/components/NumberBall';
import { ConfirmDialog, PageHeader, Pagination } from '@/components/common';
import { compareDraws, sortChrono } from '@/lib/analysis';
import { findDuplicate, validateDraw } from '@/lib/validation';
import { fmtDate, fmtMoney, parseNumberList, todayISO } from '@/lib/utils';
import { Link } from 'react-router-dom';

function DrawForm({ game, initial, onDone }: { game: Game; initial: Draw | null; onDone: () => void }) {
  const { saveDraw, data } = useApp();
  const [num, setNum] = useState(initial?.draw_number ?? '');
  const [date, setDate] = useState(initial?.draw_date ?? todayISO());
  const [main, setMain] = useState(initial?.main_numbers.join(' ') ?? '');
  const [bonus, setBonus] = useState(initial?.bonus_numbers.join(' ') ?? '');
  const [jackpot, setJackpot] = useState(initial?.jackpot != null ? String(initial.jackpot) : '');
  const [winners, setWinners] = useState(initial?.winners != null ? String(initial.winners) : '');
  const [prize, setPrize] = useState(initial?.prize_details ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [source, setSource] = useState<DataSource>(initial?.source ?? 'manual');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: DrawInput = {
      id: initial?.id,
      game_id: game.id,
      draw_number: num.trim(),
      draw_date: date,
      main_numbers: parseNumberList(main),
      bonus_numbers: parseNumberList(bonus),
      jackpot: jackpot.trim() === '' ? null : Number(jackpot.replace(/,/g, '')),
      winners: winners.trim() === '' ? null : Number(winners),
      prize_details: prize.trim(),
      notes: notes.trim(),
      source,
    };
    const errs = validateDraw(game, input);
    const dup = findDuplicate(data.draws, game.id, input, initial?.id);
    if (dup) errs.push(dup.reason + '.');
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    const saved = await saveDraw(input);
    setBusy(false);
    if (saved) onDone();
  }

  const mainHint = `${game.main_count} different numbers, ${game.min_number}–${game.max_number}, separated by spaces or commas`;
  const bonusHint = game.bonus_from_main_pool ? `${game.bonus_count} number(s), ${game.min_number}–${game.max_number}, not one of the winning numbers` : `${game.bonus_count} number(s), ${game.bonus_min}–${game.bonus_max}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Draw ID / number" hint="Optional, but used to detect duplicates">
          <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. 4123" />
        </Field>
        <Field label="Draw date *">
          <Input type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Winning numbers *" hint={mainHint}>
        <Input value={main} onChange={(e) => setMain(e.target.value)} placeholder="3 11 18 27 34 46" inputMode="numeric" />
      </Field>
      {game.bonus_count > 0 && (
        <Field label="Bonus / supplementary numbers *" hint={bonusHint}>
          <Input value={bonus} onChange={(e) => setBonus(e.target.value)} inputMode="numeric" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jackpot amount">
          <Input type="number" min={0} step="any" value={jackpot} onChange={(e) => setJackpot(e.target.value)} />
        </Field>
        <Field label="Number of winners">
          <Input type="number" min={0} step={1} value={winners} onChange={(e) => setWinners(e.target.value)} />
        </Field>
      </div>
      <Field label="Prize details">
        <Textarea value={prize} onChange={(e) => setPrize(e.target.value)} className="min-h-[56px]" />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px]" />
      </Field>
      <Field label="Data source" hint="Mark where this result came from. Only mark 'External' if you copied it from an official source.">
        <Select value={source} onChange={(e) => setSource(e.target.value as DataSource)}>
          {(Object.keys(SOURCE_LABEL) as DataSource[]).map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </Field>
      {errors.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive" role="alert">
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
          {initial ? 'Save changes' : 'Add result'}
        </Button>
      </div>
    </form>
  );
}

function CompareDialog({ a, b, onClose }: { a: Draw; b: Draw; onClose: () => void }) {
  const c = compareDraws(a, b);
  const row = (d: Draw, label: string) => (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {label}: {d.draw_number ? `#${d.draw_number} · ` : ''}
        {fmtDate(d.draw_date)}
      </p>
      <span className="inline-flex flex-wrap gap-1">
        {d.main_numbers.map((n) => (
          <NumberBall key={n} n={n} muted={!(label === 'Draw A' ? c.onlyA : c.onlyB).includes(n) ? false : true} />
        ))}
        {d.bonus_numbers.map((n) => (
          <NumberBall key={'b' + n} n={n} bonus />
        ))}
      </span>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Compare draws" description="Numbers in green appear in both draws; grey numbers appear in only one.">
        <div className="space-y-4">
          {row(a, 'Draw A')}
          {row(b, 'Draw B')}
          <div className="grid gap-3 rounded-md bg-muted p-3 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Common main numbers:</span> <strong>{c.commonMain.length ? c.commonMain.join(', ') : 'none'}</strong> ({c.commonMain.length})
            </p>
            <p>
              <span className="text-muted-foreground">Common bonus numbers:</span> <strong>{c.commonBonus.length ? c.commonBonus.join(', ') : 'none'}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Only in A:</span> {c.onlyA.join(', ') || '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Only in B:</span> {c.onlyB.join(', ') || '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Sum A / B:</span> {c.sumA} / {c.sumB}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SortKey = 'draw_date' | 'draw_number' | 'jackpot';

export default function HistoryPage() {
  const { game, data, deleteDraws, updateSettings, toast } = useApp();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'draw_date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Draw | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Draw[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const pageSize = data.settings.page_size;

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [game?.id, q, from, to, sourceFilter, pageSize]);

  const all = useMemo(() => (game ? data.draws.filter((d) => d.game_id === game.id) : []), [data.draws, game]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter((d) => {
      if (from && d.draw_date < from) return false;
      if (to && d.draw_date > to) return false;
      if (sourceFilter && d.source !== sourceFilter) return false;
      if (term && !(d.draw_number.toLowerCase().includes(term) || d.draw_date.includes(term) || fmtDate(d.draw_date).toLowerCase().includes(term))) return false;
      return true;
    });
    const order = new Map(sortChrono(list).map((d, i) => [d.id, i])); // stable, date-aware base order
    const cmp = (a: Draw, b: Draw) => {
      if (sort.key === 'draw_date') return order.get(a.id)! - order.get(b.id)!;
      if (sort.key === 'jackpot') return (a.jackpot ?? -1) - (b.jackpot ?? -1);
      const na = parseFloat(a.draw_number);
      const nb = parseFloat(b.draw_number);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a.draw_number.localeCompare(b.draw_number);
    };
    const sorted = [...list].sort(cmp);
    return sort.dir === 'asc' ? sorted : sorted.reverse();
  }, [all, q, from, to, sourceFilter, sort]);

  if (!game) return <><PageHeader title="Winning History" /><Empty title="Add a lottery game first"><Button asChild className="mt-2"><Link to="/games">Go to Lottery Games</Link></Button></Empty></>;

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((d) => selected.includes(d.id));
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <Th>
      <button className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => toggleSort(k)}>
        {children}
        {sort.key === k && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </Th>
  );
  const picked = selected.map((id) => all.find((d) => d.id === id)).filter(Boolean) as Draw[];

  return (
    <>
      <PageHeader
        title="Winning History"
        description={`${game.name} · ${all.length} draws stored. Enter results manually or import them from CSV.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/csv">Import CSV</Link>
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus /> Add result
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search draw number or date" className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 4123 or 2024-05" />
            </div>
          </Field>
          <Field label="From date">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To date">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Data source">
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              {(Object.keys(SOURCE_LABEL) as DataSource[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {(selected.length > 0 || q || from || to || sourceFilter) && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{filtered.length} matching</span>
          {(q || from || to || sourceFilter) && (
            <Button size="sm" variant="ghost" onClick={() => { setQ(''); setFrom(''); setTo(''); setSourceFilter(''); }}>
              Clear filters
            </Button>
          )}
          {selected.length > 0 && (
            <>
              <Badge variant="blue">{selected.length} selected</Badge>
              <Button size="sm" variant="outline" disabled={selected.length !== 2} title="Select exactly two draws" onClick={() => setComparing(true)}>
                <GitCompare /> Compare
              </Button>
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleting(picked)}>
                <Trash2 /> Delete selected
              </Button>
            </>
          )}
        </div>
      )}

      {all.length === 0 ? (
        <Empty title="No results recorded yet">
          <p>Add a result manually or import a CSV file.</p>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-3">
            <Table>
              <thead>
                <tr>
                  <Th className="w-8">
                    <input type="checkbox" aria-label="Select all on page" className="size-4 accent-[hsl(var(--primary))]" checked={allOnPageSelected} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...pageRows.map((d) => d.id)])] : selected.filter((id) => !pageRows.some((d) => d.id === id)))} />
                  </Th>
                  <SortHead k="draw_number">Draw</SortHead>
                  <SortHead k="draw_date">Date</SortHead>
                  <Th>Numbers</Th>
                  <SortHead k="jackpot">Jackpot</SortHead>
                  <Th>Winners</Th>
                  <Th>Source</Th>
                  <Th className="no-print text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50">
                    <Td>
                      <input type="checkbox" aria-label={`Select draw ${d.draw_number || d.draw_date}`} className="size-4 accent-[hsl(var(--primary))]" checked={selected.includes(d.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, d.id] : selected.filter((x) => x !== d.id))} />
                    </Td>
                    <Td className="tabular whitespace-nowrap">{d.draw_number || '—'}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(d.draw_date)}</Td>
                    <Td>
                      <Balls main={d.main_numbers} bonus={d.bonus_numbers} size="sm" />
                    </Td>
                    <Td className="tabular">{fmtMoney(d.jackpot)}</Td>
                    <Td className="tabular">{d.winners ?? '—'}</Td>
                    <Td>
                      <Badge variant={d.source === 'manual' ? 'muted' : d.source === 'imported' ? 'blue' : 'default'}>{SOURCE_LABEL[d.source]}</Badge>
                    </Td>
                    <Td className="no-print whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon" aria-label="Edit draw" onClick={() => setEditing(d)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Delete draw" className="text-destructive" onClick={() => setDeleting([d])}>
                        <Trash2 />
                      </Button>
                    </Td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <Td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No draws match the current filters.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(s) => updateSettings({ page_size: s })} />
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === 'new' ? 'Add draw result' : 'Edit draw result'} description={game.name} className="max-w-xl">
          {editing !== null && <DrawForm game={game} initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      {comparing && picked.length === 2 && <CompareDialog a={picked[0]} b={picked[1]} onClose={() => setComparing(false)} />}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.length ?? 0} draw${(deleting?.length ?? 0) === 1 ? '' : 's'}?`}
        message="This permanently removes the selected results. Analysis will be recalculated without them."
        onConfirm={async () => {
          if (deleting && (await deleteDraws(deleting.map((d) => d.id)))) {
            toast(`${deleting.length} draw${deleting.length === 1 ? '' : 's'} deleted`);
            setSelected([]);
          }
        }}
      />
    </>
  );
}
