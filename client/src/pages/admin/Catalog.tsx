import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, useFetch } from '@/lib/api';
import { useApp } from '@/context/AppContext';
import type { Category, Country } from '@/lib/types';
import { flag } from '@/lib/utils';
import { Button, Card, ConfirmDialog, Empty, ErrorBox, Field, Input, Modal, PageHeader, Spinner, Table, Tabs, Td, Textarea, Th } from '@/components/ui';

function CountryForm({ initial, onDone }: { initial: Country | null; onDone: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ countryName: initial?.name ?? '', countryCode: initial?.code ?? '', currency: initial?.currency ?? '', timezone: initial?.timezone ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = { ...f, currency: f.currency || null };
      if (initial) await api.put(`/admin/countries/${initial.id}`, body);
      else await api.post('/admin/countries', body);
      toast('Country saved');
      onDone();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Country name *"><Input required value={f.countryName} onChange={(e) => setF({ ...f, countryName: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ISO code *" hint="2–3 letters"><Input required maxLength={3} value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value.toUpperCase() })} /></Field>
        <Field label="Currency"><Input maxLength={8} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label="Time zone *" hint="IANA, e.g. Europe/Paris"><Input required value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
      </div>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button type="submit" variant="gold" loading={busy}>Save</Button></div>
    </form>
  );
}

function CategoryForm({ initial, onDone }: { initial: Category | null; onDone: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ name: initial?.name ?? '', description: initial?.description ?? '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = { name: f.name, description: f.description || null };
      if (initial) await api.put(`/admin/categories/${initial.id}`, body);
      else await api.post('/admin/categories', body);
      toast('Category saved');
      onDone();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Category name *"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onDone}>Cancel</Button><Button type="submit" variant="gold" loading={busy}>Save</Button></div>
    </form>
  );
}

export default function AdminCatalog() {
  const { toast } = useApp();
  const [tab, setTab] = useState('countries');
  const countries = useFetch<{ items: Country[] }>('/countries');
  const cats = useFetch<{ items: Category[] }>('/categories');
  const [editC, setEditC] = useState<Country | 'new' | null>(null);
  const [editK, setEditK] = useState<Category | 'new' | null>(null);
  const [delC, setDelC] = useState<Country | null>(null);
  const [delK, setDelK] = useState<Category | null>(null);

  return (
    <>
      <PageHeader title="Countries & Categories" subtitle="Reference data used by lotteries." actions={
        <Button variant="gold" onClick={() => (tab === 'countries' ? setEditC('new') : setEditK('new'))}><Plus className="size-4" /> Add {tab === 'countries' ? 'country' : 'category'}</Button>} />
      <div className="mb-4"><Tabs tabs={[{ id: 'countries', label: 'Countries' }, { id: 'categories', label: 'Lottery categories' }]} value={tab} onChange={setTab} /></div>

      {tab === 'countries' && (countries.loading ? <Spinner /> : countries.error ? <ErrorBox message={countries.error} onRetry={countries.reload} /> : countries.data?.items.length === 0 ? <Empty title="No countries" /> : (
        <Card><Table><thead><tr><Th>Country</Th><Th>Code</Th><Th>Currency</Th><Th>Time zone</Th><Th>Active lotteries</Th><Th className="text-right">Actions</Th></tr></thead><tbody>
          {countries.data?.items.map((c) => (
            <tr key={c.id}><Td>{flag(c.code)} {c.name}</Td><Td>{c.code}</Td><Td>{c.currency ?? '—'}</Td><Td>{c.timezone}</Td><Td className="tabular">{c.lotteryCount}</Td>
              <Td className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditC(c)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDelC(c)}><Trash2 className="size-4" /></Button></Td></tr>
          ))}</tbody></Table></Card>
      ))}
      {tab === 'categories' && (cats.loading ? <Spinner /> : cats.error ? <ErrorBox message={cats.error} onRetry={cats.reload} /> : cats.data?.items.length === 0 ? <Empty title="No categories" /> : (
        <Card><Table><thead><tr><Th>Category</Th><Th>Description</Th><Th>Lotteries</Th><Th className="text-right">Actions</Th></tr></thead><tbody>
          {cats.data?.items.map((c) => (
            <tr key={c.id}><Td className="font-medium">{c.name}</Td><Td className="text-navy-500">{c.description ?? '—'}</Td><Td className="tabular">{c.lotteryCount}</Td>
              <Td className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditK(c)}><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" aria-label="Delete" className="text-red-600" onClick={() => setDelK(c)}><Trash2 className="size-4" /></Button></Td></tr>
          ))}</tbody></Table></Card>
      ))}

      <Modal open={editC !== null} onClose={() => setEditC(null)} title={editC === 'new' ? 'Add country' : 'Edit country'}>{editC !== null && <CountryForm initial={editC === 'new' ? null : editC} onDone={() => { setEditC(null); countries.reload(); }} />}</Modal>
      <Modal open={editK !== null} onClose={() => setEditK(null)} title={editK === 'new' ? 'Add category' : 'Edit category'}>{editK !== null && <CategoryForm initial={editK === 'new' ? null : editK} onDone={() => { setEditK(null); cats.reload(); }} />}</Modal>
      <ConfirmDialog open={!!delC} onClose={() => setDelC(null)} title={`Delete ${delC?.name}?`} message="Countries that still have lotteries cannot be deleted." onConfirm={async () => { try { await api.del(`/admin/countries/${delC!.id}`); toast('Country deleted'); countries.reload(); } catch (e) { toast((e as Error).message, 'error'); } }} />
      <ConfirmDialog open={!!delK} onClose={() => setDelK(null)} title={`Delete category “${delK?.name}”?`} message={`${delK?.lotteryCount ?? 0} lottery(ies) use this category; they will become uncategorised.`} onConfirm={async () => { try { await api.del(`/admin/categories/${delK!.id}`); toast('Category deleted'); cats.reload(); } catch (e) { toast((e as Error).message, 'error'); } }} />
    </>
  );
}
