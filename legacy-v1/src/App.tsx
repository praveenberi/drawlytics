import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from '@/context/AppContext';
import { Layout } from '@/components/Layout';
import AuthPage from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import Games from '@/pages/Games';
import HistoryPage from '@/pages/History';
import Analysis from '@/pages/Analysis';
import Generator from '@/pages/Generator';
import Favourites from '@/pages/Favourites';
import CsvPage from '@/pages/CsvPage';
import SettingsPage from '@/pages/Settings';
import { Button } from '@/components/ui/button';

function Gate() {
  const { mode, authReady, session, loading, loadError, reload } = useApp();
  if (!authReady) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (mode === 'supabase' && !session) return <AuthPage />;
  if (loadError)
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-lg font-semibold">Could not load your data</h1>
        <p className="mt-2 text-sm text-destructive">{loadError}</p>
        <p className="mt-2 text-sm text-muted-foreground">If you just created your Supabase project, make sure <code>supabase/schema.sql</code> has been run.</p>
        <Button className="mt-4" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading your data…</div>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="games" element={<Games />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="analysis" element={<Analysis />} />
        <Route path="generator" element={<Generator />} />
        <Route path="favourites" element={<Favourites />} />
        <Route path="csv" element={<CsvPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Gate />
      </AppProvider>
    </BrowserRouter>
  );
}
