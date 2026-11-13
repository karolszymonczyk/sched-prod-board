// Opens the real deployed board (real API) with video on; logs row changes, network and console with video time.
import { chromium } from 'playwright';
import fs from 'node:fs';
const url = process.argv[2]; const secs = +(process.argv[3] || 180); const outDir = process.argv[4] || 'rec/raw';
const t0 = Date.now();
const browser = await chromium.launch({ channel: 'chrome' });
fs.mkdirSync(`${outDir}/frames`, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 }, timezoneId: 'Europe/Berlin', locale: 'en-GB' });
await ctx.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.id='__ptr'; d.style.cssText='position:fixed;z-index:99999;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,0,90,.55);border:2px solid #c00050;pointer-events:none;left:-50px;top:-50px'; document.body.append(d); addEventListener('mousemove', (e) => { d.style.left=e.clientX+'px'; d.style.top=e.clientY+'px'; }, true); addEventListener('mousedown', () => { d.style.background='rgba(220,0,90,.95)'; }, true); addEventListener('mouseup', () => { d.style.background='rgba(220,0,90,.55)'; }, true); }); });
const page = await ctx.newPage();
// Chrome screencast -> timestamped JPEG frames (stitched by scripts/stitch.py with system ffmpeg).
const cdp = await ctx.newCDPSession(page); let nf = 0; const frames = [];
cdp.on('Page.screencastFrame', async (f) => { const n = String(nf++).padStart(6, '0'); fs.writeFileSync(`${outDir}/frames/${n}.jpg`, Buffer.from(f.data, 'base64')); frames.push([n, Date.now() - t0]); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
const mmss = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const log = (...a) => { const l = `${mmss()} ${new Date().toISOString()} ${a.join(' ')}`; console.log(l); fs.appendFileSync(`${outDir}/events.log`, l + '\n'); };
page.on('console', (m) => log('console', m.type(), m.text()));
page.on('response', async (r) => { if (r.url().includes('/api/')) { const u = new URL(r.url()); let b = ''; try { b = await r.text(); } catch {} log('resp', u.pathname.split('/').pop(), r.status(), u.pathname.endsWith('/ack') ? b : b.length + 'B'); } });
await page.goto(url);
let last = '';
const end = Date.now() + secs * 1000;
while (Date.now() < end) {
  const ids = await page.getByTestId('incident-row').evaluateAll((e) => e.map((x) => x.dataset.id + (x.querySelector('[data-testid=acked]') ? '*' : ''))).catch(() => []);
  const s = ids.join(','); if (s !== last) { log('rows', ids.length, s); last = s; }
  if (process.env.ACT_AT && !globalThis.__acted && Date.now() - t0 > +process.env.ACT_AT * 1000) {
    globalThis.__acted = true;
    // Like a person: pick a row, move the pointer onto its Ack, read it, click. The page keeps changing meanwhile.
    const row = page.getByTestId('incident-row').nth(+(process.env.ROW || 0)); const id = await row.getAttribute('data-id');
    const box = await row.getByTestId('ack').boundingBox(); const x = box.x + box.width / 2, y = box.y + box.height / 2;
    log('aim', id, 'pointer to', Math.round(x), Math.round(y));
    await page.mouse.move(x, y, { steps: 15 });
    // The person is reading the row; the click lands ~150 ms after the next insert (too fast to react to).
    await page.evaluate(() => new Promise((res) => { const l = document.querySelector('[data-testid=incident-list]'); const n = l.children.length; new MutationObserver((_, o) => { if (l.children.length !== n) { o.disconnect(); res(); } }).observe(l, { childList: true }); }));
    await page.waitForTimeout(150);
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid=incident-row]')?.dataset.id, [x, y]);
    log('click', 'expected', id, 'under-pointer', under);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(1500);
    const marks = await page.locator('[data-testid=acked]').evaluateAll((e) => e.map((m) => m.closest('[data-testid=incident-row]').dataset.id));
    log('acked-marks', marks.join(','));
  }
  await page.waitForTimeout(500);
}
await cdp.send('Page.stopScreencast').catch(() => {});
fs.writeFileSync(`${outDir}/frames.json`, JSON.stringify({ frames, endMs: Date.now() - t0 }));
await ctx.close(); await browser.close();
