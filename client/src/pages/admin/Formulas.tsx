import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FlaskConical, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { api, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Formula, FormulaConfig, Lottery } from '@/lib/types';
import { fmtDateTime, fmtNum } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table, Td, Th, Toggle } from '@/components/ui';
import { InfoNote, LotteryPicker } from '@/components/shared';

const NAMES: Record<string, string> = { LONG_TERM_FREQUENCY: 'Long-term historical frequency', FREQUENCY: 'Frequency-based', RECENT_FREQUENCY: 'Recent draw frequency', HOT_COLD: 'Hot & cold numbers', GAP: 'Number gap analysis', PAIR_FREQUENCY: 'Pair frequency analysis', ODD_EVEN: 'Odd/even balancing', HIGH_LOW: 'High/low balancing', RANDOM: 'Random number generation' };
interface Test { drawsAvailable: number; tested: number; combosPerDraw: number; avgMain: number; avgBonus: number; baselineAvgMain: number; baselineAvgBonus: number; expectedByChance: number; bestMain: number; distribution: { matches: number; count: number; baselineCount: number }[]; note: string }
interface Meta { types: string[]; catalog: { type: string; name: string; description: string }[]; defaultConfig: FormulaConfig }

const list = (s: string) => s.split(/[\s,;]+/).filter(Boolean).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
const optInt = (s: string) => (s.trim() === '' ? null : parseInt(s, 10));

export default function AdminFormulas() {
  const { toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const lot = useFetch<Lottery>(lotteryId ? `/lotteries/${lotteryId}` : null);
  const meta = useFetch<Meta>('/admin/algorithm-types');
  const algos = useFetch<{ items: { algorithmType: string; status: string }[] }>('/admin/algorithms');
  const formulas = useFetch<{ items: Formula[] }>(lotteryId ? `/admin/formulas?lotteryId=${lotteryId}` : null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('Custom formula');
  const [cfg, setCfg] = useState<FormulaConfig | null>(null);
  const [busy, setBusy] = useState('');
  const [errs, setErrs] = useState<string[]>([]);
  const [test, setTest] = useState<Test | null>(null);
  const [lastN, setLastN] = useState(50);
  const [deleting, setDeleting] = useState<Formula | null>(null);

  useEffect(() => { if (meta.data && !cfg) setCfg(meta.data.defaultConfig); }, [meta.data, cfg]);
  useEffect(() => { setEditingId(null); setTest(null); if (meta.data) setCfg(meta.data.defaultConfig); }, [lotteryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const disabledGlobal = new Set(algos.data?.items.filter((a) => a.status === 'INACTIVE').map((a) => a.algorithmType));
  const editing = formulas.data?.items.find((f) => f.id === editingId) ?? null;
  const r = lot.data?.rules;

  if (!cfg || !meta.data) return meta.error ? <ErrorBox message={meta.error} /> : <Spinner />;
  const set = (patch: Partial<FormulaConfig>) => setCfg({ ...cfg, ...patch });
  const comp = (type: string) => cfg.algorithms.find((a) => a.type === type) ?? { type, enabled: false, weight: 0 };
  const setComp = (type: string, patch: Partial<{ enabled: boolean; weight: number }>) => {
    const exists = cfg.algorithms.some((a) => a.type === type);
    set({ algorithms: exists ? cfg.algorithms.map((a) => (a.type === type ? { ...a, ...patch } : a)) : [...cfg.algorithms, { ...comp(type), ...patch }] });
  };
  const total = cfg.algorithms.filter((a) => a.enabled).reduce((s, a) => s + a.weight, 0);
  const normalise = () => { if (total > 0) set({ algorithms: cfg.algorithms.map((a) => (a.enabled ? { ...a, weight: Math.round((a.weight / total) * 1000) / 10 } : a)) }); };

  const call = async (kind: string, fn: () => Promise<unknown>) => {
    setBusy(kind); setErrs([]);
    try { await fn(); } catch (e) {
      const d = (e as { details?: { message: string }[] }).details;
      setErrs(d?.length ? d.map((x) => x.message) : [(e as Error).message]);
    } finally { setBusy(''); }
  };
  const loadFormula = (f: Formula) => { setEditingId(f.id); setName(f.formulaName); setCfg(f.formulaConfig); setTest(null); setErrs([]); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const newDraft = () => { setEditingId(null); setName('Custom formula'); setCfg(meta.data!.defaultConfig); setTest(null); setErrs([]); };

  const saveNew = (activate: boolean, formulaName = name) => call('save', async () => {
    const f = await api.post<Formula>('/admin/formulas', { lotteryId, formulaName, formulaConfig: cfg, activate });
    toast(`Saved ${f.formulaName} v${f.version}${activate ? ' and activated' : ''}`);
    setEditingId(f.id); setName(f.formulaName); formulas.reload();
  });
  const update = () => call('update', async () => { await api.put(`/admin/formulas/${editingId}`, { formulaName: name, formulaConfig: cfg }); toast('Formula updated'); formulas.reload(); });
  const runTest = () => call('test', async () => { setTest(await api.post<Test>('/admin/formulas/test', { lotteryId, formulaConfig: cfg, lastN })); });
  const toggle = async (f: Formula) => { try { await api.post(`/admin/formulas/${f.id}/activate`, { active: !f.isActive }); toast(f.isActive ? 'Formula deactivated' : 'Formula activated'); formulas.reload(); } catch (e) { toast((e as Error).message, 'error'); } };

  const single = cfg.primaryAlgorithm !== 'WEIGHTED';
  const hasPreds = (editing?.predictionCount ?? 0) > 0;

  return (
    <>
      <PageHeader title="Prediction Formulas" subtitle="Configure how number suggestions are produced for each lottery. Save multiple versions, activate one, and test it against history." />
      <div className="mb-6"><InfoNote>Suggestions are statistical experiments. Use “Test against history” to compare a formula with a plain random baseline — in a fair lottery no formula is expected to beat chance.</InfoNote></div>
      <Card className="mb-6 p-4"><LotteryPicker includeInactive value={lotteryId} onChange={(id) => setSp(id ? { lottery: id } : {}, { replace: true })} /></Card>

      {lotteryId && (
        <>
          <Card className="mb-6">
            <CardHeader title="Saved formulas" actions={<Button size="sm" variant="outline" onClick={newDraft}><Plus className="size-4" /> New draft</Button>} />
            {formulas.loading && !formulas.data ? <Spinner /> : formulas.error ? <div className="p-4"><ErrorBox message={formulas.error} /></div> : formulas.data?.items.length === 0 ? <div className="p-6"><Empty title="No formulas yet">The default weighted formula is used until you save and activate one.</Empty></div> : (
              <Table><thead><tr><Th>Name</Th><Th>Version</Th><Th>Status</Th><Th>Predictions</Th><Th>Created</Th><Th className="text-right">Actions</Th></tr></thead><tbody>
                {formulas.data?.items.map((f) => (
                  <tr key={f.id} className={f.id === editingId ? 'bg-gold-50' : ''}>
                    <Td className="font-medium">{f.formulaName}</Td><Td>v{f.version}</Td>
                    <Td><Badge tone={f.isActive ? 'green' : 'gray'}>{f.isActive ? 'Active' : 'Inactive'}</Badge></Td>
                    <Td className="tabular">{f.predictionCount}</Td><Td className="whitespace-nowrap text-xs text-navy-500">{fmtDateTime(f.createdAt)}<br />{f.createdBy}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" title={f.isActive ? 'Deactivate' : 'Activate'} aria-label="Toggle active" onClick={() => toggle(f)}><Power className={`size-4 ${f.isActive ? 'text-emerald-600' : ''}`} /></Button>
                      <Button size="sm" variant="ghost" aria-label="Load in editor" onClick={() => loadFormula(f)}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDeleting(f)}><Trash2 className="size-4" /></Button>
                    </Td>
                  </tr>
                ))}</tbody></Table>
            )}
          </Card>

          <Card className="mb-6">
            <CardHeader title={editing ? `Editing: ${editing.formulaName} v${editing.version}` : 'Formula editor (new draft)'} description="Configure algorithms, weights, periods and constraints." />
            <div className="space-y-6 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Formula name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
                <Field label="Algorithm mode" hint="Weighted blends all enabled algorithms; or run just one.">
                  <Select value={cfg.primaryAlgorithm} onChange={(e) => set({ primaryAlgorithm: e.target.value })}>
                    <option value="WEIGHTED">Weighted combination</option>
                    {meta.data.types.filter((t) => t !== 'WEIGHTED').map((t) => <option key={t} value={t}>{NAMES[t]} only</option>)}
                  </Select>
                </Field>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Algorithms &amp; weights</p>
                  {!single && <div className="flex items-center gap-2 text-xs"><span className={Math.abs(total - 100) < 0.5 ? 'text-emerald-700' : 'text-gold-700'}>Total weight: {fmtNum(total, 1)}</span><Button size="sm" variant="outline" onClick={normalise}>Normalise to 100</Button></div>}</div>
                <div className={`divide-y divide-navy-50 rounded-lg border border-navy-100 ${single ? 'opacity-50' : ''}`}>
                  {meta.data.types.filter((t) => t !== 'WEIGHTED').map((t) => {
                    const c = comp(t);
                    const off = disabledGlobal.has(t);
                    return (
                      <div key={t} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <Toggle label={`Enable ${NAMES[t]}`} checked={c.enabled && !off} disabled={off || single} onChange={(v) => setComp(t, { enabled: v })} />
                        <div className="min-w-[12rem] flex-1 text-sm"><span className="font-medium">{NAMES[t]}</span>{off && <Badge tone="red" className="ml-2">disabled globally</Badge>}<p className="text-xs text-navy-400">{meta.data!.catalog.find((a) => a.type === t)?.description}</p></div>
                        <input type="range" min={0} max={100} value={c.weight} disabled={!c.enabled || single} onChange={(e) => setComp(t, { weight: Number(e.target.value) })} aria-label={`${NAMES[t]} weight`} className="w-40 accent-navy-700" />
                        <Input type="number" min={0} max={100} className="h-8 w-20" disabled={!c.enabled || single} value={c.weight} onChange={(e) => setComp(t, { weight: Math.max(0, Math.min(100, Number(e.target.value))) })} aria-label={`${NAMES[t]} weight value`} />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Analysis period (draws)" hint="Empty = all stored draws"><Input type="number" min={5} value={cfg.periods.analysisDraws ?? ''} onChange={(e) => set({ periods: { ...cfg.periods, analysisDraws: optInt(e.target.value) } })} /></Field>
                <Field label="Recent frequency window"><Input type="number" min={1} value={cfg.periods.recentDraws} onChange={(e) => set({ periods: { ...cfg.periods, recentDraws: Number(e.target.value) || 1 } })} /></Field>
                <Field label="Frequency window" hint="Empty = all"><Input type="number" min={1} value={cfg.periods.frequencyDraws ?? ''} onChange={(e) => set({ periods: { ...cfg.periods, frequencyDraws: optInt(e.target.value) } })} /></Field>
                <Field label="Hot/cold window"><Input type="number" min={1} value={cfg.periods.hotColdDraws} onChange={(e) => set({ periods: { ...cfg.periods, hotColdDraws: Number(e.target.value) || 1 } })} /></Field>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="Hot/cold preference"><Select value={cfg.hotColdMode} onChange={(e) => set({ hotColdMode: e.target.value as 'hot' | 'cold' })}><option value="hot">Favour hot numbers</option><option value="cold">Favour cold numbers</option></Select></Field>
                <Field label="Combinations per request" hint="1–20"><Input type="number" min={1} max={20} value={cfg.combinations} onChange={(e) => set({ combinations: Number(e.target.value) || 1 })} /></Field>
                <Field label="Sharpness" hint="<1 flatter, >1 favours top scores"><Input type="number" step="0.25" min={0.25} max={4} value={cfg.sharpness} onChange={(e) => set({ sharpness: Number(e.target.value) || 1 })} /></Field>
                <Field label="Bonus number rule"><Select value={cfg.bonus.strategy} onChange={(e) => set({ bonus: { ...cfg.bonus, strategy: e.target.value as FormulaConfig['bonus']['strategy'] } })} disabled={!r?.bonus}><option value="RANDOM">Random</option><option value="FREQUENCY">By frequency</option><option value="HOT">Hot</option><option value="COLD">Cold</option><option value="GAP">By gap</option></Select></Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <fieldset className="rounded-lg border border-navy-100 p-3"><legend className="px-1 text-sm font-semibold">Odd / even preference</legend>
                  <div className="grid grid-cols-3 items-end gap-3"><Field label="Min odd"><Input type="number" min={0} placeholder="auto" value={cfg.oddEven.minOdd ?? ''} onChange={(e) => set({ oddEven: { ...cfg.oddEven, minOdd: optInt(e.target.value) } })} /></Field><Field label="Max odd"><Input type="number" min={0} placeholder="auto" value={cfg.oddEven.maxOdd ?? ''} onChange={(e) => set({ oddEven: { ...cfg.oddEven, maxOdd: optInt(e.target.value) } })} /></Field><label className="flex items-center gap-2 pb-2 text-sm"><Toggle label="Enforce odd/even" checked={cfg.oddEven.enforce} onChange={(v) => set({ oddEven: { ...cfg.oddEven, enforce: v } })} /> Enforce</label></div></fieldset>
                <fieldset className="rounded-lg border border-navy-100 p-3"><legend className="px-1 text-sm font-semibold">High / low distribution</legend>
                  <div className="grid grid-cols-3 items-end gap-3"><Field label="Min high"><Input type="number" min={0} placeholder="auto" value={cfg.highLow.minHigh ?? ''} onChange={(e) => set({ highLow: { ...cfg.highLow, minHigh: optInt(e.target.value) } })} /></Field><Field label="Max high"><Input type="number" min={0} placeholder="auto" value={cfg.highLow.maxHigh ?? ''} onChange={(e) => set({ highLow: { ...cfg.highLow, maxHigh: optInt(e.target.value) } })} /></Field><label className="flex items-center gap-2 pb-2 text-sm"><Toggle label="Enforce high/low" checked={cfg.highLow.enforce} onChange={(v) => set({ highLow: { ...cfg.highLow, enforce: v } })} /> Enforce</label></div></fieldset>
              </div>

              <fieldset className="rounded-lg border border-navy-100 p-3"><legend className="px-1 text-sm font-semibold">Number constraints {r && <span className="font-normal text-navy-400">(lottery range {r.minNumber}–{r.maxNumber})</span>}</legend>
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Minimum number"><Input type="number" placeholder={String(r?.minNumber ?? '')} value={cfg.constraints.minNumber ?? ''} onChange={(e) => set({ constraints: { ...cfg.constraints, minNumber: optInt(e.target.value) } })} /></Field>
                  <Field label="Maximum number"><Input type="number" placeholder={String(r?.maxNumber ?? '')} value={cfg.constraints.maxNumber ?? ''} onChange={(e) => set({ constraints: { ...cfg.constraints, maxNumber: optInt(e.target.value) } })} /></Field>
                  <Field label="Always exclude" hint="comma separated"><Input defaultValue={cfg.constraints.exclude.join(', ')} key={'ex' + editingId} onBlur={(e) => set({ constraints: { ...cfg.constraints, exclude: list(e.target.value) } })} /></Field>
                  <Field label="Must include" hint="comma separated"><Input defaultValue={cfg.constraints.include.join(', ')} key={'in' + editingId} onBlur={(e) => set({ constraints: { ...cfg.constraints, include: list(e.target.value) } })} /></Field>
                </div>
              </fieldset>

              {errs.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-600" role="alert">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
              <div className="flex flex-wrap items-center gap-2 border-t border-navy-50 pt-4">
                {editing && <Button variant="primary" loading={busy === 'update'} disabled={hasPreds} title={hasPreds ? 'Predictions already use this version – save a new version instead' : ''} onClick={update}>Save changes</Button>}
                {editing && <Button variant="gold" loading={busy === 'save'} onClick={() => saveNew(false, editing.formulaName)}>Save as new version (v{Math.max(...(formulas.data?.items.filter((f) => f.formulaName === editing.formulaName).map((f) => f.version) ?? [0])) + 1})</Button>}
                <Button variant={editing ? 'outline' : 'gold'} loading={busy === 'save'} onClick={() => saveNew(false)}>{editing ? 'Save as new formula' : 'Save formula'}</Button>
                <Button variant="outline" loading={busy === 'save'} onClick={() => saveNew(true)}>Save &amp; activate</Button>
                <span className="ml-auto flex items-center gap-2"><Select className="h-10 w-36" value={lastN} onChange={(e) => setLastN(Number(e.target.value))} aria-label="Draws to test"><option value={20}>Last 20 draws</option><option value={50}>Last 50 draws</option><option value={100}>Last 100 draws</option><option value={200}>Last 200 draws</option></Select>
                  <Button variant="outline" loading={busy === 'test'} onClick={runTest}><FlaskConical className="size-4" /> Test against history</Button></span>
              </div>
              {hasPreds && <p className="text-xs text-gold-700">This version already has {editing!.predictionCount} prediction(s), so it is locked. Save as a new version to keep performance history accurate.</p>}
            </div>
          </Card>

          {test && (
            <Card className="mb-6 fade-in">
              <CardHeader title="Back-test result" description={`Walk-forward test over ${test.tested} draws (${test.drawsAvailable} available), ${test.combosPerDraw} combination(s) per draw.`} />
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[['This formula — avg main matches', fmtNum(test.avgMain, 3)], ['Random baseline', fmtNum(test.baselineAvgMain, 3)], ['Expected by pure chance', fmtNum(test.expectedByChance, 3)], ['Best single match', test.bestMain]].map(([l, v]) => <div key={l as string} className="rounded-lg border border-navy-100 p-3"><p className="text-xs text-navy-400">{l}</p><p className="text-xl font-bold">{v}</p></div>)}
                </div>
                <div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={test.distribution.map((d) => ({ ...d, label: `${d.matches} matched` }))} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="count" name="This formula" fill="#22335f" radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="baselineCount" name="Random baseline" fill="#e2b52c" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
                <InfoNote>{test.note} Bonus matches — formula {fmtNum(test.avgBonus, 3)} vs random {fmtNum(test.baselineAvgBonus, 3)}.</InfoNote>
              </div>
            </Card>
          )}
        </>
      )}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={`Delete ${deleting?.formulaName} v${deleting?.version}?`} message="Predictions generated with this version are kept but will no longer be linked to a formula." onConfirm={async () => { try { await api.del(`/admin/formulas/${deleting!.id}`); toast('Formula deleted'); if (editingId === deleting!.id) newDraft(); formulas.reload(); } catch (e) { toast((e as Error).message, 'error'); } }} />
    </>
  );
}
