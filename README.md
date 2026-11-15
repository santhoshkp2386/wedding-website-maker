# 💍 Forever3D — 3D Wedding Website Maker

Create a 3D wedding website in your browser and share it with guests as a link.
No server, no build step: it's plain HTML/JS with [Three.js](https://threejs.org).

## Features

- **Photos**: upload couple photos (resized in the browser) and choose which appear in the 3D hero and which in the gallery
- **8 templates**: Royal Gold, Shubh Vivah, Blush Garden, Midnight Stars, Beach Sunset, Modern Minimal, Winter Wonderland, Celestial
- **3D hero scenes**: photo carousel, arched portrait slideshow, interlocking gold rings, fly-through floating frames, particle heart
- **Effects**: rose petals, sparkles, hearts, fireflies, sky lanterns, bokeh, snow, confetti, starfield, plus a sparkle cursor trail
- **Style**: your own colours and fonts, background style, mouse/phone-tilt parallax
- **Elements**: countdown, our story timeline, events (with directions and add-to-calendar), 3D photo gallery, venue map, RSVP (WhatsApp, email or form), dress code, quote, YouTube video, wedding party, travel, gifts, FAQ, thank-you
- **Opening envelope**: guests tap a 3D envelope to open the invitation, and background music starts
- **Publish**: one click creates a GitHub repository and turns on GitHub Pages, giving you a link to share. You can also download a ZIP.
- **Autosave**: projects are saved in the browser (IndexedDB), and you can export or import a backup

## Use it

Open the hosted builder (GitHub Pages for this repo), or run it locally:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

> It must be served over http(s). Opening `index.html` directly from disk won't work, because it uses ES modules.

### Publishing a wedding site

1. In the **Publish** tab, open the token link and create a GitHub token with the `public_repo` scope.
2. Paste the token, choose a site name (for example `aarav-weds-diya`) and click **Publish**.
3. Your site goes live at `https://<username>.github.io/<site-name>/`. Share it on WhatsApp.

Publish again any time after editing. The link stays the same.

## Files

| Path | Purpose |
|---|---|
| `index.html`, `js/builder.js`, `css/builder.css` | The editor |
| `site.html`, `js/site.js`, `css/site.css` | The guest website (also used for the live preview) |
| `js/scene.js` | Three.js scene: hero objects and particle effects |
| `js/templates.js` | Templates, elements and default content |
| `js/publish.js` | Static-site packaging, GitHub API publishing and ZIP |
| `js/store.js`, `js/fonts.js` | IndexedDB storage and Google Fonts helpers |

A published wedding repo contains `index.html`, `config.json` (all the content), `photos/`, `music/` and the site scripts.
To change text later, you can also edit `config.json` directly on GitHub.

## Privacy

Published sites live in **public** repositories, so anyone with the link can see the photos.
Your GitHub token stays in your browser and is sent only to `api.github.com`.
