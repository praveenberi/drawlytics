import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api, qs, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Paged, Prediction } from '@/lib/types';
import { fmtDate, fmtDateTime, fmtNum } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Field, PageHeader, Pagination, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { Balls, LotteryPicker, PredictionDisclaimer } from '@/components/shared';
import type { Lottery } from '@/lib/types';
import { SHORT_NOTE } from '@/lib/types';

interface Info {
  formula: { id: string | null; name: string; version: number };
  primaryAlgorithm: string;
  algorithms: { type: string; weight: number }[];
  analysisPeriod: string;
  combinations: number;
}
const ALGO_NAME: Record<string, string> = { LONG_TERM_FREQUENCY: 'Long-term frequency', FREQUENCY: 'Frequency', RECENT_FREQUENCY: 'Recent frequency', HOT_COLD: 'Hot/cold', GAP: 'Gap analysis', PAIR_FREQUENCY: 'Pair frequency', ODD_EVEN: 'Odd/even balance', HIGH_LOW: 'High/low balance', RANDOM: 'Random component', WEIGHTED: 'Weighted combination' };

export default function Suggestions() {
  const { user, toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Prediction[]>([]);
  const [page, setPage] = useState(1);

  const lot = useFetch<Lottery>(lotteryId ? `/lotteries/${lotteryId}` : null);
  const info = useFetch<Info>(lotteryId ? `/suggestion-info/${lotteryId}` : null);
  const hist = useFetch<Paged<Prediction> & { summary: { evaluated: number; avgMatchedNumbers: number | null; avgMatchedBonus: number | null; bestMatch: number | null } }>(user && lotteryId ? `/predictions${qs({ lotteryId, page, pageSize: 10 })}` : null);
  const rules = lot.data?.rules;

  async function generate() {
    setBusy(true);
    try {
      const r = await api.post<{ items: Prediction[] }>('/predictions/generate', { lotteryId, count: count ? Number(count) : undefined });
      setResults(r.items);
      setPage(1);
      hist.reload();
      toast(`${r.items.length} suggestion${r.items.length === 1 ? '' : 's'} generated and saved`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not generate suggestions', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Number Suggestions" subtitle="Formula-based combinations built from historical results — a statistical experiment for entertainment, not a prediction." />
      <div className="mb-6"><PredictionDisclaimer /></div>

      <Card className="mb-6 p-4">
        <LotteryPicker value={lotteryId} onChange={(id) => { setSp(id ? { lottery: id } : {}, { replace: true }); setResults([]); }} />
        {info.data && (
          <div className="mt-4 rounded-lg bg-navy-50 p-3 text-sm">
            <p><span className="font-medium">Formula:</span> {info.data.formula.name}{info.data.formula.version ? ` v${info.data.formula.version}` : ''} · <span className="font-medium">History used:</span> {info.data.analysisPeriod}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {info.data.algorithms.map((a) => <Badge key={a.type} tone="navy">{ALGO_NAME[a.type] ?? a.type}{info.data!.primaryAlgorithm === 'WEIGHTED' ? ` ${a.weight}%` : ''}</Badge>)}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {user ? (
            <>
              <Field label="Combinations"><Select value={count} onChange={(e) => setCount(e.target.value)} className="w-56"><option value="">Formula default ({info.data?.combinations ?? 3})</option>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
              <Button variant="gold" loading={busy} disabled={!lotteryId} onClick={generate}><Sparkles className="size-4" /> Generate Suggested Numbers</Button>
            </>
          ) : (
            <p className="text-sm text-navy-600"><Link to="/login" className="font-semibold text-navy-900 underline decoration-gold-400">Sign in</Link> or <Link to="/register" className="font-semibold text-navy-900 underline decoration-gold-400">create a free account</Link> to generate and save suggestions.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-navy-500" role="note">{SHORT_NOTE}</p>
      </Card>

      {busy && <Spinner label="Generating…" />}
      {results.length > 0 && rules && (
        <div className="mb-8 space-y-4">
          <h2 className="text-lg font-semibold">Your suggestions</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((p, i) => (
              <Card key={p.id} className="p-5 fade-in">
                <div className="mb-3 flex items-center justify-between"><p className="font-semibold text-navy-900">Suggested combination {i + 1}</p><Badge tone="gold">Experiment</Badge></div>
                <Balls main={p.suggestedNumbers} bonus={p.bonusNumbers} rules={rules} size="lg" />
                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-navy-400">Formula</dt><dd>{p.formula.name}{p.formula.version ? ` v${p.formula.version}` : ''}</dd>
                  <dt className="text-navy-400">Analysis period</dt><dd>{p.analysisPeriod}</dd>
                  <dt className="text-navy-400">Generated</dt><dd>{fmtDateTime(p.generatedAt)}</dd>
                  <dt className="text-navy-400">For draw</dt><dd>{p.targetDrawDate ? fmtDate(p.targetDrawDate) : 'next draw'}</dd>
                  <dt className="text-navy-400">Reference ID</dt><dd className="tabular font-mono">{p.referenceId}</dd>
                </dl>
              </Card>
            ))}
          </div>
          <PredictionDisclaimer />
        </div>
      )}

      {user && lotteryId && (
        <Card>
          <CardHeader title="My prediction history" description="Suggestions are compared automatically once the next result is published." />
          {hist.data && hist.data.summary.evaluated > 0 && (
            <div className="grid grid-cols-3 gap-px border-b border-navy-50 bg-navy-50 text-center text-sm">
              <div className="bg-white p-3"><p className="text-xs text-navy-400">Evaluated</p><p className="font-semibold">{hist.data.summary.evaluated}</p></div>
              <div className="bg-white p-3"><p className="text-xs text-navy-400">Avg main matches</p><p className="font-semibold">{fmtNum(hist.data.summary.avgMatchedNumbers)}</p></div>
              <div className="bg-white p-3"><p className="text-xs text-navy-400">Best match</p><p className="font-semibold">{hist.data.summary.bestMatch ?? '—'}</p></div>
            </div>
          )}
          {hist.loading && !hist.data ? <Spinner /> : hist.error ? <div className="p-4"><ErrorBox message={hist.error} /></div> : hist.data && hist.data.items.length === 0 ? <div className="p-6"><Empty title="No suggestions yet for this lottery" /></div> : hist.data && rules && (
            <>
              <Table>
                <thead><tr><Th>Reference</Th><Th>Suggested</Th><Th>Formula</Th><Th>Generated</Th><Th>Status</Th><Th>Actual result</Th></tr></thead>
                <tbody>
                  {hist.data.items.map((p) => (
                    <tr key={p.id}>
                      <Td className="tabular whitespace-nowrap font-mono text-xs">{p.referenceId}</Td>
                      <Td><Balls main={p.suggestedNumbers} bonus={p.bonusNumbers} rules={rules} size="sm" /></Td>
                      <Td className="whitespace-nowrap text-xs">{p.formula.name}{p.formula.version ? ` v${p.formula.version}` : ''}</Td>
                      <Td className="whitespace-nowrap text-xs text-navy-500">{fmtDateTime(p.generatedAt)}</Td>
                      <Td>{p.performanceStatus === 'EVALUATED' ? <Badge tone="green">{p.matchedNumbers} main{rules.bonus ? ` · ${p.matchedBonus} bonus` : ''}</Badge> : <Badge tone="gray">Pending</Badge>}</Td>
                      <Td>{p.actual ? <div className="space-y-1"><Balls main={p.actual.mainNumbers} bonus={p.actual.bonusNumbers} rules={rules} size="sm" /><p className="text-xs text-navy-400">{fmtDate(p.actual.drawDate)}</p></div> : <span className="text-xs text-navy-300">awaiting draw</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="px-4 pb-4"><Pagination page={hist.data.page} pageSize={hist.data.pageSize} total={hist.data.total} onPage={setPage} /></div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
