import { TEMPLATES, SECTION_TYPES, EFFECTS, HERO_STYLES, HERO_ICON, BACKGROUNDS, defaultConfig, newSection, templateStyle, uid } from './templates.js';
import { createWedding } from './backend.js';
import { mountDashboard } from './dashboard.js';
import { FONTS, fontsHref } from './fonts.js';
import * as store from './store.js';
import { buildSiteFiles, publishToGitHub, downloadZip, slugify } from './publish.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TABS = [
  ['details', '💌', 'Details'],
  ['photos', '🖼️', 'Photos'],
  ['template', '✨', 'Templates'],
  ['style', '🎨', 'Style'],
  ['effects', '🌸', 'Effects'],
  ['elements', '🧩', 'Elements'],
  ['guests', '👥', 'Guests'],
  ['publish', '🚀', 'Publish'],
];

const panel = $('#panel');
const frame = $('#preview');
let state;
let tab = 'details';
let openIdx = -1;
let fid = 0;
let previewInvite = null; // slug the live preview is personalised for

// ---------- helpers ----------
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => (a[k] ??= {}), o);
  t[last] = v;
}
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}
const kb = n => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB');

function migrate(s) {
  const d = defaultConfig();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  for (const k of ['couple', 'colors', 'fonts', 'scene', 'intro', 'music', 'publish', 'heroLayout']) s[k] = { ...d[k], ...s[k] };
  s.effects = { ...Object.fromEntries(EFFECTS.map(e => [e.id, false])), ...s.effects };
  s.invites ||= [];
  s.admin ||= { key: '' };
  for (const sec of s.sections) if (sec.type === 'events') for (const it of sec.data.items || []) it.id ||= uid();
  return s;
}

// ---------- preview + save ----------
let sendT, saveT;

// ---------- undo / redo ----------
// Snapshots are JSON with big data: URLs (photos, music) swapped for references, so history stays light.
const blobs = new Map();
const snap = () => JSON.stringify(state, function (k, v) {
  if (k === 'src' && typeof v === 'string' && v.length > 2000) { const id = this.id || 'music'; blobs.set(id, v); return '@blob:' + id; }
  return v;
});
const unsnap = j => JSON.parse(j, (k, v) => (typeof v === 'string' && v.startsWith('@blob:') ? blobs.get(v.slice(6)) : v));
const past = [], future = [];
let lastSnap = null, histT = null, restoring = false;
function commitHistory() {
  clearTimeout(histT);
  histT = null;
  const now = snap();
  if (lastSnap !== null && now !== lastSnap) {
    past.push(lastSnap);
    if (past.length > 80) past.shift();
    future.length = 0;
  }
  lastSnap = now;
  updateUndoButtons();
}
function updateUndoButtons() {
  $('#btnUndo').disabled = !past.length;
  $('#btnRedo').disabled = !future.length;
}
function travel(from, to, label) {
  if (histT) commitHistory();
  if (!from.length) return;
  to.push(lastSnap);
  lastSnap = from.pop();
  restoring = true;
  state = migrate(unsnap(lastSnap));
  renderPanel();
  changed();
  restoring = false;
  updateUndoButtons();
  toast(label, 1200);
}
const undo = () => travel(past, future, '↶ Undone');
const redo = () => travel(future, past, '↷ Redone');

function sendPreview() {
  frame.contentWindow?.postMessage({ type: 'config', config: state, invite: previewInvite }, location.origin);
}
function changed() {
  if (!restoring) { clearTimeout(histT); histT = setTimeout(commitHistory, 450); }
  clearTimeout(sendT);
  sendT = setTimeout(sendPreview, 90);
  $('#saveState').textContent = 'Saving…';
  $('#saveState').classList.remove('ok');
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    try {
      await store.set('project', state);
      $('#saveState').textContent = '✓ Saved on this device';
      $('#saveState').classList.add('ok');
    } catch (e) {
      $('#saveState').textContent = '⚠ Could not save';
      console.error(e);
    }
  }, 500);
}
addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  const m = e.data || {};
  if (m.type === 'ready') sendPreview();
  else if (m.type === 'sectionAction') sectionAction(m.id, m.action);
  else if (m.type === 'heroAction') go({ details: 'details', layout: 'style', template: 'template' }[m.action] || 'details');
  else if (m.type === 'editText') {
    const sm = /^sec:([^:]+):(\w+)$/.exec(m.path);
    if (sm) { const sec = state.sections.find(x => x.id === sm[1]); if (sec) sec.data[sm[2]] = m.value; }
    else if (/^couple\.\w+$/.test(m.path)) setPath(state, m.path, m.value);
    else return;
    renderPanel(); changed();
    toast('Text updated ✓', 1200);
  }
});

function sectionAction(id, action) {
  const i = state.sections.findIndex(s => s.id === id);
  if (i < 0) return;
  if (action === 'edit') {
    openIdx = i;
    go('elements');
    setTimeout(() => panel.querySelector('.sec.open')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return;
  }
  const a = { up: 'moveSection', down: 'moveSection', dup: 'duplicateSection', delete: 'removeSection' }[action];
  if (action === 'hide') {
    state.sections[i].enabled = false;
    renderPanel(); changed();
    toast('Section hidden — turn it back on in Elements (or press Ctrl+Z)', 3200);
    return;
  }
  if (a) actions[a]({ i, d: action === 'up' ? -1 : 1 });
}

// ---------- form fields ----------
function field(f, path, extra = '') {
  const id = 'f' + (++fid);
  const v = getPath(state, path) ?? '';
  const label = `<label for="${id}">${esc(f.label)}</label>`;
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  if (f.type === 'textarea') return `<div class="field">${label}<textarea id="${id}" rows="${f.rows || 3}" data-bind="${path}"${ph}${extra}>${esc(v)}</textarea></div>`;
  if (f.type === 'select') {
    return `<div class="field">${label}<select id="${id}" data-bind="${path}"${extra}>${f.options.map(([val, l]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  }
  return `<div class="field">${label}<input id="${id}" type="${f.type || 'text'}" value="${esc(v)}" data-bind="${path}"${ph}${extra}></div>`;
}
const toggle = (path, label, sub = '') => `<label class="toggle"><input type="checkbox" data-bind="${path}" ${getPath(state, path) ? 'checked' : ''}><i></i><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
const colorField = (path, label) => {
  const v = getPath(state, path);
  return `<label class="color"><input type="color" value="${esc(v)}" data-bind="${path}"><span>${esc(label)}<code>${esc(v)}</code></span></label>`;
};

const SLIDER_FMT = {};
const slider = (path, label, min, max, step, fmt) => {
  const v = getPath(state, path) ?? 1;
  SLIDER_FMT[path] = fmt;
  return `<div class="field"><label>${esc(label)} <output data-out="${path}">${esc(fmt(v))}</output></label>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${esc(v)}" data-bind="${path}" data-num></div>`;
};

// ---------- tabs ----------
const views = {
  details: () => `
    <h2>Wedding details</h2>
    <p class="hint">The basics your guests see first.</p>
    <div class="grid2">${field({ label: 'Partner 1' }, 'couple.partner1')}${field({ label: 'Partner 2' }, 'couple.partner2')}</div>
    ${field({ label: 'Line above the names', ph: 'Together with their families' }, 'couple.tagline')}
    ${field({ label: 'Wedding date & time', type: 'datetime-local' }, 'couple.date')}
    ${field({ label: 'City / location' }, 'couple.location')}
    ${field({ label: 'Hashtag' }, 'couple.hashtag')}
    <h3>Opening envelope</h3>
    ${toggle('intro.enabled', 'Show a “tap to open” 3D envelope', 'Guests open the invitation before seeing the site')}
    ${field({ label: 'Envelope line' }, 'intro.text')}
    <h3>Background music</h3>
    ${state.music.src
      ? `<div class="music-row"><span>🎵 ${esc(state.music.name || 'Song')}</span><button class="btn small" data-action="removeMusic">Remove</button></div>`
      : `<label class="drop small"><input type="file" accept="audio/*" data-upload="music" hidden><strong>🎵 Upload a song (MP3)</strong><small>Plays after guests open the envelope · keep it under 8 MB</small></label>`}
  `,

  photos: () => `
    <h2>Couple photos</h2>
    <p class="hint">Photos are resized in your browser (max 1600px). Choose where each one appears.</p>
    <label class="drop" data-drop><input type="file" accept="image/*" multiple data-upload="photos" hidden>
      <span class="drop-ico">⬆</span><strong>Click or drop photos here</strong><small>JPG, PNG or WEBP — add as many as you like</small></label>
    <div class="photo-grid">${state.photos.map((p, i) => `
      <div class="photo" data-drop-photo data-i="${i}">
        <div class="thumb" draggable="true" data-drag="photo" data-i="${i}" title="Drag to reorder"><img src="${p.src}" alt="" draggable="false"><span class="num">${i + 1}</span>
          <div class="photo-tools">
            <button title="Move left" data-action="movePhoto" data-i="${i}" data-d="-1">◀</button>
            <button title="Move right" data-action="movePhoto" data-i="${i}" data-d="1">▶</button>
            <button title="Delete" data-action="removePhoto" data-i="${i}">✕</button>
          </div></div>
        <div class="flags">
          <label><input type="checkbox" data-bind="photos.${i}.hero" ${p.hero !== false ? 'checked' : ''}> 3D hero</label>
          <label><input type="checkbox" data-bind="photos.${i}.gallery" ${p.gallery !== false ? 'checked' : ''}> Gallery</label>
        </div>
        <input class="cap" placeholder="Caption (optional)" value="${esc(p.caption)}" data-bind="photos.${i}.caption">
      </div>`).join('')}
    </div>
    ${state.photos.length ? `<p class="hint">${state.photos.length} photo(s). “3D hero” photos appear in the 3D scene at the top; “Gallery” photos appear in the gallery element.</p>` : ''}
  `,

  template: () => {
    const a = (state.couple.partner1 || 'A')[0], b = (state.couple.partner2 || 'B')[0];
    return `
    <h2>Templates</h2>
    <p class="hint">A template sets colours, fonts, the 3D scene and effects. Your text and photos stay the same.</p>
    <div class="tpl-grid">${TEMPLATES.map(t => `
      <button class="tpl ${state.template === t.id ? 'on' : ''}" data-action="applyTemplate" data-id="${t.id}"
        style="--tb:${t.colors.bg};--tp:${t.colors.primary};--ta:${t.colors.accent};--tt:${t.colors.text}">
        <div class="tpl-prev">
          <span class="tpl-ico">${HERO_ICON[t.scene.hero] || '✨'}</span>
          <span class="tpl-names" style="font-family:'${t.fonts.display}'">${esc(a)} &amp; ${esc(b)}</span>
          <span class="tpl-sw"><i style="background:var(--tp)"></i><i style="background:var(--ta)"></i><i style="background:var(--tt)"></i></span>
        </div>
        <div class="tpl-meta"><strong>${esc(t.name)}</strong><small>${esc(t.desc)}</small></div>
      </button>`).join('')}
    </div>`;
  },

  style: () => `
    <h2>Style</h2>
    <h3>Colours</h3>
    <div class="colors">
      ${colorField('colors.bg', 'Background')}${colorField('colors.text', 'Text')}
      ${colorField('colors.primary', 'Primary / metal')}${colorField('colors.accent', 'Accent')}
    </div>
    <h3>Fonts</h3>
    ${field({ label: 'Names & headings', type: 'select', options: Object.keys(FONTS).map(f => [f, f]) }, 'fonts.display')}
    ${field({ label: 'Body text', type: 'select', options: Object.keys(FONTS).map(f => [f, f]) }, 'fonts.body')}
    <h3>3D scene</h3>
    ${field({ label: 'Hero 3D object', type: 'select', options: HERO_STYLES }, 'scene.hero')}
    ${field({ label: 'Background', type: 'select', options: BACKGROUNDS }, 'scene.background')}
    ${toggle('scene.motion', 'Mouse / tilt parallax', 'The camera follows the mouse or phone tilt')}
    <h3>Move & resize <button class="btn small link" data-action="resetLayout">Reset</button></h3>
    <p class="hint">Position the names and the 3D object at the top of the page.</p>
    ${field({ label: 'Names position', type: 'select', options: [['bottom', 'Bottom'], ['center', 'Middle'], ['top', 'Top']] }, 'heroLayout.textPos')}
    ${slider('heroLayout.nameSize', 'Names size', 0.5, 1.6, 0.05, v => Math.round(v * 100) + '%')}
    ${slider('heroLayout.objScale', '3D object size', 0.4, 2, 0.05, v => Math.round(v * 100) + '%')}
    ${slider('heroLayout.objX', '3D object ← left · right →', -4, 4, 0.1, v => (v > 0 ? '+' : '') + Number(v).toFixed(1))}
    ${slider('heroLayout.objY', '3D object ↓ down · up ↑', -4, 3, 0.1, v => (v > 0 ? '+' : '') + Number(v).toFixed(1))}
    ${slider('heroLayout.spin', 'Animation speed', 0, 3, 0.1, v => (v == 0 ? 'paused' : Number(v).toFixed(1) + '×'))}
  `,

  effects: () => `
    <h2>Effects</h2>
    <p class="hint">Layer as many as you like — they float in 3D behind your content.</p>
    <div class="fx-grid">${EFFECTS.map(e => `
      <label class="fx"><input type="checkbox" data-bind="effects.${e.id}" ${state.effects[e.id] ? 'checked' : ''}>
        <span class="fx-ico">${e.icon}</span><span>${esc(e.label)}</span></label>`).join('')}
    </div>
    <div class="field"><label>Density <output id="densOut">${Math.round(state.density * 100)}%</output></label>
      <input type="range" min="0.3" max="2" step="0.1" value="${state.density}" data-bind="density" data-num></div>
    ${toggle('cursorTrail', 'Sparkle cursor trail', 'Little ✦ and ♥ follow the mouse on desktop')}
  `,

  elements: () => `
    <h2>Page elements</h2>
    <p class="hint">Drag ⠿ to reorder, switch sections on or off, and click one to edit it. Tip: hover a section in the preview for quick tools, and double-click any title there to edit it in place.</p>
    <div class="sec-list">${state.sections.map((s, i) => {
      const T = SECTION_TYPES[s.type];
      if (!T) return '';
      return `<div class="sec ${openIdx === i ? 'open' : ''} ${s.enabled === false ? 'off' : ''}" data-drop-sec data-i="${i}">
        <div class="sec-head">
          <span class="grip" draggable="true" data-drag="sec" data-i="${i}" title="Drag to move">⠿</span>
          <button class="sec-name" data-action="toggleSection" data-i="${i}"><span class="ico">${T.icon}</span>
            <span><strong>${esc(s.data.title || T.label)}</strong><small>${esc(T.label)}</small></span></button>
          <label class="switch" title="Show on site"><input type="checkbox" data-bind="sections.${i}.enabled" data-rerender ${s.enabled !== false ? 'checked' : ''}><i></i></label>
          <div class="sec-tools">
            <button title="Move up" data-action="moveSection" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button title="Move down" data-action="moveSection" data-i="${i}" data-d="1" ${i === state.sections.length - 1 ? 'disabled' : ''}>↓</button>
            <button title="Duplicate" data-action="duplicateSection" data-i="${i}">⧉</button>
            <button title="Delete" data-action="removeSection" data-i="${i}">🗑</button>
          </div>
        </div>
        ${openIdx === i ? `<div class="sec-body">${sectionForm(s, i)}</div>` : ''}
      </div>`;
    }).join('')}</div>
    <h3>Add an element</h3>
    <div class="add-grid">${Object.entries(SECTION_TYPES).map(([k, T]) => `
      <button class="add" data-action="addSection" data-type="${k}"><span class="ico">${T.icon}</span><strong>${esc(T.label)}</strong><small>${esc(T.desc)}</small></button>`).join('')}
    </div>
  `,

  guests: () => {
    const evs = eventList();
    const base = siteBase();
    const prev = previewInvite && state.invites.find(v => v.slug === previewInvite);
    return `
    <h2>Guests & RSVPs</h2>
    <p class="hint">Send each family a personal link. It greets them by name, shows only the events they're invited to, and their replies land here.</p>
    ${prev ? `<div class="banner">👀 Previewing as <strong>${esc(prev.name)}</strong> <button class="btn small" data-action="previewAs" data-slug="">Stop</button></div>` : ''}
    ${state.weddingId ? '' : `<div class="box activate">
      <h3>Turn on online RSVPs & guestbook</h3>
      <p class="hint">Creates a private record for this wedding so replies and wishes are saved. Free.</p>
      <button class="btn primary block" data-action="activate">✨ Activate</button>
    </div>`}
    <h3>Personal invite links <span class="count">${state.invites.length}</span></h3>
    ${state.publish?.url ? '' : '<p class="hint warn">Publish the site first to get working links. You can add invites now.</p>'}
    <div class="field"><label for="bulkNames">Add invites — one family or guest per line</label>
      <textarea id="bulkNames" rows="3" placeholder="Sharma Family&#10;Rohan & Priya&#10;Mehta Ji"></textarea></div>
    <button class="btn small block" data-action="addInvites">+ Add invites</button>
    <div class="inv-list">${state.invites.map((v, i) => `
      <div class="inv">
        <div class="inv-top">
          <input class="inv-name" aria-label="Invite name" value="${esc(v.name)}" data-bind="invites.${i}.name">
          <button title="Preview the site as this guest" class="icon-btn" data-action="previewAs" data-slug="${esc(v.slug)}">👀</button>
          <button title="Delete invite" class="icon-btn" data-action="removeInvite" data-i="${i}">✕</button>
        </div>
        <div class="grid2">
          <div class="field"><label>Seats</label><input type="number" min="1" max="50" value="${esc(v.maxGuests || '')}" placeholder="any" data-bind="invites.${i}.maxGuests" data-num></div>
          <div class="field"><label>WhatsApp no. (optional)</label><input type="tel" value="${esc(v.phone || '')}" placeholder="+91…" data-bind="invites.${i}.phone"></div>
        </div>
        ${evs.length > 1 ? `<div class="chips" title="Leave all unticked to invite to every event">${evs.map(e => `<label><input type="checkbox" data-inv-ev="${i}" value="${esc(e.id)}" ${v.events?.includes(e.id) ? 'checked' : ''}><span>${esc(e.name || 'Event')}</span></label>`).join('')}</div>
          <small class="hint tight">${v.events?.length ? 'Only the ticked events are shown.' : 'Invited to all events.'}</small>` : ''}
        <div class="inv-link"><code>${esc(base)}?i=${esc(v.slug)}</code></div>
        <div class="row">
          <button class="btn small" data-action="copyInvite" data-i="${i}">Copy link</button>
          <a class="btn small" target="_blank" rel="noopener" href="${esc(waLink(v))}">Send on WhatsApp</a>
        </div>
      </div>`).join('')}
    </div>
    <h3>Replies & wishes</h3>
    ${state.weddingId ? `<div id="dash" class="dash"></div>
      <div class="box">
        <h3>Share the dashboard with family</h3>
        <p class="hint">A private page with live replies — works on any phone. Anyone with this link can see replies, so share it only with family.</p>
        <button class="btn small" data-action="copyDashboard">Copy private dashboard link</button>
      </div>` : '<p class="hint">Activate online RSVPs above to see replies here.</p>'}
    `;
  },

  publish: () => {
    const p = state.publish || {};
    const repo = p.repo || slugify(`${state.couple.partner1}-weds-${state.couple.partner2}`);
    let saved = '';
    try { saved = localStorage.getItem('gh_token') || sessionStorage.getItem('gh_token') || ''; } catch { /* storage blocked */ }
    const share = p.url ? encodeURIComponent(`You're invited to ${state.couple.partner1} & ${state.couple.partner2}'s wedding! 💍 ${p.url}`) : '';
    return `
    <h2>Publish & share</h2>
    ${p.url ? `<div class="live">
      <div class="live-top"><span class="dot"></span> Your website</div>
      <a href="${esc(p.url)}" target="_blank" rel="noopener" class="live-url">${esc(p.url)}</a>
      <div class="row">
        <button class="btn small" data-action="copyLink">Copy link</button>
        <a class="btn small" href="https://wa.me/?text=${share}" target="_blank" rel="noopener">Share on WhatsApp</a>
        <a class="btn small ghost" href="${esc(p.url)}" target="_blank" rel="noopener">Open ↗</a>
      </div>
      <small class="hint">Edit anything and publish again — the link stays the same.</small>
    </div>` : ''}
    <div class="box">
      <h3>Publish to GitHub Pages <span class="tag">free</span></h3>
      <ol class="steps">
        <li><a href="https://github.com/settings/tokens/new?scopes=public_repo&description=Forever3D%20Wedding%20Website" target="_blank" rel="noopener">Create a GitHub token ↗</a> — keep <code>public_repo</code> ticked, click <em>Generate</em> and copy it.</li>
        <li>Paste it here, pick a site name and press Publish.</li>
      </ol>
      <div class="field"><label for="ghToken">GitHub token</label><input id="ghToken" type="password" autocomplete="off" placeholder="ghp_…" value="${esc(saved)}"></div>
      ${field({ label: 'Site name (becomes part of the link)', ph: repo }, 'publish.repo')}
      <p class="hint url-preview">Link: https://&lt;your-username&gt;.github.io/<b>${esc(repo)}</b>/</p>
      <label class="check"><input type="checkbox" id="ghRemember" ${saved && (() => { try { return !!localStorage.getItem('gh_token'); } catch { return false; } })() ? 'checked' : ''}> Remember token on this device</label>
      <button class="btn primary block" data-action="publish" id="pubBtn">🚀 Publish website</button>
      <pre class="log" id="pubLog" hidden></pre>
      <p class="hint">The token stays in this browser and is only sent to api.github.com. The repository is public, so anyone with the link can see the photos.</p>
    </div>
    <div class="box">
      <h3>Or download a ZIP</h3>
      <p class="hint">A ready-to-host folder — drop it on Netlify Drop, Vercel, or any web host.</p>
      <button class="btn" data-action="zip">⬇ Download website ZIP</button>
    </div>
    <div class="box">
      <h3>Project</h3>
      <p class="hint">Your work autosaves in this browser. Export a backup to move it to another device.</p>
      <div class="row">
        <button class="btn small" data-action="exportProject">Export backup</button>
        <label class="btn small">Import backup<input type="file" accept="application/json,.json" data-upload="project" hidden></label>
        <button class="btn small danger" data-action="resetProject">Start over</button>
      </div>
    </div>`;
  },
};

function sectionForm(s, i) {
  const T = SECTION_TYPES[s.type];
  let h = T.fields.map(f => field(f, `sections.${i}.data.${f.k}`)).join('');
  if (T.list) {
    const items = s.data[T.list.k] || [];
    h += `<div class="list"><div class="list-head">${esc(T.list.label)}</div>
      ${items.map((it, j) => `<div class="item">
        <div class="item-head"><span>${esc(T.list.one)} ${j + 1}</span>
          <button data-action="moveItem" data-i="${i}" data-j="${j}" data-d="-1" ${j === 0 ? 'disabled' : ''}>↑</button>
          <button data-action="moveItem" data-i="${i}" data-j="${j}" data-d="1" ${j === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-action="removeItem" data-i="${i}" data-j="${j}">✕</button></div>
        ${T.list.item.map(f => field(f, `sections.${i}.data.${T.list.k}.${j}.${f.k}`)).join('')}
      </div>`).join('')}
      <button class="btn small block" data-action="addItem" data-i="${i}">+ Add ${esc(T.list.one)}</button></div>`;
  }
  if (T.note) h += `<p class="hint">${esc(T.note)}</p>`;
  const sp = k => `sections.${i}.style.${k}`;
  const pick = (k, label, opts, def) => {
    const v = s.style?.[k] || def;
    return `<div class="field"><label>${label}</label><select data-bind="${sp(k)}">${opts.map(([val, l]) => `<option value="${val}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  };
  h += `<div class="sstyle"><div class="list-head">Section style</div><div class="grid2">
    ${pick('bg', 'Background', [['none', 'None'], ['glass', 'Glass panel'], ['band', 'Colour band']], 'none')}
    ${pick('anim', 'Entrance', [['rise', 'Rise up'], ['zoom', 'Zoom in'], ['flip', '3D flip'], ['slide', 'Slide in'], ['none', 'None']], 'rise')}
    ${pick('width', 'Width', [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']], 'normal')}
    ${pick('spacing', 'Spacing', [['compact', 'Compact'], ['normal', 'Normal'], ['roomy', 'Roomy']], 'normal')}
    ${pick('align', 'Title align', [['center', 'Centre'], ['left', 'Left']], 'center')}
  </div></div>`;
  return h;
}

function renderRail() {
  $('#rail').innerHTML = TABS.map(([id, ico, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}"><span>${ico}</span><small>${label}</small></button>`).join('');
}

function renderPanel() {
  const y = panel.scrollTop;
  fid = 0;
  panel.innerHTML = `<div class="panel-inner">${views[tab]()}</div>`;
  panel.scrollTop = y;
  const dash = $('#dash');
  if (dash && state.weddingId) {
    mountDashboard(dash, {
      weddingId: state.weddingId, adminKey: state.admin.key, invites: state.invites,
      events: eventList().map(e => e.name).filter(Boolean),
      title: slugify(`${state.couple.partner1}-${state.couple.partner2}`),
    });
  }
}

// ---------- guests helpers ----------
const eventList = () => state.sections.find(s => s.type === 'events')?.data.items || [];
const siteBase = () => (state.publish?.url || 'https://<your-site>/').replace(/\/?$/, '/');
const inviteUrl = v => `${siteBase()}?i=${encodeURIComponent(v.slug)}`;
function waLink(v) {
  const c = state.couple;
  const text = `Dear ${v.name}, you're invited to ${c.partner1} & ${c.partner2}'s wedding! 💍\nOpen your personal invitation: ${inviteUrl(v)}`;
  const phone = String(v.phone || '').replace(/\D/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
async function ensureWedding({ quiet = false } = {}) {
  if (state.weddingId) return true;
  try {
    const r = await createWedding(`${state.couple.partner1} & ${state.couple.partner2}`);
    state.weddingId = r.id;
    state.admin = { key: r.admin_key };
    changed();
    return true;
  } catch (e) {
    if (!quiet) toast('Could not activate: ' + e.message, 5000);
    return false;
  }
}
const needsBackend = () => state.sections.some(s => s.enabled !== false && (s.type === 'wishes' || (s.type === 'rsvp' && (!s.data.method || s.data.method === 'online'))));

function go(t) {
  tab = t;
  renderRail();
  renderPanel();
  panel.scrollTop = 0;
}

// ---------- events ----------
$('#rail').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) go(b.dataset.tab);
});

panel.addEventListener('input', e => {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'range' || el.dataset.num !== undefined) v = Number(v);
  setPath(state, el.dataset.bind, v);
  if (el.type === 'color') el.parentElement.querySelector('code').textContent = v;
  if (el.dataset.bind === 'density') $('#densOut').textContent = Math.round(v * 100) + '%';
  if (SLIDER_FMT[el.dataset.bind]) panel.querySelector(`[data-out="${el.dataset.bind}"]`).textContent = SLIDER_FMT[el.dataset.bind](v);
  if (el.dataset.bind === 'publish.repo') $('.url-preview b').textContent = slugify(v || `${state.couple.partner1}-weds-${state.couple.partner2}`);
  if (/^(colors|fonts|scene|effects)\./.test(el.dataset.bind)) state.template = 'custom';
  changed();
});

panel.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.invEv !== undefined) {
    const v = state.invites[+el.dataset.invEv];
    const set = new Set(v.events || []);
    el.checked ? set.add(el.value) : set.delete(el.value);
    v.events = [...set];
    renderPanel(); changed();
    return;
  }
  if (/^invites\.\d+\.name$/.test(el.dataset.bind || '')) renderPanel();
  if (el.dataset.rerender !== undefined) renderPanel();
  if (el.matches('select[data-bind^="sections."]')) renderPanel();
  const up = el.dataset.upload;
  if (!up || !el.files?.length) return;
  if (up === 'photos') await addPhotos(el.files);
  if (up === 'music') await addMusic(el.files[0]);
  if (up === 'project') await importProject(el.files[0]);
  el.value = '';
});

// drag & drop: reorder sections/photos, or drop image files onto the upload zone
let drag = null;
const clearMarks = () => panel.querySelectorAll('.drop-before, .drop-after, .dragging').forEach(x => x.classList.remove('drop-before', 'drop-after', 'dragging'));
panel.addEventListener('dragstart', e => {
  const g = e.target.closest?.('[data-drag]');
  if (!g) return;
  drag = { kind: g.dataset.drag, from: +g.dataset.i, to: null };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', drag.kind);
  g.closest(`[data-drop-${drag.kind}]`)?.classList.add('dragging');
});
panel.addEventListener('dragend', () => { drag = null; clearMarks(); });
panel.addEventListener('dragover', e => {
  if (drag) {
    const t = e.target.closest(`[data-drop-${drag.kind}]`);
    if (!t) return;
    e.preventDefault();
    panel.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    const r = t.getBoundingClientRect();
    const after = drag.kind === 'photo' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    t.classList.add(after ? 'drop-after' : 'drop-before');
    drag.to = +t.dataset.i + (after ? 1 : 0);
    return;
  }
  const d = e.target.closest('[data-drop]');
  if (!d) return;
  e.preventDefault();
  d.classList.add('over');
});
panel.addEventListener('dragleave', e => e.target.closest?.('[data-drop]')?.classList.remove('over'));
panel.addEventListener('drop', e => {
  if (drag) {
    e.preventDefault();
    const { kind, from, to } = drag;
    drag = null;
    clearMarks();
    if (to == null) return;
    const arr = kind === 'sec' ? state.sections : state.photos;
    const openId = state.sections[openIdx]?.id;
    const dest = to > from ? to - 1 : to;
    if (dest === from) return;
    const [x] = arr.splice(from, 1);
    arr.splice(dest, 0, x);
    if (kind === 'sec') openIdx = state.sections.findIndex(sec => sec.id === openId);
    renderPanel(); changed();
    return;
  }
  const d = e.target.closest('[data-drop]');
  if (!d) return;
  e.preventDefault();
  d.classList.remove('over');
  addPhotos(e.dataTransfer.files);
});

panel.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const i = +b.dataset.i, j = +b.dataset.j, d = +b.dataset.d;
  actions[b.dataset.action]?.({ ...b.dataset, i, j, d, el: b });
});

const swap = (arr, i, k) => { if (k < 0 || k >= arr.length) return; [arr[i], arr[k]] = [arr[k], arr[i]]; };

const actions = {
  applyTemplate({ id }) {
    const t = TEMPLATES.find(x => x.id === id);
    Object.assign(state, templateStyle(t));
    renderPanel(); changed();
    toast(`Applied “${t.name}”`);
  },
  movePhoto({ i, d }) { swap(state.photos, i, i + d); renderPanel(); changed(); },
  removePhoto({ i }) { state.photos.splice(i, 1); renderPanel(); changed(); },
  removeMusic() { state.music = { src: '', name: '' }; renderPanel(); changed(); },
  toggleSection({ i }) {
    openIdx = openIdx === i ? -1 : i;
    renderPanel();
    if (openIdx === i) frame.contentWindow?.postMessage({ type: 'scrollTo', id: state.sections[i].id }, location.origin);
  },
  moveSection({ i, d }) {
    swap(state.sections, i, i + d);
    if (openIdx === i) openIdx = i + d; else if (openIdx === i + d) openIdx = i;
    renderPanel(); changed();
  },
  removeSection({ i }) {
    const T = SECTION_TYPES[state.sections[i].type];
    if (!confirm(`Remove the “${T.label}” element?`)) return;
    state.sections.splice(i, 1);
    openIdx = -1;
    renderPanel(); changed();
  },
  addSection({ type }) {
    state.sections.push(newSection(type));
    openIdx = state.sections.length - 1;
    renderPanel(); changed();
    setTimeout(() => {
      panel.querySelector('.sec.open')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      frame.contentWindow?.postMessage({ type: 'scrollTo', id: state.sections[openIdx].id }, location.origin);
    }, 250);
  },
  addItem({ i }) {
    const s = state.sections[i], L = SECTION_TYPES[s.type].list;
    (s.data[L.k] ||= []).push({ ...structuredClone(L.blank), ...(L.withId ? { id: uid() } : {}) });
    renderPanel(); changed();
  },
  removeItem({ i, j }) {
    const s = state.sections[i];
    s.data[SECTION_TYPES[s.type].list.k].splice(j, 1);
    renderPanel(); changed();
  },
  moveItem({ i, j, d }) {
    const s = state.sections[i];
    swap(s.data[SECTION_TYPES[s.type].list.k], j, j + d);
    renderPanel(); changed();
  },
  duplicateSection({ i }) {
    const c = structuredClone(state.sections[i]);
    c.id = uid();
    if (c.type === 'events') (c.data.items || []).forEach(it => (it.id = uid()));
    if (c.data.title) c.data.title += ' (copy)';
    state.sections.splice(i + 1, 0, c);
    openIdx = i + 1;
    renderPanel(); changed();
    toast('Section duplicated');
  },
  resetLayout() {
    state.heroLayout = { ...defaultConfig().heroLayout };
    renderPanel(); changed();
  },
  async activate() {
    if (await ensureWedding()) { renderPanel(); toast('Online RSVPs & guestbook are on ✓'); }
  },
  addInvites() {
    const names = $('#bulkNames').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!names.length) return toast('Type at least one name');
    const used = new Set(state.invites.map(v => v.slug));
    for (const name of names) {
      let slug = slugify(name), k = 2;
      while (used.has(slug)) slug = `${slugify(name)}-${k++}`;
      used.add(slug);
      state.invites.push({ id: uid(), name, slug, maxGuests: '', phone: '', events: [] });
    }
    renderPanel(); changed();
    toast(`${names.length} invite(s) added`);
  },
  removeInvite({ i }) {
    if (!confirm(`Delete the invite for “${state.invites[i].name}”? Its link will stop being personalised.`)) return;
    if (previewInvite === state.invites[i].slug) previewInvite = null;
    state.invites.splice(i, 1);
    renderPanel(); changed();
  },
  async copyInvite({ i }) {
    const url = inviteUrl(state.invites[i]);
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { prompt('Copy this link:', url); }
  },
  previewAs({ slug }) {
    previewInvite = slug || null;
    sendPreview(); renderPanel();
    if (slug) frame.contentWindow?.postMessage({ type: 'replayIntro' }, location.origin);
  },
  async copyDashboard() {
    const builderBase = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const url = `${builderBase}dashboard.html#w=${state.weddingId}&k=${state.admin.key}&t=${encodeURIComponent(`${state.couple.partner1} & ${state.couple.partner2}`)}`;
    try { await navigator.clipboard.writeText(url); toast('Private dashboard link copied'); } catch { prompt('Copy this private link:', url); }
  },
  async copyLink() {
    try { await navigator.clipboard.writeText(state.publish.url); toast('Link copied!'); }
    catch { prompt('Copy this link:', state.publish.url); }
  },
  publish: doPublish,
  async zip() {
    try {
      toast('Building ZIP…');
      const files = await buildSiteFiles(state);
      await downloadZip(files, slugify(`${state.couple.partner1}-weds-${state.couple.partner2}`));
      toast('ZIP downloaded ✓');
    } catch (e) { toast('ZIP failed: ' + e.message, 5000); }
  },
  exportProject() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = slugify(`${state.couple.partner1}-${state.couple.partner2}`) + '-project.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  resetProject() {
    if (!confirm('Start over? This deletes all your photos and edits in this browser.')) return;
    state = defaultConfig();
    openIdx = -1;
    go('details'); changed();
  },
};

// ---------- uploads ----------
function resizeImage(file, max = 1600, q = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unsupported image: ' + file.name)); };
    img.src = url;
  });
}

async function addPhotos(files) {
  const list = [...files].filter(f => f.type.startsWith('image/'));
  if (!list.length) return toast('Please choose image files');
  toast(`Adding ${list.length} photo(s)…`);
  for (const f of list) {
    try {
      state.photos.push({ id: Math.random().toString(36).slice(2, 10), src: await resizeImage(f), caption: '', hero: true, gallery: true });
    } catch (e) { toast(e.message); }
  }
  renderPanel(); changed();
  toast(`${list.length} photo(s) added ✓`);
}

function readDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}

async function addMusic(file) {
  if (!file.type.startsWith('audio/')) return toast('Please choose an audio file');
  if (file.size > 15e6) return toast(`That file is ${kb(file.size)} — please use one under 15 MB`, 4000);
  state.music = { src: await readDataUrl(file), name: file.name };
  renderPanel(); changed();
  toast('Music added ✓');
}

async function importProject(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data.couple || !data.sections) throw new Error('Not a wedding project file');
    state = migrate(data);
    openIdx = -1;
    go('details'); changed();
    toast('Project imported ✓');
  } catch (e) { toast('Import failed: ' + e.message, 4000); }
}

// ---------- publish ----------
async function doPublish() {
  const token = $('#ghToken').value.trim();
  const repo = slugify(state.publish.repo || `${state.couple.partner1}-weds-${state.couple.partner2}`);
  const log = $('#pubLog'), btn = $('#pubBtn');
  if (!token) { toast('Paste your GitHub token first'); $('#ghToken').focus(); return; }
  try {
    if ($('#ghRemember').checked) { localStorage.setItem('gh_token', token); sessionStorage.removeItem('gh_token'); }
    else { localStorage.removeItem('gh_token'); sessionStorage.setItem('gh_token', token); }
  } catch { /* storage blocked — fine */ }
  log.hidden = false;
  log.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Publishing…';
  const write = (msg, replace) => {
    const lines = log.textContent.split('\n').filter(Boolean);
    if (replace && lines.length && lines[lines.length - 1].startsWith('Uploaded')) lines.pop();
    lines.push(msg);
    log.textContent = lines.join('\n');
    log.scrollTop = log.scrollHeight;
  };
  if (needsBackend() && !state.weddingId) {
    write('Activating online RSVPs & guestbook…');
    if (!(await ensureWedding({ quiet: true }))) write('⚠ Online RSVP backend unavailable — publishing anyway; RSVPs will not be saved.');
  }
  try {
    const res = await publishToGitHub({ token, repo, onLog: write, buildFiles: siteUrl => buildSiteFiles(state, { siteUrl }) });
    state.publish = { repo, url: res.url };
    changed();
    renderPanel();
    toast(res.live ? 'Your website is live! 🎉' : 'Published — live in a few minutes', 5000);
  } catch (e) {
    let hint = '';
    if (e.status === 401) hint = ' — the token is invalid or expired.';
    else if (e.status === 403 || e.status === 404) hint = ' — the token needs the “public_repo” (or “repo”) scope.';
    else if (e.status === 422) hint = ' — that site name may already be taken or invalid.';
    write('✕ ' + e.message + hint);
    btn.disabled = false;
    btn.textContent = '🚀 Try again';
  }
}

// ---------- top bar ----------
$('#btnPublish').addEventListener('click', () => go('publish'));
$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (typing) return; // let the field use its own undo
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});
$('#btnIntro').addEventListener('click', () => frame.contentWindow?.postMessage({ type: 'replayIntro' }, location.origin));
$('#btnOpen').addEventListener('click', async () => { await store.set('project', state); window.open('site.html?draft=1', '_blank'); });
$('#device').addEventListener('click', e => {
  const b = e.target.closest('[data-device]');
  if (!b) return;
  $('#device .on')?.classList.remove('on');
  b.classList.add('on');
  $('#frameWrap').className = 'frame-wrap ' + b.dataset.device;
});

// ---------- init ----------
(async () => {
  try { state = await store.get('project'); } catch (e) { console.warn(e); }
  state = migrate(state || defaultConfig());
  // load every template font so template cards preview correctly
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = fontsHref(Object.keys(FONTS));
  document.head.appendChild(l);
  renderRail();
  renderPanel();
  lastSnap = snap();
  updateUndoButtons();
  $('#saveState').textContent = '✓ Saved on this device';
  $('#saveState').classList.add('ok');
  sendPreview();
  // quietly register the wedding for online RSVPs / guestbook so the preview forms work
  if (needsBackend() && !state.weddingId && await ensureWedding({ quiet: true })) {
    sendPreview();
    if (tab === 'guests') renderPanel();
  }
})();
