// RSVP + guestbook dashboard (used inside the builder and on dashboard.html).
import { adminData, setWishHidden, deleteRsvp } from './backend.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = d => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function mountDashboard(el, { weddingId, adminKey, invites = [], events = [], title = 'wedding' }) {
  let data = null;
  let filter = 'all';
  const inviteName = slug => invites.find(v => v.slug === slug)?.name || slug;

  async function load() {
    if (!data) el.innerHTML = '<p class="hint">Loading replies…</p>';
    try {
      data = await adminData(weddingId, adminKey);
      draw();
    } catch (e) {
      el.innerHTML = `<p class="err">⚠ ${esc(e.message)}</p><button class="btn small" data-reload>Retry</button>`;
      el.querySelector('[data-reload]').onclick = load;
    }
  }

  function draw() {
    const rs = data.rsvps, yes = rs.filter(r => r.attending), no = rs.filter(r => !r.attending);
    const heads = yes.reduce((a, r) => a + r.guests, 0);
    const replied = new Set(rs.map(r => r.invite).filter(Boolean));
    const waiting = invites.filter(v => !replied.has(v.slug));
    const evNames = events.length ? events : [...new Set(rs.flatMap(r => r.events))];
    const perEvent = evNames.map(n => [n, yes.filter(r => r.events.includes(n)).reduce((a, r) => a + r.guests, 0)]);
    const rows = filter === 'yes' ? yes : filter === 'no' ? no : rs;
    el.innerHTML = `
      <div class="stats">
        <div class="stat hi"><b>${heads}</b><span>guests coming</span></div>
        <div class="stat"><b>${yes.length}</b><span>accepted</span></div>
        <div class="stat"><b>${no.length}</b><span>declined</span></div>
        ${invites.length ? `<div class="stat"><b>${waiting.length}</b><span>awaiting</span></div>` : ''}
      </div>
      ${perEvent.length ? `<div class="per-event">${perEvent.map(([n, c]) => `<div><span>${esc(n)}</span><b>${c}</b></div>`).join('')}</div>` : ''}
      <div class="dash-bar">
        <div class="seg">${[['all', `All ${rs.length}`], ['yes', 'Coming'], ['no', 'Declined']].map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="grow"></span>
        <button class="btn small" data-refresh title="Refresh">↻</button>
        <button class="btn small" data-csv ${rs.length ? '' : 'disabled'}>⬇ CSV</button>
      </div>
      <div class="rsvp-list">${rows.map(r => `
        <div class="rsvp-row ${r.attending ? 'yes' : 'no'}">
          <div class="rr-main"><strong>${esc(r.name)}</strong>
            <span class="pill">${r.attending ? `✓ ${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}` : '✕ declined'}</span></div>
          ${r.invite ? `<small class="rr-inv">Invite: ${esc(inviteName(r.invite))}</small>` : ''}
          ${r.attending && r.events.length ? `<div class="rr-ev">${r.events.map(e => `<span>${esc(e)}</span>`).join('')}</div>` : ''}
          ${r.message ? `<p class="rr-msg">“${esc(r.message)}”</p>` : ''}
          <div class="rr-foot"><small>${esc(when(r.updated_at))}</small><button data-del="${r.id}" title="Delete this reply">Delete</button></div>
        </div>`).join('') || '<p class="hint">No replies yet — share your invite links!</p>'}
      </div>
      ${waiting.length ? `<details class="waiting"><summary>Awaiting reply (${waiting.length})</summary><p>${waiting.map(v => esc(v.name)).join(' · ')}</p></details>` : ''}
      <h3>Guestbook wishes (${data.wishes.length})</h3>
      <div class="wish-admin">${data.wishes.map(w => `
        <div class="wa ${w.hidden ? 'is-hidden' : ''}">
          <p>“${esc(w.message)}”</p>
          <div class="rr-foot"><small>— ${esc(w.name)} · ${esc(when(w.created_at))}${w.hidden ? ' · hidden' : ''}</small>
          <button data-hide="${w.id}" data-h="${w.hidden ? 0 : 1}">${w.hidden ? 'Show on site' : 'Hide'}</button></div>
        </div>`).join('') || '<p class="hint">No wishes yet.</p>'}
      </div>`;

    el.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { filter = b.dataset.f; draw(); }));
    el.querySelector('[data-refresh]').onclick = load;
    el.querySelector('[data-csv]').onclick = () => {
      const lines = [['Name', 'Invite', 'Attending', 'Guests', 'Events', 'Message', 'Updated'].map(csvCell).join(',')]
        .concat(rs.map(r => [r.name, r.invite ? inviteName(r.invite) : '', r.attending ? 'Yes' : 'No', r.guests, r.events.join('; '), r.message, new Date(r.updated_at).toLocaleString()].map(csvCell).join(',')));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
      a.download = `${title}-rsvps.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    el.querySelectorAll('[data-del]').forEach(b => (b.onclick = async () => {
      if (!confirm('Delete this reply?')) return;
      try { await deleteRsvp(weddingId, adminKey, Number(b.dataset.del)); load(); } catch (e) { alert(e.message); }
    }));
    el.querySelectorAll('[data-hide]').forEach(b => (b.onclick = async () => {
      try { await setWishHidden(weddingId, adminKey, Number(b.dataset.hide), b.dataset.h === '1'); load(); } catch (e) { alert(e.message); }
    }));
  }

  load();
  return { reload: load };
}
