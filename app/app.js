import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');

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

function makeRow(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, fmt.format(new Date(i.openedAt))),
  );
  const slot = el('span', { class: 'act' });
  li.append(slot);
  renderAck(slot, i.id);
  return li;
}

function renderAck(slot, id) {
  slot.replaceChildren();
  if (acked.has(id)) {
    slot.append(el('span', { 'data-testid': 'acked', class: 'acked' }, '✓ acked'));
    return;
  }
  const btn = el('button', { 'data-testid': 'ack', type: 'button' }, 'Ack');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await ack(id); // R2
      acked.add(id);
      renderAck(slot, id);
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      status.textContent = `ack failed for ${id}`;
    }
  });
  slot.append(btn);
}

function update(incidents) {
  // R1: newest first, new ones at the top. Update times in place; drop rows the API no longer lists.
  const seen = new Set(incidents.map((i) => i.id));
  for (const [id, li] of rows) if (!seen.has(id)) { li.remove(); rows.delete(id); }
  let prev = null;
  for (const i of incidents) {
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
