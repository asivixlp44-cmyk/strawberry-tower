import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = THREE;
export const V3 = THREE.Vector3;
export const $ = (s) => document.querySelector(s);
export const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');

// ----- renderer, scene, camera, lights -----
export const canvas = $('#view');
export const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
// Shader error checks cost extra blocking GPU calls per shader; only in development
renderer.debug.checkShaderErrors = import.meta.env.DEV;
// PCFShadowMap: three r186 removed PCFSoft and switches it at the first shadow frame, which
// recompiles every material at once (a long freeze when the game starts)
renderer.shadowMap.type = T.PCFShadowMap;

export const scene = new T.Scene();
export const FOG = 0xf6dce8;
// a soft pink-white haze far away, so the tower melts into the sky
scene.fog = new T.Fog(FOG, 380, 1500);
scene.background = new T.Color(0x8ac8ff);

// ----- sky: a bright Roblox day over a sea of clouds -----
// Deep blue overhead fading to pale blue-pink at the horizon, a few soft clouds drifting above it,
// and below the floating island an endless plane of fluffy clouds that recedes into the haze. The
// clouds come from one small tiling texture drawn once at load (cheap on any GPU: no noise maths
// per pixel). A dome that follows the camera.
function cloudTile() {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // puffy clusters: each a handful of soft round blobs, wrapped around the tile edges
    const blob = (cx, cy, r, a) => {
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
            const px = cx + ox, py = cy + oy;
            if (px + r < 0 || px - r > N || py + r < 0 || py - r > N) continue;
            const g = x.createRadialGradient(px, py, r * 0.1, px, py, r);
            g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
        }
    };
    for (let k = 0; k < 34; k++) {
        const cx = rnd() * N, cy = rnd() * N, R = 28 + rnd() * 46;
        for (let j = 0; j < 7; j++) blob(cx + (rnd() - 0.5) * R * 2.2, cy + (rnd() - 0.5) * R * 1.2, R * (0.45 + rnd() * 0.6), 0.55 + rnd() * 0.35);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.NoColorSpace;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    return t;
}
const SUN_DIR = new T.Vector3(0.45, 0.62, -0.64).normalize();
const skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uClouds: { value: cloudTile() }, uCamY: { value: 0 } },
    vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform sampler2D uClouds; uniform float uCamY; varying vec3 vDir;
        void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 zen = vec3(0.16, 0.46, 0.96), hor = vec3(0.80, 0.88, 1.0), pinkHaze = vec3(1.0, 0.86, 0.92);
            vec3 col = mix(mix(hor, pinkHaze, 0.35), zen, pow(max(h, 0.0), 0.55));
            float s = max(dot(d, uSun), 0.0);
            // a few soft clouds drifting above the horizon
            if (h > -0.02) {
                // around the sky exactly twice, so the tiling texture meets itself without a seam;
                // the gradients skip the jump where atan wraps (no thin line of a blurrier mip)
                vec2 cuv = vec2(atan(d.z, d.x) / 3.14159265 + uTime * 0.004, h * 3.2);
                vec2 gx = dFdx(cuv), gy = dFdy(cuv);
                if (abs(gx.x) > 0.5) gx.x = 0.0;
                if (abs(gy.x) > 0.5) gy.x = 0.0;
                float c = textureGrad(uClouds, cuv, gx, gy).r * smoothstep(-0.02, 0.06, h) * (1.0 - smoothstep(0.18, 0.5, h));
                vec3 cc = mix(vec3(0.86, 0.9, 1.0), vec3(1.0), smoothstep(0.2, 0.8, c)) + vec3(0.25, 0.2, 0.15) * pow(s, 6.0);
                col = mix(col, cc, smoothstep(0.25, 0.7, c) * 0.9);
            }
            // below: an endless sea of clouds far under the island
            if (h < 0.02) {
                float dn = max(-h, 0.004);
                // a cloud plane ~600 studs below, one texture tile ~1500 studs across
                vec2 p = d.xz / dn * (0.4 * (1.0 + max(uCamY, 0.0) / 600.0));
                float c1 = texture2D(uClouds, p + vec2(uTime * 0.0035, 0.0)).r;
                float c2 = texture2D(uClouds, p * 0.43 + vec2(0.31, uTime * 0.002)).r;
                float c = clamp(c1 * 0.65 + c2 * 0.6, 0.0, 1.0);
                vec3 gap = vec3(0.36, 0.62, 0.98);
                // lit tops a warm white, the shaded sides a soft lilac blue: depth without any lighting maths
                vec3 lit = mix(vec3(0.78, 0.8, 0.97), vec3(1.0, 0.97, 0.98), smoothstep(0.35, 0.9, c));
                vec3 sea = mix(gap, lit, smoothstep(0.28, 0.62, c));
                // the far clouds melt into the haze at the horizon
                float far = 1.0 - smoothstep(0.0, 0.2, dn);
                sea = mix(sea, mix(hor, pinkHaze, 0.5), far * 0.7);
                col = mix(col, sea, smoothstep(0.02, -0.01, h));
            }
            col += vec3(1.0, 0.95, 0.85) * (pow(s, 1400.0) * 4.0 + pow(s, 90.0) * 0.45 + pow(s, 9.0) * 0.12);
            gl_FragColor = vec4(col, 1.0);
        }`,
});
const skyDome = new T.Mesh(new T.SphereGeometry(3000, 32, 16), skyMat);
skyDome.renderOrder = -10;
skyDome.frustumCulled = false;
scene.add(skyDome);
export function updateSky(pos, t) {
    skyMat.uniforms.uTime.value = t;
    skyMat.uniforms.uCamY.value = pos.y;
    skyDome.position.copy(pos);
}
export const SUN_DIRECTION = SUN_DIR;

export const camera = new T.PerspectiveCamera(70, 1, 0.3, 2600);
function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 85 : 70;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// No image-based environment map, no reflections: building one (PMREM blur shaders) froze slow PCs
// for seconds at load. A sky / pink-ground hemisphere light gives the soft fill, the sun adds
// direction and crisp shadows on top, and a little ambient keeps the shade from going dull.
export const hemi = new T.HemisphereLight(0xeaf2ff, 0xd86a92, 1.1);
export const ambient = new T.AmbientLight(0xfff0f4, 0.45);
scene.add(hemi, ambient);
export const sun = new T.DirectionalLight(0xfff4ea, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -64, right: 64, top: 64, bottom: -64, near: 1, far: 360 });
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 2;
scene.add(sun, sun.target);

// ----- materials & textures -----
export const UNIT = new T.BoxGeometry(1, 1, 1);
// Glowing parts are drawn unlit and a little brighter than their colour (there is no bloom)
export const NEON_BOOST = 1.25;
const matCache = new Map();
// Matte, non-reflective plastic (Lambert): cheap to draw and no specular gloss or reflections.
// Takes MeshStandardMaterial-style parameters and drops the ones a matte material doesn't have.
export function matte(p) {
    p = { ...(p || {}) };
    for (const k of ['roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenColor', 'sheenRoughness', 'envMapIntensity']) delete p[k];
    return new T.MeshLambertMaterial(p);
}
// Flat plastic in one colour (Roblox-style), matte; o.neon: unlit and a touch brighter
export function mat(color, o) {
    o = o || {};
    const key = color + '|' + (o.neon ? 1 : 0) + '|' + (o.opacity || 1) + '|' + (o.side || 0) + '|' + (o.emissive || 0) + '|' + (o.boost || 0);
    let m = matCache.get(key);
    if (!m) {
        m = o.neon ? new T.MeshBasicMaterial({ color }) : new T.MeshLambertMaterial({ color });
        if (o.neon) m.color.multiplyScalar(NEON_BOOST * (o.boost || 1));
        if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei ?? 0.5; }
        if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
        if (o.side) m.side = T.DoubleSide;
        matCache.set(key, m);
    }
    return m;
}
export function texFrom(cv, repeat) {
    const t = new T.CanvasTexture(cv);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
}
// A text texture by its content: the same label is drawn and uploaded to the GPU once and shared
// by every sign that shows it. Never dispose these.
const sharedTexs = new Map();
export function sharedTex(key, draw) {
    let t = sharedTexs.get(key);
    if (!t) { t = texFrom(draw()); sharedTexs.set(key, t); }
    return t;
}

// ----- Roblox studs -----
// One texture tile is 8 x 8 studs. Each stud is a raised square with bevelled edges: a height
// field turned into a normal map, so the studs catch the sun and the sky light from any angle,
// plus a soft albedo with darker grooves (the reference's studded pink plastic).
const STUD_TEX = (() => {
    const N = 256, C = 32, INSET = 6, BEVEL = 5;
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const lx = x % C + 0.5, ly = y % C + 0.5;
        const d = Math.min(lx - INSET, C - INSET - lx, ly - INSET, C - INSET - ly);
        h[y * N + x] = d <= 0 ? 0 : Math.min(1, d / BEVEL) ** 0.8;
    }
    const albedo = document.createElement('canvas'); albedo.width = albedo.height = N;
    const normal = document.createElement('canvas'); normal.width = normal.height = N;
    const flat = document.createElement('canvas'); flat.width = flat.height = N;
    const ai = albedo.getContext('2d').createImageData(N, N), ni = normal.getContext('2d').createImageData(N, N), fi = flat.getContext('2d').createImageData(N, N);
    const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4, v = at(x, y);
        const lx = x % C, ly = y % C, edge = lx < 1 || ly < 1;
        const g = edge ? 214 : v === 0 ? 232 : 238 + v * 17;
        ai.data[i] = ai.data[i + 1] = ai.data[i + 2] = g; ai.data[i + 3] = 255;
        const dx = (at(x + 1, y) - at(x - 1, y)) * 2.4, dy = (at(x, y + 1) - at(x, y - 1)) * 2.4;
        const len = Math.hypot(dx, dy, 1);
        ni.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        ni.data[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
        ni.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        ni.data[i + 3] = 255;
        // Low quality draws without the normal map: the same studs with the light painted in
        const lit = 1 + 0.6 * ((dx * 0.45 + dy * 0.55 + 0.7) / len - 0.7);
        fi.data[i] = fi.data[i + 1] = fi.data[i + 2] = Math.min(255, Math.round(g * lit)); fi.data[i + 3] = 255;
    }
    albedo.getContext('2d').putImageData(ai, 0, 0);
    normal.getContext('2d').putImageData(ni, 0, 0);
    flat.getContext('2d').putImageData(fi, 0, 0);
    const map = texFrom(albedo), nrm = new T.CanvasTexture(normal), flatMap = texFrom(flat);
    nrm.colorSpace = T.NoColorSpace;
    for (const t of [map, nrm, flatMap]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); }
    return { map, nrm, flat: flatMap };
})();
export const STUDS = STUD_TEX;
// Normal-mapped studs (Medium/High) or the painted-light ones (Low: one texture read a pixel less)
let studsDetailed = true;
function studDetail(m) {
    const d = m.userData.stud, want = studsDetailed ? d.nrm : null;
    if (m.normalMap === want) return;
    m.normalMap = want; m.map = studsDetailed ? d.map : d.flat; m.needsUpdate = true;
}
export function setStudDetail(on) {
    studsDetailed = !!on;
    for (const m of matCache.values()) if (m.userData.stud) studDetail(m);
}
// Studded plastic for the merged world boxes: one material for every colour (the colour is in the
// vertices), sharing the stud textures, so the whole world needs only a couple of materials
export function studVCMaterial() {
    let m = matCache.get('studvc');
    if (!m) {
        m = matte({ color: 0xffffff, vertexColors: true, map: STUD_TEX.map, normalMap: STUD_TEX.nrm, normalScale: new T.Vector2(0.7, 0.7) });
        m.userData.stud = { map: STUD_TEX.map, nrm: STUD_TEX.nrm, flat: STUD_TEX.flat };
        matCache.set('studvc', m);
        studDetail(m);
    }
    return m;
}
// Studded plastic in one colour for a single mesh (o.rx / o.ry: tile repeats on plain 0..1 UVs)
export function studMaterial(color, o) {
    o = o || {};
    const rx = Math.max(1, Math.round(o.rx || 1)), ry = Math.max(1, Math.round(o.ry || 1));
    const key = 'stud|' + color + '|' + rx + '|' + ry;
    let m = matCache.get(key);
    if (!m) {
        const map = STUD_TEX.map.clone(), nrm = STUD_TEX.nrm.clone(), flat = STUD_TEX.flat.clone();
        for (const t of [map, nrm, flat]) { t.repeat.set(rx, ry); t.needsUpdate = true; }
        m = matte({ color, map, normalMap: nrm, normalScale: new T.Vector2(0.7, 0.7) });
        m.userData.stud = { map, nrm, flat };
        matCache.set(key, m);
        studDetail(m);
    }
    return m;
}

// ----- world collections -----
// solids: { min, max, shape?, mat, zone, ... } — boxes, plus round shapes (dome / cyl) with their
// own surface tests (see main.js)
export const solids = [];
export const triggers = []; // { min, max, enter, inside, zone }
export const prompts = [];  // { pos, r, label(), act(), zone }
export const tickers = [];  // per-frame callbacks (dt, t)

export function aabb(x, y, z, sx, sy, sz) {
    return { min: new V3(x - sx / 2, y - sy / 2, z - sz / 2), max: new V3(x + sx / 2, y + sy / 2, z + sz / 2) };
}
export function solidBox(x, y, z, sx, sy, sz, o) {
    const c = aabb(x, y, z, sx, sy, sz);
    Object.assign(c, { zone: -1, mat: 'block' }, o || {});
    solids.push(c);
    return c;
}

// ----- text -----
export function textCanvas(lines, W) {
    const pad = 10;
    let H = pad * 2;
    for (const l of lines) H += l.px * 1.2;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = Math.ceil(H);
    const x = cv.getContext('2d');
    let y = pad;
    for (const l of lines) {
        let px = l.px;
        const font = (p) => `${l.w || 700} ${p}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
        x.font = font(px);
        while (x.measureText(l.t).width > W - 24 && px > 8) { px -= 2; x.font = font(px); }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const cy = y + l.px * 0.62;
        if (l.s) { x.lineJoin = 'round'; x.lineWidth = Math.max(4, px * 0.22); x.strokeStyle = l.s; x.strokeText(l.t, W / 2, cy); }
        if (l.g) {
            const g = x.createLinearGradient(0, cy - px / 2, 0, cy + px / 2);
            g.addColorStop(0, l.g[0]); g.addColorStop(1, l.g[1]);
            x.fillStyle = g;
        } else x.fillStyle = l.c || '#fff';
        x.fillText(l.t, W / 2, cy);
        y += l.px * 1.2;
    }
    return cv;
}
// shared: a fixed label whose texture can be shared with others (see sharedTex); its own
// texture is made only when the text changes (set)
export function billboard(lines, worldW, W, pos, parent, shared) {
    W = W || 512;
    const map = shared ? sharedTex('bb|' + W + '|' + JSON.stringify(lines), () => textCanvas(lines, W)) : texFrom(textCanvas(lines, W));
    const cv = map.image;
    const sp = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(worldW, worldW * cv.height / cv.width, 1);
    if (pos) sp.position.copy(pos);
    sp.userData.ownTex = !shared;
    sp.userData.set = (nl) => {
        const c2 = textCanvas(nl, W);
        if (sp.userData.ownTex) sp.material.map.dispose();
        sp.userData.ownTex = true;
        sp.material.map = texFrom(c2);
        sp.material.needsUpdate = true;
        sp.scale.set(worldW, worldW * c2.height / c2.width, 1);
    };
    (parent || scene).add(sp);
    return sp;
}
export function textPlane(lines, worldW, W, pos, look, parent) {
    const map = sharedTex('tp|' + (W || 512) + '|' + JSON.stringify(lines), () => textCanvas(lines, W || 512));
    const cv = map.image;
    const h = worldW * cv.height / cv.width;
    const m = new T.Mesh(new T.PlaneGeometry(worldW, h), new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.copy(pos);
    if (look) m.lookAt(look);
    (parent || scene).add(m);
    return m;
}

// ----- blocky fallback body (used until / unless the Bloxity avatar loads) -----
function buildHair(part, c) {
    part(1.3, 0.35, 1.3, 0, 5.33, -0.02, c);
    part(1.3, 0.75, 0.3, 0, 4.95, -0.5, c);
    part(1.3, 0.16, 0.2, 0, 5.16, 0.56, c);
}
export function buildRig(d) {
    const g = new T.Group();
    const part = (sx, sy, sz, x, y, z, c, parent) => {
        const m = new T.Mesh(UNIT, mat(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; (parent || g).add(m); return m;
    };
    part(2, 2, 1, 0, 3, 0, d.shirt);
    part(2.02, 0.12, 1.02, 0, 2.06, 0, d.shorts);
    const head = new T.Group(); g.add(head);
    part(1.2, 1.2, 1.2, 0, 4.6, 0, d.skin, head);
    for (const sx of [-0.26, 0.26]) {
        part(0.26, 0.24, 0.04, sx, 4.72, 0.605, 0xffffff, head);
        part(0.13, 0.18, 0.04, sx + (sx > 0 ? -0.04 : 0.04), 4.71, 0.625, 0x1a1420, head);
    }
    part(0.36, 0.07, 0.04, 0, 4.34, 0.64, 0x6b2a2a, head);
    buildHair((sx, sy, sz, x, y, z, c) => part(sx, sy, sz, x, y, z, c, head), d.hair ?? 0x3a2618);
    const legs = [], arms = [];
    for (const side of [-0.5, 0.5]) {
        const p = new T.Group(); p.position.set(side, 2, 0); g.add(p);
        part(1, 0.9, 1, 0, -0.45, 0, d.shorts, p);
        part(0.98, 1.1, 0.98, 0, -1.45, 0, d.socks, p);
        part(1.05, 0.42, 1.34, 0, -1.84, 0.12, 0x141418, p);
        legs.push(p);
    }
    for (const side of [-1.5, 1.5]) {
        const p = new T.Group(); p.position.set(side, 3.9, 0); g.add(p);
        part(1, 0.8, 1, 0, -0.4, 0, d.shirt, p);
        part(0.98, 1.2, 0.98, 0, -1.4, 0, d.skin, p);
        arms.push(p);
    }
    g.userData.legs = legs; g.userData.arms = arms; g.userData.head = head;
    return g;
}
export function animRig(g, phase, amt) {
    const s = Math.sin(phase) * amt;
    const u = g.userData;
    u.legs[0].rotation.set(s, 0, 0); u.legs[1].rotation.set(-s, 0, 0);
    u.arms[0].rotation.set(-s * 0.9, 0, 0); u.arms[1].rotation.set(s * 0.9, 0, 0);
}
export function airPose(g) {
    const u = g.userData;
    u.legs[0].rotation.set(0.5, 0, 0); u.legs[1].rotation.set(-0.3, 0, 0);
    u.arms[0].rotation.set(-2.6, 0, 0); u.arms[1].rotation.set(-2.6, 0, 0);
}
// Hands up on the truss, alternating as you climb
export function climbPose(g, phase) {
    const u = g.userData, s = Math.sin(phase);
    u.arms[0].rotation.set(-2.7 + s * 0.4, 0, 0); u.arms[1].rotation.set(-2.7 - s * 0.4, 0, 0);
    u.legs[0].rotation.set(-0.5 - s * 0.4, 0, 0); u.legs[1].rotation.set(-0.5 + s * 0.4, 0, 0);
}
// Holding a tool out in front (right arm)
export function holdPose(g) { g.userData.arms[1].rotation.set(-1.45, 0, 0); }

// ----- floating text -----
const floaters = [];
export function floatText(text, color, pos, size) {
    const sp = billboard([{ t: text, c: color, s: '#5a0a24', px: 70 }], size || 5, 512, pos, null, true);
    sp.material.depthTest = false; sp.renderOrder = 12;
    floaters.push({ sp, t: 1.2 });
}
export function updateEffects(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.t -= dt; f.sp.position.y += dt * 4; f.sp.material.opacity = Math.min(1, f.t * 2);
        if (f.t <= 0) { scene.remove(f.sp); f.sp.material.dispose(); floaters.splice(i, 1); }
    }
}

export function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}

// Colours for little models (pets, gear): tintMat(c) marks a part's colour; bakeTints(root) then
// moves every marked colour into the geometry and swaps in one shared vertex-colour material (lit,
// or unlit for eyes and shines), so after mergeChildren a whole model is one or two draw calls
const tints = new Map();
export function tintMat(color, unlit) {
    const key = color + '|' + (unlit ? 1 : 0);
    let m = tints.get(key);
    if (!m) { m = unlit ? new T.MeshBasicMaterial({ color }) : new T.MeshLambertMaterial({ color }); m.userData.tint = color; m.userData.unlit = !!unlit; tints.set(key, m); }
    return m;
}
let litVC = null, unlitVC = null;
export function bakeTints(root) {
    if (!litVC) { litVC = new T.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.07 }); unlitVC = new T.MeshBasicMaterial({ vertexColors: true }); }
    const c = new T.Color();
    root.traverse((o) => {
        if (!o.isMesh || !o.material || o.material.userData.tint === undefined) return;
        const g = o.geometry.clone(), n = g.attributes.position.count, a = new Float32Array(n * 3);
        c.set(o.material.userData.tint);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        g.setAttribute('color', new T.BufferAttribute(a, 3));
        o.geometry = g;
        o.material = o.material.userData.unlit ? unlitVC : litVC;
    });
    return root;
}

// Merges every mesh under root into one mesh per material (static props): many draw calls become few
export function mergeChildren(root) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), m4 = new T.Matrix4();
    const buckets = new Map(), done = [];
    root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.keep) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        const keepColor = !!(o.material.vertexColors && g.attributes.color);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name) && !(keepColor && name === 'color')) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
        if (!buckets.has(o.material)) buckets.set(o.material, { list: [], shadow: false });
        const b = buckets.get(o.material);
        b.list.push(g); b.shadow = b.shadow || o.castShadow;
        done.push(o);
    });
    for (const o of done) o.parent.remove(o);
    for (const [material, b] of buckets) {
        const mesh = new T.Mesh(mergeGeometries(b.list), material);
        mesh.castShadow = b.shadow;
        mesh.receiveShadow = true;
        root.add(mesh);
        for (const g of b.list) g.dispose();
    }
}
