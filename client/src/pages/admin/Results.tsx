import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, qs, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Draw, Lottery, Paged, Rules } from '@/lib/types';
import { fmtDate, padNum } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { Balls, LotteryPicker, SampleBadge } from '@/components/shared';

const todayISO = () => new Date().toISOString().slice(0, 10);

function clientCheck(r: Rules, main: string[], bonus: string[]): string[] {
  const e: string[] = [];
  const toN = (s: string) => (/^\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN);
  const m = main.map(toN);
  const b = bonus.map(toN);
  if (m.some(Number.isNaN)) e.push('Fill in every winning number with a whole number.');
  else {
    if (m.some((n) => n < r.minNumber || n > r.maxNumber)) e.push(`Winning numbers must be between ${r.minNumber} and ${r.maxNumber}.`);
    if (!r.allowDuplicates && new Set(m).size !== m.length) e.push('Winning numbers must be different.');
  }
  if (r.bonus) {
    if (b.some(Number.isNaN)) e.push('Fill in every bonus number.');
    else {
      const lo = r.bonus.separatePool ? r.bonus.minNumber : r.minNumber;
      const hi = r.bonus.separatePool ? r.bonus.maxNumber : r.maxNumber;
      if (b.some((n) => n < lo || n > hi)) e.push(`Bonus numbers must be between ${lo} and ${hi}.`);
      if (!r.bonus.allowDuplicates && new Set(b).size !== b.length) e.push('Bonus numbers must be different.');
      if (!r.bonus.separatePool && !r.allowDuplicates && b.some((n) => m.includes(n))) e.push('A bonus number repeats a winning number.');
    }
  }
  return e;
}

function DrawForm({ lottery, initial, onDone }: { lottery: Lottery; initial: Draw | null; onDone: () => void }) {
  const { toast } = useApp();
  const r = lottery.rules;
  const [date, setDate] = useState(initial?.drawDate ?? todayISO());
  const [ref, setRef] = useState(initial?.drawReference ?? '');
  const [main, setMain] = useState<string[]>(Array.from({ length: r.mainCount }, (_, i) => (initial ? padNum(initial.mainNumbers[i] ?? 0, r.padDigits) : '')));
  const [bonus, setBonus] = useState<string[]>(Array.from({ length: r.bonus?.count ?? 0 }, (_, i) => (initial ? padNum(initial.bonusNumbers[i] ?? 0, r.padDigits) : '')));
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState<'PENDING' | 'PUBLISHED' | null>(null);

  async function save(status: 'PENDING' | 'PUBLISHED') {
    const problems = clientCheck(r, main, bonus);
    setErrs(problems);
    if (problems.length) return;
    setBusy(status);
    const body = { lotteryId: lottery.id, drawDate: date, drawReference: ref || null, mainNumbers: main.map((x) => parseInt(x, 10)), bonusNumbers: bonus.map((x) => parseInt(x, 10)), remarks: remarks || null, status };
    try {
      const res = initial ? await api.put<{ evaluatedPredictions: number }>(`/admin/draws/${initial.id}`, body) : await api.post<{ evaluatedPredictions: number }>('/admin/draws', body);
      toast(status === 'PUBLISHED' ? `Result published${res.evaluatedPredictions ? ` · ${res.evaluatedPredictions} suggestion(s) evaluated` : ''}` : 'Saved as pending');
      onDone();
    } catch (e) {
      setErrs([(e as Error).message]);
    } finally {
      setBusy(null);
    }
  }

  const cell = (vals: string[], set: (v: string[]) => void, i: number, bonusCell = false) => (
    <input key={i} inputMode="numeric" aria-label={`${bonusCell ? 'Bonus' : 'Number'} ${i + 1}`} value={vals[i]} onChange={(e) => { const n = [...vals]; n[i] = e.target.value.replace(/\D/g, '').slice(0, 4); set(n); }}
      className={`tabular size-12 rounded-full border-2 text-center text-base font-bold ${bonusCell ? 'border-gold-400 bg-gold-50' : 'border-navy-300 bg-white'}`} />
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Draw date *"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Draw ID / reference"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. D001" maxLength={64} /></Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Winning numbers <span className="font-normal text-navy-400">({r.mainCount} × {r.minNumber}–{r.maxNumber}{r.allowDuplicates ? ', repeats allowed' : ''})</span></p>
        <div className="flex flex-wrap gap-2">{main.map((_, i) => cell(main, setMain, i))}</div>
      </div>
      {r.bonus && (
        <div>
          <p className="mb-2 text-sm font-medium">Bonus numbers <span className="font-normal text-navy-400">({r.bonus.count} × {r.bonus.separatePool ? `${r.bonus.minNumber}–${r.bonus.maxNumber}` : 'same pool'})</span></p>
          <div className="flex flex-wrap gap-2">{bonus.map((_, i) => cell(bonus, setBonus, i, true))}</div>
        </div>
      )}
      <Field label="Remarks"><Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[60px]" maxLength={2000} /></Field>
      {errs.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-600" role="alert">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button variant="outline" loading={busy === 'PENDING'} disabled={!!busy} onClick={() => save('PENDING')}>Save as pending</Button>
        <Button variant="gold" loading={busy === 'PUBLISHED'} disabled={!!busy} onClick={() => save('PUBLISHED')}>Save &amp; publish</Button>
      </div>
    </div>
  );
}

export default function AdminResults() {
  const { toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Draw | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Draw | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [lotteryId, status]);

  const lot = useFetch<Lottery>(lotteryId ? `/lotteries/${lotteryId}` : null);
  const { data, loading, error, reload } = useFetch<Paged<Draw>>(lotteryId ? `/lotteries/${lotteryId}/draws${qs({ status, q: dq, page, pageSize: 15 })}` : null);
  const L = lot.data;

  return (
    <>
      <PageHeader title="Winning Numbers" subtitle="Add, edit, publish and delete draw results. Numbers are validated against the lottery's configured rules and every change is audited." actions={<Button variant="gold" disabled={!L} onClick={() => setEditing('new')}><Plus className="size-4" /> Add result</Button>} />
      <Card className="mb-4 p-4">
        <LotteryPicker includeInactive value={lotteryId} onChange={(id) => setSp(id ? { lottery: id } : {}, { replace: true })} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Status"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All</option><option value="PUBLISHED">Published</option><option value="PENDING">Pending</option></Select></Field>
          <Field label="Search date or reference"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-navy-300" /><Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="2026-11-15 or D001" /></div></Field>
        </div>
      </Card>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {lotteryId && (
        <Card>
          <CardHeader title={`${L?.name ?? ''} — ${data?.total ?? '…'} records`} />
          {loading && !data ? <Spinner /> : data && data.items.length === 0 ? <div className="p-6"><Empty title="No results">Add the first result for this lottery.</Empty></div> : data && L && (
            <>
              <Table>
                <thead><tr><Th>Date</Th><Th>Draw ID</Th><Th>Numbers</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={d.id} className="hover:bg-navy-50/40">
                      <Td className="whitespace-nowrap font-medium">{fmtDate(d.drawDate)}</Td>
                      <Td className="tabular text-navy-500">{d.drawReference ?? '—'}</Td>
                      <Td><Balls main={d.mainNumbers} bonus={d.bonusNumbers} rules={L.rules} size="sm" /></Td>
                      <Td><div className="flex gap-1"><Badge tone={d.status === 'PUBLISHED' ? 'green' : 'gold'}>{d.status === 'PUBLISHED' ? 'Published' : 'Pending'}</Badge>{d.isSample && <SampleBadge />}</div></Td>
                      <Td className="whitespace-nowrap text-right">
                        {d.status === 'PENDING' && <Button size="sm" variant="ghost" title="Publish" aria-label="Publish" onClick={async () => { try { await api.post(`/admin/draws/${d.id}/publish`); toast('Published'); reload(); } catch (e) { toast((e as Error).message, 'error'); } }}><CheckCircle2 className="size-4 text-emerald-600" /></Button>}
                        <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(d)}><Pencil className="size-4" /></Button>
                        <Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDeleting(d)}><Trash2 className="size-4" /></Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="px-4 pb-4"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div>
            </>
          )}
        </Card>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? `Add result – ${L?.name}` : `Edit result – ${L?.name}`}>
        {editing !== null && L && <DrawForm lottery={L} initial={editing === 'new' ? null : editing} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete this result?" message={deleting ? <>The result of <strong>{fmtDate(deleting.drawDate)}</strong> will be permanently removed. Predictions evaluated against it will be re-evaluated. The deletion is recorded in the audit log.</> : null} onConfirm={async () => { try { await api.del(`/admin/draws/${deleting!.id}`); toast('Result deleted'); reload(); } catch (e) { toast((e as Error).message, 'error'); } }} />
    </>
  );
}
