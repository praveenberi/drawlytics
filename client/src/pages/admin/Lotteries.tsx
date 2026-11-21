import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, qs, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Category, Country, Frequency, Lottery, Paged, Rules } from '@/lib/types';
import { FREQ_LABEL, WEEKDAYS, cn, flag, rulesText } from '@/lib/utils';
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table, Td, Textarea, Th } from '@/components/ui';

const PRESETS: Record<string, { label: string; rules: Rules }> = {
  '6/49': { label: '6/49', rules: { format: '6/49', mainCount: 6, minNumber: 1, maxNumber: 49, allowDuplicates: false, ordered: false, padDigits: 2, bonus: null } },
  '6/49+1': { label: '6/49 + 1 bonus', rules: { format: '6/49 + 1 bonus', mainCount: 6, minNumber: 1, maxNumber: 49, allowDuplicates: false, ordered: false, padDigits: 2, bonus: { count: 1, minNumber: 1, maxNumber: 49, allowDuplicates: false, separatePool: false } } },
  '5/50+2': { label: '5/50 + 2 bonus', rules: { format: '5/50 + 2', mainCount: 5, minNumber: 1, maxNumber: 50, allowDuplicates: false, ordered: false, padDigits: 2, bonus: { count: 2, minNumber: 1, maxNumber: 12, allowDuplicates: false, separatePool: true } } },
  '4d': { label: '4-digit', rules: { format: '4-digit', mainCount: 4, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0, bonus: null } },
  '3d': { label: '3-digit', rules: { format: '3-digit', mainCount: 3, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0, bonus: null } },
  pick3: { label: 'Pick 3', rules: { format: 'Pick 3', mainCount: 3, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0, bonus: null } },
  pick4: { label: 'Pick 4', rules: { format: 'Pick 4', mainCount: 4, minNumber: 0, maxNumber: 9, allowDuplicates: true, ordered: true, padDigits: 0, bonus: null } },
};

interface Form {
  countryId: string; categoryId: string; lotteryName: string; stateRegion: string; provider: string; currency: string; description: string; websiteUrl: string;
  drawFrequency: Frequency; drawDays: number[]; drawTime: string; timezone: string; status: 'ACTIVE' | 'INACTIVE'; rules: Rules;
}
const blank = (countryId = '', tz = 'UTC'): Form => ({ countryId, categoryId: '', lotteryName: '', stateRegion: '', provider: '', currency: '', description: '', websiteUrl: '', drawFrequency: 'WEEKLY', drawDays: [], drawTime: '', timezone: tz, status: 'ACTIVE', rules: { ...PRESETS['6/49'].rules } });
const fromLottery = (l: Lottery): Form => ({ countryId: l.countryId, categoryId: l.categoryId ?? '', lotteryName: l.name, stateRegion: l.stateRegion ?? '', provider: l.provider, currency: l.currency ?? '', description: l.description ?? '', websiteUrl: l.websiteUrl ?? '', drawFrequency: l.drawFrequency, drawDays: l.drawDays, drawTime: l.drawTime ?? '', timezone: l.timezone, status: l.status, rules: l.rules });

function LotteryForm({ initial, countries, categories, onDone }: { initial: Lottery | null; countries: Country[]; categories: Category[]; onDone: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<Form>(initial ? fromLottery(initial) : blank(countries[0]?.id, countries[0]?.timezone));
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const setR = (patch: Partial<Rules>) => setF((p) => ({ ...p, rules: { ...p.rules, ...patch } }));
  const num = (v: string) => (v === '' ? 0 : parseInt(v, 10));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrs([]);
    const body = { ...f, categoryId: f.categoryId || null, stateRegion: f.stateRegion || null, currency: f.currency || null, description: f.description || null, websiteUrl: f.websiteUrl || null, drawTime: f.drawTime || null };
    try {
      if (initial) await api.put(`/admin/lotteries/${initial.id}`, body);
      else await api.post('/admin/lotteries', body);
      toast(initial ? 'Lottery updated' : 'Lottery created');
      onDone();
    } catch (e2) {
      const d = (e2 as { details?: { field: string; message: string }[] }).details;
      setErrs(d?.length ? d.map((x) => `${x.field}: ${x.message}`) : [e2 instanceof Error ? e2.message : 'Failed']);
    } finally {
      setBusy(false);
    }
  }
  const monthly = f.drawFrequency === 'MONTHLY';
  const b = f.rules.bonus;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lottery name *" className="sm:col-span-2"><Input required value={f.lotteryName} onChange={(e) => set('lotteryName', e.target.value)} /></Field>
        <Field label="Country *"><Select required value={f.countryId} onChange={(e) => { set('countryId', e.target.value); const c = countries.find((x) => x.id === e.target.value); if (c && !initial) { set('timezone', c.timezone); set('currency', c.currency ?? ''); } }}>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="State / region"><Input value={f.stateRegion} onChange={(e) => set('stateRegion', e.target.value)} /></Field>
        <Field label="Provider *"><Input required value={f.provider} onChange={(e) => set('provider', e.target.value)} /></Field>
        <Field label="Category"><Select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}><option value="">— none —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Currency"><Input maxLength={8} value={f.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="e.g. USD" /></Field>
        <Field label="Website URL"><Input type="url" value={f.websiteUrl} onChange={(e) => set('websiteUrl', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-navy-100 p-4">
        <legend className="px-2 text-sm font-semibold">Draw schedule</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Frequency"><Select value={f.drawFrequency} onChange={(e) => { set('drawFrequency', e.target.value as Frequency); set('drawDays', []); }}>{Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Draw time"><Input type="time" value={f.drawTime} onChange={(e) => set('drawTime', e.target.value)} /></Field>
          <Field label="Time zone *" hint="IANA name"><Input required value={f.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Asia/Singapore" /></Field>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">{monthly ? 'Days of the month' : 'Draw days'}{f.drawFrequency === 'DAILY' && <span className="font-normal text-navy-400"> (leave empty for every day)</span>}</p>
          <div className="flex flex-wrap gap-1.5">
            {(monthly ? Array.from({ length: 31 }, (_, i) => i + 1) : [0, 1, 2, 3, 4, 5, 6]).map((d) => {
              const on = f.drawDays.includes(d);
              return <button key={d} type="button" aria-pressed={on} onClick={() => set('drawDays', on ? f.drawDays.filter((x) => x !== d) : [...f.drawDays, d].sort((a, c) => a - c))} className={cn('rounded-md border px-2.5 py-1 text-sm', on ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-200 hover:bg-navy-50')}>{monthly ? d : WEEKDAYS[d]}</button>;
            })}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-navy-100 p-4">
        <legend className="px-2 text-sm font-semibold">Number rules</legend>
        <div className="flex flex-wrap gap-1.5">
          <span className="mr-1 self-center text-xs text-navy-400">Presets:</span>
          {Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" onClick={() => setR({ ...p.rules })} className="rounded-full border border-navy-200 px-2.5 py-1 text-xs hover:bg-navy-50">{p.label}</button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Main numbers"><Input type="number" min={1} max={20} value={f.rules.mainCount} onChange={(e) => setR({ mainCount: num(e.target.value) })} /></Field>
          <Field label="Minimum number"><Input type="number" min={0} value={f.rules.minNumber} onChange={(e) => setR({ minNumber: num(e.target.value) })} /></Field>
          <Field label="Maximum number"><Input type="number" min={1} value={f.rules.maxNumber} onChange={(e) => setR({ maxNumber: num(e.target.value) })} /></Field>
          <Field label="Zero-pad display" hint="2 → “05”"><Input type="number" min={0} max={4} value={f.rules.padDigits} onChange={(e) => setR({ padDigits: num(e.target.value) })} /></Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.rules.allowDuplicates} onChange={(e) => setR({ allowDuplicates: e.target.checked })} /> Duplicate numbers allowed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.rules.ordered} onChange={(e) => setR({ ordered: e.target.checked })} /> Order matters (digit games)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!b} onChange={(e) => setR({ bonus: e.target.checked ? { count: 1, minNumber: 1, maxNumber: 10, allowDuplicates: false, separatePool: true } : null })} /> Has bonus numbers</label>
        </div>
        {b && (
          <div className="grid gap-4 rounded-lg bg-gold-50 p-3 sm:grid-cols-4">
            <Field label="Bonus count"><Input type="number" min={1} max={10} value={b.count} onChange={(e) => setR({ bonus: { ...b, count: num(e.target.value) } })} /></Field>
            <Field label="Bonus minimum"><Input type="number" min={0} disabled={!b.separatePool} value={b.minNumber} onChange={(e) => setR({ bonus: { ...b, minNumber: num(e.target.value) } })} /></Field>
            <Field label="Bonus maximum"><Input type="number" min={1} disabled={!b.separatePool} value={b.maxNumber} onChange={(e) => setR({ bonus: { ...b, maxNumber: num(e.target.value) } })} /></Field>
            <div className="space-y-2 pt-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={!b.separatePool} onChange={(e) => setR({ bonus: { ...b, separatePool: !e.target.checked } })} /> Same pool as main</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={b.allowDuplicates} onChange={(e) => setR({ bonus: { ...b, allowDuplicates: e.target.checked } })} /> Duplicates allowed</label>
            </div>
          </div>
        )}
      </fieldset>

      <Field label="Status"><Select value={f.status} onChange={(e) => set('status', e.target.value as Form['status'])} className="w-40"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></Field>
      {errs.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-600" role="alert">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button type="submit" variant="gold" loading={busy}>{initial ? 'Save changes' : 'Create lottery'}</Button></div>
    </form>
  );
}

export default function AdminLotteries() {
  const { toast } = useApp();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [status, setStatus] = useState('ALL');
  const [countryId, setCountryId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Lottery | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Lottery | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const countries = useFetch<{ items: Country[] }>('/countries');
  const cats = useFetch<{ items: Category[] }>('/categories');
  const { data, loading, error, reload } = useFetch<Paged<Lottery>>(`/lotteries${qs({ q: dq, status, countryId, page, pageSize: 15 })}`);

  return (
    <>
      <PageHeader title="Lotteries" subtitle="Create lotteries from any country and configure their number rules — nothing is hardcoded." actions={<Button variant="gold" onClick={() => setEditing('new')} disabled={!countries.data?.items.length}><Plus className="size-4" /> Add lottery</Button>} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <Input placeholder="Search…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Country" value={countryId} onChange={(e) => { setCountryId(e.target.value); setPage(1); }}><option value="">All countries</option>{countries.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
      </Card>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="No lotteries found" />}
      {data && data.items.length > 0 && (
        <Card>
          <Table>
            <thead><tr><Th>Lottery</Th><Th>Country</Th><Th>Category</Th><Th>Format</Th><Th>Frequency</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id} className="hover:bg-navy-50/40">
                  <Td><p className="font-medium">{l.name}</p><p className="text-xs text-navy-400">{l.provider}</p></Td>
                  <Td className="whitespace-nowrap">{flag(l.country.code)} {l.country.name}</Td>
                  <Td>{l.category?.name ?? '—'}</Td>
                  <Td><Badge>{rulesText(l.rules)}</Badge></Td>
                  <Td>{FREQ_LABEL[l.drawFrequency]}</Td>
                  <Td><Badge tone={l.status === 'ACTIVE' ? 'green' : 'gray'}>{l.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge></Td>
                  <Td className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(l)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDeleting(l)}><Trash2 className="size-4" /></Button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="px-4 pb-4"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>
        </Card>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add lottery' : 'Edit lottery'} wide>
        {editing !== null && countries.data && cats.data && <LotteryForm initial={editing === 'new' ? null : editing} countries={countries.data.items} categories={cats.data.items} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name}?`} message="This permanently deletes the lottery together with ALL its draws, formulas, predictions and upload history. This cannot be undone." confirmLabel="Delete lottery" onConfirm={async () => { try { const r = await api.del<{ deletedDraws: number }>(`/admin/lotteries/${deleting!.id}`); toast(`Lottery deleted (${r.deletedDraws} draws removed)`); reload(); } catch (e) { toast((e as Error).message, 'error'); } }} />
    </>
  );
}
