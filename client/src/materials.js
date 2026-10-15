// Textures and materials, all drawn in code at load (no image files) and all matte (Lambert) or
// unlit (Basic): strawberries with seeds, shortcake, whipped cream, strawberry milk, glossy icing
// (the gloss is painted in, there are no reflections), trusses, jelly, berry slices, checkpoint
// pads, the rainbow carpet. Each is made once and shared.
import { T, texFrom, matte, NEON_BOOST } from './engine.js';

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
const wrap = (t) => { t.wrapS = t.wrapT = T.RepeatWrapping; return t; };

// ----- strawberries -----
// Red skin with little golden seeds in neat staggered rows, a lighter shoulder near the leaves
export const berryTex = () => once('berry', () => {
    const W = 512, H = 256, c = canvas(W, H), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ff5a74'); g.addColorStop(0.18, '#ff2e52'); g.addColorStop(0.7, '#e81c44'); g.addColorStop(1, '#c8123a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const rnd = seeded(11);
    for (let row = 0; row < 11; row++) {
        const y = 18 + row * 21, n = 14;
        for (let k = 0; k < n; k++) {
            const px = (k + (row % 2) * 0.5) * (W / n) + (rnd() - 0.5) * 4, py = y + (rnd() - 0.5) * 4;
            // a dimple with a seed in it
            x.fillStyle = 'rgba(120,0,24,0.35)'; x.beginPath(); x.ellipse(px, py + 1.5, 7, 9, 0, 0, Math.PI * 2); x.fill();
            const sg = x.createLinearGradient(px, py - 5, px, py + 5); sg.addColorStop(0, '#fff6a8'); sg.addColorStop(1, '#e8b02a');
            x.fillStyle = sg; x.beginPath(); x.ellipse(px, py, 2.6, 4.6, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.arc(px - 0.8, py - 1.8, 1, 0, Math.PI * 2); x.fill();
        }
    }
    const t = wrap(texFrom(c)); t.wrapT = T.ClampToEdgeWrapping;
    return t;
});
export const berryMaterial = () => once('berrymat', () => matte({ map: berryTex(), emissive: 0x5a0012, emissiveIntensity: 0.35 }));
export const leafMaterial = () => once('leafmat', () => matte({ color: 0x5ad86a, emissive: 0x0a3a14, emissiveIntensity: 0.3 }));
export const goldBerryMaterial = () => once('goldberry', () => matte({ map: berryTex(), color: 0xffe07a, emissive: 0x7a4a00, emissiveIntensity: 0.55 }));

// ----- shortcake -----
// The side of a slice: golden sponge, a cream layer with sliced strawberries, sponge, cream on top
export const cakeSideTex = () => once('cakeside', () => {
    const W = 256, H = 128, c = canvas(W, H), x = c.getContext('2d');
    const band = (y0, y1, c0, c1) => { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, y0, W, y1 - y0); };
    band(0, 22, '#fffafc', '#fff0f4');          // cream top
    band(22, 56, '#ffe2a0', '#f4c870');         // sponge
    band(56, 78, '#fff6f8', '#ffeef2');         // cream filling
    band(78, 128, '#ffd890', '#eab460');        // sponge
    const rnd = seeded(5);
    // sponge holes
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(190,120,40,${0.2 + rnd() * 0.25})`; x.beginPath(); x.arc(rnd() * W, 24 + rnd() * 30 + (rnd() < 0.5 ? 0 : 56), 1 + rnd() * 1.8, 0, Math.PI * 2); x.fill(); }
    // sliced strawberries in the cream layer
    for (let k = 0; k < 6; k++) {
        const cx = 22 + k * 43, cy = 67;
        x.fillStyle = '#ff2e52'; x.beginPath(); x.ellipse(cx, cy, 16, 9, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ff8aa0'; x.beginPath(); x.ellipse(cx, cy, 11, 5.5, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ffe0e6'; x.beginPath(); x.ellipse(cx, cy, 5, 2.2, 0, 0, Math.PI * 2); x.fill();
    }
    // a jam drizzle over the top edge
    x.fillStyle = '#ff3a62';
    for (let k = 0; k < 9; k++) { const px = k * 30 + 8; x.beginPath(); x.moveTo(px - 8, 0); x.lineTo(px + 8, 0); x.quadraticCurveTo(px + 6, 12 + (k % 3) * 5, px, 16 + (k % 3) * 6); x.quadraticCurveTo(px - 6, 12, px - 8, 0); x.fill(); }
    x.fillRect(0, 0, W, 4);
    return wrap(texFrom(c));
});
export const creamTopTex = () => once('creamtop', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d');
    x.fillStyle = '#fff6f8'; x.fillRect(0, 0, N, N);
    const rnd = seeded(23);
    // soft swirls of whipped cream
    for (let i = 0; i < 40; i++) {
        const cx = rnd() * N, cy = rnd() * N, r = 10 + rnd() * 18;
        x.strokeStyle = `rgba(232,200,214,${0.35 + rnd() * 0.3})`; x.lineWidth = 2.5;
        x.beginPath(); x.arc(cx, cy, r, rnd() * 6, rnd() * 6 + 3.5); x.stroke();
    }
    // pink drizzle lines
    x.strokeStyle = 'rgba(255,90,130,0.85)'; x.lineWidth = 5; x.lineCap = 'round';
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(0, 30 + k * 64); for (let px = 0; px <= N; px += 16) x.lineTo(px, 30 + k * 64 + Math.sin(px * 0.06 + k) * 10); x.stroke(); }
    return wrap(texFrom(c));
});
export const cakeSideMaterial = () => once('cakesidemat', () => matte({ map: cakeSideTex() }));
export const creamTopMaterial = () => once('creamtopmat', () => matte({ map: creamTopTex() }));
// whipped cream (puffs, trampolines): soft white with a faint pink glow in the shade
export const creamMaterial = () => once('creammat', () => matte({ color: 0xfff4f8, emissive: 0xffc8dc, emissiveIntensity: 0.18 }));

// ----- strawberry milk -----
export const milkTex = () => once('milk', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d');
    x.fillStyle = '#ffb6d2'; x.fillRect(0, 0, N, N);
    const rnd = seeded(41);
    for (let i = 0; i < 26; i++) {
        const cx = rnd() * N, cy = rnd() * N, r = 14 + rnd() * 30;
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
            const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
            g.addColorStop(0, 'rgba(255,240,248,0.55)'); g.addColorStop(1, 'rgba(255,240,248,0)');
            x.fillStyle = g; x.beginPath(); x.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); x.fill();
        }
    }
    for (let i = 0; i < 22; i++) { x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.beginPath(); const cx = rnd() * N, cy = rnd() * N; x.arc(cx, cy, 3 + rnd() * 5, 0, Math.PI * 2); x.stroke(); }
    return wrap(texFrom(c));
});
export const milkMaterial = () => once('milkmat', () => matte({ map: milkTex(), emissive: 0xff7aa8, emissiveIntensity: 0.2 }));
export const tubMaterial = () => once('tubmat', () => matte({ color: 0xffffff, emissive: 0xffd8e8, emissiveIntensity: 0.12 }));

// ----- glossy icing (slippery): pink with painted-in highlights and sprinkles, drips down the sides -----
export const icingTopTex = () => once('icingtop', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, N, N); g.addColorStop(0, '#ff9ad0'); g.addColorStop(1, '#ff6ab4');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineCap = 'round';
    for (let k = 0; k < 6; k++) { x.lineWidth = 3 + (k % 3) * 2; x.beginPath(); x.moveTo(k * 48 - 20, 0); x.lineTo(k * 48 + 40, N); x.stroke(); }
    const rnd = seeded(9);
    const cols = ['#ffffff', '#ffe03a', '#3ad8ff', '#7affa0'];
    for (let i = 0; i < 40; i++) { x.fillStyle = cols[i % 4]; x.save(); x.translate(rnd() * N, rnd() * N); x.rotate(rnd() * 3); x.fillRect(-5, -1.5, 10, 3); x.restore(); }
    return wrap(texFrom(c));
});
export const icingSideTex = () => once('icingside', () => {
    const W = 256, H = 128, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#fff0e0'; x.fillRect(0, 0, W, H);
    // biscuit base with rows of little holes
    x.fillStyle = '#f2c890'; x.fillRect(0, 60, W, 68);
    x.fillStyle = 'rgba(180,110,40,0.5)';
    for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) { x.beginPath(); x.arc(8 + i * 16, 76 + j * 18, 2.2, 0, Math.PI * 2); x.fill(); }
    // pink icing dripping down
    x.fillStyle = '#ff7ac0';
    x.fillRect(0, 0, W, 30);
    const rnd = seeded(3);
    for (let px = 0; px < W; px += 20) { const d = 34 + rnd() * 34; x.beginPath(); x.moveTo(px, 20); x.lineTo(px + 14, 20); x.lineTo(px + 14, d - 6); x.arc(px + 7, d - 6, 7, 0, Math.PI); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(0, 6, W, 3);
    return wrap(texFrom(c));
});
export const icingTopMaterial = () => once('icingtopmat', () => matte({ map: icingTopTex(), emissive: 0xff5aa8, emissiveIntensity: 0.15 }));
export const icingSideMaterial = () => once('icingsidemat', () => matte({ map: icingSideTex() }));

// ----- truss (climbable) -----
export const trussTex = () => once('truss', () => {
    const N = 128, c = canvas(N), x = c.getContext('2d');
    x.clearRect(0, 0, N, N);
    x.strokeStyle = '#ffffff'; x.lineWidth = 12; x.lineCap = 'square';
    x.strokeRect(6, 6, N - 12, N - 12);
    x.beginPath(); x.moveTo(6, 6); x.lineTo(N - 6, N - 6); x.moveTo(N - 6, 6); x.lineTo(6, N - 6); x.stroke();
    x.strokeStyle = '#ffb8d0'; x.lineWidth = 4;
    x.strokeRect(6, 6, N - 12, N - 12);
    return wrap(texFrom(c));
});
export const trussMaterial = () => once('trussmat', () => matte({ map: trussTex(), alphaTest: 0.45, side: T.DoubleSide, emissive: 0xffd8e8, emissiveIntensity: 0.2 }));

// ----- jelly that melts (translucent strawberry jelly) -----
export const jellyMaterial = (color) => once('jelly|' + color, () => matte({ color, transparent: true, opacity: 0.82, emissive: color, emissiveIntensity: 0.35 }));

// ----- a strawberry slice (the spinners): red rim, pale flesh, a white heart, seeds at the edge -----
export const sliceTex = () => once('slice', () => {
    const N = 256, c = canvas(N), x = c.getContext('2d'), m = N / 2;
    const g = x.createRadialGradient(m, m, 10, m, m, m);
    g.addColorStop(0, '#fff2f4'); g.addColorStop(0.32, '#ffc8d4'); g.addColorStop(0.7, '#ff6a88'); g.addColorStop(0.9, '#f02a50'); g.addColorStop(1, '#c8123a');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    // the white core with lines fanning out
    x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 3;
    for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; x.beginPath(); x.moveTo(m + Math.cos(a) * 26, m + Math.sin(a) * 26); x.lineTo(m + Math.cos(a) * 88, m + Math.sin(a) * 88); x.stroke(); }
    x.fillStyle = '#ffffff';
    x.beginPath(); x.moveTo(m, m + 22); x.bezierCurveTo(m - 40, m - 4, m - 16, m - 34, m, m - 14); x.bezierCurveTo(m + 16, m - 34, m + 40, m - 4, m, m + 22); x.fill();
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; x.fillStyle = '#ffe58a'; x.beginPath(); x.ellipse(m + Math.cos(a) * 112, m + Math.sin(a) * 112, 2.4, 4, a, 0, Math.PI * 2); x.fill(); }
    return texFrom(c);
});
export const sliceMaterial = () => once('slicemat', () => matte({ map: sliceTex(), emissive: 0x5a0a1a, emissiveIntensity: 0.2 }));

// ----- checkpoint pads: a pink pad with a strawberry; green with a tick once reached -----
export const cpPadTex = (on) => once('cp' + (on ? 1 : 0), () => {
    const N = 256, c = canvas(N), x = c.getContext('2d');
    const g = x.createRadialGradient(N / 2, N / 2, 10, N / 2, N / 2, N * 0.7);
    if (on) { g.addColorStop(0, '#9aff8a'); g.addColorStop(1, '#22c73a'); } else { g.addColorStop(0, '#ffb0c8'); g.addColorStop(1, '#ff4a7a'); }
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 10; x.strokeRect(14, 14, N - 28, N - 28);
    x.setLineDash([18, 14]); x.lineWidth = 5; x.strokeRect(30, 30, N - 60, N - 60); x.setLineDash([]);
    x.font = '120px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(on ? '✅' : '🍓', N / 2, N / 2 + 6);
    return texFrom(c);
});
export const cpPadMaterial = (on) => once('cpmat' + (on ? 1 : 0), () => matte({ map: cpPadTex(on), emissive: on ? 0x1a8a2a : 0xff2a5a, emissiveIntensity: 0.3 }));
// The checkpoint flag: white with a big strawberry and a rose border; green with a tick once reached
export const flagTex = (on) => once('flag' + (on ? 1 : 0), () => {
    const W = 256, H = 160, c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = on ? '#46e85a' : '#ffffff'; x.fillRect(0, 0, W, H);
    x.fillStyle = on ? '#1a9a2a' : '#ff4a7a';
    for (let k = 0; k < 8; k++) x.fillRect(0, k * 20, 14, 10);
    x.strokeStyle = on ? '#1a9a2a' : '#ff4a7a'; x.lineWidth = 12; x.strokeRect(6, 6, W - 12, H - 12);
    x.font = '96px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(on ? '✅' : '🍓', W / 2 + 8, H / 2 + 6);
    return texFrom(c);
});
export const flagMaterial = (on) => once('flagmat' + (on ? 1 : 0), () => matte({ map: flagTex(on), side: T.DoubleSide, emissive: 0xffffff, emissiveMap: flagTex(on), emissiveIntensity: 0.25 }));

// ----- glass floor over the sky -----
export const glassMaterial = () => once('glassmat', () => new T.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.18, depthWrite: false }));

// ----- rainbow (the summit pad, the carpet) -----
export const rainbowTex = () => once('rainbow', () => {
    const c = canvas(256, 16), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 0);
    ['#ff3c5a', '#ff9a2a', '#ffe83a', '#46ec50', '#28c8ff', '#6a5aff', '#d84aff', '#ff3c5a'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    x.fillStyle = g; x.fillRect(0, 0, 256, 16);
    return wrap(texFrom(c));
});
export const carpetTex = () => once('carpet', () => {
    const c = canvas(128, 256), x = c.getContext('2d');
    const cols = ['#ff3c5a', '#ff9a2a', '#ffe83a', '#46ec50', '#28c8ff', '#8a5aff'];
    cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * (128 / cols.length), 0, 128 / cols.length + 1, 256); });
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 6; x.strokeRect(5, 5, 118, 246);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 8; k++) { x.beginPath(); x.arc(64, 20 + k * 31, 6, 0, Math.PI * 2); x.fill(); }
    return texFrom(c);
});

// Soft glow dot (pad glows, the summit)
export const softTex = () => once('soft', () => {
    const c = canvas(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return texFrom(c);
});

// Fluffy cloud puff for the sprites drifting around the island
export const cloudSpriteTex = () => once('cloudsprite', () => {
    const W = 256, H = 128, c = canvas(W, H), x = c.getContext('2d');
    const rnd = seeded(77);
    for (let i = 0; i < 16; i++) {
        const cx = 40 + rnd() * 176, cy = 54 + rnd() * 34, r = 22 + rnd() * 30;
        const g = x.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.6, 'rgba(250,246,255,0.8)'); g.addColorStop(1, 'rgba(240,236,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    return texFrom(c);
});

// Unlit glowing colour (neon trims, light panels), a little brighter than the colour itself
export const neon = (color, boost) => once('neon|' + color + '|' + (boost || 1.2), () => { const m = new T.MeshBasicMaterial({ color }); m.color.multiplyScalar(NEON_BOOST * (boost || 1.2) / 1.25); return m; });
