import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileUp } from 'lucide-react';
import { api, qs, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Lottery, Paged } from '@/lib/types';
import { cn, fmtDateTime } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, Empty, ErrorBox, Field, PageHeader, Pagination, Select, Spinner, Table, Td, Th, Toggle } from '@/components/ui';
import { InfoNote, LotteryPicker } from '@/components/shared';

interface Mapping { drawDate: string; drawReference: string | null; remarks: string | null; main: string[]; bonus: string[]; mainCombined: string | null; bonusCombined: string | null }
interface Inspect { fileName: string; totalRows: number; headers: string[]; sampleRows: string[][]; suggestedMapping: Mapping; expectedColumns: string[] }
interface PreviewRow { line: number; status: 'valid' | 'duplicate' | 'invalid'; date: string | null; ref: string | null; main: number[]; bonus: number[]; errors: string[]; duplicateOf: string | null }
interface Preview { summary: { total: number; valid: number; duplicates: number; invalid: number }; truncated: boolean; rows: PreviewRow[] }
interface CommitResult { uploadId: string; status: string; total: number; created: number; updated: number; skipped: number; failed: number; rejectedDuplicates: number; evaluatedPredictions: number; errors: { line: number; date: string | null; reference: string | null; numbers: string; outcome: string; reason: string }[] }
interface History { id: string; fileName: string; lottery: string; country: string; totalRecords: number; successfulRecords: number; failedRecords: number; status: string; summary: { created?: number; updated?: number; skipped?: number; duplicatePolicy?: string } | null; uploadedBy: string | null; uploadedAt: string; hasErrors: boolean }
const tone = (s: string) => (s === 'COMPLETED' ? 'green' : s === 'PARTIAL' ? 'gold' : 'red');

export default function AdminUpload() {
  const { toast } = useApp();
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const lot = useFetch<Lottery>(lotteryId ? `/lotteries/${lotteryId}` : null);
  const L = lot.data;

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fmt, setFmt] = useState('iso');
  const [insp, setInsp] = useState<Inspect | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [policy, setPolicy] = useState<'skip' | 'update' | 'reject'>('skip');
  const [publish, setPublish] = useState(true);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [hPage, setHPage] = useState(1);
  const history = useFetch<Paged<History>>(`/admin/uploads/history${qs({ page: hPage, pageSize: 10 })}`);

  const reset = () => { setFile(null); setInsp(null); setMapping(null); setPreview(null); setResult(null); setErr(''); if (fileRef.current) fileRef.current.value = ''; };
  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.append('file', file!);
    f.append('lotteryId', lotteryId);
    f.append('dateFormat', fmt);
    Object.entries(extra).forEach(([k, v]) => f.append(k, v));
    return f;
  };

  async function inspect(f: File) {
    setBusy('inspect'); setErr(''); setPreview(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('lotteryId', lotteryId);
      const r = await api.upload<Inspect>('/admin/uploads/inspect', fd);
      setInsp(r); setMapping(r.suggestedMapping);
    } catch (e) { setErr((e as Error).message); setInsp(null); } finally { setBusy(''); }
  }
  async function runPreview() {
    setBusy('preview'); setErr('');
    try { setPreview(await api.upload<Preview>('/admin/uploads/preview', form({ mapping: JSON.stringify(mapping), publish: String(publish) }))); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }
  async function commit() {
    setBusy('commit'); setErr('');
    try {
      const r = await api.upload<CommitResult>('/admin/uploads/commit', form({ mapping: JSON.stringify(mapping), duplicatePolicy: policy, publish: String(publish) }));
      setResult(r); history.reload();
      toast(r.status === 'REJECTED' ? 'Import rejected – duplicates found' : `Imported ${r.created + r.updated} record(s)`, r.status === 'REJECTED' || r.status === 'FAILED' ? 'error' : 'ok');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  }

  const sel = (value: string | null, onChange: (v: string | null) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm"><span className="w-28 shrink-0 text-navy-600">{label}</span>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="h-9"><option value="">— not mapped —</option>{insp?.headers.map((h) => <option key={h} value={h}>{h}</option>)}</Select></label>
  );
  const r = L?.rules;
  const mainSlots = r ? Array.from({ length: r.mainCount }, (_, i) => i) : [];
  const bonusSlots = r?.bonus ? Array.from({ length: r.bonus.count }, (_, i) => i) : [];
  const setCol = (key: 'main' | 'bonus', i: number, v: string | null) => setMapping((m) => {
    if (!m) return m;
    const a = Array.from({ length: key === 'main' ? r!.mainCount : r!.bonus!.count }, (_, j) => m[key][j] ?? '');
    a[i] = v ?? '';
    return { ...m, [key]: a };
  });
  const mappingReady = mapping && mapping.drawDate && ((mapping.mainCombined) || (mapping.main.filter(Boolean).length === r?.mainCount));

  return (
    <>
      <PageHeader title="Bulk Upload" subtitle="Import historical or daily results from CSV or Excel (.xlsx). Everything is validated before anything is saved." />

      <Card className="mb-6">
        <CardHeader title="1 · Choose lottery and file" />
        <div className="space-y-4 p-5">
          <LotteryPicker includeInactive value={lotteryId} onChange={(id) => { setSp(id ? { lottery: id } : {}, { replace: true }); reset(); }} />
          {L && r && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-navy-500">Expected columns: <code className="rounded bg-navy-50 px-1.5 py-0.5 text-xs">{[ 'draw_date', 'draw_id', ...mainSlots.map((i) => `number_${i + 1}`), ...(r.bonus ? (r.bonus.count === 1 ? ['bonus_number'] : bonusSlots.map((i) => `bonus_number_${i + 1}`)) : []), 'remarks'].join(', ')}</code></span>
              <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-navy-200 px-3 text-xs font-medium hover:bg-navy-50" href={`/api/admin/uploads/template${qs({ lotteryId })}`}><Download className="size-3.5" /> CSV template</a>
              <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-navy-200 px-3 text-xs font-medium hover:bg-navy-50" href={`/api/admin/uploads/template${qs({ lotteryId, format: 'xlsx' })}`}><Download className="size-3.5" /> Excel template</a>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="File (.csv or .xlsx, max 5 MB)" className="sm:col-span-2">
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); inspect(f); } }} />
                <Button variant="outline" className="flex-1 justify-start" disabled={!lotteryId} onClick={() => fileRef.current?.click()}><FileUp className="size-4" /> {file?.name ?? 'Choose file…'}</Button>
                {file && <Button variant="ghost" onClick={reset}>Clear</Button>}
              </div>
            </Field>
            <Field label="Date format in file"><Select value={fmt} onChange={(e) => { setFmt(e.target.value); setPreview(null); }}><option value="iso">YYYY-MM-DD</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option></Select></Field>
          </div>
          {busy === 'inspect' && <Spinner label="Reading file…" />}
          {err && <ErrorBox message={err} />}
        </div>
      </Card>

      {insp && mapping && r && (
        <Card className="mb-6">
          <CardHeader title="2 · Map columns" description={`${insp.fileName} · ${insp.totalRows} data rows. Columns were matched automatically — adjust if needed.`} />
          <div className="space-y-4 p-5">
            <div className="grid gap-3 md:grid-cols-2">
              {sel(mapping.drawDate, (v) => setMapping({ ...mapping, drawDate: v ?? '' }), 'Draw date *')}
              {sel(mapping.drawReference, (v) => setMapping({ ...mapping, drawReference: v }), 'Draw ID')}
              {sel(mapping.remarks, (v) => setMapping({ ...mapping, remarks: v }), 'Remarks')}
            </div>
            <div className="rounded-lg border border-navy-100 p-3">
              <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Winning numbers *</p>
                <label className="flex items-center gap-2 text-xs text-navy-500">One combined column <Toggle label="Combined column" checked={mapping.mainCombined !== null} onChange={(v) => setMapping({ ...mapping, mainCombined: v ? insp.headers[0] : null, main: [] })} /></label></div>
              {mapping.mainCombined !== null ? sel(mapping.mainCombined, (v) => setMapping({ ...mapping, mainCombined: v }), 'Numbers column') : <div className="grid gap-2 md:grid-cols-2">{mainSlots.map((i) => <div key={i}>{sel(mapping.main[i] ?? null, (v) => setCol('main', i, v), `Number ${i + 1}`)}</div>)}</div>}
            </div>
            {r.bonus && (
              <div className="rounded-lg border border-gold-200 bg-gold-50/50 p-3">
                <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Bonus numbers *</p>
                  <label className="flex items-center gap-2 text-xs text-navy-500">One combined column <Toggle label="Combined bonus column" checked={mapping.bonusCombined !== null} onChange={(v) => setMapping({ ...mapping, bonusCombined: v ? insp.headers[0] : null, bonus: [] })} /></label></div>
                {mapping.bonusCombined !== null ? sel(mapping.bonusCombined, (v) => setMapping({ ...mapping, bonusCombined: v }), 'Bonus column') : <div className="grid gap-2 md:grid-cols-2">{bonusSlots.map((i) => <div key={i}>{sel(mapping.bonus[i] ?? null, (v) => setCol('bonus', i, v), `Bonus ${i + 1}`)}</div>)}</div>}
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-navy-400">File preview (first rows)</p>
              <div className="max-h-48 overflow-auto rounded-lg border border-navy-100"><Table><thead><tr>{insp.headers.map((h) => <Th key={h}>{h}</Th>)}</tr></thead><tbody>{insp.sampleRows.map((row, i) => <tr key={i}>{insp.headers.map((_, j) => <Td key={j} className="whitespace-nowrap text-xs">{row[j]}</Td>)}</tr>)}</tbody></Table></div>
            </div>
            <div className="flex items-center gap-3"><Button variant="gold" loading={busy === 'preview'} disabled={!mappingReady} onClick={runPreview}>Validate &amp; preview</Button>{!mappingReady && <span className="text-xs text-navy-400">Map the date and all {r.mainCount} number columns (or one combined column).</span>}</div>
          </div>
        </Card>
      )}

      {preview && !result && (
        <Card className="mb-6">
          <CardHeader title="3 · Review and import" description="Nothing has been saved yet." />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Rows', preview.summary.total, 'navy'], ['Valid', preview.summary.valid, 'green'], ['Duplicates', preview.summary.duplicates, 'gold'], ['Invalid', preview.summary.invalid, 'red']].map(([l, v, t]) => (
                <div key={l as string} className="rounded-lg border border-navy-100 p-3 text-center"><p className="text-xs text-navy-400">{l}</p><p className={cn('text-2xl font-bold', t === 'red' && (v as number) > 0 && 'text-red-600', t === 'gold' && (v as number) > 0 && 'text-gold-600', t === 'green' && 'text-emerald-600')}>{v}</p></div>
              ))}
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border border-navy-100">
              <Table><thead className="sticky top-0"><tr><Th>Line</Th><Th>Status</Th><Th>Date</Th><Th>Draw ID</Th><Th>Numbers</Th><Th>Problem</Th></tr></thead><tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className={cn(row.status === 'invalid' && 'bg-red-50', row.status === 'duplicate' && 'bg-gold-50')}>
                    <Td className="tabular">{row.line}</Td>
                    <Td><Badge tone={row.status === 'valid' ? 'green' : row.status === 'duplicate' ? 'gold' : 'red'}>{row.status}</Badge></Td>
                    <Td className="whitespace-nowrap">{row.date ?? '—'}</Td><Td>{row.ref ?? '—'}</Td>
                    <Td className="tabular whitespace-nowrap">{row.main.map((n, i) => <span key={i} className={cn('mr-1 inline-block min-w-[1.6rem] rounded px-1 text-center', row.status === 'invalid' && r && (n < r.minNumber || n > r.maxNumber || Number.isNaN(n)) ? 'bg-red-200 font-bold text-red-800' : 'bg-navy-50')}>{Number.isNaN(n) ? '?' : n}</span>)}{row.bonus.length > 0 && <span className="text-navy-300">+ {row.bonus.join(' ')}</span>}</Td>
                    <Td className="text-xs text-red-700">{row.errors.join(' ')}</Td>
                  </tr>
                ))}
              </tbody></Table>
            </div>
            {preview.truncated && <p className="text-xs text-navy-400">Showing the first 500 rows — all rows are validated on import.</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-navy-100 p-3">
                <p className="mb-2 text-sm font-semibold">If a draw date / ID already exists…</p>
                {([['skip', 'Skip duplicates', 'Keep existing records; import only new draws.'], ['update', 'Update existing', 'Overwrite existing records with the values from the file.'], ['reject', 'Reject the whole file', 'Import nothing if any duplicate is found.']] as const).map(([k, t, d]) => (
                  <label key={k} className="flex cursor-pointer items-start gap-2 py-1 text-sm"><input type="radio" name="policy" className="mt-1" checked={policy === k} onChange={() => setPolicy(k)} /><span><span className="font-medium">{t}</span><span className="block text-xs text-navy-400">{d}</span></span></label>
                ))}
              </div>
              <div className="rounded-lg border border-navy-100 p-3">
                <p className="mb-2 text-sm font-semibold">Publishing</p>
                <label className="flex items-center gap-3 text-sm"><Toggle label="Publish immediately" checked={publish} onChange={setPublish} /> {publish ? 'Publish imported results immediately' : 'Save as pending (not visible to users)'}</label>
                <InfoNote>Invalid rows are never imported; they are listed in the error report.</InfoNote>
              </div>
            </div>
            {err && <ErrorBox message={err} />}
            <div className="flex flex-wrap gap-2"><Button variant="gold" loading={busy === 'commit'} disabled={preview.summary.valid + (policy === 'update' ? preview.summary.duplicates : 0) === 0} onClick={commit}>Import now</Button><Button variant="outline" onClick={reset}>Cancel</Button></div>
          </div>
        </Card>
      )}

      {result && (
        <Card className="mb-6">
          <CardHeader title="Import result" actions={<Badge tone={tone(result.status)}>{result.status}</Badge>} />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[['Created', result.created], ['Updated', result.updated], ['Skipped', result.skipped], ['Failed', result.failed], ['Total rows', result.total]].map(([l, v]) => <div key={l as string} className="rounded-lg border border-navy-100 p-3 text-center"><p className="text-xs text-navy-400">{l}</p><p className="text-2xl font-bold">{v}</p></div>)}
            </div>
            {result.status === 'REJECTED' && <ErrorBox message={`Import rejected: ${result.rejectedDuplicates} duplicate record(s) found and the "reject" policy was selected. Nothing was saved.`} />}
            {result.evaluatedPredictions > 0 && <InfoNote>{result.evaluatedPredictions} earlier suggestion(s) were evaluated against the new results.</InfoNote>}
            {result.errors.length > 0 && (
              <div className="max-h-60 overflow-auto rounded-lg border border-navy-100"><Table><thead className="sticky top-0"><tr><Th>Line</Th><Th>Date</Th><Th>Outcome</Th><Th>Reason</Th></tr></thead><tbody>{result.errors.map((e, i) => <tr key={i}><Td className="tabular">{e.line}</Td><Td>{e.date ?? '—'}</Td><Td><Badge tone={e.outcome === 'failed' ? 'red' : 'gold'}>{e.outcome}</Badge></Td><Td className="text-xs">{e.reason}</Td></tr>)}</tbody></Table></div>
            )}
            <div className="flex gap-2">
              {result.errors.length > 0 && <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-navy-200 px-4 text-sm font-medium hover:bg-navy-50" href={`/api/admin/uploads/${result.uploadId}/errors.csv`}><Download className="size-4" /> Download error report</a>}
              <Button variant="primary" onClick={reset}>Upload another file</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Upload history" />
        {history.loading && !history.data ? <Spinner /> : history.error ? <div className="p-4"><ErrorBox message={history.error} /></div> : history.data && history.data.items.length === 0 ? <div className="p-6"><Empty title="No uploads yet" /></div> : history.data && (
          <>
            <Table><thead><tr><Th>When</Th><Th>File</Th><Th>Lottery</Th><Th>Records</Th><Th>Result</Th><Th>By</Th><Th /></tr></thead><tbody>
              {history.data.items.map((u) => (
                <tr key={u.id}><Td className="whitespace-nowrap text-xs">{fmtDateTime(u.uploadedAt)}</Td><Td>{u.fileName}</Td><Td>{u.lottery}<span className="block text-xs text-navy-400">{u.country}</span></Td>
                  <Td className="text-xs">{u.totalRecords} rows · <span className="text-emerald-700">{u.successfulRecords} ok</span> · <span className="text-red-600">{u.failedRecords} failed</span>{u.summary?.skipped ? ` · ${u.summary.skipped} skipped` : ''}</Td>
                  <Td><Badge tone={tone(u.status)}>{u.status}</Badge><span className="block text-xs text-navy-400">{u.summary?.duplicatePolicy}</span></Td><Td className="text-xs">{u.uploadedBy ?? '—'}</Td>
                  <Td>{u.hasErrors && <a className="text-xs font-medium text-navy-600 underline" href={`/api/admin/uploads/${u.id}/errors.csv`}>Error report</a>}</Td></tr>
              ))}</tbody></Table>
            <div className="px-4 pb-4"><Pagination page={history.data.page} pageSize={history.data.pageSize} total={history.data.total} onPage={setHPage} /></div>
          </>
        )}
      </Card>
    </>
  );
}
