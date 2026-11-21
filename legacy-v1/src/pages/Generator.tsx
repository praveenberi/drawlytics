import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Sparkles, Star, Trash2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';
import { Badge, Empty, Table, Td, Th } from '@/components/ui/misc';
import { Balls } from '@/components/NumberBall';
import { ConfirmDialog, Disclaimer, PageHeader } from '@/components/common';
import { PERIOD_OPTIONS, parsePeriod } from '@/lib/analysis';
import { STRATEGIES, generateCombinations, strategyLabel, type StrategyId } from '@/lib/generator';
import { exportGenerated } from '@/lib/exports';
import { fmtDateTime, sameSet } from '@/lib/utils';

export default function Generator() {
  const { game, data, addGenerated, clearGenerated, saveFavourite, deleteFavourite, toast } = useApp();
  const [count, setCount] = useState(5);
  const [period, setPeriod] = useState('all');
  const [strategy, setStrategy] = useState<StrategyId>('random');
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);

  const items = useMemo(() => (game ? data.generated.filter((g) => g.game_id === game.id) : []), [data.generated, game]);
  const drawCount = useMemo(() => (game ? data.draws.filter((d) => d.game_id === game.id).length : 0), [data.draws, game]);

  if (!game)
    return (
      <>
        <PageHeader title="Combination Generator" />
        <Empty title="Add a lottery game first">
          <Button asChild className="mt-2">
            <Link to="/games">Go to Lottery Games</Link>
          </Button>
        </Empty>
      </>
    );

  const strat = STRATEGIES.find((s) => s.id === strategy)!;
  const favFor = (g: { numbers: number[]; bonus: number[] }) => data.favourites.find((f) => f.game_id === game.id && sameSet(f.numbers, g.numbers) && sameSet(f.bonus, g.bonus));

  async function generate() {
    if (!game) return;
    const n = Math.max(1, Math.min(50, count || 1));
    setBusy(true);
    const out = generateCombinations({ game, draws: data.draws, strategy, count: n, period: parsePeriod(period), seed });
    const saved = await addGenerated(out);
    setBusy(false);
    if (saved) {
      setNewIds(saved.map((s) => s.id));
      toast(`${saved.length} combination${saved.length === 1 ? '' : 's'} generated`);
    }
  }

  return (
    <>
      <PageHeader
        title="Combination Generator"
        description={`${game.name} · generate statistical experiments from ${drawCount} stored draws.`}
        actions={
          <Button variant="outline" disabled={!items.length} onClick={() => exportGenerated(items, data.games)}>
            <Download /> Download CSV
          </Button>
        }
      />
      <div className="mb-4">
        <Disclaimer long />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Generate</CardTitle>
          <CardDescription>Choose a strategy and a historical period. Results are saved in the list below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Strategy">
              <Select value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyId)}>
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Historical analysis period">
              <Select value={period} onChange={(e) => setPeriod(e.target.value)} disabled={strategy === 'random'}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Combinations (1–50)">
              <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(parseInt(e.target.value, 10))} />
            </Field>
            <Field label="Seed (optional)" hint="Same seed + same data = same output">
              <Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="leave empty for random" />
            </Field>
          </div>
          <p className="rounded-md bg-muted p-3 text-sm">
            <strong>{strat.label}:</strong> {strat.description} <span className="text-muted-foreground">This is not a predictive method — it only changes how numbers are sampled.</span>
          </p>
          {drawCount === 0 && strategy !== 'random' && <p className="text-sm text-amber-700 dark:text-amber-300">No stored draws for this game: history-based strategies fall back to uniform weights.</p>}
          <Button onClick={generate} disabled={busy}>
            <Sparkles /> Generate combinations
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Generated combinations ({items.length})</CardTitle>
            <CardDescription>
              “Historical frequency score” = the average share of analysed draws in which each selected number appeared. It describes the past only.
            </CardDescription>
          </div>
          {items.length > 0 && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setClearing(true)}>
              <Trash2 /> Clear list
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <Empty title="Nothing generated yet" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Numbers</Th>
                  <Th>Strategy</Th>
                  <Th>Period</Th>
                  <Th>Freq. score</Th>
                  <Th>Generated</Th>
                  <Th className="text-right">Favourite</Th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 100).map((g) => {
                  const fav = favFor(g);
                  return (
                    <tr key={g.id} className={newIds.includes(g.id) ? 'bg-primary/5' : ''}>
                      <Td>
                        <Balls main={g.numbers} bonus={g.bonus} />
                      </Td>
                      <Td>
                        <Badge variant="blue">{strategyLabel(g.strategy)}</Badge>
                        {g.seed && <span className="ml-1 text-xs text-muted-foreground">seed “{g.seed}”</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{g.period}</Td>
                      <Td className="tabular">{g.score.toFixed(2)}%</Td>
                      <Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(g.created_at)}</Td>
                      <Td className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={fav ? 'Remove from favourites' : 'Save to favourites'}
                          aria-pressed={!!fav}
                          onClick={async () => {
                            if (fav) await deleteFavourite(fav.id);
                            else if (await saveFavourite({ game_id: game.id, numbers: g.numbers, bonus: g.bonus, strategy: g.strategy, label: '', note: '' })) toast('Saved to favourites');
                          }}
                        >
                          <Star className={fav ? 'fill-amber-400 text-amber-500' : ''} />
                        </Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {items.length > 100 && <p className="pt-2 text-xs text-muted-foreground">Showing the latest 100. The CSV download includes all {items.length}.</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear generated combinations?"
        confirmLabel="Clear"
        message={`This removes all generated combinations for ${game.name}. Saved favourites are not affected.`}
        onConfirm={async () => {
          if (await clearGenerated(game.id)) setNewIds([]);
        }}
      />
    </>
  );
}
