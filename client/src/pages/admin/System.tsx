import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Trash2 } from 'lucide-react';
import { api, qs, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Paged } from '@/lib/types';
import { fmtDateTime, fmtNum } from '@/lib/utils';
import { Badge, Button, Card, CardHeader, ConfirmDialog, Empty, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Table, Td, Textarea, Th, Toggle } from '@/components/ui';
import { InfoNote, LotteryPicker } from '@/components/shared';

// ---------- algorithms ----------
interface Algo { id: string; algorithmName: string; description: string; algorithmType: string; status: 'ACTIVE' | 'INACTIVE' }
export function AdminAlgorithms() {
  const { toast } = useApp();
  const { data, loading, error, reload } = useFetch<{ items: Algo[] }>('/admin/algorithms');
  const [edit, setEdit] = useState<Algo | null>(null);
  const save = async (a: Algo) => { try { await api.put(`/admin/algorithms/${a.id}`, { algorithmName: a.algorithmName, description: a.description, status: a.status }); toast('Algorithm saved'); reload(); return true; } catch (e) { toast((e as Error).message, 'error'); return false; } };
  return (
    <>
      <PageHeader title="Prediction Algorithms" subtitle="Switch algorithms on or off globally and edit their descriptions. A disabled algorithm is ignored by every formula." />
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <Card><Table><thead><tr><Th>Algorithm</Th><Th>Type</Th><Th>Description</Th><Th>Enabled</Th><Th /></tr></thead><tbody>
          {data.items.map((a) => (
            <tr key={a.id}><Td className="font-medium">{a.algorithmName}</Td><Td><code className="text-xs">{a.algorithmType}</code></Td><Td className="max-w-md text-xs text-navy-500">{a.description}</Td>
              <Td><Toggle label={`Enable ${a.algorithmName}`} checked={a.status === 'ACTIVE'} onChange={(v) => save({ ...a, status: v ? 'ACTIVE' : 'INACTIVE' })} /></Td>
              <Td><Button size="sm" variant="outline" onClick={() => setEdit(a)}>Edit</Button></Td></tr>
          ))}</tbody></Table></Card>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit algorithm">
        {edit && <div className="space-y-4">
          <Field label="Name"><Input value={edit.algorithmName} onChange={(e) => setEdit({ ...edit, algorithmName: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button variant="gold" onClick={async () => { if (await save(edit)) setEdit(null); }}>Save</Button></div>
        </div>}
      </Modal>
    </>
  );
}

// ---------- performance ----------
interface Perf { formulaId: string; lottery: string; formulaName: string; version: number; isActive: boolean; totalPredictions: number; evaluated: number; avgMatchedNumbers: number | null; avgMatchedBonus: number | null; bestMatch: number | null; expectedByChance: number; distribution: { matches: number; count: number }[]; series: { week: string; avg: number; n: number }[] }
export function AdminPerformance() {
  const [sp, setSp] = useSearchParams();
  const lotteryId = sp.get('lottery') ?? '';
  const { data, loading, error, reload } = useFetch<{ items: Perf[]; note: string }>(`/admin/performance${qs({ lotteryId })}`);
  const [sel, setSel] = useState<string[]>([]);
  const items = data?.items ?? [];
  const chosen = items.filter((p) => sel.includes(p.formulaId));
  const weeks = [...new Set(chosen.flatMap((c) => c.series.map((s) => s.week)))].sort();
  const lineData = weeks.map((w) => Object.fromEntries([['week', w], ...chosen.map((c) => [c.formulaId, c.series.find((s) => s.week === w)?.avg ?? null])]));
  return (
    <>
      <PageHeader title="Formula Performance" subtitle="How suggestions compare with actual published results. Select formula versions to compare." />
      <Card className="mb-6 p-4"><div className="flex items-end gap-3"><div className="flex-1"><LotteryPicker includeInactive value={lotteryId} onChange={(id) => setSp(id ? { lottery: id } : {}, { replace: true })} /></div><Button variant="outline" onClick={() => setSp({}, { replace: true })}>All lotteries</Button></div></Card>
      {loading && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <InfoNote>{data.note}</InfoNote>
          {items.length === 0 ? <div className="mt-4"><Empty title="No formulas yet" /></div> : (
            <Card className="mt-4">
              <Table><thead><tr><Th /><Th>Lottery</Th><Th>Formula</Th><Th>Predictions</Th><Th>Evaluated</Th><Th>Avg main matches</Th><Th>Expected by chance</Th><Th>Avg bonus</Th><Th>Best</Th></tr></thead><tbody>
                {items.map((p) => (
                  <tr key={p.formulaId}><Td><input type="checkbox" aria-label="Compare" checked={sel.includes(p.formulaId)} onChange={(e) => setSel(e.target.checked ? [...sel, p.formulaId] : sel.filter((x) => x !== p.formulaId))} /></Td>
                    <Td>{p.lottery}</Td><Td>{p.formulaName} <Badge tone={p.isActive ? 'green' : 'gray'}>v{p.version}{p.isActive ? ' · active' : ''}</Badge></Td><Td className="tabular">{p.totalPredictions}</Td><Td className="tabular">{p.evaluated}</Td>
                    <Td className="tabular font-semibold">{fmtNum(p.avgMatchedNumbers, 3)}</Td><Td className="tabular text-navy-500">{fmtNum(p.expectedByChance, 3)}</Td><Td className="tabular">{fmtNum(p.avgMatchedBonus, 3)}</Td><Td className="tabular">{p.bestMatch ?? '—'}</Td></tr>
                ))}</tbody></Table>
            </Card>
          )}
          {chosen.length > 0 && (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card><CardHeader title="Match distribution" /><div className="p-5" style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={[...new Set(chosen.flatMap((c) => c.distribution.map((d) => d.matches)))].sort((a, b) => a - b).map((m) => Object.fromEntries([['matches', `${m} matched`], ...chosen.map((c) => [c.formulaId, c.distribution.find((d) => d.matches === m)?.count ?? 0])]))} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="matches" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip /><Legend formatter={(id) => { const c = chosen.find((x) => x.formulaId === id); return c ? `${c.formulaName} v${c.version}` : id; }} />{chosen.map((c, i) => <Bar key={c.formulaId} dataKey={c.formulaId} fill={['#22335f', '#e2b52c', '#5a76b5', '#b07a15'][i % 4]} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}</BarChart></ResponsiveContainer></div></Card>
              <Card><CardHeader title="Average matches over time" description="Weekly average of matched main numbers" /><div className="p-5" style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={lineData} margin={{ left: -12 }}><CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend formatter={(id) => { const c = chosen.find((x) => x.formulaId === id); return c ? `${c.formulaName} v${c.version}` : id; }} />{chosen[0] && <ReferenceLine y={chosen[0].expectedByChance} stroke="#b07a15" strokeDasharray="4 4" label={{ value: 'chance', fontSize: 10 }} />}{chosen.map((c, i) => <Line key={c.formulaId} dataKey={c.formulaId} connectNulls stroke={['#22335f', '#e2b52c', '#5a76b5', '#b07a15'][i % 4]} strokeWidth={2} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div></Card>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------- users ----------
interface U { id: string; name: string; email: string; role: 'ADMIN' | 'USER'; status: 'ACTIVE' | 'SUSPENDED'; createdAt: string; predictions: number }
export function AdminUsers() {
  const { user: me, toast } = useApp();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(1);
  const [add, setAdd] = useState(false);
  const [del, setDel] = useState<U | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'USER' });
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, loading, error, reload } = useFetch<Paged<U>>(`/admin/users${qs({ q: dq, page, pageSize: 15 })}`);
  const patch = async (u: U, body: Partial<U>) => { try { await api.patch(`/admin/users/${u.id}`, body); toast('User updated'); reload(); } catch (e) { toast((e as Error).message, 'error'); } };
  return (
    <>
      <PageHeader title="Users" subtitle="Manage registered users, roles and account status." actions={<Button variant="gold" onClick={() => { setAdd(true); setErr(''); }}><Plus className="size-4" /> Add user</Button>} />
      <Card className="mb-4 p-4"><Input placeholder="Search name or email…" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} /></Card>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <Card><Table><thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Predictions</Th><Th>Joined</Th><Th /></tr></thead><tbody>
          {data.items.map((u) => {
            const self = u.id === me?.id;
            return (
              <tr key={u.id}><Td className="font-medium">{u.name}{self && <Badge tone="gold" className="ml-2">you</Badge>}</Td><Td>{u.email}</Td>
                <Td><Select className="h-8 w-28 text-xs" value={u.role} disabled={self} onChange={(e) => patch(u, { role: e.target.value as U['role'] })} aria-label="Role"><option value="USER">User</option><option value="ADMIN">Admin</option></Select></Td>
                <Td><Select className="h-8 w-32 text-xs" value={u.status} disabled={self} onChange={(e) => patch(u, { status: e.target.value as U['status'] })} aria-label="Status"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select></Td>
                <Td className="tabular">{u.predictions}</Td><Td className="whitespace-nowrap text-xs text-navy-500">{fmtDateTime(u.createdAt)}</Td>
                <Td><Button size="sm" variant="ghost" className="text-red-600" disabled={self} aria-label="Delete user" onClick={() => setDel(u)}><Trash2 className="size-4" /></Button></Td></tr>
            );
          })}</tbody></Table>
          <div className="px-4 pb-4"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div></Card>
      )}
      <Modal open={add} onClose={() => setAdd(false)} title="Add user">
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); try { await api.post('/admin/users', f); toast('User created'); setAdd(false); setF({ name: '', email: '', password: '', role: 'USER' }); reload(); } catch (e2) { setErr((e2 as Error).message); } }}>
          <Field label="Name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Temporary password" hint="8+ characters with a letter and a number"><Input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="USER">User</option><option value="ADMIN">Admin</option></Select></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdd(false)}>Cancel</Button><Button type="submit" variant="gold">Create user</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name}?`} message="The account is removed permanently. Their saved predictions are kept anonymously." onConfirm={async () => { try { await api.del(`/admin/users/${del!.id}`); toast('User deleted'); reload(); } catch (e) { toast((e as Error).message, 'error'); } }} />
    </>
  );
}

// ---------- audit ----------
interface Log { id: string; action: string; entityType: string; entityId: string | null; oldValue: unknown; newValue: unknown; createdAt: string; user: { name: string; email: string } | null }
export function AdminAudit() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<Log | null>(null);
  const { data, loading, error, reload } = useFetch<Paged<Log> & { entityTypes: string[] }>(`/admin/audit-logs${qs({ entityType, action, from, to, page, pageSize: 20 })}`);
  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every create, update, delete, publish and import is recorded with the before and after values." />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <Select aria-label="Entity" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}><option value="">All entities</option>{data?.entityTypes.map((t) => <option key={t}>{t}</option>)}</Select>
        <Select aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{['CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'IMPORT', 'ACTIVATE', 'DEACTIVATE', 'LOGIN', 'LOGIN_FAILED', 'REGISTER'].map((a) => <option key={a}>{a}</option>)}</Select>
        <Input type="date" aria-label="From" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <Input type="date" aria-label="To" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </Card>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <Empty title="No log entries" />}
      {data && data.items.length > 0 && (
        <Card><Table><thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Entity</Th><Th /></tr></thead><tbody>
          {data.items.map((l) => (
            <tr key={l.id}><Td className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</Td><Td className="text-xs">{l.user?.name ?? 'system'}<span className="block text-navy-400">{l.user?.email}</span></Td>
              <Td><Badge tone={l.action === 'DELETE' || l.action === 'LOGIN_FAILED' ? 'red' : l.action === 'CREATE' ? 'green' : 'navy'}>{l.action}</Badge></Td><Td>{l.entityType}<span className="block font-mono text-[10px] text-navy-400">{l.entityId?.slice(0, 8)}</span></Td>
              <Td>{(l.oldValue || l.newValue) ? <Button size="sm" variant="outline" onClick={() => setView(l)}>View changes</Button> : null}</Td></tr>
          ))}</tbody></Table>
          <div className="px-4 pb-4"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></div></Card>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${view.action} ${view.entityType}` : ''} wide>
        {view && <div className="grid gap-4 md:grid-cols-2">
          {([['Before', view.oldValue], ['After', view.newValue]] as const).map(([t, v]) => <div key={t}><p className="mb-1 text-xs font-semibold uppercase text-navy-400">{t}</p><pre className="max-h-96 overflow-auto rounded-lg bg-navy-950 p-3 text-xs text-navy-100">{v ? JSON.stringify(v, null, 2) : '—'}</pre></div>)}
        </div>}
      </Modal>
    </>
  );
}
