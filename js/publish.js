// Builds the static guest website and publishes it to GitHub Pages (or a ZIP).
const ASSETS = ['css/site.css', 'js/site.js', 'js/scene.js', 'js/fonts.js', 'js/backend.js'];

export const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'our-wedding';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba',
};

function dataUrl(u) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(u || ''));
  if (!m || !m[2]) return null;
  return { mime: m[1], base64: m[3] };
}

async function fetchText(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.text();
}

function injectMeta(html, cfg, siteUrl) {
  const c = cfg.couple || {};
  const title = `${c.partner1} & ${c.partner2} — Wedding`;
  const d = c.date ? new Date(c.date) : null;
  const when = d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const desc = `${c.partner1} & ${c.partner2} are getting married${when ? ' on ' + when : ''}${c.location ? ' in ' + c.location : ''}. Join us!`;
  const img = (cfg.photos || []).find(p => p.hero !== false) || cfg.photos?.[0];
  const abs = img && siteUrl ? siteUrl.replace(/\/?$/, '/') + img.src : '';
  const meta = [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    siteUrl ? `<meta property="og:url" content="${esc(siteUrl)}">` : '',
    abs ? `<meta property="og:image" content="${esc(abs)}">\n<meta name="twitter:card" content="summary_large_image">` : '',
  ].filter(Boolean).join('\n');
  return html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`).replace('<!--META-->', meta);
}

/** Returns [{path, text}|{path, base64}] — everything needed for a standalone site. */
export async function buildSiteFiles(config, { siteUrl = '' } = {}) {
  const cfg = structuredClone(config);
  delete cfg.publish;
  delete cfg.admin; // the couple's secret dashboard key must never be published
  (cfg.invites || []).forEach(v => delete v.phone); // keep guests' phone numbers private
  const files = [];
  cfg.photos = (cfg.photos || []).map((p, i) => {
    const d = dataUrl(p.src);
    if (!d) return p;
    const path = `photos/photo-${i + 1}.${EXT[d.mime] || 'jpg'}`;
    files.push({ path, base64: d.base64 });
    return { ...p, src: path };
  });
  if (cfg.music?.src) {
    const d = dataUrl(cfg.music.src);
    if (d) {
      const path = `music/song.${EXT[d.mime] || 'mp3'}`;
      files.push({ path, base64: d.base64 });
      cfg.music.src = path;
    }
  }
  files.push({ path: 'index.html', text: injectMeta(await fetchText('site.html'), cfg, siteUrl) });
  for (const a of ASSETS) files.push({ path: a, text: await fetchText(a) });
  files.push({ path: 'config.json', text: JSON.stringify(cfg, null, 1) });
  files.push({ path: '.nojekyll', text: '\n' });
  const c = cfg.couple || {};
  files.push({ path: 'README.md', text: `# ${c.partner1} & ${c.partner2} — Wedding website\n\n${siteUrl ? `Live at ${siteUrl}\n\n` : ''}Made with Forever3D Wedding Website Maker. Edit \`config.json\` to change content.\n` });
  return files;
}

// ---------- ZIP ----------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

export async function downloadZip(files, name) {
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  const zip = new window.JSZip();
  for (const f of files) f.base64 != null ? zip.file(f.path, f.base64, { base64: true }) : zip.file(f.path, f.text);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- GitHub ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function publishToGitHub({ token, repo, buildFiles, onLog = () => {} }) {
  const api = async (method, path, body) => {
    const r = await fetch('https://api.github.com' + path, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!r.ok) {
      const e = new Error(data?.message || `${r.status} ${r.statusText}`);
      e.status = r.status;
      throw e;
    }
    return data;
  };

  onLog('Checking your GitHub account…');
  const user = await api('GET', '/user');
  const owner = user.login;
  const lower = owner.toLowerCase();
  const siteUrl = repo.toLowerCase() === `${lower}.github.io` ? `https://${lower}.github.io/` : `https://${lower}.github.io/${repo}/`;

  let info;
  try {
    info = await api('GET', `/repos/${owner}/${repo}`);
    onLog(`Updating existing repository ${owner}/${repo}`);
  } catch (e) {
    if (e.status !== 404) throw e;
    onLog(`Creating repository ${owner}/${repo}…`);
    info = await api('POST', '/user/repos', { name: repo, description: 'Our wedding website 💍', homepage: siteUrl, auto_init: true, private: false });
  }
  const branch = info.default_branch || 'main';

  let parent = null;
  for (let i = 0; i < 6 && !parent; i++) {
    try {
      parent = (await api('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`)).object.sha;
    } catch (e) {
      if (e.status !== 404 && e.status !== 409) throw e;
      if (i === 3) { // still empty → seed it
        await api('PUT', `/repos/${owner}/${repo}/contents/README.md`, { message: 'Initialise', content: btoa('# Wedding website\n'), branch }).catch(() => {});
      }
      await sleep(1500);
    }
  }
  if (!parent) throw new Error('Repository is not ready yet — please try again in a minute.');

  onLog('Preparing website files…');
  const files = await buildFiles(siteUrl);

  const tree = [];
  let done = 0;
  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const blob = await api('POST', `/repos/${owner}/${repo}/git/blobs`,
        f.base64 != null ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      onLog(`Uploaded ${++done}/${files.length}: ${f.path}`, true);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  onLog('Committing…');
  const t = await api('POST', `/repos/${owner}/${repo}/git/trees`, { tree });
  const commit = await api('POST', `/repos/${owner}/${repo}/git/commits`, { message: 'Publish wedding website 💍', tree: t.sha, parents: [parent] });
  await api('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, { sha: commit.sha, force: true });

  onLog('Turning on GitHub Pages…');
  let pages = null;
  try { pages = await api('GET', `/repos/${owner}/${repo}/pages`); }
  catch (e) {
    if (e.status !== 404) throw e;
    for (let i = 0; i < 4 && !pages; i++) {
      try { pages = await api('POST', `/repos/${owner}/${repo}/pages`, { source: { branch, path: '/' } }); }
      catch (err) { if (err.status === 409) break; if (i === 3) throw err; await sleep(2000); }
    }
  }
  const url = pages?.html_url || siteUrl;

  onLog('Waiting for GitHub to build the site (usually under a minute)…');
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    try {
      const b = await api('GET', `/repos/${owner}/${repo}/pages/builds/latest`);
      if (b.status === 'built' && (!b.commit || b.commit === commit.sha)) { onLog('Site is live! 🎉'); return { url, owner, repo, live: true }; }
      if (b.status === 'errored') throw new Error('GitHub Pages build failed: ' + (b.error?.message || 'unknown error'));
    } catch (e) { if (e.message.startsWith('GitHub Pages build failed')) throw e; }
  }
  onLog('Published. GitHub is still deploying — the link will work in a few minutes.');
  return { url, owner, repo, live: false };
}
