/**
 * End-to-end API smoke test against a running server + seeded database.
 *   npm run dev            (in one terminal)
 *   npm run test:api       (in another)
 * Creates a throw-away country/lottery, exercises auth, RBAC, CRUD, bulk import, analysis,
 * suggestions and evaluation, then cleans up after itself.
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000/api';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@drawlytics.local', password: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026' };

let pass = 0, fail = 0;
const ok = (cond: unknown, name: string, extra?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`, extra ?? ''); }
};

class Client {
  cookie = '';
  async req(method: string, path: string, body?: unknown, form?: FormData) {
    const r = await fetch(BASE + path, { method, headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* csv etc */ }
    return { status: r.status, json, text, headers: r.headers };
  }
}

const anon = new Client(), admin = new Client(), user = new Client();
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log('Auth & RBAC');
  ok((await admin.req('POST', '/auth/login', ADMIN)).status === 200, 'admin can log in');
  ok((await anon.req('POST', '/auth/login', { email: ADMIN.email, password: 'wrong-password1' })).status === 401, 'wrong password rejected');
  const email = `tester${Date.now()}@example.com`;
  ok((await user.req('POST', '/auth/register', { name: 'Tester', email, password: 'Passw0rdTest' })).status === 201, 'user can register');
  ok((await user.req('POST', '/auth/register', { name: 'Tester', email, password: 'Passw0rdTest' })).status === 409, 'duplicate email rejected');
  ok((await anon.req('GET', '/admin/dashboard')).status === 401, 'anonymous blocked from admin API');
  ok((await user.req('GET', '/admin/dashboard')).status === 403, 'normal user blocked from admin API');
  ok((await user.req('POST', '/admin/lotteries', {})).status === 403, 'normal user cannot create lotteries');
  ok((await admin.req('GET', '/admin/dashboard')).status === 200, 'admin dashboard OK');

  console.log('Catalog CRUD');
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const code = 'Z' + A[Math.floor(Math.random() * 26)] + A[Math.floor(Math.random() * 26)];
  const country = (await admin.req('POST', '/admin/countries', { countryName: `Testland ${code}`, countryCode: code, currency: 'TST', timezone: 'UTC' })).json;
  ok(country?.id, 'create country');
  const rules = { mainCount: 5, minNumber: 1, maxNumber: 20, allowDuplicates: false, ordered: false, padDigits: 2, bonus: { count: 1, minNumber: 1, maxNumber: 5, allowDuplicates: false, separatePool: true } };
  const lot = { countryId: country.id, categoryId: null, lotteryName: 'Test 5/20', provider: 'Tester', drawFrequency: 'DAILY', drawDays: [], drawTime: '23:59', timezone: 'UTC', rules, status: 'ACTIVE' };
  const created = await admin.req('POST', '/admin/lotteries', lot);
  ok(created.status === 201, 'create lottery', created.json);
  const L = created.json;
  ok((await admin.req('POST', '/admin/lotteries', { ...lot, rules: { ...rules, maxNumber: 3 } })).status === 400, 'invalid rules rejected');
  ok((await admin.req('PUT', `/admin/lotteries/${L.id}`, { ...lot, provider: 'Tester 2' })).json?.provider === 'Tester 2', 'update lottery');

  console.log('Draws');
  const d = (n: number) => iso(new Date(Date.now() - n * 86400000));
  const mk = (n: number, main: number[], bonus: number[], ref?: string) => admin.req('POST', '/admin/draws', { lotteryId: L.id, drawDate: d(n), drawReference: ref, mainNumbers: main, bonusNumbers: bonus });
  ok((await mk(100, [1, 2, 3, 4, 5], [1], 'A1')).status === 201, 'add draw');
  ok((await mk(100, [1, 2, 3, 4, 6], [1], 'A2')).status === 409, 'duplicate date rejected');
  ok((await mk(99, [1, 2, 3, 4, 6], [1], 'A1')).status === 409, 'duplicate reference rejected');
  ok((await mk(98, [1, 2, 3, 4, 4], [1])).status === 400, 'duplicate numbers rejected');
  ok((await mk(98, [1, 2, 3, 4, 25], [1])).status === 400, 'out-of-range number rejected');
  ok((await mk(98, [1, 2, 3, 4, 5], [9])).status === 400, 'out-of-range bonus rejected');
  ok((await mk(98, [1, 2, 3, 4], [1])).status === 400, 'wrong count rejected');

  console.log('Bulk import');
  const rnd = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const r = rnd(42);
  const lines = ['draw_date,draw_id,number_1,number_2,number_3,number_4,number_5,bonus_number'];
  for (let i = 97; i >= 5; i--) {
    const s = new Set<number>();
    while (s.size < 5) s.add(1 + Math.floor(r() * 20));
    lines.push(`${d(i)},T${i},${[...s].map((n) => String(n).padStart(2, '0')).join(',')},${1 + Math.floor(r() * 5)}`);
  }
  lines.push(`${d(100)},DUP,01,02,03,04,05,1`);   // duplicate date (db)
  lines.push(`not-a-date,BAD,01,02,03,04,05,1`);   // bad date
  lines.push(`${d(4)},BAD2,01,02,03,04,40,1`);     // out of range
  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.append('file', new Blob([lines.join('\n')], { type: 'text/csv' }), 'test.csv');
    f.append('lotteryId', L.id);
    Object.entries(extra).forEach(([k, v]) => f.append(k, v));
    return f;
  };
  const insp = await admin.req('POST', '/admin/uploads/inspect', undefined, form());
  ok(insp.json?.suggestedMapping?.main?.length === 5 && insp.json.suggestedMapping.drawDate === 'draw_date', 'auto-maps columns', insp.json);
  const prev = await admin.req('POST', '/admin/uploads/preview', undefined, form({ mapping: JSON.stringify(insp.json.suggestedMapping) }));
  ok(prev.json?.summary?.invalid === 2 && prev.json.summary.duplicates === 1, 'preview flags invalid + duplicate rows', prev.json?.summary);
  const rej = await admin.req('POST', '/admin/uploads/commit', undefined, form({ mapping: JSON.stringify(insp.json.suggestedMapping), duplicatePolicy: 'reject' }));
  ok(rej.json?.status === 'REJECTED' && rej.json.created === 0, 'reject policy aborts import', rej.json);
  const commit = await admin.req('POST', '/admin/uploads/commit', undefined, form({ mapping: JSON.stringify(insp.json.suggestedMapping), duplicatePolicy: 'skip' }));
  ok(commit.json?.created === 93 && commit.json.skipped === 1 && commit.json.failed === 2, 'skip policy imports valid rows', commit.json);
  const upd = await admin.req('POST', '/admin/uploads/commit', undefined, form({ mapping: JSON.stringify(insp.json.suggestedMapping), duplicatePolicy: 'update' }));
  ok(upd.json?.updated >= 93, 're-import with update policy updates existing', upd.json);
  const err = await admin.req('GET', `/admin/uploads/${commit.json.uploadId}/errors.csv`);
  ok(err.status === 200 && err.text.includes('BAD'), 'error report downloadable');
  ok((await admin.req('GET', '/admin/uploads/history')).json?.total >= 3, 'upload history recorded');
  const xl = await admin.req('GET', `/admin/uploads/template?lotteryId=${L.id}&format=xlsx`);
  ok(xl.status === 200, 'xlsx template');
  const bad = new FormData(); bad.append('file', new Blob(['MZ\x00\x01'], { type: 'text/csv' }), 'evil.csv'); bad.append('lotteryId', L.id);
  ok((await admin.req('POST', '/admin/uploads/inspect', undefined, bad)).status === 400, 'binary file disguised as csv rejected');
  const exe = new FormData(); exe.append('file', new Blob(['x']), 'evil.exe'); exe.append('lotteryId', L.id);
  ok((await admin.req('POST', '/admin/uploads/inspect', undefined, exe)).status === 400, '.exe upload rejected');

  console.log('Public API');
  const list = await anon.req('GET', `/lotteries?q=Testland&pageSize=5`);
  ok(list.json?.items?.some((x: any) => x.id === L.id), 'search finds lottery by country');
  const hist = await anon.req('GET', `/lotteries/${L.id}/draws?pageSize=10&sort=asc`);
  ok(hist.json?.total >= 94 && hist.json.items.length === 10, 'paginated history', hist.json?.total);
  ok((await anon.req('GET', `/lotteries/${L.id}/draws?q=T50`)).json?.total === 1, 'search by draw reference');
  ok((await anon.req('GET', `/lotteries/${L.id}/draws?q=${d(100)}`)).json?.total === 1, 'search by draw date');
  const csv = await anon.req('GET', `/lotteries/${L.id}/draws/export.csv`);
  ok(csv.status === 200 && csv.text.split('\n')[0].includes('number_1'), 'CSV export');
  const an = await anon.req('GET', `/analysis/${L.id}?last=50`);
  ok(an.json?.summary?.drawCount === 50 && an.json.frequency.length === 20 && an.json.heatmap.rows.length === 20 && an.json.pairs.length > 0, 'analysis payload', an.json?.summary);
  ok((await anon.req('POST', '/predictions/generate', { lotteryId: L.id })).status === 401, 'anonymous cannot generate suggestions');

  console.log('Formulas, suggestions, evaluation');
  const fcfg = (await admin.req('GET', '/admin/algorithm-types')).json.defaultConfig;
  const f1 = await admin.req('POST', '/admin/formulas', { lotteryId: L.id, formulaName: 'Test Formula', formulaConfig: fcfg, activate: true });
  ok(f1.status === 201 && f1.json.version === 1 && f1.json.isActive, 'create + activate formula', f1.json);
  const f2 = await admin.req('POST', '/admin/formulas', { lotteryId: L.id, formulaName: 'Test Formula', formulaConfig: { ...fcfg, combinations: 4 }, activate: true });
  ok(f2.json?.version === 2, 'new version created');
  const lst = (await admin.req('GET', `/admin/formulas?lotteryId=${L.id}`)).json.items;
  ok(lst.filter((x: any) => x.isActive).length === 1, 'only one active formula per lottery');
  ok((await admin.req('POST', '/admin/formulas', { lotteryId: L.id, formulaName: 'Bad', formulaConfig: { ...fcfg, oddEven: { minOdd: 5, maxOdd: 1, enforce: true } } })).status === 400, 'invalid formula config rejected');
  const t = await admin.req('POST', '/admin/formulas/test', { lotteryId: L.id, formulaConfig: fcfg, lastN: 30 });
  ok(t.json?.tested === 30 && typeof t.json.avgMain === 'number' && typeof t.json.baselineAvgMain === 'number', 'formula back-test vs random baseline', t.json?.error);
  const gen = await user.req('POST', '/predictions/generate', { lotteryId: L.id });
  ok(gen.status === 201 && gen.json.items.length === 4 && gen.json.items[0].referenceId && gen.json.disclaimer.startsWith('Disclaimer:'), 'user generates suggestions', gen.json);
  const valid = gen.json.items.every((p: any) => p.suggestedNumbers.length === 5 && new Set(p.suggestedNumbers).size === 5 && p.suggestedNumbers.every((n: number) => n >= 1 && n <= 20) && p.bonusNumbers.length === 1);
  ok(valid, 'suggestions respect lottery rules');
  const todayDraw = await admin.req('POST', '/admin/draws', { lotteryId: L.id, drawDate: iso(new Date()), drawReference: 'TODAY', mainNumbers: gen.json.items[0].suggestedNumbers, bonusNumbers: gen.json.items[0].bonusNumbers });
  ok(todayDraw.status === 201 && todayDraw.json.evaluatedPredictions >= 4, 'publishing a draw evaluates earlier suggestions', todayDraw.json);
  const mine = (await user.req('GET', '/predictions')).json;
  const first = mine.items.find((p: any) => p.referenceId === gen.json.items[0].referenceId);
  ok(first?.performanceStatus === 'EVALUATED' && first.matchedNumbers === 5 && first.matchedBonus === 1, 'match counts stored (main + bonus separately)', first);
  const perf = (await admin.req('GET', `/admin/performance?lotteryId=${L.id}`)).json;
  ok(perf.items.some((x: any) => x.evaluated >= 4), 'performance statistics');

  console.log('Users & audit');
  const users = (await admin.req('GET', `/admin/users?q=${email}`)).json;
  ok(users.total === 1, 'admin lists users');
  const uid = users.items[0].id;
  ok((await admin.req('PATCH', `/admin/users/${uid}`, { status: 'SUSPENDED' })).status === 200, 'admin suspends user');
  ok((await user.req('GET', '/predictions')).status === 401, 'suspended user loses access');
  const audit = (await admin.req('GET', `/admin/audit-logs?entityType=Lottery&entityId=${L.id}`)).json;
  ok(audit.total >= 2 && audit.items.some((a: any) => a.action === 'UPDATE' && a.oldValue && a.newValue), 'audit trail has old/new values');

  console.log('Cleanup');
  ok((await admin.req('DELETE', `/admin/countries/${country.id}`)).status === 409, 'country with lotteries cannot be deleted');
  ok((await admin.req('DELETE', `/admin/lotteries/${L.id}`)).json?.ok, 'delete lottery');
  ok((await admin.req('DELETE', `/admin/countries/${country.id}`)).json?.ok, 'delete country');
  ok((await admin.req('DELETE', `/admin/users/${uid}`)).json?.ok, 'delete test user');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
