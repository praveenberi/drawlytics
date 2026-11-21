import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/utils';
import { Badge, Card, CardHeader, Empty, ErrorBox, PageHeader, Spinner, StatCard } from '@/components/ui';

interface D {
  totals: { lotteries: number; activeLotteries: number; countries: number; publishedDraws: number; pendingDraws: number; users: number; predictions: number; evaluatedPredictions: number };
  uploads: { total: number; last30Days: number; failed: number; recordsImported: number; recordsFailed: number };
  recentUploads: { id: string; fileName: string; lottery: string; status: string; successful: number; failed: number; uploadedAt: string }[];
  recentActivity: { id: string; action: string; entityType: string; user: string | null; createdAt: string }[];
  formulaPerformance: { formulaId: string; formula: string; lottery: string; evaluated: number; avgMatchedNumbers: number | null; avgMatchedBonus: number | null; expectedByChance: number | null }[];
}
const tone = (s: string) => (s === 'COMPLETED' ? 'green' : s === 'PARTIAL' ? 'gold' : 'red');

export default function AdminDashboard() {
  const { data, loading, error, reload } = useFetch<D>('/admin/dashboard');
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? 'Failed to load'} onRetry={reload} />;
  const t = data.totals;
  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle="Overview of lotteries, results, imports, users and prediction performance." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total lotteries" value={t.lotteries} hint={`${t.activeLotteries} active`} />
        <StatCard label="Countries" value={t.countries} />
        <StatCard label="Published draws" value={t.publishedDraws} />
        <StatCard tone="gold" label="Pending results" value={t.pendingDraws} hint="saved but not published" />
        <StatCard label="Bulk uploads" value={data.uploads.total} hint={`${data.uploads.last30Days} in last 30 days`} />
        <StatCard label="Failed imports" value={data.uploads.failed} hint={`${data.uploads.recordsFailed} invalid rows total`} />
        <StatCard label="Registered users" value={t.users} />
        <StatCard label="Predictions generated" value={t.predictions} hint={`${t.evaluatedPredictions} evaluated`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Formula performance overview" description="Average matched main numbers vs. what pure chance would give." actions={<Link to="/admin/performance" className="text-sm font-medium text-navy-600 hover:text-gold-600">Details</Link>} />
          <div className="p-5">
            {data.formulaPerformance.length === 0 ? <Empty title="No evaluated predictions yet">Evaluations appear after results are published for lotteries that have suggestions.</Empty> : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.formulaPerformance.map((f) => ({ name: f.formula, avg: Number((f.avgMatchedNumbers ?? 0).toFixed(2)), chance: Number((f.expectedByChance ?? 0).toFixed(2)) }))} margin={{ left: -12 }}>
                    <CartesianGrid vertical={false} stroke="#e8edf7" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="avg" name="Avg matched" fill="#22335f" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="chance" name="Expected by chance" fill="#e2b52c" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent bulk uploads" actions={<Link to="/admin/upload" className="text-sm font-medium text-navy-600 hover:text-gold-600">Upload</Link>} />
          <ul className="divide-y divide-navy-50 text-sm">
            {data.recentUploads.length === 0 && <li className="p-5 text-navy-400">No uploads yet.</li>}
            {data.recentUploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><p className="truncate font-medium">{u.fileName}</p><p className="text-xs text-navy-400">{u.lottery} · {fmtDateTime(u.uploadedAt)}</p></div>
                <div className="shrink-0 text-right"><Badge tone={tone(u.status)}>{u.status}</Badge><p className="mt-1 text-xs text-navy-400">{u.successful} ok · {u.failed} failed</p></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" actions={<Link to="/admin/audit" className="text-sm font-medium text-navy-600 hover:text-gold-600">Audit log</Link>} />
        <ul className="divide-y divide-navy-50 text-sm">
          {data.recentActivity.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"><span><Badge tone="gray">{a.action}</Badge> <span className="ml-1">{a.entityType}</span></span><span className="text-xs text-navy-400">{a.user ?? 'system'} · {fmtDateTime(a.createdAt)}</span></li>
          ))}
        </ul>
      </Card>
      <p className="mt-4 text-xs text-navy-400">Averages: {fmtNum(0)} means no matches. Randomness dominates short samples — treat small numbers cautiously.</p>
    </>
  );
}
