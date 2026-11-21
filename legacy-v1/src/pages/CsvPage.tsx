import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Badge, Table, Td, Th } from '@/components/ui/misc';
import { InfoNote, PageHeader, Pagination } from '@/components/common';
import { PERIOD_OPTIONS, parsePeriod } from '@/lib/analysis';
import { downloadCsv } from '@/lib/csv';
import { exportFavourites, exportFrequency, exportGames, exportGenerated, exportHistory, exportHotCold } from '@/lib/exports';
import { IMPORT_TEMPLATE_HEADERS, analyseImport, type DateFormat, type ParsedImport } from '@/lib/importer';

function ExportCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">{children}</CardContent>
    </Card>
  );
}

export default function CsvPage() {
  const { data, game, importDraws, toast, setGameId } = useApp();
  const [period, setPeriod] = useState('all');
  const [hcK, setHcK] = useState(10);

  // import state
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fmt, setFmt] = useState<DateFormat>('iso');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [filter, setFilter] = useState<'all' | 'valid' | 'duplicate' | 'invalid'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c = { valid: 0, duplicate: 0, invalid: 0 };
    parsed?.rows.forEach((r) => c[r.status]++);
    return c;
  }, [parsed]);
  const shown = useMemo(() => (parsed ? parsed.rows.filter((r) => filter === 'all' || r.status === filter) : []), [parsed, filter]);

  function analyse(t = text, f = fmt) {
    setParsed(analyseImport(t, data.games, game, data.draws, f));
    setPage(1);
    setFilter('all');
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('File is larger than 10 MB.', 'error');
    const t = await file.text();
    setText(t);
    setFileName(file.name);
    analyse(t);
  }

  async function commit() {
    if (!parsed) return;
    const inputs = parsed.rows.filter((r) => r.status === 'valid' && r.input).map((r) => r.input!);
    if (!inputs.length) return;
    setBusy(true);
    const saved = await importDraws(inputs);
    setBusy(false);
    if (saved) {
      toast(`Imported ${saved.length} draw${saved.length === 1 ? '' : 's'}. Skipped ${counts.duplicate} duplicate and ${counts.invalid} invalid row(s).`);
      setText('');
      setFileName('');
      setParsed(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const gameBlock = !game;

  return (
    <>
      <PageHeader title="CSV Import / Export" description="Files use UTF-8 with a byte-order mark and CRLF line endings, so they open correctly in Microsoft Excel and Google Sheets." />

      <h2 className="mb-3 text-lg font-semibold">Export</h2>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Game for single-game exports">
          <Select value={game?.id ?? ''} onChange={(e) => setGameId(e.target.value)} disabled={gameBlock}>
            {gameBlock && <option value="">No games</option>}
            {data.games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Analysis period">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hot / cold list size">
          <Select value={hcK} onChange={(e) => setHcK(Number(e.target.value))}>
            {[5, 6, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ExportCard title="Lottery games" description={`All ${data.games.length} configured games and their rules.`}>
          <Button disabled={!data.games.length} onClick={() => exportGames(data.games)}>
            <Download /> Download games
          </Button>
        </ExportCard>
        <ExportCard title="Historical winning results" description="Re-importable. Includes source (manual / CSV / external).">
          <Button disabled={!game} onClick={() => game && exportHistory(data.draws, data.games, game)}>
            <Download /> Selected game
          </Button>
          <Button variant="outline" disabled={!data.draws.length} onClick={() => exportHistory(data.draws, data.games)}>
            <Download /> All games
          </Button>
        </ExportCard>
        <ExportCard title="Number frequency analysis" description="Counts, percentages, ranks and gaps for every number.">
          <Button disabled={!game} onClick={() => game && exportFrequency(game, data.draws, parsePeriod(period))}>
            <Download /> Download frequency
          </Button>
        </ExportCard>
        <ExportCard title="Hot and cold numbers" description="The hottest and coldest numbers for the chosen period.">
          <Button disabled={!game} onClick={() => game && exportHotCold(game, data.draws, parsePeriod(period), hcK)}>
            <Download /> Download hot / cold
          </Button>
        </ExportCard>
        <ExportCard title="Generated combinations" description={`${data.generated.length} saved experiments (all games).`}>
          <Button disabled={!data.generated.length} onClick={() => exportGenerated(data.generated, data.games)}>
            <Download /> Download generated
          </Button>
        </ExportCard>
        <ExportCard title="Saved favourites" description={`${data.favourites.length} favourite combinations.`}>
          <Button disabled={!data.favourites.length} onClick={() => exportFavourites(data.favourites, data.games)}>
            <Download /> Download favourites
          </Button>
        </ExportCard>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Import historical results</h2>
      <Card>
        <CardContent className="space-y-4 pt-4">
          <InfoNote>
            <p>
              Required columns: <code>draw_date</code> and either <code>numbers</code> (space-separated, e.g. <code>3 11 18 27 34 46</code>) or <code>n1, n2, …</code>. Optional: <code>draw_number</code>, <code>bonus_numbers</code> (or <code>b1, b2…</code>), <code>jackpot</code>, <code>winners</code>, <code>prize_details</code>, <code>notes</code>, <code>game</code>.
              If there is a <code>game</code> column its name must match an existing game; otherwise the selected game is used. Imported rows are tagged “CSV import”. Nothing is saved until you press Import.
            </p>
          </InfoNote>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Target game (when the file has no game column)">
              <Select value={game?.id ?? ''} onChange={(e) => { setGameId(e.target.value); setParsed(null); }} disabled={gameBlock}>
                {gameBlock && <option value="">No games</option>}
                {data.games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date format in file">
              <Select
                value={fmt}
                onChange={(e) => {
                  const f = e.target.value as DateFormat;
                  setFmt(f);
                  if (text) analyse(text, f);
                }}
              >
                <option value="iso">YYYY-MM-DD (ISO)</option>
                <option value="dmy">DD/MM/YYYY</option>
                <option value="mdy">MM/DD/YYYY</option>
              </Select>
            </Field>
            <Field label="CSV file">
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
                  <FileUp /> {fileName || 'Choose file…'}
                </Button>
              </div>
            </Field>
          </div>
          <Field label="…or paste CSV text">
            <Textarea className="min-h-[96px] font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setFileName(''); }} placeholder={IMPORT_TEMPLATE_HEADERS.join(',')} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!text.trim() || gameBlock} onClick={() => analyse()}>
              <Upload /> Validate &amp; preview
            </Button>
            <Button variant="outline" onClick={() => downloadCsv('lotto-import-template', IMPORT_TEMPLATE_HEADERS, [])}>
              <Download /> Download blank template
            </Button>
          </div>

          {parsed?.headerError && <p className="text-sm text-destructive">{parsed.headerError}</p>}
          {parsed && !parsed.headerError && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {(['all', 'valid', 'duplicate', 'invalid'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setFilter(f); setPage(1); }}
                    className={`rounded-full border px-3 py-1 ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}
                  >
                    {f === 'all' ? `All (${parsed.rows.length})` : `${f[0].toUpperCase() + f.slice(1)} (${counts[f]})`}
                  </button>
                ))}
              </div>
              <Table>
                <thead>
                  <tr>
                    <Th>Line</Th>
                    <Th>Status</Th>
                    <Th>Draw</Th>
                    <Th>Date</Th>
                    <Th>Numbers</Th>
                    <Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice((page - 1) * pageSize, page * pageSize).map((r) => (
                    <tr key={r.line}>
                      <Td className="tabular">{r.line}</Td>
                      <Td>
                        <Badge variant={r.status === 'valid' ? 'default' : r.status === 'duplicate' ? 'warn' : 'danger'}>{r.status}</Badge>
                      </Td>
                      <Td className="tabular">{r.raw.draw_number || '—'}</Td>
                      <Td className="whitespace-nowrap">{r.input?.draw_date || r.raw.draw_date}</Td>
                      <Td className="tabular whitespace-nowrap">
                        {r.raw.numbers}
                        {r.raw.bonus && <span className="text-muted-foreground"> + {r.raw.bonus}</span>}
                      </Td>
                      <Td className="text-xs text-muted-foreground">{r.messages.join(' ')}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} pageSize={pageSize} total={shown.length} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!counts.valid || busy} onClick={commit}>
                  Import {counts.valid} valid draw{counts.valid === 1 ? '' : 's'}
                </Button>
                <span className="text-sm text-muted-foreground">Duplicates ({counts.duplicate}) and invalid rows ({counts.invalid}) are skipped.</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
