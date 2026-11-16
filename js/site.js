// Renders a wedding website from a config object.
// Modes: published (loads ./config.json), ?draft (loads the builder's saved project), ?preview (live, via postMessage).
import { fontsHref, fontStack } from './fonts.js';
import { submitRsvp, addWish, listWishes } from './backend.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const safeUrl = u => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (/^[a-z]+:/i.test(s)) return ''; // block javascript: etc.
  return 'https://' + s;
};
const luminance = hex => {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255;
};

const params = new URLSearchParams(location.search);
const isPreview = params.has('preview');

let cfg = null;
let scene = null;
let parts = new Map();
let introDone = isPreview; // in the builder, the intro is shown only on demand
let audio = null;
let renderedOnce = false;
let previewInvite = null; // builder can preview the site "as" a specific invite

// ---------- personal invites (?i=sharma-family) ----------
const inviteSlug = () => (isPreview ? previewInvite : params.get('i') || params.get('to')) || '';
const getInvite = () => {
  const s = inviteSlug().toLowerCase();
  return s ? (cfg?.invites || []).find(v => v.slug === s) || null : null;
};
const allEvents = () => (cfg?.sections || []).find(s => s.type === 'events' && s.enabled !== false)?.data?.items || [];
const visibleEvents = items => {
  const inv = getInvite();
  return inv?.events?.length ? items.filter(e => inv.events.includes(e.id)) : items;
};
const rsvpKey = () => `rsvp:${cfg?.weddingId}:${inviteSlug()}`;
const loadPrev = () => { try { return JSON.parse(localStorage.getItem(rsvpKey()) || 'null'); } catch { return null; } };

// ---------- dates ----------
function parseDate(d, t) {
  if (!d) return null;
  const [y, m, dd] = String(d).split('-').map(Number);
  if (!y || !m || !dd) return null;
  const [hh, mm] = String(t || '').split(':').map(Number);
  return new Date(y, m - 1, dd, hh || 0, mm || 0);
}
const parseDT = s => (s ? parseDate(...String(s).split('T')) : null);
const fmtLong = d => (d ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const fmtTime = d => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const gcalStamp = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;

// ---------- theme ----------
function applyTheme(c) {
  const st = document.documentElement.style;
  st.setProperty('--bg', c.colors.bg);
  st.setProperty('--primary', c.colors.primary);
  st.setProperty('--accent', c.colors.accent);
  st.setProperty('--text', c.colors.text);
  st.setProperty('--fd', fontStack(c.fonts.display));
  st.setProperty('--fb', fontStack(c.fonts.body));
  document.documentElement.dataset.tone = luminance(c.colors.bg) > 0.55 ? 'light' : 'dark';
  document.body.dataset.bg = c.scene?.background || 'radial';
  document.body.dataset.hero = c.scene?.hero || 'none';
  const href = fontsHref([c.fonts.display, c.fonts.body]);
  let link = $('#gfonts');
  if (!link) { link = document.createElement('link'); link.id = 'gfonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  if (href && link.getAttribute('href') !== href) link.href = href;
  const p = c.couple || {};
  document.title = `${p.partner1 || ''} & ${p.partner2 || ''} — Wedding`;
  let meta = $('meta[name=theme-color]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = c.colors.bg;
}

// ---------- sections ----------
const divider = '<div class="divider reveal"><span>❦</span></div>';
const galleryPhotos = () => (cfg.photos || []).filter(p => p.gallery !== false && p.src);
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

const R = {
  countdown: () => `<div class="countdown" data-countdown>
      ${['Days', 'Hours', 'Minutes', 'Seconds'].map(u => `<div class="reveal"><div class="cd-unit card tilt"><span class="cd-num" data-u="${u}">00</span><span class="cd-label">${u}</span></div></div>`).join('')}
    </div>
    <p class="cd-sub reveal">${esc(fmtLong(parseDT(cfg.couple?.date)))}</p>`,

  story: d => `<div class="timeline">${(d.items || []).map((it, i) => `
      <article class="tl-item ${i % 2 ? 'right' : 'left'} reveal">
        <div class="card tilt"><span class="tl-date">${esc(it.date)}</span><h3>${esc(it.title)}</h3><p>${nl2br(it.text)}</p></div>
      </article>`).join('')}</div>`,

  events: d => `<div class="events">${visibleEvents(d.items || []).map(ev => {
    const when = parseDate(ev.date, ev.time);
    const maps = ev.address || ev.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ev.venue, ev.address].filter(Boolean).join(', '))}` : '';
    let cal = '';
    if (when) {
      const end = new Date(when.getTime() + 3 * 3600e3);
      cal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${ev.name} — ${cfg.couple.partner1} & ${cfg.couple.partner2}`)}&dates=${gcalStamp(when)}/${gcalStamp(end)}&location=${encodeURIComponent([ev.venue, ev.address].filter(Boolean).join(', '))}&details=${encodeURIComponent(ev.note || '')}`;
    }
    return `<div class="reveal"><article class="event card tilt">
        ${when ? `<div class="ev-date"><b>${when.getDate()}</b><span>${when.toLocaleDateString(undefined, { month: 'short' })}</span></div>` : ''}
        <h3>${esc(ev.name)}</h3>
        ${when ? `<p class="ev-when">${esc(when.toLocaleDateString(undefined, { weekday: 'long' }))}${ev.time ? ' · ' + esc(fmtTime(when)) : ''}</p>` : ''}
        ${ev.venue ? `<p class="ev-venue">${esc(ev.venue)}</p>` : ''}
        ${ev.address ? `<p class="ev-meta">${esc(ev.address)}</p>` : ''}
        ${ev.note ? `<p class="ev-note">${nl2br(ev.note)}</p>` : ''}
        <div class="ev-actions">
          ${maps ? `<a class="btn small" href="${esc(maps)}" target="_blank" rel="noopener">Directions</a>` : ''}
          ${cal ? `<a class="btn small ghost" href="${esc(cal)}" target="_blank" rel="noopener">Add to calendar</a>` : ''}
        </div>
      </article></div>`;
  }).join('')}</div>`,

  gallery: d => {
    const ph = galleryPhotos();
    if (!ph.length) return '<p class="empty-note reveal">Add photos in the builder to fill this gallery.</p>';
    const fig = (p, i) => `<figure data-lb="${i}"><img src="${esc(p.src)}" alt="${esc(p.caption || 'Photo')}" loading="lazy">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`;
    if (d.style === 'ring' && ph.length >= 3) {
      return `<div class="ring-stage reveal" data-ring><div class="ring">${ph.map(fig).join('')}</div></div><p class="hint-small reveal">Drag to spin · tap a photo to enlarge</p>`;
    }
    if (d.style === 'grid') return `<div class="g-grid">${ph.map((p, i) => `<div class="reveal">${fig(p, i)}</div>`).join('')}</div>`;
    return `<div class="g-tilt">${ph.map((p, i) => `<div class="reveal"><div class="tilt">${fig(p, i)}</div></div>`).join('')}</div>`;
  },

  map: d => {
    const q = [d.venue, d.address].filter(Boolean).join(', ');
    if (!q) return '';
    return `<div class="map-grid">
      <div class="card map-info reveal"><h3>${esc(d.venue)}</h3><p>${esc(d.address)}</p>
        <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}" target="_blank" rel="noopener">Open in Maps</a></div>
      <div class="map-wrap reveal"><iframe title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed"></iframe></div>
    </div>`;
  },

  rsvp: d => {
    const by = parseDate(d.deadline);
    const intro = `<p class="center">${nl2br(d.text)}${by ? ` <strong>${esc(by.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</strong>` : ''}</p>`;
    if (d.method === 'link') {
      const u = safeUrl(d.target);
      return `<div class="card rsvp reveal">${intro}${u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">RSVP now</a>` : '<p class="empty-note">Add your form link in the builder.</p>'}</div>`;
    }
    if (!d.method || d.method === 'online') {
      const inv = getInvite();
      const evs = visibleEvents(allEvents()).filter(e => e.name);
      const max = Math.max(1, Number(inv?.maxGuests) || 10);
      const prev = loadPrev();
      const yes = prev ? prev.attending : true;
      return `<form class="card rsvp reveal" data-rsvp-online>
      ${intro}
      ${inv ? `<p class="center invite-for">Invitation for <strong>${esc(inv.name)}</strong>${inv.maxGuests ? ` · ${esc(inv.maxGuests)} ${Number(inv.maxGuests) > 1 ? 'seats' : 'seat'} reserved` : ''}</p>` : ''}
      ${prev ? `<p class="center prev-note">You replied earlier — update anything below and send again.</p>` : ''}
      <label>Your name<input name="name" required maxlength="120" autocomplete="name" value="${esc(prev?.name || inv?.name || '')}"></label>
      <div class="choice">
        <label><input type="radio" name="attend" value="yes" ${yes ? 'checked' : ''}><span>Joyfully accepts</span></label>
        <label><input type="radio" name="attend" value="no" ${yes ? '' : 'checked'}><span>Regretfully declines</span></label>
      </div>
      <div class="if-yes">
        <label>Number of guests (including you)<input name="guests" type="number" min="1" max="${max}" value="${esc(Math.min(max, prev?.guests || 1))}"></label>
        ${evs.length > 1 ? `<fieldset class="ev-pick"><legend>Which events will you attend?</legend>${evs.map(e => `<label><input type="checkbox" name="events" value="${esc(e.name)}" ${!prev || prev.events?.includes(e.name) ? 'checked' : ''}><span>${esc(e.name)}</span></label>`).join('')}</fieldset>` : ''}
      </div>
      <label>A note for the couple<textarea name="msg" rows="3" maxlength="1000">${esc(prev?.message || '')}</textarea></label>
      <button class="btn" type="submit">Send RSVP</button>
    </form>`;
    }
    return `<form class="card rsvp reveal" data-rsvp>
      ${intro}
      <label>Your name<input name="name" required autocomplete="name"></label>
      <div class="choice">
        <label><input type="radio" name="attend" value="Joyfully accepts" checked><span>Joyfully accepts</span></label>
        <label><input type="radio" name="attend" value="Regretfully declines"><span>Regretfully declines</span></label>
      </div>
      <label>Number of guests<input name="guests" type="number" min="1" max="20" value="1"></label>
      <label>A note for the couple<textarea name="msg" rows="3"></textarea></label>
      <button class="btn" type="submit">Send RSVP via ${d.method === 'email' ? 'email' : 'WhatsApp'}</button>
    </form>`;
  },

  dresscode: d => {
    const cols = String(d.colors || '').split(',').map(s => s.trim()).filter(s => /^#[0-9a-f]{3,8}$/i.test(s));
    return `<div class="card center narrow reveal"><p>${nl2br(d.text)}</p>${cols.length ? `<div class="swatches">${cols.map(c => `<i style="background:${c}" title="${c}"></i>`).join('')}</div>` : ''}</div>`;
  },

  quote: d => `<figure class="quote reveal"><blockquote>“${nl2br(d.text)}”</blockquote>${d.author ? `<cite>— ${esc(d.author)}</cite>` : ''}</figure>`,

  video: d => {
    const id = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(d.url || '')?.[1];
    if (!id) return '<p class="empty-note reveal">Paste a YouTube link in the builder.</p>';
    return `<div class="video reveal"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  },

  people: d => `<div class="people">${(d.items || []).map(p => `<div class="reveal"><div class="person card tilt"><span class="avatar">${esc(initials(p.name))}</span><h3>${esc(p.name)}</h3><p>${esc(p.role)}</p></div></div>`).join('')}</div>`,

  travel: d => `<div class="card narrow reveal prose">${String(d.text || '').split(/\n{1,}/).map(l => `<p>${esc(l)}</p>`).join('')}</div>`,

  registry: d => {
    const u = safeUrl(d.link);
    return `<div class="card center narrow reveal"><p>${nl2br(d.text)}</p>${u ? `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${esc(d.button || 'View registry')}</a>` : ''}</div>`;
  },

  faq: d => `<div class="faq narrow">${(d.items || []).map(f => `<details class="card reveal"><summary>${esc(f.q)}</summary><p>${nl2br(f.a)}</p></details>`).join('')}</div>`,

  wishes: d => `<div class="wishes">
      <form class="card wish-form reveal" data-wish>
        ${d.text ? `<p class="center">${nl2br(d.text)}</p>` : ''}
        <input name="name" placeholder="Your name" required maxlength="80" autocomplete="name" value="${esc(getInvite()?.name || '')}">
        <textarea name="msg" placeholder="Your wishes for the couple…" required maxlength="500" rows="3"></textarea>
        <button class="btn" type="submit">Send wishes 💖</button>
      </form>
      <div class="wish-wall" data-wall><p class="empty-note">Be the first to leave a wish ✨</p></div>
    </div>`,

  thanks: d => `<div class="thanks reveal"><p>${nl2br(d.text)}</p><p class="sign">${esc(cfg.couple.partner1)} &amp; ${esc(cfg.couple.partner2)}</p></div>`,
};

// editable text (preview only): double-click to edit in place
const ed = path => (isPreview ? ` data-edit="${esc(path)}" title="Double-click to edit"` : '');

const SEC_TOOLS = [['edit', '✎', 'Edit'], ['up', '↑', 'Move up'], ['down', '↓', 'Move down'], ['dup', '⧉', 'Duplicate'], ['hide', '👁', 'Hide'], ['delete', '🗑', 'Delete']];
const edBar = (id, label) => (isPreview ? `<div class="ed-bar" data-sec-tools="${esc(id)}"><span class="ed-label">${esc(label)}</span>${SEC_TOOLS.map(([a, i, t]) => `<button type="button" data-act="${a}" title="${t}">${i}</button>`).join('')}</div>` : '');
const SEC_LABEL = { countdown: 'Countdown', story: 'Our Story', events: 'Events', gallery: 'Gallery', map: 'Map', rsvp: 'RSVP', dresscode: 'Dress code', quote: 'Quote', video: 'Video', people: 'Wedding party', travel: 'Travel', registry: 'Gifts', faq: 'FAQ', wishes: 'Guestbook', thanks: 'Thank you' };

function sectionHtml(s) {
  const body = R[s.type]?.(s.data || {}) ?? '';
  const title = s.data?.title;
  const st = s.style || {};
  const cls = [`sec`, `sec-${s.type}`, `bg-${st.bg || 'none'}`, `w-${st.width || 'normal'}`, `sp-${st.spacing || 'normal'}`, `anim-${st.anim || 'rise'}`, `al-${st.align || 'center'}`].join(' ');
  return `<section class="${cls}" id="sec-${esc(s.id)}">
    ${edBar(s.id, SEC_LABEL[s.type] || s.type)}
    ${title ? `<h2 class="sec-title reveal"${ed(`sec:${s.id}:title`)}>${esc(title)}</h2>${divider}` : ''}
    ${body}
  </section>`;
}

function heroHtml(c) {
  const p = c.couple || {};
  const date = parseDT(p.date);
  const inv = getInvite();
  const L = c.heroLayout || {};
  const pos = c.scene?.hero === 'none' && (!L.textPos || L.textPos === 'bottom') ? 'center' : (L.textPos || 'bottom');
  const tools = isPreview ? `<div class="ed-bar hero-bar"><span class="ed-label">Top of page</span>
      <button type="button" data-hero-act="details" title="Edit names, date & place">✎ Text</button>
      <button type="button" data-hero-act="layout" title="Move & resize the 3D object and text">✥ Layout</button>
      <button type="button" data-hero-act="template" title="Change template">✨ Theme</button></div>` : '';
  return `<section class="hero pos-${pos}" id="top" style="--name-scale:${Number(L.nameSize) || 1}">
    ${tools}
    <div class="hero-inner">
      ${inv ? `<p class="greet">Dear ${esc(inv.name)},</p>` : ''}
      ${p.tagline ? `<p class="eyebrow"${ed('couple.tagline')}>${esc(p.tagline)}</p>` : ''}
      <h1 class="names"><span${ed('couple.partner1')}>${esc(p.partner1)}</span><span class="amp">&amp;</span><span${ed('couple.partner2')}>${esc(p.partner2)}</span></h1>
      <p class="hero-date"><span class="nw">${esc(fmtLong(date))}</span>${p.location ? `<span class="dot">•</span><span class="nw">${esc(p.location)}</span>` : ''}</p>
      ${p.hashtag ? `<p class="hashtag"${ed('couple.hashtag')}>${esc(p.hashtag)}</p>` : ''}
    </div>
    <a class="scroll-cue" href="#content" aria-label="Scroll down"><span></span></a>
  </section>`;
}

function footerHtml(c) {
  const p = c.couple || {};
  return `<footer class="foot">
    <p class="foot-names">${esc(p.partner1)} &amp; ${esc(p.partner2)}</p>
    <p>${esc(fmtLong(parseDT(p.date)))}${p.hashtag ? ` · ${esc(p.hashtag)}` : ''}</p>
    <p class="made">Made with ♥</p>
  </footer>`;
}

// ---------- incremental DOM update (keeps iframes/maps from reloading while editing) ----------
function toNode(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function renderParts(list) {
  const main = $('#site');
  const keys = [...parts.keys()];
  const same = keys.length === list.length && list.every((p, i) => keys[i] === p.key);
  if (!same) {
    parts.forEach(p => p.node._cleanup?.());
    main.innerHTML = '';
    parts = new Map();
    for (const p of list) {
      const node = toNode(p.html);
      main.appendChild(node);
      parts.set(p.key, { html: p.html, node });
      wire(node);
    }
    return;
  }
  for (const p of list) {
    const old = parts.get(p.key);
    if (old.html === p.html) continue;
    old.node._cleanup?.();
    const node = toNode(p.html);
    old.node.replaceWith(node);
    parts.set(p.key, { html: p.html, node });
    wire(node);
  }
}

// ---------- interactivity ----------
const io = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

function wishCard(w, i, fresh = false) {
  const el = document.createElement('figure');
  el.className = 'wish' + (fresh ? ' fresh' : '');
  // deterministic tilt/float per wish so re-renders don't jump
  const seed = (Number(w.id) || i) * 9301 % 233;
  el.style.setProperty('--rot', `${((seed % 7) - 3) * 0.8}deg`);
  el.style.setProperty('--delay', `${(seed % 10) * -0.6}s`);
  el.innerHTML = `<blockquote>${nl2br(w.message)}</blockquote><figcaption>— ${esc(w.name)}</figcaption>`;
  return el;
}

function wire(root) {
  const cleanups = [];
  $$('.reveal', root).forEach(el => io.observe(el));
  if (root.classList.contains('reveal')) io.observe(root);

  $$('.tilt', root).forEach(el => {
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg) translateZ(10px)`;
      el.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
      el.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
    });
    el.addEventListener('pointerleave', () => (el.style.transform = ''));
  });

  $$('[data-ring]', root).forEach(stage => cleanups.push(initRing(stage)));

  $$('[data-lb]', root).forEach(f => f.addEventListener('click', () => {
    if (f.closest('[data-ring]')?.dataset.dragged === '1') return;
    openLightbox(+f.dataset.lb);
  }));

  $$('[data-rsvp-online]', root).forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!cfg.weddingId) { toast('Online RSVP is not activated yet — open the Guests tab in the builder.'); return; }
    const f = new FormData(form);
    const attending = f.get('attend') === 'yes';
    const reply = {
      name: String(f.get('name') || '').trim(), invite: inviteSlug(), attending,
      guests: attending ? Number(f.get('guests')) || 1 : 0,
      events: attending ? (form.querySelector('.ev-pick') ? f.getAll('events') : visibleEvents(allEvents()).map(x => x.name).filter(Boolean)) : [],
      message: String(f.get('msg') || '').trim(),
    };
    if (!reply.name) return;
    if (attending && form.querySelector('.ev-pick') && !reply.events.length) { toast('Please pick at least one event'); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await submitRsvp(cfg.weddingId, reply);
      try { localStorage.setItem(rsvpKey(), JSON.stringify(reply)); } catch { /* private mode */ }
      const original = form.innerHTML;
      form.innerHTML = `<div class="rsvp-done"><div class="big">${attending ? '💌' : '🤍'}</div>
        <h3>Thank you, ${esc(reply.name)}!</h3>
        <p>${attending ? `We can't wait to celebrate with you${reply.guests > 1 ? ` — all ${reply.guests} of you` : ''}!` : "We'll miss you — thank you for letting us know."}</p>
        <button type="button" class="btn ghost small" data-again>Change my reply</button></div>`;
      form.querySelector('[data-again]').onclick = () => { form.innerHTML = original; const b = form.querySelector('button[type=submit]'); b.disabled = false; b.textContent = 'Send RSVP'; };
      if (attending) scene?.burst?.();
    } catch (err) {
      toast('Could not send: ' + err.message);
      btn.disabled = false; btn.textContent = 'Send RSVP';
    }
  }));

  $$('[data-wish]', root).forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!cfg.weddingId) { toast('The guestbook is not activated yet — open the Guests tab in the builder.'); return; }
    const f = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const w = await addWish(cfg.weddingId, String(f.get('name')).trim(), String(f.get('msg')).trim());
      form.querySelector('textarea').value = '';
      const wall = form.parentElement.querySelector('[data-wall]');
      wall.querySelector('.empty-note')?.remove();
      wall.prepend(wishCard(w, 0, true));
      toast('Thank you for your wishes 💖');
    } catch (err) { toast('Could not send: ' + err.message); }
    btn.disabled = false;
  }));

  $$('[data-wall]', root).forEach(wall => {
    const load = async () => {
      if (!cfg.weddingId) { wall.innerHTML = '<p class="empty-note">The guestbook activates once the site is set up for online wishes.</p>'; return; }
      try {
        const list = await listWishes(cfg.weddingId);
        if (!list?.length) return;
        wall.replaceChildren(...list.map((w, i) => wishCard(w, i)));
      } catch (err) { console.warn('wishes:', err.message); }
    };
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    cleanups.push(() => clearInterval(t));
  });

  $$('[data-rsvp]', root).forEach(form => form.addEventListener('submit', e => {
    e.preventDefault();
    const sec = cfg.sections.find(s => s.type === 'rsvp')?.data || {};
    const f = new FormData(form);
    const p = cfg.couple;
    const text = `RSVP for ${p.partner1} & ${p.partner2}'s wedding\nName: ${f.get('name')}\nResponse: ${f.get('attend')}\nGuests: ${f.get('guests')}${f.get('msg') ? `\nNote: ${f.get('msg')}` : ''}`;
    if (sec.method === 'email') {
      location.href = `mailto:${encodeURIComponent(sec.target || '')}?subject=${encodeURIComponent(`RSVP — ${f.get('name')}`)}&body=${encodeURIComponent(text)}`;
    } else {
      const phone = String(sec.target || '').replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
    form.classList.add('sent');
    toast('Thank you! Your RSVP is ready to send 💌');
  }));

  root._cleanup = () => cleanups.forEach(fn => fn?.());
}

function initRing(stage) {
  const ring = $('.ring', stage);
  const figs = $$('figure', ring);
  const n = figs.length;
  let radius = 0, angle = 0, vel = 0, dragging = false, lastX = 0, moved = 0, hover = false, raf;
  const layout = () => {
    const w = Math.min(240, Math.max(150, stage.clientWidth * 0.32));
    ring.style.width = w + 'px';
    radius = Math.round(w / 2 / Math.tan(Math.PI / n)) + w * 0.35;
    figs.forEach((f, i) => (f.style.transform = `rotateY(${i * 360 / n}deg) translateZ(${radius}px)`));
  };
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(stage);
  const frame = () => {
    if (!dragging) { angle += (vel || -0.12) * (hover ? 0.25 : 1); vel *= 0.95; if (Math.abs(vel) < 0.12) vel = 0; }
    ring.style.transform = `translateZ(${-radius}px) rotateY(${angle}deg)`;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  stage.addEventListener('pointerenter', () => (hover = true));
  stage.addEventListener('pointerleave', () => { hover = false; dragging = false; });
  stage.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; moved = 0; stage.dataset.dragged = '0'; });
  const up = () => { if (dragging) { dragging = false; stage.dataset.dragged = moved > 6 ? '1' : '0'; } };
  addEventListener('pointerup', up);
  stage.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX; moved += Math.abs(dx);
    angle += dx * 0.35; vel = dx * 0.35;
  });
  return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('pointerup', up); };
}

function tickCountdown() {
  const els = $$('[data-countdown]');
  if (!els.length || !cfg) return;
  const target = parseDT(cfg.couple?.date);
  if (!target) return;
  let diff = Math.max(0, target - Date.now());
  const vals = { Days: Math.floor(diff / 864e5), Hours: Math.floor(diff / 36e5) % 24, Minutes: Math.floor(diff / 6e4) % 60, Seconds: Math.floor(diff / 1e3) % 60 };
  els.forEach(el => $$('[data-u]', el).forEach(n => {
    const v = String(vals[n.dataset.u]).padStart(2, '0');
    if (n.textContent !== v) n.textContent = v;
  }));
}
setInterval(tickCountdown, 1000);

// ---------- lightbox ----------
function openLightbox(i) {
  const ph = galleryPhotos();
  if (!ph.length) return;
  let lb = $('#lightbox');
  if (!lb) {
    lb = toNode(`<div id="lightbox" class="lightbox" role="dialog" aria-modal="true">
      <button class="lb-close" aria-label="Close">✕</button><button class="lb-prev" aria-label="Previous">‹</button>
      <figure><img alt=""><figcaption></figcaption></figure><button class="lb-next" aria-label="Next">›</button></div>`);
    document.body.appendChild(lb);
    lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('.lb-close')) lb.classList.remove('open'); });
    $('.lb-prev', lb).onclick = () => show(lb._i - 1);
    $('.lb-next', lb).onclick = () => show(lb._i + 1);
    addEventListener('keydown', e => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') lb.classList.remove('open');
      if (e.key === 'ArrowLeft') show(lb._i - 1);
      if (e.key === 'ArrowRight') show(lb._i + 1);
    });
  }
  function show(k) {
    const list = galleryPhotos();
    lb._i = (k + list.length) % list.length;
    $('img', lb).src = list[lb._i].src;
    $('figcaption', lb).textContent = list[lb._i].caption || '';
  }
  show(i);
  lb.classList.add('open');
}

// ---------- intro envelope ----------
function showIntro(c) {
  $('#intro')?.remove();
  const p = c.couple || {};
  const el = toNode(`<div id="intro" class="intro">
    <div class="envelope" role="button" tabindex="0" aria-label="Open invitation">
      <div class="env-back"></div>
      <div class="letter">${getInvite() ? `<em class="dear">Dear ${esc(getInvite().name)},</em>` : ''}<p>${esc(c.intro?.text || 'You are invited')}</p><h2>${esc(p.partner1)} &amp; ${esc(p.partner2)}</h2><small>${esc(fmtLong(parseDT(p.date)))}</small></div>
      <div class="env-front"></div><div class="flap"></div>
      <span class="seal">${esc((p.partner1 || 'A')[0])}${esc((p.partner2 || 'B')[0])}</span>
    </div>
    <p class="tap">Tap to open</p>
  </div>`);
  document.body.appendChild(el);
  document.body.classList.add('locked');
  const env = $('.envelope', el);
  const open = () => {
    if (env.classList.contains('open')) return;
    env.classList.add('open');
    playMusic();
    setTimeout(() => el.classList.add('gone'), 1500);
    setTimeout(() => { el.remove(); document.body.classList.remove('locked'); introDone = true; }, 2400);
  };
  env.addEventListener('click', open);
  env.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && open());
}

// ---------- music ----------
function setupMusic(c) {
  let btn = $('#musicBtn');
  const src = c.music?.src;
  if (!src) { btn?.remove(); audio?.pause(); audio = null; return; }
  if (!audio || audio._src !== src) {
    audio?.pause();
    audio = new Audio(src);
    audio._src = src;
    audio.loop = true;
    audio.volume = 0.6;
  }
  if (!btn) {
    btn = toNode('<button id="musicBtn" class="music-btn" aria-label="Toggle music"><span>♪</span></button>');
    document.body.appendChild(btn);
    btn.addEventListener('click', () => (audio?.paused ? playMusic() : (audio.pause(), btn.classList.remove('playing'))));
  }
}
function playMusic() {
  if (!audio) return;
  audio.play().then(() => $('#musicBtn')?.classList.add('playing')).catch(() => {});
}

// ---------- cursor sparkle trail ----------
let lastTrail = 0;
addEventListener('pointermove', e => {
  if (!cfg?.cursorTrail || e.pointerType !== 'mouse') return;
  const now = performance.now();
  if (now - lastTrail < 35) return;
  lastTrail = now;
  const s = document.createElement('span');
  s.className = 'trail';
  s.textContent = Math.random() < 0.3 ? '♥' : '✦';
  s.style.left = e.clientX + 'px';
  s.style.top = e.clientY + 'px';
  s.style.color = Math.random() < 0.5 ? 'var(--primary)' : 'var(--accent)';
  s.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`);
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 900);
}, { passive: true });

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = toNode('<div id="toast" class="site-toast"></div>'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- render ----------
async function render(c) {
  cfg = c;
  applyTheme(c);
  const list = [{ key: 'hero', html: heroHtml(c) }];
  const secs = (c.sections || []).filter(s => s.enabled !== false && R[s.type]);
  list.push({ key: 'content', html: '<div id="content"></div>' });
  secs.forEach(s => list.push({ key: s.id, html: sectionHtml(s) }));
  list.push({ key: 'footer', html: footerHtml(c) });
  renderParts(list);
  // in the builder, skip entrance animations after the first paint so edits don't flicker
  if (isPreview && renderedOnce) { document.documentElement.classList.add('static'); $$('.reveal').forEach(e => e.classList.add('in')); }
  renderedOnce = true;
  tickCountdown();
  setupMusic(c);
  if (c.intro?.enabled && !introDone) showIntro(c);
  if (!scene) {
    try {
      const { WeddingScene } = await import('./scene.js');
      scene = new WeddingScene($('#bg3d'));
    } catch (err) {
      console.warn('3D disabled:', err);
      scene = false;
    }
  }
  if (scene) scene.update(cfg);
}

// ---------- builder preview: toolbars + inline editing ----------
function setupPreviewEditing() {
  const post = m => parent.postMessage(m, location.origin);
  document.documentElement.classList.add('editing');
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sec-tools] button');
    if (b) { e.preventDefault(); post({ type: 'sectionAction', id: b.closest('[data-sec-tools]').dataset.secTools, action: b.dataset.act }); return; }
    const h = e.target.closest('[data-hero-act]');
    if (h) { e.preventDefault(); post({ type: 'heroAction', action: h.dataset.heroAct }); }
  });
  document.addEventListener('dblclick', e => {
    const el = e.target.closest('[data-edit]');
    if (!el || el.isContentEditable) return;
    try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
    el.classList.add('is-editing');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const before = el.textContent;
    const finish = save => {
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      el.contentEditable = 'false';
      el.classList.remove('is-editing');
      const value = el.textContent.trim();
      if (save && value && value !== before) post({ type: 'editText', path: el.dataset.edit, value });
      else el.textContent = before;
    };
    const onBlur = () => finish(true);
    const onKey = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  });
}

async function boot() {
  if (isPreview) {
    addEventListener('message', e => {
      if (e.origin !== location.origin) return;
      const m = e.data || {};
      if (m.type === 'config') {
        const inv = m.invite || null;
        if (inv !== previewInvite) { previewInvite = inv; parts.forEach(p => (p.html = '')); } // force refresh of personalised parts
        render(m.config);
      }
      else if (m.type === 'replayIntro' && cfg) { showIntro(cfg); }
      else if (m.type === 'scrollTo') document.getElementById('sec-' + m.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    setupPreviewEditing();
    parent.postMessage({ type: 'ready' }, location.origin);
    return;
  }
  let config = null;
  try {
    if (params.has('draft')) config = await (await import('./store.js')).get('project');
    else config = await (await fetch('config.json', { cache: 'no-cache' })).json();
  } catch (err) { console.error(err); }
  if (!config) { $('#site').innerHTML = '<p class="empty-note" style="padding:40vh 16px">No wedding found here yet.</p>'; return; }
  render(config);
}

boot();
