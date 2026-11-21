import { useRef, useState } from 'react';
import { Download, LogOut, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { DEFAULT_SETTINGS, type AppData, type ThemeSetting } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { ConfirmDialog, Disclaimer, InfoNote, PageHeader } from '@/components/common';
import { downloadBlob, todayISO } from '@/lib/utils';

export default function SettingsPage() {
  const { data, game, mode, session, signOut, updateSettings, setGameId, restore, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const [wiping, setWiping] = useState(false);

  function backup() {
    const payload = { app: 'lotto-insights', version: 1, exported_at: new Date().toISOString(), data };
    downloadBlob(`lotto-insights-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  async function onRestoreFile(file?: File) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const d = json?.app === 'lotto-insights' ? json.data : null;
      if (!d || !Array.isArray(d.games) || !Array.isArray(d.draws)) throw new Error('not a Lotto Insights backup');
      setPending(d as AppData);
    } catch {
      toast('That file is not a valid Lotto Insights backup.', 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Appearance">
              <Select value={data.settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as ThemeSetting })}>
                <option value="system">Match system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </Select>
            </Field>
            <Field label="Default lottery game">
              <Select value={game?.id ?? ''} onChange={(e) => setGameId(e.target.value)} disabled={!data.games.length}>
                {!data.games.length && <option value="">No games yet</option>}
                {data.games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rows per page in tables">
              <Select value={data.settings.page_size} onChange={(e) => updateSettings({ page_size: Number(e.target.value) })}>
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="outline" size="sm" onClick={() => updateSettings({ ...DEFAULT_SETTINGS, selected_game_id: game?.id ?? null })}>
              <RotateCcw /> Reset preferences
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backup &amp; restore</CardTitle>
            <CardDescription>A backup contains all games, draws, generated combinations, favourites, notes and settings as one JSON file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={backup}>
                <Download /> Download backup
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onRestoreFile(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload /> Restore from backup…
              </Button>
            </div>
            <InfoNote>Restoring replaces <strong>all</strong> current data with the contents of the backup.</InfoNote>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setWiping(true)}>
              <Trash2 /> Delete all my data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {mode === 'supabase' ? (
              <>
                <p>
                  Connected to Supabase. Signed in as <strong>{session?.user.email}</strong>. Your data is private to your account via Row Level Security.
                </p>
                <Button variant="outline" onClick={signOut}>
                  <LogOut /> Sign out
                </Button>
              </>
            ) : (
              <>
                <p>
                  <strong>Local mode.</strong> Supabase is not configured, so everything is stored in this browser only (no account needed). Clear site data and it is gone — download backups regularly.
                </p>
                <p className="text-muted-foreground">
                  To sync across devices, create a Supabase project, run <code>supabase/schema.sql</code>, put the URL and anon key in <code>.env.local</code> and restart. See the README.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About the numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Disclaimer long />
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>The app never invents results — every draw is entered by you or imported from your file.</li>
              <li>Each draw is tagged Manual, CSV import or External so you can tell where it came from.</li>
              <li>All statistics are plain counts over your stored draws and are reproducible.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Restore this backup?"
        confirmLabel="Replace my data"
        message={
          pending && (
            <>
              This will <strong>replace all current data</strong> with the backup: {pending.games.length} games, {pending.draws.length} draws, {pending.favourites?.length ?? 0} favourites. This cannot be undone.
            </>
          )
        }
        onConfirm={async () => {
          if (pending && (await restore(pending))) toast('Backup restored');
        }}
      />
      <ConfirmDialog
        open={wiping}
        onOpenChange={setWiping}
        title="Delete all your data?"
        confirmLabel="Delete everything"
        message="All games, draws, generated combinations and favourites will be permanently deleted. Download a backup first if you might want them back."
        onConfirm={async () => {
          if (await restore({ games: [], draws: [], generated: [], favourites: [], settings: { ...data.settings, selected_game_id: null } })) toast('All data deleted');
        }}
      />
    </>
  );
}
