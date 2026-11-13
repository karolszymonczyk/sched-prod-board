// Checks the four issues against a board URL with a mocked API (no real acks are sent).
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5174/';
const base = [
  { id: 'INC-1', service: 'auth', region: 'eu-central', summary: 'a', severity: 'sev1', openedAt: '2026-11-12T03:03:00.000Z' },
  { id: 'INC-2', service: 'exports', region: 'us-west', summary: 'b', severity: 'sev2', openedAt: '2026-11-12T02:03:00.000Z' },
];
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
for (const [tz, loc, want] of [['Pacific/Auckland', 'en-NZ', '12/11'], ['Europe/Berlin', 'de-DE', '12.11'], ['America/New_York', 'en-US', '11/11']]) {
  const ctx = await browser.newContext({ timezoneId: tz, locale: loc });
  const page = await ctx.newPage();
  let calls = 0, extra = false, acks = [];
  await page.route('**/incidents?*', async (r) => {
    calls++; await new Promise((s) => setTimeout(s, calls === 1 ? 800 : 0));
    const inc = extra ? [{ id: 'INC-3', service: 'payments', region: 'us-east', summary: 'c', severity: 'sev3', openedAt: '2026-11-12T04:03:00.000Z' }, ...base] : base;
    r.fulfill({ json: { updatedAt: new Date().toISOString(), incidents: inc, cursor: `c${calls}` } });
  });
  await page.route('**/ack?*', (r) => { const u = new URL(r.request().url()); acks.push([u.searchParams.get('id'), u.searchParams.get('cursor')]); r.fulfill({ json: { id: u.searchParams.get('id'), ackedAt: new Date().toISOString(), receipt: 'r' } }); });
  await page.goto(url);
  ok(await page.getByTestId('loader').isVisible(), `${tz}: loader on open`);
  await page.getByTestId('incident-row').first().waitFor();
  ok(await page.getByTestId('loader').count() === 0, `${tz}: loader gone after load`);
  const t = await page.locator('[data-id="INC-1"] time').textContent();
  const dt = await page.locator('[data-id="INC-1"] time').getAttribute('datetime');
  ok(t.includes(want) && dt === base[0].openedAt, `${tz}: time "${t}" (datetime ${dt})`);
  await page.locator('[data-id="INC-2"] [data-testid="ack"]').click();
  await page.locator('[data-id="INC-2"] [data-testid="acked"]').waitFor();
  ok(acks.length === 1 && acks[0][0] === 'INC-2', `${tz}: ack sent for INC-2 with cursor ${acks[0]?.[1]}`);
  extra = true; const before = calls; await page.waitForTimeout(4500);
  ok(calls - before >= 2, `${tz}: refreshed ${calls - before}x in 4.5s`);
  const ids = await page.getByTestId('incident-row').evaluateAll((els) => els.map((e) => e.dataset.id));
  ok(ids.join() === 'INC-3,INC-1,INC-2', `${tz}: new incident on top without reload: ${ids}`);
  ok(await page.locator('[data-id="INC-2"] [data-testid="acked"]').count() === 1, `${tz}: acked mark survives refresh`);
  const sha = await page.getByTestId('build-sha').textContent(); const meta = await page.locator('meta[name=build]').getAttribute('content');
  ok(sha === meta && /^[0-9a-f]{40}$/.test(sha), `${tz}: build sha ${sha.slice(0, 7)} in meta + footer`);
  await ctx.close();
}
await browser.close();
