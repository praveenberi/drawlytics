import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Button, Card, CardHeader, Field, Input, PageHeader } from '@/components/ui';
import { PredictionDisclaimer } from '@/components/shared';

export function About() {
  return (
    <>
      <PageHeader title="About Drawlytics" subtitle="A global lottery information and statistical analysis platform." />
      <div className="max-w-3xl space-y-6">
        <PredictionDisclaimer />
        <Card><CardHeader title="What this site does" /><div className="space-y-3 p-5 text-sm leading-relaxed text-navy-700">
          <p>Drawlytics collects historical winning numbers from lotteries around the world, lets you browse and export them, and calculates descriptive statistics: frequency, hot and cold numbers, gaps, odd/even and high/low balance, consecutive numbers, pairs and more.</p>
          <p>The “Number Suggestions” tool combines those statistics with configurable formulas to produce number combinations. Every suggestion you generate is saved and automatically compared with the real result once it is published, so you can see for yourself how it performs against plain chance.</p>
        </div></Card>
        <Card><CardHeader title="What it cannot do" /><div className="space-y-3 p-5 text-sm leading-relaxed text-navy-700">
          <p>Fair lottery draws are independent random events. A number that has appeared often is not “hot” in any causal sense, and a number that has not appeared for a long time is not “due”. No formula here — or anywhere — can reliably predict winning numbers, and no outcome is guaranteed.</p>
          <p>Results labelled <strong>SAMPLE</strong> are demonstration data generated for development and are not real draws. Always verify results with the official lottery operator.</p>
        </div></Card>
        <Card><CardHeader title="Play responsibly" /><p className="p-5 text-sm text-navy-700">Only spend what you can afford to lose. If gambling is a problem, contact your local support service.</p></Card>
      </div>
    </>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const from = (loc.state as { from?: string } | null)?.from ?? '/';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const u = mode === 'login' ? await login(email, password) : await register(name, email, password);
      nav(u.role === 'ADMIN' && from === '/' ? '/admin' : from, { replace: true });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-1 text-sm text-navy-500">{mode === 'login' ? 'Sign in to generate and track number suggestions.' : 'Free account – needed to save your suggestions.'}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'register' && <Field label="Name"><Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 8 characters, with a letter and a number.' : undefined}><Input type="password" required minLength={mode === 'register' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
          {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
          <Button type="submit" variant="gold" className="w-full" loading={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-navy-500">{mode === 'login' ? <>No account? <Link to="/register" className="font-semibold text-navy-800 underline">Register</Link></> : <>Already registered? <Link to="/login" className="font-semibold text-navy-800 underline">Sign in</Link></>}</p>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-extrabold text-navy-200">404</p>
      <p className="mt-2 text-lg font-semibold">Page not found</p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-navy-700 underline">Back to home</Link>
    </div>
  );
}
