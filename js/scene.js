// 3D layer for the wedding site: hero object + particle effects, rendered on a fixed background canvas.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAN = Math.tan(THREE.MathUtils.degToRad(25)); // half of 50° fov

function hexRgb(hex) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
export function luminance(hex) {
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Classic bezier heart, centred on the origin. Works with CanvasRenderingContext2D, Path2D and THREE.Shape.
export function traceHeart(p, s = 1, flipY = false) {
  const f = (x, y) => [(x - 5) * s, (flipY ? -(y - 9.5) : (y - 9.5)) * s];
  const segs = [[5, 5, 4, 0, 0, 0], [-6, 0, -6, 7, -6, 7], [-6, 11, -3, 15.4, 5, 19], [12, 15.4, 16, 11, 16, 7], [16, 7, 16, 0, 10, 0], [7, 0, 5, 5, 5, 5]];
  p.moveTo(...f(5, 5));
  for (const q of segs) p.bezierCurveTo(...f(q[0], q[1]), ...f(q[2], q[3]), ...f(q[4], q[5]));
}

// ---------- particle sprite textures (white masks, tinted in the shader) ----------
const texCache = {};
function spriteTex(kind) {
  if (texCache[kind]) return texCache[kind];
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const radial = (r, stops) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    return gr;
  };
  const W = a => `rgba(255,255,255,${a})`;
  switch (kind) {
    case 'dot':
      g.fillStyle = radial(S / 2, [[0, W(1)], [0.35, W(0.85)], [1, W(0)]]);
      g.fillRect(-S / 2, -S / 2, S, S);
      break;
    case 'glow':
      g.fillStyle = radial(S / 2, [[0, W(1)], [0.12, W(0.95)], [0.35, W(0.3)], [1, W(0)]]);
      g.fillRect(-S / 2, -S / 2, S, S);
      break;
    case 'sparkle':
      g.fillStyle = radial(S * 0.2, [[0, W(1)], [1, W(0)]]);
      g.fillRect(-S / 2, -S / 2, S, S);
      g.fillStyle = W(1);
      for (const rot of [0, Math.PI / 2]) {
        g.save(); g.rotate(rot); g.beginPath();
        g.moveTo(-S / 2, 0); g.quadraticCurveTo(0, -S * 0.04, S / 2, 0); g.quadraticCurveTo(0, S * 0.04, -S / 2, 0);
        g.fill(); g.restore();
      }
      break;
    case 'petal': {
      const gr = g.createLinearGradient(0, -S * 0.42, 0, S * 0.42);
      gr.addColorStop(0, W(1)); gr.addColorStop(1, W(0.75));
      g.fillStyle = gr; g.beginPath();
      g.moveTo(0, S * 0.42);
      g.bezierCurveTo(S * 0.4, S * 0.12, S * 0.3, -S * 0.36, 0, -S * 0.3);
      g.bezierCurveTo(-S * 0.3, -S * 0.36, -S * 0.4, S * 0.12, 0, S * 0.42);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath(); g.ellipse(0, 0, S * 0.03, S * 0.28, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'heart':
      g.fillStyle = W(1); g.beginPath(); traceHeart(g, S / 25); g.fill();
      break;
    case 'ring':
      g.fillStyle = radial(S / 2, [[0, W(0.22)], [0.82, W(0.32)], [0.93, W(0.75)], [1, W(0)]]);
      g.beginPath(); g.arc(0, 0, S / 2 - 1, 0, Math.PI * 2); g.fill();
      break;
    case 'rect':
      g.fillStyle = W(1); g.fillRect(-S * 0.3, -S * 0.14, S * 0.6, S * 0.28);
      break;
    case 'lantern': {
      g.fillStyle = radial(S / 2, [[0, W(0.55)], [1, W(0)]]);
      g.fillRect(-S / 2, -S / 2, S, S);
      const gr = g.createLinearGradient(0, -S * 0.26, 0, S * 0.24);
      gr.addColorStop(0, W(0.8)); gr.addColorStop(1, W(1));
      g.fillStyle = gr; g.beginPath(); g.roundRect(-S * 0.16, -S * 0.26, S * 0.32, S * 0.5, S * 0.08); g.fill();
      break;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; // match gl_PointCoord (origin top-left)
  return (texCache[kind] = t);
}

function particleMaterial(tex, additive, opacity = 1, twinkle = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex }, uTime: { value: 0 }, uScale: { value: 600 },
      uOpacity: { value: opacity }, uTwinkle: { value: twinkle },
    },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aRot; attribute float aSeed; attribute vec3 aColor;
      uniform float uTime; uniform float uScale; uniform float uTwinkle;
      varying float vRot; varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 220.0);
        vRot = aRot; vColor = aColor;
        vAlpha = mix(1.0, 0.25 + 0.75 * abs(sin(uTime * 1.3 + aSeed * 31.0)), uTwinkle);
        vAlpha *= smoothstep(0.3, 2.5, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uOpacity;
      varying float vRot; varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float s = sin(vRot), co = cos(vRot);
        vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
        vec4 t = texture2D(uMap, uv);
        float a = t.a * vAlpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * t.rgb, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ---------- effect definitions ----------
const FX = {
  petals: { n: 70, size: [0.3, 0.55], tex: 'petal', color: 'accent', vy: [-0.9, -0.45], sway: 0.7, spin: 1.6 },
  sparkles: { n: 130, size: [0.12, 0.3], tex: 'sparkle', color: 'primary', vy: [-0.06, 0.06], sway: 0.1, spin: 0.3, twinkle: 1, glow: true },
  hearts: { n: 32, size: [0.28, 0.5], tex: 'heart', color: 'accent', vy: [0.25, 0.5], sway: 0.4, spin: 0.4 },
  snow: { n: 260, size: [0.06, 0.16], tex: 'dot', color: 'white', vy: [-0.6, -0.3], sway: 0.4, spin: 0 },
  fireflies: { n: 60, size: [0.16, 0.32], tex: 'glow', color: '#ffe27a', vy: [-0.08, 0.08], sway: 0.6, wander: true, twinkle: 1, glow: true },
  bokeh: { n: 32, size: [0.8, 1.8], tex: 'ring', color: 'primary', vy: [0.03, 0.1], sway: 0.2, spin: 0, opacity: 0.35, glow: true },
  confetti: { n: 150, size: [0.12, 0.22], tex: 'rect', color: 'multi', vy: [-1, -0.55], sway: 0.5, spin: 4 },
  lanterns: { n: 22, size: [0.35, 0.6], tex: 'lantern', color: '#ffb347', vy: [0.2, 0.42], sway: 0.2, spin: 0.1, twinkle: 0.35, glow: true },
  marigold: { n: 75, size: [0.28, 0.5], tex: 'petal', color: 'marigold', vy: [-0.85, -0.4], sway: 0.7, spin: 1.8 },
  stars: { n: 900, size: [0.05, 0.14], tex: 'dot', color: 'white', vy: [0, 0], sway: 0, spin: 0, twinkle: 1, glow: true, far: true },
};

class Particles {
  constructor(def, colors, density, tone, pointScale) {
    this.def = def;
    const n = this.n = Math.max(4, Math.round(def.n * density));
    const pos = new Float32Array(n * 3), size = new Float32Array(n), rot = new Float32Array(n);
    const seed = new Float32Array(n), col = new Float32Array(n * 3);
    this.vy = new Float32Array(n); this.spin = new Float32Array(n);
    const light = tone === 'light';
    const resolve = c => {
      if (c === 'primary' || c === 'accent') return colors[c];
      if (c === 'white') return light ? colors.primary : '#ffffff';
      return c;
    };
    const multi = def.color === 'marigold' ? ['#ff9f1c', '#ffbf00', '#ff7b00', '#ffd23f']
      : [colors.primary, colors.accent, light ? colors.text : '#ffffff', '#ffd1dc'];
    for (let i = 0; i < n; i++) {
      const z = def.far ? rand(-70, -25) : rand(-14, 4);
      const yb = this.yBound(z);
      pos[i * 3] = rand(-yb * 1.9, yb * 1.9);
      pos[i * 3 + 1] = rand(-yb, yb);
      pos[i * 3 + 2] = z;
      size[i] = rand(def.size[0], def.size[1]);
      rot[i] = rand(0, Math.PI * 2);
      seed[i] = Math.random();
      this.vy[i] = rand(def.vy[0], def.vy[1]);
      this.spin[i] = rand(-1, 1) * (def.spin || 0);
      col.set(hexRgb(def.color === 'multi' || def.color === 'marigold' ? multi[i % multi.length] : resolve(def.color)), i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    // additive glow disappears on light backgrounds, so fall back to normal blending there
    this.material = particleMaterial(spriteTex(def.tex), def.glow && !light, (def.opacity ?? 1) * (light && def.glow ? 0.8 : 1), def.twinkle || 0);
    this.material.uniforms.uScale.value = pointScale;
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }
  yBound(z) { return (10 - z) * TAN + 0.8; }
  tick(t, dt) {
    this.material.uniforms.uTime.value = t;
    const d = this.def;
    if (d.far) { this.points.rotation.y = t * 0.004; return; }
    const geo = this.points.geometry;
    const p = geo.attributes.position.array, r = geo.attributes.aRot.array, s = geo.attributes.aSeed.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3, sd = s[i];
      let x = p[k], y = p[k + 1];
      const z = p[k + 2];
      y += this.vy[i] * dt;
      x += Math.sin(t * 0.6 + sd * 40) * d.sway * dt;
      if (d.wander) { x += Math.sin(t * 0.7 + sd * 20) * 0.35 * dt; y += Math.cos(t * 0.55 + sd * 13) * 0.35 * dt; }
      const yb = this.yBound(z);
      if (d.noWrap) { /* one-off burst: let particles leave the screen */ }
      else if (y < -yb) { y = yb; x = rand(-yb * 1.9, yb * 1.9); }
      else if (y > yb) { y = -yb; x = rand(-yb * 1.9, yb * 1.9); }
      p[k] = x; p[k + 1] = y;
      r[i] += this.spin[i] * dt;
    }
    geo.attributes.position.needsUpdate = true;
    if (d.spin) geo.attributes.aRot.needsUpdate = true;
  }
  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}

function disposeTree(o) {
  o.traverse(m => {
    m.geometry?.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x?.dispose());
  });
}

function archShape(w, h) {
  const r = w / 2, s = new THREE.Shape();
  s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, 0, Math.PI, false);
  s.lineTo(-r, -h / 2);
  return s;
}

function heartShape(s) {
  const sh = new THREE.Shape();
  traceHeart(sh, s, true);
  return sh;
}

// ---------- main scene ----------
export class WeddingScene {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.camera.position.set(0, 0, 10);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(r), 0.04).texture;
    pm.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 6);
    this.rim = new THREE.PointLight(0xffffff, 30, 0, 2);
    this.rim.position.set(-4, 3, 3);
    this.scene.add(key, this.rim);

    this.hero = new THREE.Group();
    this.fx = new THREE.Group();
    this.scene.add(this.hero, this.fx);
    this.systems = [];
    this.keys = {};
    this.photoTex = new Map();
    this.loader = new THREE.TextureLoader();
    this.mouse = { x: 0, y: 0 };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clock = new THREE.Clock();
    this.t = 0;
    this.heroType = 'none';

    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', e => {
      this.mouse.x = e.clientX / innerWidth * 2 - 1;
      this.mouse.y = e.clientY / innerHeight * 2 - 1;
    }, { passive: true });
    addEventListener('deviceorientation', e => {
      if (e.gamma == null) return;
      this.mouse.x = clamp(e.gamma / 30, -1, 1);
      this.mouse.y = clamp((e.beta - 45) / 30, -1, 1);
    }, { passive: true });

    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pointScale = h * this.renderer.getPixelRatio() / (2 * TAN);
    this.systems.forEach(s => (s.material.uniforms.uScale.value = this.pointScale));
  }

  update(cfg) {
    this.cfg = cfg;
    const c = cfg.colors;
    this.tone = luminance(c.bg) > 0.55 ? 'light' : 'dark';
    this.rim.color.set(c.primary);
    this.motion = cfg.scene?.motion !== false;
    const photos = (cfg.photos || []).filter(p => p.hero !== false && p.src);
    const heroKey = JSON.stringify([cfg.scene?.hero, c.primary, c.accent, c.bg, c.text, photos.map(p => p.id + ':' + p.src.length), cfg.couple?.partner1, cfg.couple?.partner2, cfg.fonts?.display]);
    if (heroKey !== this.keys.hero) {
      this.keys.hero = heroKey;
      this.buildHero(cfg.scene?.hero || 'none', photos.map(p => p.src), cfg);
    }
    const fxKey = JSON.stringify([cfg.effects, cfg.density, c.primary, c.accent, c.text, this.tone]);
    if (fxKey !== this.keys.fx) {
      this.keys.fx = fxKey;
      this.buildFx(cfg);
    }
  }

  buildFx(cfg) {
    this.systems.forEach(s => { this.fx.remove(s.points); s.dispose(); });
    this.systems = [];
    const mobile = Math.min(innerWidth, innerHeight) < 600 ? 0.6 : 1;
    const density = clamp(Number(cfg.density) || 1, 0.2, 3) * mobile;
    for (const [id, on] of Object.entries(cfg.effects || {})) {
      if (!on || !FX[id]) continue;
      const s = new Particles(FX[id], cfg.colors, density, this.tone, this.pointScale);
      this.systems.push(s);
      this.fx.add(s.points);
    }
  }

  // one-off shower of hearts (e.g. after an RSVP)
  burst() {
    if (!this.cfg) return;
    const def = { n: 70, size: [0.25, 0.5], tex: 'heart', color: 'multi', vy: [1.8, 3.4], sway: 0.9, spin: 1.2, noWrap: true };
    const s = new Particles(def, this.cfg.colors, 1, this.tone, this.pointScale);
    const pos = s.points.geometry.attributes.position.array;
    for (let i = 0; i < s.n; i++) pos[i * 3 + 1] = s.yBound(pos[i * 3 + 2]) * -1 - Math.random() * 3; // start below the screen
    this.systems.push(s);
    this.fx.add(s.points);
    setTimeout(() => {
      this.systems = this.systems.filter(x => x !== s);
      this.fx.remove(s.points);
      s.dispose();
    }, 4500);
  }

  // ----- textures -----
  photo(src, aspect) {
    let tex = this.photoTex.get(src);
    if (!tex) {
      tex = this.loader.load(src, t => { (t.userData.pending || []).forEach(f => f()); t.userData.pending = []; });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.photoTex.set(src, tex);
    }
    const fit = () => {
      const img = tex.image;
      if (!img || !img.width) return;
      const ia = img.width / img.height;
      if (ia > aspect) { tex.repeat.set(aspect / ia, 1); tex.offset.set((1 - aspect / ia) / 2, 0); }
      else { tex.repeat.set(1, ia / aspect); tex.offset.set(0, (1 - ia / aspect) / 2); }
    };
    if (tex.image && tex.image.width) fit();
    else (tex.userData.pending ||= []).push(fit);
    return tex;
  }

  placeholder(cfg, aspect, i = 0) {
    const W = 512, H = Math.round(W / aspect);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, W, H);
    const cols = i % 2 ? [cfg.colors.accent, cfg.colors.primary] : [cfg.colors.primary, cfg.colors.accent];
    gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.save(); g.translate(W / 2, H * 0.4); g.beginPath(); traceHeart(g, W / 60); g.fill(); g.restore();
    const a = (cfg.couple?.partner1 || 'A')[0], b = (cfg.couple?.partner2 || 'B')[0];
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(W * 0.22)}px ${cfg.fonts?.display ? `'${cfg.fonts.display}',` : ''} serif`;
    g.fillText(`${a} & ${b}`, W / 2, H * 0.62);
    g.font = `${Math.round(W * 0.045)}px sans-serif`;
    g.fillText('Add your photos ♥', W / 2, H * 0.8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  frameMaterial(cfg) {
    return new THREE.MeshStandardMaterial({ color: cfg.colors.primary, metalness: 0.85, roughness: 0.25 });
  }

  // ----- hero objects -----
  buildHero(type, photos, cfg) {
    disposeTree(this.hero);
    this.hero.clear();
    this.hero.rotation.set(0, 0, 0);
    this.heroType = type;
    this.heroTick = null;
    const g = new THREE.Group();
    this.hero.add(g);
    this.heroBaseY = 1.15;
    const build = {
      carousel: this.heroCarousel, portrait: this.heroPortrait, rings: this.heroRings, frames: this.heroFrames, heart: this.heroHeart,
      mandap: this.heroMandap, lotus: this.heroLotus, monogram: this.heroMonogram, galaxy: this.heroGalaxy, cube: this.heroCube, garland: this.heroGarland,
    }[type];
    if (build) this.heroTick = build.call(this, g, photos, cfg);
  }

  photoCard(cfg, src, w, h, frameMat, i) {
    const item = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.07), frameMat);
    const map = src ? this.photo(src, w / h) : this.placeholder(cfg, w / h, i);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
    pic.position.z = 0.04;
    item.add(frame, pic);
    return item;
  }

  heroCarousel(g, photos, cfg) {
    let list = photos.length ? photos.slice(0, 12) : [null, null, null, null, null, null];
    while (list.length < 6) list = list.concat(list).slice(0, 6);
    const n = list.length, w = 2, h = 2.6;
    const r = Math.max(3.2, (w + 0.5) * n / (2 * Math.PI));
    const fm = this.frameMaterial(cfg);
    list.forEach((src, i) => {
      const a = i / n * Math.PI * 2;
      const item = this.photoCard(cfg, src, w, h, fm, i);
      item.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      item.rotation.y = a;
      g.add(item);
    });
    g.position.z = 2 - r;
    return (t, dt) => { g.rotation.y += dt * 0.16; };
  }

  heroPortrait(g, photos, cfg) {
    const w = 2.4, h = 3.2;
    const geo = new THREE.ShapeGeometry(archShape(w, h), 48);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    const maps = photos.length ? photos.slice(0, 8).map(s => this.photo(s, w / h)) : [this.placeholder(cfg, w / h)];
    const mat = new THREE.MeshBasicMaterial({ map: maps[0], transparent: true, toneMapped: false });
    const pic = new THREE.Mesh(geo, mat);
    const outer = archShape(w + 0.32, h + 0.32);
    outer.holes.push(archShape(w, h));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 48 }), this.frameMaterial(cfg));
    frame.position.z = -0.1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spriteTex('glow'), color: cfg.colors.primary, transparent: true, depthWrite: false,
      opacity: this.tone === 'light' ? 0.35 : 0.55, blending: this.tone === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    halo.scale.set(7, 7, 1);
    halo.position.z = -0.6;
    // small orbiting hearts
    const hg = new THREE.ExtrudeGeometry(heartShape(0.022), { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    hg.center();
    const hm = new THREE.MeshStandardMaterial({ color: cfg.colors.accent, metalness: 0.4, roughness: 0.35 });
    const hearts = [...Array(6)].map((_, i) => { const m = new THREE.Mesh(hg, hm); m.userData.o = i / 6 * Math.PI * 2; g.add(m); return m; });
    g.add(halo, frame, pic);
    g.position.y = 0.15;
    let idx = 0, timer = 0, swapped = false;
    return (t, dt) => {
      g.rotation.y = Math.sin(t * 0.5) * 0.12;
      hearts.forEach((m, i) => {
        const a = t * 0.4 + m.userData.o;
        m.position.set(Math.cos(a) * 2.1, Math.sin(a * 1.3) * 1.4, Math.sin(a) * 1.2);
        m.rotation.y = t + i;
      });
      if (maps.length < 2) return;
      timer += dt;
      if (timer > 5) {
        const f = timer - 5; // 0..0.6 fade out, 0.6..1.2 fade in
        if (f < 0.6) mat.opacity = 1 - f / 0.6;
        else {
          if (!swapped) { idx = (idx + 1) % maps.length; mat.map = maps[idx]; swapped = true; }
          mat.opacity = Math.min(1, (f - 0.6) / 0.6);
        }
        if (f >= 1.2) { timer = 0; swapped = false; mat.opacity = 1; }
      }
    };
  }

  heroRings(g, photos, cfg) {
    const metal = new THREE.MeshStandardMaterial({ color: cfg.colors.primary, metalness: 1, roughness: 0.16 });
    const tg = new THREE.TorusGeometry(1.3, 0.16, 48, 160);
    const a = new THREE.Mesh(tg, metal);
    a.position.x = -0.65;
    const b = new THREE.Mesh(tg, metal);
    b.position.x = 0.65;
    b.rotation.x = Math.PI / 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.1, roughness: 0, flatShading: true, emissive: '#9ab8ff', emissiveIntensity: 0.25 }));
    gem.position.set(-0.65, 1.55, 0);
    gem.scale.y = 1.3;
    const rings = new THREE.Group();
    rings.add(a, b, gem);
    rings.rotation.set(0.25, -0.5, 0.15);
    g.add(rings);
    const hg = new THREE.ExtrudeGeometry(heartShape(0.025), { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 });
    hg.center();
    const hm = new THREE.MeshStandardMaterial({ color: cfg.colors.accent, metalness: 0.35, roughness: 0.35 });
    const hearts = [...Array(7)].map((_, i) => { const m = new THREE.Mesh(hg, hm); m.userData.o = i / 7 * Math.PI * 2; m.scale.setScalar(rand(0.7, 1.2)); g.add(m); return m; });
    return (t) => {
      rings.rotation.y = -0.5 + Math.sin(t * 0.45) * 0.6;
      rings.rotation.x = 0.25 + Math.sin(t * 0.3) * 0.12;
      rings.position.y = Math.sin(t * 0.9) * 0.08;
      gem.rotation.y = t * 1.2;
      hearts.forEach((m, i) => {
        const ang = t * 0.35 + m.userData.o;
        m.position.set(Math.cos(ang) * 2.9, Math.sin(ang * 2 + i) * 0.7, Math.sin(ang) * 1.6);
        m.rotation.set(Math.sin(t + i) * 0.4, t * 0.8 + i, 0);
      });
    };
  }

  heroFrames(g, photos, cfg) {
    const fm = this.frameMaterial(cfg);
    const list = photos.length ? photos : [null, null, null, null];
    const items = [];
    for (let i = 0; i < 14; i++) {
      const item = this.photoCard(cfg, list[i % list.length], 1.7, 2.2, fm, i);
      const side = i % 2 ? 1 : -1;
      item.position.set(i === 0 ? 0 : side * rand(2, 3.4), i === 0 ? 1.5 : rand(-0.4, 2.4), 1.2 - i * 3.4);
      item.rotation.set(rand(-0.1, 0.1), -side * rand(0.15, 0.45) * (i ? 1 : 0), rand(-0.08, 0.08));
      item.userData.y = item.position.y;
      item.userData.s = Math.random() * 10;
      g.add(item);
      items.push(item);
    }
    this.heroBaseY = 0;
    return (t) => items.forEach(it => {
      it.position.y = it.userData.y + Math.sin(t * 0.8 + it.userData.s) * 0.12;
    });
  }

  heroHeart(g, photos, cfg) {
    const ctx = document.createElement('canvas').getContext('2d');
    const path = new Path2D();
    traceHeart(path, 1);
    const N = 2600, pos = new Float32Array(N * 3), size = new Float32Array(N), rot = new Float32Array(N), seed = new Float32Array(N), col = new Float32Array(N * 3);
    const c1 = hexRgb(cfg.colors.primary), c2 = hexRgb(cfg.colors.accent);
    let i = 0, guard = 0;
    while (i < N && guard++ < 100000) {
      const x = rand(-11, 11), y = rand(-9.5, 9.5);
      if (!ctx.isPointInPath(path, x, y)) continue;
      const edge = Math.random() < 0.35;
      pos[i * 3] = x * 0.13; pos[i * 3 + 1] = -y * 0.13; pos[i * 3 + 2] = rand(-0.5, 0.5) * (edge ? 0.3 : 1);
      size[i] = rand(0.04, edge ? 0.14 : 0.1);
      seed[i] = Math.random();
      const m = (y + 9.5) / 19;
      col.set([c1[0] + (c2[0] - c1[0]) * m, c1[1] + (c2[1] - c1[1]) * m, c1[2] + (c2[2] - c1[2]) * m], i * 3);
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = particleMaterial(spriteTex('glow'), this.tone !== 'light', 1, 0.6);
    mat.uniforms.uScale.value = this.pointScale;
    this.heartMat = mat;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    g.add(pts);
    g.position.y = 0.2;
    return (t) => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uScale.value = this.pointScale;
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.6)), 12) + 0.5 * Math.pow(Math.max(0, Math.sin(t * 2.6 - 0.6)), 12);
      g.scale.setScalar(1 + beat * 0.07);
      g.rotation.y = Math.sin(t * 0.5) * 0.5;
    };
  }

  glowSprite(color, scale, opacity = 0.5) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spriteTex('glow'), color, transparent: true, depthWrite: false, opacity: this.tone === 'light' ? opacity * 0.7 : opacity,
      blending: this.tone === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  // Indian wedding mandap: gold pillars, draped dome, marigold garlands, couple photo inside
  heroMandap(g, photos, cfg) {
    const V = THREE.Vector3;
    const gold = this.frameMaterial(cfg);
    const cloth = new THREE.MeshStandardMaterial({ color: cfg.colors.accent, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
    const W = 1.9, D = 1.25, H = 3.2, top = H / 2 - 0.08;
    const m = new THREE.Group();
    g.add(m);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.22, 64), new THREE.MeshStandardMaterial({ color: cfg.colors.primary, metalness: 0.6, roughness: 0.35 }));
    base.position.y = -H / 2 - 0.11;
    m.add(base);
    const pg = new THREE.CylinderGeometry(0.09, 0.11, H, 24), cg = new THREE.TorusGeometry(0.13, 0.04, 12, 32);
    for (const x of [-W, W]) for (const z of [-D, D]) {
      const p = new THREE.Mesh(pg, gold);
      p.position.set(x, 0, z);
      m.add(p);
      for (const y of [-H / 2 + 0.12, 0, H / 2 - 0.12]) {
        const c = new THREE.Mesh(cg, gold);
        c.rotation.x = Math.PI / 2;
        c.position.set(x, y, z);
        m.add(c);
      }
    }
    const bx = new THREE.BoxGeometry(2 * W + 0.3, 0.12, 0.12), bz = new THREE.BoxGeometry(0.12, 0.12, 2 * D + 0.3);
    for (const z of [-D, D]) { const b = new THREE.Mesh(bx, gold); b.position.set(0, H / 2, z); m.add(b); }
    for (const x of [-W, W]) { const b = new THREE.Mesh(bz, gold); b.position.set(x, H / 2, 0); m.add(b); }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), cloth);
    dome.scale.set(W * 1.08, 0.8, D * 1.2);
    dome.position.y = H / 2 + 0.06;
    m.add(dome);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 16), gold);
    fin.position.y = H / 2 + 0.06 + 0.8 + 0.2;
    m.add(fin);
    // marigold & jasmine garlands
    const pts = [];
    const swag = (a, b, n, depth) => { for (let i = 0; i <= n; i++) { const t = i / n; const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * depth; pts.push(p); } };
    swag(new V(-W, top, D + 0.06), new V(0, top, D + 0.06), 16, 0.5);
    swag(new V(0, top, D + 0.06), new V(W, top, D + 0.06), 16, 0.5);
    swag(new V(-W, top, -D - 0.06), new V(W, top, -D - 0.06), 26, 0.35);
    for (const x of [-W, W]) swag(new V(x + Math.sign(x) * 0.06, top, -D), new V(x + Math.sign(x) * 0.06, top, D), 18, 0.4);
    for (const x of [-W, W]) for (let i = 0; i < 18; i++) pts.push(new V(x - Math.sign(x) * 0.2, top - i * 0.13, D + 0.08));
    const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), pts.length);
    const mtx = new THREE.Matrix4(), col = new THREE.Color(), cols = ['#ff9f1c', '#ffbf00', '#ff7b00'];
    pts.forEach((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); inst.setMatrixAt(i, mtx); inst.setColorAt(i, col.set(i % 7 === 0 ? '#fffaf0' : cols[i % 3])); });
    m.add(inst);
    // couple photo on the back wall
    const pw = 1.6, ph = 2.1;
    const maps = photos.length ? photos.slice(0, 8).map(s => this.photo(s, pw / ph)) : [this.placeholder(cfg, pw / ph)];
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: maps[0], toneMapped: false }));
    pic.position.set(0, -0.2, -D + 0.1);
    const pf = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.16, ph + 0.16, 0.05), gold);
    pf.position.set(0, -0.2, -D + 0.06);
    const halo = this.glowSprite(cfg.colors.primary, 5, 0.45);
    halo.position.set(0, 0, -D - 0.3);
    m.add(halo, pf, pic);
    m.scale.setScalar(0.72);
    m.position.y = -0.05;
    let idx = 0, timer = 0;
    return (t, dt) => {
      m.rotation.y = Math.sin(t * 0.35) * 0.4;
      if (maps.length > 1 && (timer += dt) > 5) { timer = 0; idx = (idx + 1) % maps.length; pic.material.map = maps[idx]; }
    };
  }

  // Blooming lotus on water
  heroLotus(g, photos, cfg) {
    const lotus = new THREE.Group();
    g.add(lotus);
    const geo = new THREE.SphereGeometry(1, 28, 16);
    geo.scale(0.34, 0.9, 0.12);
    geo.translate(0, 0.9, 0);
    const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const layers = [
      { n: 9, r: 0.18, open: 1.3, sc: 1.0, col: mix(cfg.colors.accent, '#ffffff', 0.1) },
      { n: 9, r: 0.14, open: 0.9, sc: 0.85, col: mix(cfg.colors.accent, cfg.colors.primary, 0.5), off: 0.5 },
      { n: 7, r: 0.1, open: 0.5, sc: 0.68, col: mix(cfg.colors.primary, '#ffffff', 0.25), off: 0.25 },
    ];
    const petals = [];
    layers.forEach(L => {
      const mat = new THREE.MeshStandardMaterial({ color: L.col, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide, emissive: L.col, emissiveIntensity: 0.12 });
      for (let i = 0; i < L.n; i++) {
        const pivot = new THREE.Group();
        pivot.rotation.y = (i + (L.off || 0)) / L.n * Math.PI * 2;
        const p = new THREE.Mesh(geo, mat);
        p.position.z = L.r;
        p.scale.setScalar(L.sc);
        pivot.add(p);
        lotus.add(pivot);
        petals.push({ p, open: L.open });
      }
    });
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.2, 32), new THREE.MeshStandardMaterial({ color: '#f4d35e', roughness: 0.5, emissive: '#c99a00', emissiveIntensity: 0.2 }));
    pod.position.y = 0.12;
    lotus.add(pod);
    const glow = this.glowSprite(cfg.colors.primary, 3.2, 0.55);
    glow.position.y = 0.6;
    lotus.add(glow);
    // lily pads + ripples
    const padMat = new THREE.MeshStandardMaterial({ color: '#3f8f4f', roughness: 0.6, side: THREE.DoubleSide });
    [[-1.9, 0.6, 0.85], [1.8, -0.3, 0.7], [-0.9, -1.6, 0.55]].forEach(([x, z, r], i) => {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 40, 0.35, Math.PI * 2 - 0.35), padMat);
      pad.rotation.set(-Math.PI / 2, 0, i * 2.1);
      pad.position.set(x, -0.02, z);
      lotus.add(pad);
    });
    const ripples = [0, 1, 2].map(i => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 64), new THREE.MeshBasicMaterial({ color: cfg.colors.primary, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2;
      r.userData.o = i / 3;
      lotus.add(r);
      return r;
    });
    lotus.rotation.x = 0.42;
    lotus.position.y = -0.55;
    lotus.scale.setScalar(1.15);
    const t0 = this.heroT || 0;
    return (t) => {
      const k = Math.min(1, (t - t0) / 3);
      const ease = 1 - Math.pow(1 - k, 3);
      const breathe = Math.sin(t * 1.2) * 0.04;
      petals.forEach(({ p, open }) => (p.rotation.x = 0.08 + (open - 0.08) * ease + breathe * open));
      lotus.rotation.y = t * 0.15;
      ripples.forEach(r => {
        const f = (t * 0.25 + r.userData.o) % 1;
        r.scale.setScalar(1 + f * 2.6);
        r.material.opacity = (1 - f) * 0.35;
      });
    };
  }

  // Gold 3D monogram of the couple's initials
  heroMonogram(g, photos, cfg) {
    const gold = new THREE.MeshStandardMaterial({ color: cfg.colors.primary, metalness: 1, roughness: 0.2 });
    const accent = new THREE.MeshStandardMaterial({ color: cfg.colors.accent, metalness: 0.7, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.055, 16, 180), gold);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.12, 0.02, 12, 180), gold);
    g.add(ring, ring2);
    const gems = [0, 1, 2, 3].map(i => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), accent);
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      m.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
      ring.add(m);
      return m;
    });
    const text = new THREE.Group();
    g.add(text);
    const pick = n => { const c = String(n || '').trim()[0] || ''; return c.toUpperCase(); };
    const a = pick(cfg.couple?.partner1), b = pick(cfg.couple?.partner2);
    Promise.all([import('three/addons/loaders/FontLoader.js'), import('three/addons/geometries/TextGeometry.js')]).then(([{ FontLoader }, { TextGeometry }]) => {
      WeddingScene.font ??= new FontLoader().loadAsync('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/gentilis_bold.typeface.json');
      return WeddingScene.font.then(font => {
        if (!g.parent) return; // hero was rebuilt meanwhile
        const make = (s, size, mat) => {
          if (!s || !font.data.glyphs[s]) return null;
          const geo = new TextGeometry(s, { font, size, height: 0.2, depth: 0.2, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 3 });
          geo.center();
          return new THREE.Mesh(geo, mat);
        };
        const A = make(a, 1.15, gold), amp = make('&', 0.6, accent), B = make(b, 1.15, gold);
        if (A) { A.position.set(-0.78, 0.05, 0); text.add(A); }
        if (amp) { amp.position.set(0, -0.35, 0.25); text.add(amp); }
        if (B) { B.position.set(0.78, 0.05, 0); text.add(B); }
      });
    }).catch(err => console.warn('monogram font:', err));
    const halo = this.glowSprite(cfg.colors.primary, 6, 0.3);
    halo.position.z = -1;
    g.add(halo);
    return (t) => {
      g.rotation.y = Math.sin(t * 0.5) * 0.4;
      ring.rotation.z = t * 0.12;
      ring2.rotation.z = -t * 0.08;
      text.position.y = Math.sin(t * 1.1) * 0.06;
      gems.forEach((m, i) => (m.rotation.y = t * 2 + i));
    };
  }

  // Spiral galaxy with the couple's photos orbiting
  heroGalaxy(g, photos, cfg) {
    const N = 7000, R = 4.2, arms = 3;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), rot = new Float32Array(N), seed = new Float32Array(N), col = new Float32Array(N * 3);
    const c1 = hexRgb(cfg.colors.primary), c2 = hexRgb(cfg.colors.accent);
    for (let i = 0; i < N; i++) {
      const r = Math.pow(Math.random(), 1.5) * R;
      const ang = (i % arms) / arms * Math.PI * 2 + r * 1.15;
      const spread = Math.pow(Math.random(), 3) * (0.25 + r * 0.22);
      const sx = (Math.random() < 0.5 ? -1 : 1) * spread, sz = (Math.random() < 0.5 ? -1 : 1) * spread;
      pos.set([Math.cos(ang) * r + sx, (Math.random() - 0.5) * 0.25 * (1.2 - r / R), Math.sin(ang) * r + sz], i * 3);
      size[i] = rand(0.03, 0.09);
      seed[i] = Math.random();
      const k = Math.min(1, r / R * 1.3);
      col.set([c1[0] + (c2[0] - c1[0]) * k, c1[1] + (c2[1] - c1[1]) * k, c1[2] + (c2[2] - c1[2]) * k], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = particleMaterial(spriteTex('glow'), this.tone !== 'light', 1, 0.45);
    const disk = new THREE.Group();
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    disk.add(pts);
    const core = this.glowSprite(cfg.colors.primary, 2.6, 0.8);
    disk.add(core);
    disk.rotation.x = 0.62;
    g.add(disk);
    g.position.y = -0.1;
    const list = photos.slice(0, 6);
    const orbs = list.map((src, i) => {
      const o = new THREE.Group();
      const pic = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ map: this.photo(src, 1), toneMapped: false }));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.03, 12, 64), this.frameMaterial(cfg));
      o.add(pic, rim);
      o.userData = { r: 2.2 + (i % 3) * 0.55, a: i / list.length * Math.PI * 2, sp: 0.18 + (i % 2) * 0.06 };
      disk.add(o);
      return o;
    });
    return (t) => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uScale.value = this.pointScale;
      pts.rotation.y = t * 0.06;
      orbs.forEach(o => {
        const a = o.userData.a + t * o.userData.sp;
        o.position.set(Math.cos(a) * o.userData.r, 0.25, Math.sin(a) * o.userData.r);
        o.lookAt(this.camera.position);
      });
    };
  }

  // Rotating cube of photos with gold edges
  heroCube(g, photos, cfg) {
    const S = 2;
    const all = photos.length ? photos : [];
    const mats = [...Array(6)].map((_, i) => new THREE.MeshBasicMaterial({ map: all.length ? this.photo(all[i % all.length], 1) : this.placeholder(cfg, 1, i), toneMapped: false }));
    const cube = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), mats);
    const gold = this.frameMaterial(cfg);
    const bar = new THREE.BoxGeometry(S + 0.1, 0.08, 0.08);
    const h = S / 2;
    for (const a of [-h, h]) for (const b of [-h, h]) {
      const x = new THREE.Mesh(bar, gold); x.position.set(0, a, b); cube.add(x);
      const y = new THREE.Mesh(bar, gold); y.rotation.z = Math.PI / 2; y.position.set(a, 0, b); cube.add(y);
      const z = new THREE.Mesh(bar, gold); z.rotation.y = Math.PI / 2; z.position.set(a, b, 0); cube.add(z);
    }
    const halo = this.glowSprite(cfg.colors.primary, 6, 0.4);
    halo.position.z = -2;
    g.add(halo, cube);
    g.position.y = 0.1;
    let next = 6, timer = 0;
    return (t, dt) => {
      cube.rotation.x = 0.35 + Math.sin(t * 0.4) * 0.3;
      cube.rotation.y = t * 0.45;
      cube.position.y = Math.sin(t * 0.9) * 0.08;
      if (all.length > 6 && (timer += dt) > 3.5) { timer = 0; mats[next % 6].map = this.photo(all[next % all.length], 1); next++; }
    };
  }

  // Polaroids hanging from strings of fairy lights
  heroGarland(g, photos, cfg) {
    const list = photos.length ? photos : [null, null, null, null, null];
    const rows = [{ y: 1.75, z: 0, n: 5, w: 6.2, sag: 0.55 }, { y: 0.55, z: -1.6, n: 4, w: 5.6, sag: 0.45 }];
    const paper = new THREE.MeshStandardMaterial({ color: '#fbf8f2', roughness: 0.9 });
    const clip = new THREE.MeshStandardMaterial({ color: cfg.colors.primary, metalness: 0.7, roughness: 0.3 });
    const cord = new THREE.MeshStandardMaterial({ color: this.tone === 'light' ? '#7a5c45' : '#c8b08a', roughness: 0.8 });
    const cards = [], bulbs = [];
    let k = 0;
    rows.forEach((row, ri) => {
      const curve = new THREE.CatmullRomCurve3([...Array(9)].map((_, i) => {
        const t = i / 8;
        return new THREE.Vector3((t - 0.5) * row.w, row.y - Math.sin(Math.PI * t) * row.sag, row.z);
      }));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.012, 6), cord));
      for (let i = 0; i < 22; i++) {
        const b = this.glowSprite('#ffd27a', 0.35, 0.9);
        b.position.copy(curve.getPoint((i + 0.5) / 22));
        b.position.y -= 0.03;
        b.userData.s = Math.random() * 10;
        g.add(b);
        bulbs.push(b);
      }
      for (let i = 0; i < row.n; i++) {
        const pivot = new THREE.Group();
        pivot.position.copy(curve.getPoint((i + 0.5) / row.n));
        const card = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.4, 0.02), paper);
        const src = list[k % list.length];
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: src ? this.photo(src, 1) : this.placeholder(cfg, 1, k), toneMapped: false }));
        pic.position.set(0, 0.12, 0.012);
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), clip);
        c.position.y = 0.72;
        card.add(frame, pic, c);
        card.position.y = -0.78;
        pivot.add(card);
        pivot.userData = { s: k * 1.7, ri };
        g.add(pivot);
        cards.push(pivot);
        k++;
      }
    });
    g.position.y = -0.2;
    return (t) => {
      cards.forEach(p => {
        p.rotation.z = Math.sin(t * 1.1 + p.userData.s) * 0.07;
        p.rotation.y = Math.sin(t * 0.7 + p.userData.s) * 0.18;
      });
      bulbs.forEach(b => (b.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.6 + b.userData.s))));
      g.rotation.y = Math.sin(t * 0.25) * 0.12;
    };
  }

  // ----- loop -----
  loop() {
    requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const speed = this.reduced ? 0.25 : 1;
    const dt = Math.min(this.clock.getDelta(), 0.05) * speed;
    this.t += dt;
    const t = this.t, cam = this.camera;
    const sy = window.scrollY / Math.max(1, innerHeight);
    const m = this.motion === false ? 0 : 1;
    const frames = this.heroType === 'frames';

    cam.position.x += (this.mouse.x * 0.6 * m - cam.position.x) * 0.04;
    cam.position.y += (-this.mouse.y * 0.35 * m - cam.position.y) * 0.04;
    const tz = frames ? 10 - Math.min(sy, 7) * 6.2 : 10 + Math.min(sy, 4) * 1.2;
    cam.position.z += (tz - cam.position.z) * 0.08;
    cam.lookAt(cam.position.x * 0.3, cam.position.y * 0.3, cam.position.z - 10);

    const L = this.cfg?.heroLayout || {};
    const objScale = clamp(Number(L.objScale) || 1, 0.3, 2.5), spin = clamp(Number(L.spin ?? 1), 0, 4);
    const s = clamp(cam.aspect / 1.3, 0.58, 1);
    this.hero.scale.setScalar((frames ? clamp(cam.aspect / 1.1, 0.7, 1) : s) * objScale);
    this.hero.position.x = (Number(L.objX) || 0) * s;
    this.hero.position.y = (this.heroBaseY ?? 1.15) * (frames ? 1 : s) + (Number(L.objY) || 0) * s + (frames ? 0 : sy * 7.5);
    this.hero.visible = frames || sy < 1.6;
    this.heroT = (this.heroT || 0) + dt * spin;
    if (this.hero.visible) this.heroTick?.(this.heroT, dt * spin, sy);

    this.fx.position.z = cam.position.z - 10;
    for (const p of this.systems) p.tick(t, dt);
    this.renderer.render(this.scene, cam);
  }
}
