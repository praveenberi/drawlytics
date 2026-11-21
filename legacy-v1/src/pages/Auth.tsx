import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';

export default function AuthPage() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const res = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) setMsg({ ok: false, text: res.error.message });
    else if (mode === 'up' && !res.data.session) setMsg({ ok: true, text: 'Account created. Check your email to confirm your address, then sign in.' });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Lotto Insights</CardTitle>
          <CardDescription>{mode === 'in' ? 'Sign in to your private lottery database.' : 'Create an account. Your data is private to you.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" hint={mode === 'up' ? 'At least 6 characters.' : undefined}>
              <Input type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {msg && <p className={msg.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>{msg.text}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === 'in' ? 'Sign in' : 'Create account'}
            </Button>
            <button type="button" className="w-full text-center text-sm text-accent hover:underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
              {mode === 'in' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
