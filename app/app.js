import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');
const panel = document.querySelector('[data-testid="incident-panel"]');

// Rows are keyed by incident id and kept across refreshes, so an acked mark survives and
// existing rows are never re-created under the pointer.
const rows = new Map();
const acked = new Set();

// R5: viewer's own zone and locale order (en-GB/de/fr… give day before month; en-US month first).
const fmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

const byId = new Map(); // latest data per incident, for the panel
let openId = null;

function makeRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}`, tabindex: '0', role: 'button', 'aria-label': `Open ${i.id}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, fmt.format(new Date(i.openedAt))),
    el('span', { class: 'act' }),
  );
  // Product decision (step 2): Ack leaves the row. A row opens its incident panel; Ack lives there.
  li.addEventListener('click', () => openPanel(i.id));
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(i.id); } });
  markRow(li, i.id);
  return li;
}

function markRow(li, id) {
  const slot = li.querySelector('.act');
  slot.replaceChildren();
  if (acked.has(id)) slot.append(el('span', { 'data-testid': 'acked', class: 'acked' }, '✓ acked'));
}

function openPanel(id) {
  openId = id;
  for (const [rid, li] of rows) li.classList.toggle('open', rid === id);
  renderPanel();
}

function closePanel() {
  openId = null;
  for (const li of rows.values()) li.classList.remove('open');
  renderPanel();
}

function renderPanel() {
  const i = openId && byId.get(openId);
  panel.hidden = !i;
  if (!i) return panel.replaceChildren();
  const close = el('button', { type: 'button', class: 'close', 'aria-label': 'Close panel' }, '×');
  close.addEventListener('click', closePanel);
  const body = [
    el('div', { class: 'phead' }, null),
    el('h2', { class: 'pid' }, i.id),
    el('p', { class: `psev ${i.severity}` }, i.severity),
    el('p', {}, i.summary),
    el('p', { class: 'pmeta' }, `${i.service} · ${i.region}`),
    el('p', { class: 'pmeta' }, null),
  ];
  body[0].append(el('span', {}, 'incident'), close);
  body[5].append(el('time', { datetime: i.openedAt }, fmt.format(new Date(i.openedAt))));
  const foot = el('div', { class: 'pfoot' });
  if (acked.has(i.id)) {
    foot.append(el('span', { class: 'acked' }, `✓ ${i.id} acked`));
  } else {
    const btn = el('button', { 'data-testid': 'panel-ack', type: 'button', class: 'primary' }, `Ack ${i.id}`);
    const id = i.id; // the panel's incident, fixed when the panel opened: rows moving cannot change it
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await ack(id); // R2
        acked.add(id);
        const li = rows.get(id); if (li) markRow(li, id);
      } catch (e) {
        console.error(e);
        status.textContent = `ack failed for ${id}`;
      }
      if (openId === id) renderPanel();
    });
    foot.append(btn);
  }
  panel.replaceChildren(...body, foot);
}

function update(incidents) {
  // R1: newest first, new ones at the top. Update times in place; drop rows the API no longer lists.
  const seen = new Set(incidents.map((i) => i.id));
  for (const [id, li] of rows) if (!seen.has(id)) { li.remove(); rows.delete(id); }
  let prev = null;
  for (const i of incidents) {
    byId.set(i.id, i);
    let li = rows.get(i.id);
    if (!li) { li = makeRow(i); rows.set(i.id, li); }
    else {
      const t = li.querySelector('time');
      if (t.getAttribute('datetime') !== i.openedAt) {
        t.setAttribute('datetime', i.openedAt);
        t.setAttribute('title', i.openedAt);
        t.textContent = fmt.format(new Date(i.openedAt));
      }
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (want !== li) list.insertBefore(li, want);
    prev = li;
  }
  empty.hidden = incidents.length > 0;
  list.hidden = incidents.length === 0;
}

async function tick() {
  try {
    const page = await fetchIncidents();
    update(page.incidents);
    status.textContent = `updated ${fmt.format(new Date(page.updatedAt))}`;
  } catch (e) {
    console.error(e);
    status.textContent = 'refresh failed — retrying';
  } finally {
    if (loader) loader.remove(); // R3: gone once the first answer is in
    board.setAttribute('aria-busy', 'false');
  }
}

await tick();
setInterval(tick, REFRESH_MS); // R4
