// The world: a floating island that is the top of a giant strawberry (a pink studded terrace with
// glass panels looking down on the clouds, a cream-piped fence, giant leaves around the rim), the
// pink studded tower on it with big windows on the sky, the lobby on its ground floor (spawn dais,
// SHOP gear pads, PET SHOP pads, leaderboards, the strawberry staircase along the south wall) and
// every course element from shared/course.js with its collider and animation.
//
// Static geometry is merged per zone and material (a handful of draw calls for the whole tower);
// everything matte (Lambert) or unlit; built in slices so the page never freezes while loading.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
    T, V3, scene, camera, mat, matte, studVCMaterial, solids, triggers, prompts, tickers, solidBox,
    billboard, textPlane, texFrom, sharedTex, textCanvas,
} from './engine.js';
import {
    berryMaterial, leafMaterial, goldBerryMaterial, cakeSideMaterial, creamTopMaterial, creamMaterial, milkMaterial, milkTex, tubMaterial,
    icingTopMaterial, icingSideMaterial, trussMaterial, jellyMaterial, sliceMaterial, cpPadMaterial, flagMaterial, rainbowTex, softTex,
    cloudSpriteTex, neon,
} from './materials.js';
import { gearModel } from './gear.js';
import { petModel } from './pets.js';
import { S, actions, net } from './state.js';
import { CFG, STAGES, TOWER, LOBBY, GEAR, PASSES, PETS, RARITY, passForGear, fmt, playtimeText, rngFrom, meltTime } from '../../shared/config.js';
import { COURSE, CHECKPOINTS, COINS, SUMMIT, TOWER_GEAR, BONUS_STEPS, BONUS } from '../../shared/course.js';

export const SPAWN = new V3(LOBBY.spawn.x, LOBBY.spawn.y, LOBBY.spawn.z);
export const SPAWN_YAW = LOBBY.yaw;
const H = TOWER.half, WT = TOWER.wall, TOP = TOWER.top, ISLE = H + WT + TOWER.terrace + 10;
const FENCE_R = ISLE - 1.2, BRIDGE_HALF = 5;
// The island fence as a collider: on the floor, you can't walk out past the ring (except onto the
// bridge to World 2). Returns true if it pushed you back.
export function islandClamp(p) {
    if (p.y > 2.4 || p.y < -2) return false;
    const r = Math.hypot(p.x, p.z), lim = FENCE_R - 1.9;
    if (r <= lim || r > FENCE_R + 3) return false;
    if (p.x > 0 && Math.abs(p.z) < BRIDGE_HALF - 0.9) return false;
    p.x *= lim / r; p.z *= lim / r;
    return true;
}
// how fast a stage's moving parts go: they speed up the higher you climb
const spd = (zone) => (STAGES[zone] && STAGES[zone].speed) || 1;
const serverT = () => net.now() / 1000;

// The reference's palette (pinks sampled from the video, a touch richer so they hold up in the sun)
export const C = {
    floor: 0xf4b8c8, floorIn: 0xf8c4d2, wall: 0xf09cb4, wallOut: 0xec92ac, trim: 0xd8486e, rose: 0xe8456e, red: 0xe8213f,
    pink: 0xff8ab4, white: 0xfff2f6, cyan: 0x2ec4f0, grey: 0x7c8498, greyLight: 0xb0b8ca, gold: 0xffd028, dark: 0x2a2a3a,
};
const PALETTE = { rose: C.rose, red: C.red, pink: C.pink, white: C.white, cyan: C.cyan, grey: C.grey };
const rainbowColor = (i) => new T.Color().setHSL((i * 0.085) % 1, 0.85, 0.62).getHex();
const colorOf = (name) => (typeof name === 'string' && name.startsWith('rainbow:') ? rainbowColor(+name.slice(8)) : PALETTE[name] ?? C.rose);

// =====================================================================================
// Zones: the shell (-2, always drawn), the lobby (-1) and one per stage. Each zone's meshes live in
// their own group, so far stages can be hidden, and the player only collides with nearby zones.
// =====================================================================================
const zoneGroups = new Map();
export function zoneGroup(z) {
    let g = zoneGroups.get(z);
    if (!g) { g = new T.Group(); g.name = 'zone' + z; scene.add(g); zoneGroups.set(z, g); }
    return g;
}
// Only the stages near the player are drawn: the tower is tall, so the ones more than three
// stages away (hidden in the haze anyway) are skipped
export function cullZones(stage) {
    for (const [z, g] of zoneGroups) {
        if (z === -2) continue;
        if (z < 0) { g.visible = stage <= 3; continue; }
        // three stages up (you look up the shaft), two down
        const d = z - Math.max(0, stage);
        g.visible = (d <= 3 && d >= -2) || (stage < 0 && z <= 2);
    }
}

// ----- static geometry, merged per zone and material at the end -----
const geoBatches = new Map();
function batchFor(zone, material, cast) {
    const k = zone + '|' + material.uuid + '|' + (cast ? 1 : 0);
    let b = geoBatches.get(k);
    if (!b) { b = { zone, material, cast, list: [], pos: [], nrm: [], uv: [], idx: [], col: [] }; geoBatches.set(k, b); }
    return b;
}
const white3 = new T.Color(0xffffff);
// Any geometry (already in world space). Materials with vertex colours get a colour attribute
// (white, or `color`), the others none, so every batch merges cleanly.
function addGeo(zone, geo, material, cast, color) {
    const b = batchFor(zone, material, cast);
    const vc = !!material.vertexColors;
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name) && !(vc && name === 'color')) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (vc && (!geo.attributes.color || color !== undefined)) {
        const c = color !== undefined ? new T.Color(color) : white3, n = geo.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
        geo.setAttribute('color', new T.BufferAttribute(a, 3));
    }
    if (!geo.index) { const idx = []; for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i); geo.setIndex(idx); }
    b.list.push(geo);
}
// Axis-aligned boxes are written straight into their batch's vertex arrays (the same faces, order
// and UVs as THREE.BoxGeometry), so building the world makes no geometry objects: thousands of
// boxes cost a few milliseconds. uvDiv: UVs in world units / uvDiv (studs), or 0 for 0..1 per face.
const BOX_FACES = [[2, 1, 0, -1, -1, 1, 2, 1], [2, 1, 0, 1, -1, -1, 2, 1], [0, 2, 1, 1, 1, 1, 0, 2], [0, 2, 1, 1, -1, -1, 0, 2], [0, 1, 2, 1, -1, 1, 0, 1], [0, 1, 2, -1, -1, -1, 0, 1]];
const vcTmp = new T.Color();
function addBoxFast(zone, material, cast, sx, sy, sz, x, y, z, uvDiv, color) {
    const b = batchFor(zone, material, cast);
    const vc = !!material.vertexColors;
    if (vc) vcTmp.set(color ?? 0xffffff);
    const size = [sx, sy, sz], c = [x, y, z], v = [0, 0, 0], n = [0, 0, 0];
    for (const [u, vv, w, ud, vd, ws, su, sv] of BOX_FACES) {
        const base = b.pos.length / 3;
        const wu = size[u], hv = size[vv], dw = size[w] / 2 * ws;
        const us = uvDiv ? size[su] / uvDiv : 1, vs = uvDiv ? size[sv] / uvDiv : 1;
        for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
            v[u] = (ix * wu - wu / 2) * ud; v[vv] = (iy * hv - hv / 2) * vd; v[w] = dw;
            b.pos.push(v[0] + c[0], v[1] + c[1], v[2] + c[2]);
            n[0] = n[1] = n[2] = 0; n[w] = ws;
            b.nrm.push(n[0], n[1], n[2]);
            // world-anchored studs: offset by the box position so neighbouring boxes line up
            b.uv.push(ix * us + (uvDiv ? (c[su] - size[su] / 2) / uvDiv : 0), (1 - iy) * vs + (uvDiv ? (c[sv] - size[sv] / 2) / uvDiv : 0));
            if (vc) b.col.push(vcTmp.r, vcTmp.g, vcTmp.b);
        }
        b.idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
}
function flushGeo() {
    for (const b of geoBatches.values()) {
        const parts = [...b.list];
        if (b.pos.length) {
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3));
            g.setAttribute('normal', new T.Float32BufferAttribute(b.nrm, 3));
            g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
            if (b.col.length) g.setAttribute('color', new T.Float32BufferAttribute(b.col, 3));
            g.setIndex(b.idx);
            parts.push(g);
        }
        if (!parts.length) continue;
        const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts);
        if (!geo) { console.warn('[world] could not merge a batch', b.zone); continue; }
        const mesh = new T.Mesh(geo, b.material);
        mesh.receiveShadow = true; mesh.castShadow = !!b.cast;
        mesh.matrixAutoUpdate = false;
        zoneGroup(b.zone).add(mesh);
        if (parts.length > 1) for (const g of parts) g.dispose();
    }
    geoBatches.clear();
}
// Studded plastic box (one shared material, colour in the vertices), with a collider
function studBox(zone, sx, sy, sz, x, y, z, color, o) {
    o = o || {};
    addBoxFast(zone, studVCMaterial(), o.cast, sx, sy, sz, x, y, z, 8, color);
    if (o.solid !== false) return solidBox(x, y, z, sx, sy, sz, { zone, mat: o.mat || 'stud', ...(o.extra || {}) });
    return null;
}
// A rounded, bevelled studded block (soft edges catch the light like moulded plastic), UVs
// projected in world space per face so the studs keep their size
function roundGeo(sx, sy, sz, r) {
    return new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r ?? 0.45, sx * 0.3, sy * 0.3, sz * 0.3));
}
function worldUV(g, tile) {
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
        if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / tile, -p.getZ(i) / tile);
        else if (ax >= az) uv.setXY(i, -p.getZ(i) / tile, p.getY(i) / tile);
        else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
    }
    return g;
}
function roundStud(zone, sx, sy, sz, x, y, z, color, o) {
    o = o || {};
    const g = roundGeo(sx, sy, sz, o.r);
    g.translate(x, y, z);
    addGeo(zone, worldUV(g, 8), studVCMaterial(), o.cast ?? true, color);
    if (o.solid !== false) return solidBox(x, y, z, sx, sy, sz, { zone, mat: o.mat || 'stud', ...(o.extra || {}) });
    return null;
}
function plainBox(zone, sx, sy, sz, x, y, z, material, o) {
    o = o || {};
    addBoxFast(zone, material, o.cast, sx, sy, sz, x, y, z, o.uv ?? 0, o.color);
}
function glowBox(zone, sx, sy, sz, x, y, z, color, k) { plainBox(zone, sx, sy, sz, x, y, z, neon(color, k)); }
// Smooth (unstudded) plastic in any colour for static props, merged into the zone batches like the
// studded blocks: posts, frames, rings, poles all cost no draw calls of their own
let smoothVCm = null;
const smoothVC = () => smoothVCm || (smoothVCm = matte({ vertexColors: true }));
// Moves a geometry to a spot (and optionally turns it to face `look`), for batching
const _o3 = new T.Object3D();
function placeGeo(geo, pos, look, ry) {
    _o3.position.copy(pos); _o3.rotation.set(0, ry || 0, 0);
    if (look) _o3.lookAt(look);
    _o3.updateMatrix();
    return geo.applyMatrix4(_o3.matrix);
}
// a studded pedestal (top and sides), batched
function pedestal(zone, x, y, z, r0, r1, h, color, topColor) {
    addGeo(zone, worldUV(cylGeo(r0, r1, h, x, y + h / 2, z, 32), 8), studVCMaterial(), false, color);
    if (topColor !== undefined) addGeo(zone, worldUV(cylGeo(r0 - 0.3, r0 - 0.3, h + 0.04, x, y + h / 2, z, 32), 8), studVCMaterial(), false, topColor);
}
function cylGeo(r0, r1, h, x, y, z, seg) {
    const g = new T.CylinderGeometry(r0, r1, h, seg || 24);
    g.translate(x, y, z);
    return g;
}
const css = (h) => '#' + h.toString(16).padStart(6, '0');

// =====================================================================================
// Strawberries: a lathe-turned berry (wide shoulders, pointed tip) with a leafy calyx on top.
// The calyx is flush with `top`, where you stand.
// =====================================================================================
const BERRY_PROFILE = [[0.001, -2.3], [0.35, -2.15], [0.66, -1.8], [0.88, -1.32], [1.0, -0.84], [1.03, -0.46], [0.97, -0.2], [0.82, -0.06], [0.55, -0.01], [0.001, 0]];
function berryGeo(r, seg) {
    const g = new T.LatheGeometry(BERRY_PROFILE.map(([a, b]) => new T.Vector2(a * r, b * r)), seg || 22);
    // the seed texture wraps around a few times so the seeds keep their size on big berries
    const uv = g.attributes.uv, rep = Math.max(1, Math.round(r / 1.6));
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
    return g;
}
function calyxGeo(r) {
    // a star of pointed leaves lying flat on top, with a little stem
    const parts = [];
    const n = 7;
    for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2;
        const leaf = new T.ConeGeometry(r * 0.22, r * 0.95, 4, 1);
        leaf.scale(1, 1, 0.28);
        leaf.rotateX(Math.PI / 2);         // pointing along +z
        leaf.translate(0, 0, r * 0.45);
        leaf.rotateX(0.12);                // tips curl down a little
        leaf.rotateY(a);
        parts.push(leaf.toNonIndexed());
    }
    const stem = new T.CylinderGeometry(r * 0.07, r * 0.1, r * 0.4, 6);
    stem.translate(0, r * 0.18, 0);
    parts.push(stem.toNonIndexed());
    for (const p of parts) p.deleteAttribute('uv');
    const g = mergeGeometries(parts);
    g.translate(0, 0.05, 0);
    return g;
}
// A strawberry in a zone's batches, top at y; returns nothing (add a collider yourself)
function addBerry(zone, x, top, z, r, rotY, gold) {
    const b = berryGeo(r);
    b.rotateY(rotY || 0);
    b.translate(x, top, z);
    addGeo(zone, b, gold ? goldBerryMaterial() : berryMaterial(), true);
    const c = calyxGeo(r);
    c.rotateY(rotY || 0);
    c.translate(x, top, z);
    addGeo(zone, c, leafMaterial(), true);
}

// =====================================================================================
// The island and the tower shell
// =====================================================================================
// The floor windows: patches of "glass" that look straight down through the island at the sea of
// clouds far below (a view-dependent shader, like real holes in the floor, but you can walk on them)
const skyWindowMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
        void main(){
            vec3 d = normalize(vW - cameraPosition);
            float dn = max(-d.y, 0.05);
            // clouds 600 studs below, seen through the glass
            vec2 p = (vW.xz + d.xz / dn * 600.0) * 0.006 + vec2(uTime * 0.01, 0.0);
            float c = n2(p) * 0.6 + n2(p * 2.3) * 0.3 + n2(p * 5.1) * 0.1;
            vec3 col = mix(vec3(0.38, 0.62, 0.98), vec3(1.0), smoothstep(0.42, 0.72, c));
            // a soft glassy sheen
            col = mix(col, vec3(0.86, 0.94, 1.0), 0.18 + 0.12 * smoothstep(0.5, 1.0, 1.0 - dn));
            gl_FragColor = vec4(col, 1.0);
        }`,
});
tickers.push((dt, t) => { skyWindowMat.uniforms.uTime.value = t; });
function buildIsland() {
    // The floor: one big studded disc (the collider is a flat round slab)
    const disc = new T.CircleGeometry(ISLE, 120);
    disc.rotateX(-Math.PI / 2);
    worldUV(disc, 8);
    addGeo(-2, disc, studVCMaterial(), false, C.floor);
    solids.push({ shape: 'cyl', cx: 0, cz: 0, r: ISLE, min: new V3(-ISLE, -4, -ISLE), max: new V3(ISLE, 0, ISLE), zone: -2, mat: 'stud' });
    // The cake layer around the rim, then the giant strawberry the island is the top of
    const rim = new T.CylinderGeometry(ISLE, ISLE - 1, 7, 120, 1, true);
    rim.translate(0, -3.5, 0);
    const ru = rim.attributes.uv;
    for (let i = 0; i < ru.count; i++) ru.setX(i, ru.getX(i) * Math.round(ISLE * Math.PI * 2 / 14));
    addGeo(-2, rim, cakeSideMaterial(), false);
    const body = berryGeo(ISLE * 1.02, 48);
    body.scale(1, 0.62, 1);
    body.translate(0, -6.5, 0);
    const bu = body.attributes.uv;
    for (let i = 0; i < bu.count; i++) bu.setX(i, bu.getX(i) * 6);
    addGeo(-2, body, berryMaterial(), false);
    // giant leaves fanning out under the rim, drooping
    for (let k = 0; k < 11; k++) {
        const a = k / 11 * Math.PI * 2 + 0.2;
        const leaf = new T.ConeGeometry(16, 34, 4, 1);
        leaf.scale(1, 1, 0.16);
        leaf.rotateX(Math.PI / 2);
        leaf.translate(0, 0, ISLE + 10);
        leaf.rotateX(0.35);
        leaf.rotateY(a);
        leaf.translate(0, -7, 0);
        leaf.deleteAttribute('uv');
        addGeo(-2, leaf, leafMaterial(), false);
    }
    // A low pink fence around the edge with cream piped along the top (a gap at the east for the
    // bridge to World 2). Its collider is a ring: see islandClamp().
    const fenceR = FENCE_R, N = 96;
    const inGap = (a) => Math.abs(Math.sin(a) * fenceR) < BRIDGE_HALF + 0.6 && Math.cos(a) > 0;
    for (let k = 0; k < N; k++) {
        const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
        if (inGap(am)) continue;
        const len = 2 * fenceR * Math.sin(Math.PI / N) + 0.1;
        // plain boxes (12 triangles each): the cream piping on top already softens the edge
        const g = new T.BoxGeometry(len, 2.2, 1.4);
        g.rotateY(-am + Math.PI / 2);
        g.translate(Math.cos(am) * fenceR, 1.1, Math.sin(am) * fenceR);
        addGeo(-2, worldUV(g, 8), studVCMaterial(), false, C.rose);
    }
    const PUFFS = 150;
    const puffs = new T.InstancedMesh(new T.SphereGeometry(1, 9, 6), creamMaterial(), PUFFS);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new V3();
    for (let k = 0; k < PUFFS; k++) {
        const a = k / PUFFS * Math.PI * 2;
        m4.compose(new V3(Math.cos(a) * fenceR, 2.5, Math.sin(a) * fenceR), q, inGap(a) ? s.setScalar(0.0001) : s.set(1.15, 0.85, 1.15));
        puffs.setMatrixAt(k, m4);
    }
    puffs.castShadow = false;
    zoneGroup(-2).add(puffs);
    // Glass windows in the terrace looking down on the clouds (rose frames)
    const wins = [];
    for (const side of [0, 1, 2, 3]) for (const off of [-38, 0, 38]) {
        const r = H + WT + 14;
        const [x, z] = [[off, r], [off, -r], [r, off], [-r, off]][side];
        if (Math.abs(x) < 12 && z < 0) continue;            // keep the south door path solid-looking
        wins.push([x, z, side < 2 ? 16 : 10, side < 2 ? 10 : 16]);
    }
    for (const [x, z, w, d] of wins) {
        const g = new T.PlaneGeometry(w, d);
        g.rotateX(-Math.PI / 2);
        g.translate(x, 0.04, z);
        addGeo(-2, g, skyWindowMat, false);
        for (const [dx, dz, sx, sz] of [[0, -d / 2, w + 1.2, 0.6], [0, d / 2, w + 1.2, 0.6], [-w / 2, 0, 0.6, d], [w / 2, 0, 0.6, d]]) plainBox(-2, sx, 0.3, sz, x + dx, 0.15, z + dz, studVCMaterial(), { color: C.white, uv: 8 });
    }
}

// One band of one wall: a solid band, or four pieces around a window (with a white frame and an
// invisible pane so nobody falls out of the tower)
const windows = [];
function towerBand(wall, y0, h, win) {
    // wall 0: north (+z), 1: south (-z), 2: east (+x), 3: west (-x); along = the axis the wall runs on
    const n = [[0, 1], [0, -1], [1, 0], [-1, 0]][wall];
    const along = n[0] === 0 ? 'x' : 'z';
    const off = H + WT / 2, L = H * 2 + WT * 2;
    const put = (a0, a1, b0, b1, invisible) => {
        const ac = (a0 + a1) / 2, al = a1 - a0, yc = (b0 + b1) / 2, yl = b1 - b0;
        if (al <= 0.01 || yl <= 0.01) return;
        const x = along === 'x' ? ac : n[0] * off, z = along === 'x' ? n[1] * off : ac;
        const sx = along === 'x' ? al : WT, sz = along === 'x' ? WT : al;
        if (!invisible) addBoxFast(-2, studVCMaterial(), false, sx, yl, sz, x, yc, z, 8, C.wall);
        solidBox(x, yc, z, sx, yl, sz, { zone: -2, mat: invisible ? 'glass' : 'wall' });
    };
    if (!win) { put(-L / 2, L / 2, y0, y0 + h); return; }
    const wy0 = y0 + (h - win.h) / 2, wy1 = wy0 + win.h, w0 = win.c - win.w / 2, w1 = win.c + win.w / 2;
    windows.push({ wall, n, a0: w0, a1: w1, y0: wy0, y1: wy1 });
    put(-L / 2, w0, y0, y0 + h);
    put(w1, L / 2, y0, y0 + h);
    put(w0, w1, y0, wy0);
    put(w0, w1, wy1, y0 + h);
    put(w0, w1, wy0, wy1, true);
    // white frame around the window on both faces, and a glowing inner edge (the reference's
    // white light panels)
    for (const side of [-1, 1]) {
        const face = H + WT / 2 + side * (WT / 2 + 0.3);
        const fx = (a, b, yc, yl, glow) => {
            const ac = (a + b) / 2, al = b - a;
            const m = glow ? neon(0xffffff, 1.15) : studVCMaterial();
            if (along === 'x') plainBox(-2, al, yl, 0.8, ac, yc, n[1] * face, m, { color: C.white, uv: glow ? 0 : 8 });
            else plainBox(-2, 0.8, yl, al, n[0] * face, yc, ac, m, { color: C.white, uv: glow ? 0 : 8 });
        };
        fx(w0 - 1.2, w1 + 1.2, wy0 - 0.6, 1.2); fx(w0 - 1.2, w1 + 1.2, wy1 + 0.6, 1.2);
        fx(w0 - 1.2, w0, (wy0 + wy1) / 2, win.h); fx(w1, w1 + 1.2, (wy0 + wy1) / 2, win.h);
        if (side < 0) {
            fx(w0, w1, wy1 - 0.15, 0.3, true); fx(w0, w1, wy0 + 0.15, 0.3, true);
        }
    }
}
function buildShell() {
    const L = H * 2 + WT * 2, D = TOWER.door, DH = 16;
    // Ground band with a big door in the middle of every wall
    for (let wall = 0; wall < 4; wall++) {
        const n = [[0, 1], [0, -1], [1, 0], [-1, 0]][wall], along = n[0] === 0 ? 'x' : 'z', off = H + WT / 2;
        for (const [a0, a1] of [[-L / 2, -D / 2], [D / 2, L / 2]]) {
            const ac = (a0 + a1) / 2, al = a1 - a0;
            const x = along === 'x' ? ac : n[0] * off, z = along === 'x' ? n[1] * off : ac;
            const sx = along === 'x' ? al : WT, sz = along === 'x' ? WT : al;
            addBoxFast(-2, studVCMaterial(), false, sx, DH, sz, x, DH / 2, z, 8, C.wall);
            solidBox(x, DH / 2, z, sx, DH, sz, { zone: -2, mat: 'wall' });
        }
        // a rose arch frame around the door, inside and out
        for (const side of [-1, 1]) {
            const face = off + side * (WT / 2 + 0.4);
            const put = (a, yc, sa, sy) => {
                if (along === 'x') addBoxFast(-2, studVCMaterial(), false, sa, sy, 1, a, yc, n[1] * face, 8, C.trim);
                else addBoxFast(-2, studVCMaterial(), false, 1, sy, sa, n[0] * face, yc, a, 8, C.trim);
            };
            put(-D / 2 - 0.8, DH / 2, 1.6, DH); put(D / 2 + 0.8, DH / 2, 1.6, DH); put(0, DH + 0.8, D + 3.2, 1.6);
        }
    }
    // Bands of wall above, some with windows on the sky
    const rnd = rngFrom(31);
    for (let wall = 0; wall < 4; wall++) {
        for (let y0 = DH; y0 < TOP; y0 += 28) {
            const h = Math.min(28, TOP - y0);
            const win = h >= 24 && y0 > 30 && rnd() < 0.62 ? { c: (rnd() * 2 - 1) * 30, w: 22 + rnd() * 10, h: 15 } : null;
            towerBand(wall, y0, h, win);
        }
    }
    // Rose trim bands around the tower, inside and out, every 56 studs, and a crown at the top
    for (let y = DH + 56; y < TOP; y += 56) {
        for (const side of [-1, 1]) {
            const o = H + WT / 2 + side * (WT / 2 + 0.35);
            addBoxFast(-2, studVCMaterial(), false, 2 * o + 0.7, 1.4, 0.7, 0, y, o, 8, C.trim);
            addBoxFast(-2, studVCMaterial(), false, 2 * o + 0.7, 1.4, 0.7, 0, y, -o, 8, C.trim);
            addBoxFast(-2, studVCMaterial(), false, 0.7, 1.4, 2 * o - 0.7, o, y, 0, 8, C.trim);
            addBoxFast(-2, studVCMaterial(), false, 0.7, 1.4, 2 * o - 0.7, -o, y, 0, 8, C.trim);
        }
    }
    // Battlements on top: rose blocks with gaps, and a giant strawberry on each corner
    const o = H + WT / 2;
    for (let k = -8; k <= 8; k += 2) {
        const a = k * (o / 8.6);
        for (const [x, z, sx, sz] of [[a, o, 7, WT + 1], [a, -o, 7, WT + 1], [o, a, WT + 1, 7], [-o, a, WT + 1, 7]]) addBoxFast(-2, studVCMaterial(), false, sx, 5, sz, x, TOP + 2.5, z, 8, C.trim);
    }
    for (const [x, z] of [[o, o], [o, -o], [-o, o], [-o, -o]]) addBerry(-2, x, TOP + 30, z, 9, Math.atan2(x, z));
}

// =====================================================================================
// The lobby (the tower's ground floor)
// =====================================================================================
function bigTitle(zone, text, w, pos, look, colors, stroke) {
    const map = sharedTex('title|' + text + '|' + colors + '|' + stroke, () => {
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 220;
        const x = cv.getContext('2d');
        let px = 150;
        x.font = `800 ${px}px Montserrat, Fredoka, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
        while (x.measureText(text).width > 980 && px > 40) { px -= 4; x.font = `800 ${px}px Montserrat, Fredoka, sans-serif`; }
        x.lineJoin = 'round'; x.lineWidth = 22; x.strokeStyle = stroke || '#7a1030'; x.strokeText(text, 512, 112);
        const g = x.createLinearGradient(0, 40, 0, 180); g.addColorStop(0, colors[0]); g.addColorStop(1, colors[1]);
        x.fillStyle = g; x.fillText(text, 512, 112);
        return cv;
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, w * 220 / 1024), new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.copy(pos); m.lookAt(look);
    m.renderOrder = 2;
    zoneGroup(zone).add(m);
    return m;
}
// A dark TV screen on the wall showing a little ad (like the reference's shop screens)
function screen(zone, lines, w, pos, look, bg) {
    const map = sharedTex('screen|' + JSON.stringify(lines) + bg, () => {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
        const x = cv.getContext('2d');
        const g = x.createLinearGradient(0, 0, 512, 288); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
        x.fillStyle = g; x.fillRect(0, 0, 512, 288);
        x.fillStyle = 'rgba(255,255,255,0.08)';
        for (let k = 0; k < 12; k++) { x.beginPath(); x.arc(40 + k * 44, 60 + (k % 3) * 80, 30, 0, Math.PI * 2); x.fill(); }
        x.textAlign = 'center'; x.textBaseline = 'middle';
        lines.forEach((l, i) => {
            x.font = `${l.w || 800} ${l.px}px Fredoka, sans-serif`;
            x.lineJoin = 'round'; x.lineWidth = l.px * 0.18; x.strokeStyle = '#2a0a1a'; x.strokeText(l.t, 256, l.y);
            x.fillStyle = l.c || '#fff'; x.fillText(l.t, 256, l.y);
        });
        return cv;
    });
    const h = w * 288 / 512;
    addGeo(zone, placeGeo(new T.BoxGeometry(w + 1, h + 1, 0.6), pos, look), smoothVC(), false, C.dark);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map, toneMapped: false }));
    m.position.copy(pos); m.lookAt(look); m.translateZ(0.32);
    zoneGroup(zone).add(m);
}
function signPost(zone, text, x, z, rotY) {
    const map = sharedTex('sign|' + text, () => {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
        const g = cv.getContext('2d');
        g.fillStyle = '#3a2418'; g.beginPath(); g.roundRect(4, 4, 248, 152, 18); g.fill();
        g.fillStyle = '#ffffff'; g.font = '800 54px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        text.split('\n').forEach((t, i, a) => g.fillText(t, 128, 80 + (i - (a.length - 1) / 2) * 56));
        return cv;
    });
    const grp = new T.Group(); grp.position.set(x, 0, z); grp.rotation.y = rotY || 0;
    addGeo(zone, cylGeo(0.18, 0.2, 4.6, x, 2.3, z, 8), smoothVC(), false, 0x3a2418);
    const board = new T.Mesh(new T.PlaneGeometry(3.4, 2.1), new T.MeshBasicMaterial({ map, toneMapped: false, side: T.DoubleSide }));
    board.position.y = 4.4; board.rotation.z = 0.12; grp.add(board);
    zoneGroup(zone).add(grp);
}

const boardCanvases = {};
function buildLobby() {
    // walkway stripes from the doors to the dais (the floor itself is the island's disc: one layer,
    // so no floor pixel is drawn twice)
    for (const [x0, x1, z0, z1] of [[-3, 3, -H, -14], [-3, 3, 14, H], [-H, -14, -3, 3], [14, H, -3, 3]]) {
        const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0.04, (z0 + z1) / 2);
        addGeo(-1, worldUV(g, 8), studVCMaterial(), false, C.pink);
    }
    // The spawn dais: a round shortcake with strawberries around it
    {
        const r = 12;
        const top = new T.CircleGeometry(r, 64);
        top.rotateX(-Math.PI / 2); top.translate(0, 1.2, 0);
        const tu = top.attributes.uv; for (let i = 0; i < tu.count; i++) tu.setXY(i, tu.getX(i) * 3, tu.getY(i) * 3);
        addGeo(-1, top, creamTopMaterial(), false);
        const side = new T.CylinderGeometry(r, r, 1.2, 64, 1, true);
        side.translate(0, 0.6, 0);
        const su = side.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * 6, 0.35 + su.getY(i) * 0.65);
        addGeo(-1, side, cakeSideMaterial(), false);
        solids.push({ shape: 'cyl', cx: 0, cz: 0, r, min: new V3(-r, 0, -r), max: new V3(r, 1.2, r), zone: -1, mat: 'cake' });
        for (let k = 0; k < 10; k++) {
            const a = k / 10 * Math.PI * 2;
            const b = berryGeo(1.1, 14); b.rotateX(Math.PI); b.translate(Math.cos(a) * (r - 1.6), 1.15, Math.sin(a) * (r - 1.6));
            addGeo(-1, b, berryMaterial(), true);
        }
        // a glowing pink ring that slowly breathes
        const ringMat = new T.MeshBasicMaterial({ color: 0xff7ab0, toneMapped: false });
        const dr = new T.Mesh(new T.TorusGeometry(r + 0.15, 0.2, 8, 96), ringMat);
        dr.rotation.x = Math.PI / 2; dr.position.y = 1.2;
        zoneGroup(-1).add(dr);
        tickers.push((dt, t) => { if (dr.parent.visible) ringMat.color.setHSL(0.93 + Math.sin(t * 0.6) * 0.03, 0.95, 0.62 + Math.sin(t * 1.4) * 0.06); });
    }
    // Title on the south wall, above the strawberry staircase: the first thing you see at the spawn
    // (clear of the HUD bar at the spawn view, and above the staircase's strawberries)
    bigTitle(-1, 'STRAWBERRY TOWER', 58, new V3(12, 31, -H + 0.6), new V3(12, 31, 0), ['#ffffff', '#ffd0e0'], '#b81848');
    // START sign by the first strawberry
    const start = billboard([{ t: 'START ▶', g: ['#ffffff', '#ffd0dc'], s: '#b81848', px: 76 }, { t: 'hop up the strawberries!', c: '#ffffff', s: '#b81848', px: 36 }], 12, 512, new V3(-44, 9, -46), zoneGroup(-1));
    start.material.depthWrite = false;
    buildShop();
    buildPetShop();
    buildBoards();
    buildTrailKiosk();
    buildBonusStairs();
    buildWorld2();
    // Giant decorative strawberries and cream puffs around the terrace
    const rnd = rngFrom(19);
    for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2 + 0.31, r = H + WT + 22 + rnd() * 6;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) < 16 || Math.abs(z) < 16) continue;   // keep the door paths clear
        const br = 3 + rnd() * 1.6;
        addBerry(-1, x, br * 2.3, z, br, rnd() * 6);
        solids.push({ shape: 'cyl', cx: x, cz: z, r: br * 0.95, min: new V3(x - br, 0, z - br), max: new V3(x + br, br * 2.3, z + br), zone: -1, mat: 'berry' });
    }
}

// ----- SHOP: gear pads along the east wall (the reference's springs, carpet and ray gun) -----
const gearPads = [];
function gearPad(id, x, y, z, zone, scale) {
    const def = GEAR.find((g) => g.id === id);
    const grp = new T.Group(); grp.position.set(x, y, z); zoneGroup(zone).add(grp);
    pedestal(zone, x, y, z, 3, 3.2, 0.6, def.color, 0xffffff);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: softTex(), color: def.color, transparent: true, opacity: 0.45, depthWrite: false, blending: T.AdditiveBlending }));
    glow.scale.set(8, 8, 1); glow.position.y = 3.6; grp.add(glow);
    const model = gearModel(id); model.position.y = 3.8; model.scale.multiplyScalar(scale || 1); grp.add(model);
    const pass = passForGear(id);
    const label = billboard([{ t: def.name, c: '#ffffff', s: '#7a1030', px: 56 }, { t: '🏆 ' + fmt(PASSES[pass].price), c: '#9aff7a', s: '#1a3a1a', px: 46 }], 8, 512, new V3(0, 8.4, 0), grp);
    const pad = { id, grp, model, label, owned: null, zone, x, y, z };
    gearPads.push(pad);
    triggers.push({ min: new V3(x - 2.6, y, z - 2.6), max: new V3(x + 2.6, y + 5, z + 2.6), zone, enter: () => actions.gearPad(id) });
    prompts.push({ pos: new V3(x, y, z), r: 5, zone, label: () => (S.gear[id] ? (S.tool === id ? 'Unequip ' : 'Equip ') + def.name : 'Buy ' + def.name), act: () => actions.gearPad(id, true) });
    solids.push({ shape: 'cyl', cx: x, cz: z, r: 3, min: new V3(x - 3, y, z - 3), max: new V3(x + 3, y + 0.6, z + 3), zone, mat: 'stud' });
    tickers.push((dt, t) => {
        if (!grp.parent.visible) return;
        model.rotation.y = t * 1.2 + x;
        model.position.y = 3.8 + Math.sin(t * 2 + z) * 0.35;
    });
}
// Owned gear says so on its pad
export function refreshGearPads() {
    for (const p of gearPads) {
        const owned = !!S.gear[p.id];
        const key = owned + '|' + (S.tool === p.id);
        if (p.owned === key) continue;
        p.owned = key;
        const def = GEAR.find((g) => g.id === p.id);
        p.label.userData.set([{ t: def.name, c: '#ffffff', s: '#7a1030', px: 56 }, owned ? { t: S.tool === p.id ? '✔ EQUIPPED' : '✔ OWNED', c: '#9aff7a', s: '#1a3a1a', px: 46 } : { t: '🏆 ' + fmt(PASSES[passForGear(p.id)].price), c: '#9aff7a', s: '#1a3a1a', px: 46 }]);
    }
}
function buildShop() {
    const x = 50;
    // a raised rose stage for the pads
    roundStud(-1, 12, 0.8, 62, x, 0.4, 0, C.rose, { r: 0.35, cast: false });
    GEAR.forEach((g, i) => gearPad(g.id, x, 0.8, -24 + i * 12, -1));
    bigTitle(-1, 'SHOP', 26, new V3(H - 0.6, 24, 0), new V3(0, 24, 0), ['#ffffff', '#ffe0ea'], '#b81848');
    screen(-1, [{ t: '🌀 SPEED COIL', px: 54, y: 110, c: '#ffffff' }, { t: 'Run 60% faster!', px: 36, y: 186, c: '#ffd0e0' }], 15, new V3(H - 0.5, 12, -24), new V3(0, 12, -24), ['#ff3a5a', '#a8104a']);
    screen(-1, [{ t: '🪐 GRAVITY COIL', px: 50, y: 110, c: '#ffffff' }, { t: 'Huge floaty jumps!', px: 36, y: 186, c: '#d0e8ff' }], 15, new V3(H - 0.5, 12, 0), new V3(0, 12, 0), ['#3a8aff', '#1a3aa8']);
    screen(-1, [{ t: '🌈 FLY!', px: 70, y: 110, c: '#ffffff' }, { t: 'Rainbow Carpet', px: 40, y: 190, c: '#fff0a0' }], 15, new V3(H - 0.5, 12, 24), new V3(0, 12, 24), ['#c45aff', '#ff4a8a']);
    signPost(-1, 'HOT\n🔥', x - 6.5, -30.5, -Math.PI / 2);
    signPost(-1, 'NEW!', x - 6.5, 30.5, -Math.PI / 2);
    prompts.push({ pos: new V3(x - 8, 1, 0), r: 6, zone: -1, label: () => '🛒 Open the Shop', act: () => actions.openStore() });
}

// ----- PET SHOP: pets standing on pads (the reference's unicorn, kitty, tiger, puppy) -----
const petPads = [];
function buildPetShop() {
    const z = 44;
    roundStud(-1, 70, 0.8, 11, 0, 0.4, z, C.rose, { r: 0.35, cast: false });
    PETS.forEach((def, i) => {
        const x = -30 + i * 10;
        const grp = new T.Group(); grp.position.set(x, 0.8, z); zoneGroup(-1).add(grp);
        const rc = new T.Color(RARITY[def.rarity].color).getHex();
        pedestal(-1, x, 0.8, z, 3.2, 3.4, 0.5, rc, 0xffffff);
        const pet = petModel(def); pet.position.y = 0.55; pet.scale.setScalar(1.25); pet.rotation.y = 0; grp.add(pet);
        const label = billboard(petLabel(def, false), 7.4, 512, new V3(0, 7.2, 0), grp);
        petPads.push({ def, grp, pet, label, owned: null });
        solids.push({ shape: 'cyl', cx: x, cz: z, r: 3.2, min: new V3(x - 3.3, 0.8, z - 3.3), max: new V3(x + 3.3, 1.3, z + 3.3), zone: -1, mat: 'stud' });
        prompts.push({ pos: new V3(x, 1, z - 2), r: 4.6, zone: -1, label: () => (S.pets && S.pets[def.id] ? ((S.equippedPets || []).includes(def.id) ? 'Unequip ' : 'Equip ') + def.name : 'Buy ' + def.name + ' (🏆 ' + fmt(def.price) + ')'), act: () => actions.petPad(def.id) });
        tickers.push((dt, t) => {
            if (!grp.parent.visible) return;
            pet.position.y = 0.55 + Math.abs(Math.sin(t * 2.4 + i)) * 0.5;
            pet.rotation.y = Math.sin(t * 0.7 + i) * 0.6;
        });
    });
    // the PET SHOP banner on two posts behind the pets
    const bx = 0, bz = z + 6.2;
    for (const sx of [-12, 12]) addGeo(-1, cylGeo(0.35, 0.4, 13, bx + sx, 6.5, bz, 10), smoothVC(), false, C.white);
    bigTitle(-1, 'PET SHOP', 24, new V3(bx, 10.6, bz - 0.2), new V3(bx, 10.6, 0), ['#ffffff', '#fff0b0'], '#8a2a8a');
    addBoxFast(-1, studVCMaterial(), false, 25, 6.4, 0.5, bx, 10.6, bz + 0.15, 8, C.rose);
}
const petLabel = (def, owned, eq) => [
    { t: def.name, c: '#ffffff', s: '#5a1040', px: 50 },
    { t: 'x' + def.mult + ' Wins · ' + RARITY[def.rarity].name, c: RARITY[def.rarity].color, s: '#2a1030', px: 38 },
    owned ? { t: eq ? '✔ EQUIPPED' : '✔ OWNED', c: '#9aff7a', s: '#1a3a1a', px: 42 } : { t: '🏆 ' + fmt(def.price), c: '#9aff7a', s: '#1a3a1a', px: 42 },
];
export function refreshPetPads() {
    for (const p of petPads) {
        const owned = !!(S.pets && S.pets[p.def.id]), eq = (S.equippedPets || []).includes(p.def.id);
        const key = owned + '|' + eq;
        if (p.owned === key) continue;
        p.owned = key;
        p.label.userData.set(petLabel(p.def, owned, eq));
    }
}

// ----- Leaderboards high on the north wall, between the course's two north sides (nothing passes
// in front of them) -----
const BOARDS = [['wins', 'Most Wins', -26], ['climbs', 'Top Climbers', 0], ['playtime', 'Playtime', 26]];
const BOARD_Y = 48;
function buildBoards() {
    for (const [key, title, x] of BOARDS) {
        addBoxFast(-1, studVCMaterial(), false, 19, 24, 1.4, x, BOARD_Y, H - 0.6, 8, C.trim);
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 640;
        const tex = texFrom(cv);
        const sc = new T.Mesh(new T.PlaneGeometry(17.4, 21.75), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
        sc.position.set(x, BOARD_Y, H - 1.35); sc.rotation.y = Math.PI;
        zoneGroup(-1).add(sc);
        boardCanvases[key] = { cv, tex, title };
        drawBoard(key, []);
    }
}
function drawBoard(key, rows) {
    const b = boardCanvases[key];
    if (!b) return;
    const x = b.cv.getContext('2d'), W = 512, Hh = 640;
    const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, '#5a1838'); g.addColorStop(1, '#3a0e26');
    x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    x.fillStyle = '#ffffff'; x.font = '700 46px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(b.title, W / 2, 46);
    for (let i = 0; i < 10; i++) {
        const y = 100 + i * 53, r = rows[i];
        x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'; x.fillRect(16, y - 23, W - 32, 48);
        x.textAlign = 'left'; x.font = '700 30px Fredoka, sans-serif';
        x.fillStyle = i === 0 ? '#ffd028' : i === 1 ? '#e0e8ff' : i === 2 ? '#ffb07a' : '#ffffff';
        x.fillText('#' + (i + 1), 28, y);
        if (!r) continue;
        x.fillStyle = '#ffffff'; x.font = '600 27px Fredoka, sans-serif';
        let n = r.n; while (x.measureText(n).width > 250 && n.length > 3) n = n.slice(0, -1);
        x.fillText(n, 96, y);
        x.textAlign = 'right'; x.fillStyle = '#ffb8d8';
        x.fillText(key === 'playtime' ? playtimeText(r.v) : key === 'climbs' ? fmt(r.v) + ' 🍓' : fmt(r.v), W - 30, y);
    }
    b.tex.needsUpdate = true;
}
// Boards arrive every 10 s: only redraw (and re-upload) the ones whose rows changed
const boardKeys = {};
export function renderBoards(m) {
    for (const [key] of BOARDS) {
        const rows = (m && m[key]) || [], k = JSON.stringify(rows);
        if (boardKeys[key] === k) continue;
        boardKeys[key] = k;
        drawBoard(key, rows);
    }
}

// ----- TRAILS kiosk: a rack of glowing ribbons in the north-west -----
function buildTrailKiosk() {
    const x = -34, z = 30;
    roundStud(-1, 12, 0.8, 9, x, 0.4, z, C.white, { r: 0.35, cast: false });
    // the rack (batched), and six glowing ribbons swaying on it: one instanced mesh
    const bar = cylGeo(0.15, 0.15, 10, 0, 0, 0, 8); bar.rotateZ(Math.PI / 2); bar.translate(x, 6.8, z);
    addGeo(-1, bar, smoothVC(), false, 0xd8d8e8);
    for (const sx of [-5, 5]) addGeo(-1, cylGeo(0.18, 0.18, 6, x + sx, 3.8, z, 8), smoothVC(), false, 0xd8d8e8);
    const cols = [0xff8ad0, 0xff3a5a, 0x6affa0, 0x3ac8ff, 0xffe03a, 0x9a5aff];
    const ribbons = new T.InstancedMesh(new T.PlaneGeometry(0.9, 4.2), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, toneMapped: false }), cols.length);
    cols.forEach((c, i) => ribbons.setColorAt(i, new T.Color(c).multiplyScalar(1.1)));
    ribbons.frustumCulled = false;
    zoneGroup(-1).add(ribbons);
    const rm = new T.Matrix4(), rq = new T.Quaternion(), rp = new V3(), rs = new V3(1, 1, 1), ry = new V3(0, 1, 0);
    tickers.push((dt, t) => {
        if (!ribbons.parent.visible) return;
        cols.forEach((c, i) => { rq.setFromAxisAngle(ry, Math.sin(t * 1.5 + i) * 0.5); rm.compose(rp.set(x - 3.8 + i * 1.5, 4.6, z), rq, rs); ribbons.setMatrixAt(i, rm); });
        ribbons.instanceMatrix.needsUpdate = true;
    });
    billboard([{ t: '✨ TRAILS ✨', g: ['#ffffff', '#ffe0f0'], s: '#8a1a5a', px: 64 }], 9, 512, new V3(x, 10.5, z), zoneGroup(-1));
    prompts.push({ pos: new V3(x, 1, z - 3), r: 6.5, zone: -1, label: () => '✨ Trails', act: () => actions.openTrails() });
}

// ----- The strawberry staircase along the south wall, up to the golden strawberry -----
export const bonusState = { mesh: null, ready: true };
function buildBonusStairs() {
    BONUS_STEPS.forEach((s, i) => {
        addBerry(-1, s.x, s.top, s.z, s.r, i * 1.3);
        solids.push({ shape: 'cyl', cx: s.x, cz: s.z, r: s.r * 0.95, min: new V3(s.x - s.r, s.top - s.r * 1.3, s.z - s.r), max: new V3(s.x + s.r, s.top, s.z + s.r), zone: -1, mat: 'berry' });
    });
    const L = BONUS.ledge;
    roundStud(-1, L.sx, 1.6, L.sz, L.x, L.top - 0.8, L.z, C.rose, { r: 0.4 });
    // the golden strawberry, spinning over the ledge
    const g = new T.Group(); g.position.set(BONUS.x, BONUS.y + 2.2, BONUS.z); zoneGroup(-1).add(g);
    const body = new T.Mesh(berryGeo(1.2, 20), goldBerryMaterial()); body.position.y = 1.4; g.add(body);
    const cal = new T.Mesh(calyxGeo(1.2), leafMaterial()); cal.position.y = 1.4; g.add(cal);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: softTex(), color: 0xffd028, transparent: true, opacity: 0.6, depthWrite: false, blending: T.AdditiveBlending }));
    glow.scale.set(7, 7, 1); g.add(glow);
    bonusState.mesh = g;
    billboard([{ t: '⭐ SECRET STRAWBERRY ⭐', c: '#fff0a0', s: '#7a4a00', px: 44 }], 12, 512, new V3(BONUS.x, BONUS.y + 6.6, BONUS.z), zoneGroup(-1));
    triggers.push({ min: new V3(BONUS.x - 3, BONUS.y - 2, BONUS.z - 3), max: new V3(BONUS.x + 3, BONUS.y + 5, BONUS.z + 3), zone: -1, enter: () => actions.bonus() });
    tickers.push((dt, t) => {
        if (!g.parent.visible) return;
        g.rotation.y = t * 1.6;
        g.position.y = BONUS.y + 2.2 + Math.sin(t * 2) * 0.3;
        g.visible = bonusState.ready;
    });
}

// ----- WORLD 2: the reference's grey bridge with red stripes, out to a floating platform -----
function buildWorld2() {
    // East door -> bridge -> grey platform with a portal arch ("coming soon")
    const x0 = ISLE - 3, x1 = ISLE + 46, w = BRIDGE_HALF * 2;
    studBox(-1, x1 - x0, 1.6, w, (x0 + x1) / 2, -0.8, 0, C.grey, { mat: 'stud' });
    for (let x = x0 + 3; x < x1; x += 6) plainBox(-1, 1.6, 0.25, w + 0.02, x, 0.1, 0, studVCMaterial(), { color: C.red, uv: 8 });
    for (const sz of [-1, 1]) studBox(-1, x1 - x0, 1.6, 0.8, (x0 + x1) / 2, 0.8, sz * (w / 2 + 0.4), C.greyLight);
    const px = x1 + 16;
    studBox(-1, 32, 3, 32, px, -1.5, 0, C.grey);
    for (const [dx, dz] of [[-16, 0], [16, 0], [0, -16], [0, 16]]) plainBox(-1, dx ? 0.8 : 32, 0.3, dz ? 0.8 : 32, px + dx, 0.15, dz, studVCMaterial(), { color: C.red, uv: 8 });
    // the arch
    for (const sz of [-1, 1]) studBox(-1, 3, 18, 3, px + 8, 9, sz * 8, C.greyLight);
    studBox(-1, 3, 3, 19, px + 8, 19.5, 0, C.red);
    const portal = new T.Mesh(new T.PlaneGeometry(13, 16), new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
            void main(){ vec2 q = vUv - 0.5; float r = length(q * vec2(1.0, 0.8)); float a = atan(q.y, q.x);
                float sw = 0.5 + 0.5 * sin(a * 5.0 + r * 18.0 - uTime * 3.0);
                vec3 c = mix(vec3(1.0, 0.45, 0.7), vec3(0.6, 0.4, 1.0), sw) + (1.0 - smoothstep(0.0, 0.25, r)) * 0.6;
                gl_FragColor = vec4(c, (1.0 - smoothstep(0.38, 0.5, r)) * 0.9); }`,
    }));
    portal.position.set(px + 8, 9, 0); portal.rotation.y = Math.PI / 2;
    zoneGroup(-1).add(portal);
    tickers.push((dt, t) => { if (portal.parent.visible) portal.material.uniforms.uTime.value = t; });
    billboard([{ t: 'WORLD 2', g: ['#ffffff', '#e0d8ff'], s: '#3a2a6a', px: 80 }, { t: '🔒 Coming soon!', c: '#ffd0e8', s: '#3a2a6a', px: 40 }], 12, 512, new V3(px + 8, 26, 0), zoneGroup(-1));
    prompts.push({ pos: new V3(px + 4, 0, 0), r: 7, zone: -1, label: () => '🌍 World 2: coming soon!', act: () => actions.openWorlds() });
    // invisible rails so nobody walks off the bridge by accident, and red rails round the platform
    for (const sz of [-1, 1]) solidBox((x0 + x1) / 2, 4, sz * (w / 2 + 0.4), x1 - x0, 8, 0.8, { zone: -1, mat: 'glass' });
    for (const sz of [-1, 1]) studBox(-1, 32, 2, 1, px, 1, sz * 15.5, C.red);
    studBox(-1, 1, 2, 30, px + 15.5, 1, 0, C.red);
    for (const sz of [-1, 1]) studBox(-1, 1, 2, 10.5, px - 15.5, 1, sz * 10.25, C.red);
}

// =====================================================================================
// The course
// =====================================================================================
export const domes = [];      // cream puffs (squish when stood on)
export const movers = [];
export const vanishers = [];
export const spinners = [];
export const sweepers = [];
export const bouncers = [];
export const cpPads = [];
let coinBody = null, coinLeaf = null;
export const coinState = { collected: new Set() };
const pistonLists = new Map();

// The cream puff shape: a dome with whipped ridges swirling up to a little peak (unit size)
const creamGeo = (() => {
    const g = new T.SphereGeometry(1, 27, 9, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const a = Math.atan2(z, x), k = 1 + 0.06 * Math.sin(a * 9 + y * 7) * (1 - y * 0.6);
        p.setXYZ(i, x * k, y + 0.12 * Math.pow(y, 5), z * k);
    }
    g.computeVertexNormals();
    return g;
})();

function buildCourse() {
    for (const e of COURSE) {
        const zone = e.zone;
        switch (e.t) {
            case 'land': buildLanding(e); break;
            case 'berry': {
                addBerry(zone, e.x, e.top, e.z, e.r, (e.x + e.z) * 0.37);
                solids.push({ shape: 'cyl', cx: e.x, cz: e.z, r: e.r * 0.95, min: new V3(e.x - e.r, e.top - e.r * 1.3, e.z - e.r), max: new V3(e.x + e.r, e.top, e.z + e.r), zone, mat: 'berry' });
                break;
            }
            case 'block': {
                roundStud(zone, e.sx, e.sy, e.sz, e.x, e.y, e.z, colorOf(e.color), { r: 0.4, mat: e.color === 'grey' ? 'plate' : 'stud' });
                break;
            }
            case 'cake': buildCake(e); break;
            case 'cream': {
                const s = { shape: 'dome', cx: e.x, cz: e.z, y0: e.y0, r: e.r, h: e.h, min: new V3(e.x - e.r, e.y0 - 0.6, e.z - e.r), max: new V3(e.x + e.r, e.y0 + e.h, e.z + e.r), zone, mat: 'cream', squish: 0, sqv: 0, press: 0 };
                solids.push(s); domes.push(s);
                // a cake base disc under it
                const base = cylGeo(e.r * 0.98, e.r * 0.9, 0.8, e.x, e.y0 - 0.4, e.z, 28);
                const bu = base.attributes.uv; for (let i = 0; i < bu.count; i++) bu.setXY(i, bu.getX(i) * 3, 0.15 + bu.getY(i) * 0.3);
                addGeo(zone, base, cakeSideMaterial(), true);
                break;
            }
            case 'truss': {
                addBoxFast(zone, trussMaterial(), true, e.sx, e.sy, e.sz, e.x, e.y, e.z, 4);
                solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: 'truss', climb: true });
                break;
            }
            case 'milk': buildMilk(e); break;
            case 'icing': buildIcing(e); break;
            case 'bounce': buildBounce(e); break;
            case 'mover': buildMover(e); break;
            case 'piston': {
                if (!pistonLists.has(zone)) pistonLists.set(zone, []);
                pistonLists.get(zone).push(e);
                break;
            }
            case 'vanish': buildVanish(e); break;
            case 'spinner': buildSpinner(e); break;
            case 'sweeper': buildSweeper(e); break;
            case 'cp': buildCheckpoint(e); break;
            case 'summit': buildSummit(e); break;
            default: break;
        }
    }
    // Cream puffs: one instanced mesh per stage
    const byZone = new Map();
    for (const s of domes) { if (!byZone.has(s.zone)) byZone.set(s.zone, []); byZone.get(s.zone).push(s); }
    for (const [zone, list] of byZone) {
        const inst = new T.InstancedMesh(creamGeo, creamMaterial(), list.length);
        list.forEach((s, i) => { s.inst = inst; s.idx = i; setDomeMatrix(s); });
        inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
        inst.castShadow = true; inst.receiveShadow = true;
        inst.frustumCulled = false;
        zoneGroup(zone).add(inst);
    }
    // Pistons: red studded blocks pumping out of white housings, instanced per stage
    const pistonGeo = worldUVLocal(roundGeo(3.2, 3, 3.2, 0.35));
    { const n = pistonGeo.attributes.position.count, a = new Float32Array(n * 3), c = new T.Color(C.red); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } pistonGeo.setAttribute('color', new T.BufferAttribute(a, 3)); }
    for (const [zone, list] of pistonLists) {
        const inst = new T.InstancedMesh(pistonGeo, studVCMaterial(), list.length);
        inst.instanceMatrix.setUsage(T.DynamicDrawUsage);
        inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
        zoneGroup(zone).add(inst);
        list.forEach((e, i) => {
            roundStud(zone, e.sx + 1, 2, e.sz + 1, e.x, e.top - e.amp - 2.2, e.z, C.white, { r: 0.35, solid: false });
            const s = solidBox(e.x, e.top - 1.5, e.z, e.sx, 3, e.sz, { zone, mat: 'stud', mover: true, piston: e, delta: new V3(), inst, idx: i });
            movers.push(s);
            m4.compose(v0.set(e.x, e.top - 1.5, e.z), q0, s0.set(e.sx / 3.2, 1, e.sz / 3.2));
            inst.setMatrixAt(i, m4);
        });
    }
    // Floating strawberries (+1 Win each): two instanced meshes for all of them, spinning
    coinBody = new T.InstancedMesh(berryGeo(0.95, 10).translate(0, 1.1, 0), berryMaterial(), COINS.length);
    coinLeaf = new T.InstancedMesh(calyxGeo(0.95).translate(0, 1.1, 0), leafMaterial(), COINS.length);
    for (const m of [coinBody, coinLeaf]) { m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; scene.add(m); }
    // Gear pads up in the tower
    for (const g of TOWER_GEAR) {
        roundStud(g.zone, 7, 3, 9, g.x, g.y - 1.5, g.z, C.rose, { r: 0.4 });
        gearPad(g.gear, g.x, g.y, g.z, g.zone, 0.9);
    }
}
// local (centered) UVs for an instanced piston block: studs in local units
function worldUVLocal(g) { return worldUV(g, 8); }

function setDomeMatrix(s) {
    const k = s.squish;
    m4.compose(v0.set(s.cx, s.y0, s.cz), q0, s0.set(s.r * (1 + 0.07 * k), s.h * (1 - 0.2 * k), s.r * (1 + 0.07 * k)));
    s.inst.setMatrixAt(s.idx, m4);
    s.inst.instanceMatrix.needsUpdate = true;
}
const m4 = new T.Matrix4(), q0 = new T.Quaternion(), v0 = new V3(), s0 = new V3();
// Called each frame for the cream puff someone stands on (main.js)
export function pressDome(s) { s.press = 0.12; }

function buildLanding(e) {
    const zone = e.zone, color = e.last ? C.gold : (e.top % 4 < 2 ? C.pink : C.rose);
    roundStud(zone, e.s, 3, e.s, e.x, e.top - 1.5, e.z, color, { r: 0.5 });
    roundStud(zone, e.s - 5, 2, e.s - 5, e.x, e.top - 4, e.z, C.white, { r: 0.4, solid: false });
    // a glowing trim around the top edge, in the stage's colour
    const nm = neon(STAGES[zone].bar, 1.2), hs = e.s / 2;
    for (const [dx, dz, sx, sz] of [[0, -hs, e.s + 0.3, 0.3], [0, hs, e.s + 0.3, 0.3], [-hs, 0, 0.3, e.s], [hs, 0, 0.3, e.s]]) plainBox(zone, sx, 0.3, sz, e.x + dx, e.top - 0.25, e.z + dz, nm);
}
function buildCake(e) {
    const zone = e.zone;
    const top = new T.PlaneGeometry(e.sx, e.sz); top.rotateX(-Math.PI / 2); top.translate(e.x, e.y + e.sy / 2, e.z);
    const tu = top.attributes.uv, tp = top.attributes.position;
    for (let i = 0; i < tu.count; i++) tu.setXY(i, tp.getX(i) / 8, -tp.getZ(i) / 8);
    addGeo(zone, top, creamTopMaterial(), true);
    // the four sides: the layer texture once per side height, along the side in world units
    const g = new T.BoxGeometry(e.sx, e.sy, e.sz);
    const idx = g.index.array, keep = [];
    // keep only the side faces (BoxGeometry groups: +x, -x, +y, -y, +z, -z)
    for (const gr of g.groups) if (gr.materialIndex !== 2 && gr.materialIndex !== 3) for (let k = gr.start; k < gr.start + gr.count; k++) keep.push(idx[k]);
    g.setIndex(keep); g.clearGroups();
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        const along = Math.abs(nn.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
        uv.setXY(i, along / 7, (p.getY(i) + e.sy / 2) / e.sy);
    }
    g.translate(e.x, e.y, e.z);
    addGeo(zone, g, cakeSideMaterial(), true);
    solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: 'cake' });
    // strawberries on the corners, and dollops of cream between
    const t = e.y + e.sy / 2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const bx = e.x + dx * (e.sx / 2 - 0.9), bz = e.z + dz * (e.sz / 2 - 0.9);
        const b = berryGeo(0.7, 12); b.rotateX(Math.PI); b.translate(bx, t - 0.05, bz);
        addGeo(zone, b, berryMaterial(), true);
    }
}
function buildMilk(e) {
    const zone = e.zone;
    // a white tub with a pink stripe, the milk inside
    const rimH = 1.1, rt = 0.8, y = e.top + 0.25;
    roundStud(zone, e.sx, e.h - 0.4, e.sz, e.x, e.top - e.h / 2 - 0.2, e.z, C.white, { r: 0.4, solid: false });
    for (const [dx, dz, sx, sz] of [[0, -e.sz / 2 + rt / 2, e.sx, rt], [0, e.sz / 2 - rt / 2, e.sx, rt], [-e.sx / 2 + rt / 2, 0, rt, e.sz - rt * 2], [e.sx / 2 - rt / 2, 0, rt, e.sz - rt * 2]]) {
        roundStud(zone, sx, rimH, sz, e.x + dx, y - rimH / 2 + 0.3, e.z + dz, C.pink, { r: 0.3, solid: false });
    }
    const geo = new T.PlaneGeometry(e.sx - rt * 2 + 0.2, e.sz - rt * 2 + 0.2);
    geo.rotateX(-Math.PI / 2);
    geo.translate(e.x, e.top - 0.1, e.z);
    const gu = geo.attributes.uv, gp = geo.attributes.position;
    for (let i = 0; i < gu.count; i++) gu.setXY(i, gp.getX(i) / 10, gp.getZ(i) / 10);
    addGeo(zone, geo, milkMaterial(), false);
    solidBox(e.x, e.top - e.h / 2, e.z, e.sx, e.h, e.sz, { zone, mat: 'milk', slime: true });
}
function buildIcing(e) {
    const zone = e.zone;
    const top = new T.PlaneGeometry(e.sx, e.sz); top.rotateX(-Math.PI / 2); top.translate(e.x, e.y + e.sy / 2, e.z);
    const tu = top.attributes.uv, tp = top.attributes.position;
    for (let i = 0; i < tu.count; i++) tu.setXY(i, tp.getX(i) / 6, -tp.getZ(i) / 6);
    addGeo(zone, top, icingTopMaterial(), true);
    const g = new T.BoxGeometry(e.sx, e.sy, e.sz);
    const idx = g.index.array, keep = [];
    for (const gr of g.groups) if (gr.materialIndex !== 2) for (let k = gr.start; k < gr.start + gr.count; k++) keep.push(idx[k]);
    g.setIndex(keep); g.clearGroups();
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        const along = Math.abs(nn.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
        uv.setXY(i, along / (e.sy * 1.2), (p.getY(i) + e.sy / 2) / e.sy);
    }
    g.translate(e.x, e.y, e.z);
    addGeo(zone, g, icingSideMaterial(), true);
    solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: 'icing', ice: true });
}
function buildBounce(e) {
    const g = new T.Group(); g.position.set(e.x, e.top, e.z); zoneGroup(e.zone).add(g);
    const disc = new T.Mesh(new T.CylinderGeometry(e.r, e.r, 0.5, 28), mat(0xff7ab0, { emissive: 0xff3a8a, ei: 0.35 }));
    disc.position.y = -0.25; g.add(disc);
    // the cream rim never moves: batched
    const ring = new T.TorusGeometry(e.r, 0.38, 8, 28); ring.rotateX(Math.PI / 2); ring.translate(e.x, e.top - 0.05, e.z);
    addGeo(e.zone, ring, creamMaterial(), true);
    const arrow = billboard([{ t: '⬆', c: '#ffe0f0', s: '#b81848', px: 90 }], 2.4, 128, new V3(0, 2.2, 0), g, true);
    arrow.material.opacity = 0.9;
    const s = { shape: 'cyl', cx: e.x, cz: e.z, r: e.r, min: new V3(e.x - e.r, e.top - 0.5, e.z - e.r), max: new V3(e.x + e.r, e.top, e.z + e.r), zone: e.zone, mat: 'bounce', bounce: CFG.bounceV, disc, jig: 0 };
    solids.push(s); bouncers.push(s);
    tickers.push((dt, t) => {
        if (!g.parent.visible) return;
        s.jig *= Math.exp(-dt * 5);
        const k = Math.sin(t * 30) * s.jig;
        disc.scale.set(1 + k * 0.08, 1 - k * 0.5, 1 + k * 0.08);
        arrow.position.y = 2.2 + Math.sin(t * 3 + e.x) * 0.4;
    });
}
export function jiggle(s) { s.jig = 1; }
function buildMover(e) {
    const zone = e.zone;
    let mesh;
    // every moving block is one mesh in the shared studded vertex-colour material
    const coloured = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), col = new T.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new T.BufferAttribute(a, 3)); return g; };
    if (e.look === 'lego') {
        mesh = new T.Mesh(coloured(worldUV(roundGeo(e.sx, e.sy, e.sz, 0.35), 8), C.cyan), studVCMaterial());
    } else if (e.look === 'wafer') {
        // a pink wafer bar
        mesh = new T.Mesh(roundGeo(e.sx, e.sy, e.sz, 0.3), icingSideMaterial());
    } else {
        // grey sky plate with a red edge underneath (the reference's grey and red)
        const plate = coloured(worldUV(roundGeo(e.sx, e.sy, e.sz, 0.3), 8), C.grey);
        const rim = coloured(worldUV(new T.BoxGeometry(e.sx + 0.3, 0.35, e.sz + 0.3).translate(0, -e.sy / 2 + 0.2, 0).toNonIndexed(), 8), C.red);
        mesh = new T.Mesh(mergeGeometries([plate, rim]), studVCMaterial());
    }
    mesh.position.set(e.x, e.y, e.z);
    mesh.castShadow = true;
    zoneGroup(zone).add(mesh);
    const s = solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone, mat: e.look === 'wafer' ? 'cake' : e.look === 'lego' ? 'stud' : 'plate', mover: true, delta: new V3(), e, mesh });
    movers.push(s);
}
function buildVanish(e) {
    const color = [0xff4a8a, 0xff6ab0, 0xff3a6a, 0xff8ad0][Math.floor(Math.abs(e.x + e.z)) % 4];
    const m = new T.Mesh(roundGeo(e.sx, e.sy, e.sz, 0.5), jellyMaterial(color).clone());
    m.position.set(e.x, e.y, e.z); m.castShadow = true;
    zoneGroup(e.zone).add(m);
    const s = solidBox(e.x, e.y, e.z, e.sx, e.sy, e.sz, { zone: e.zone, mat: 'jelly', vanish: true, state: 0, t: 0, mesh: m, home: m.position.clone() });
    vanishers.push(s);
}
// Called while someone stands on a melting jelly (main.js)
export function touchVanish(s) { if (s.state === 0) { s.state = 1; s.t = s.t0 = meltTime(s.zone); } }
function buildSpinner(e) {
    const g = new T.Group(); g.position.set(e.x, e.top, e.z); zoneGroup(e.zone).add(g);
    // one material for the whole slice: the side's UVs point at the red rim at the texture's edge
    const geo = new T.CylinderGeometry(e.r, e.r * 0.96, 1.4, 32);
    const uv = geo.attributes.uv;
    for (const gr of geo.groups) if (gr.materialIndex === 0) for (let k = gr.start; k < gr.start + gr.count; k++) uv.setXY(geo.index.array[k], 0.5, 0.004);
    geo.clearGroups();
    const disc = new T.Mesh(geo, sliceMaterial());
    disc.position.y = -0.7; disc.castShadow = true; disc.receiveShadow = true; g.add(disc);
    const s = { shape: 'cyl', cx: e.x, cz: e.z, r: e.r, min: new V3(e.x - e.r, e.top - 1.4, e.z - e.r), max: new V3(e.x + e.r, e.top, e.z + e.r), zone: e.zone, mat: 'berry', spin: e.speed * spd(e.zone), g };
    solids.push(s); spinners.push(s);
}
function buildSweeper(e) {
    const g = new T.Group(); g.position.set(e.x, e.y, e.z); zoneGroup(e.zone).add(g);
    addGeo(e.zone, cylGeo(0.7, 0.9, 2.4, e.x, e.y + 1.2, e.z, 16), smoothVC(), true, C.white);
    // a candy stick: biscuit in the middle, strawberry coating out to the ends (one mesh, colours
    // in the vertices)
    const coat = new T.CapsuleGeometry(0.55, e.len * 2 - 1.1, 4, 10);
    const p = coat.attributes.position, col = new Float32Array(p.count * 3), pink = new T.Color(0xff5aa8), biscuit = new T.Color(0xf2c890);
    for (let i = 0; i < p.count; i++) { const c = Math.abs(p.getY(i)) < 0.9 ? biscuit : pink; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    coat.setAttribute('color', new T.BufferAttribute(col, 3));
    coat.rotateZ(Math.PI / 2);
    const bar = new T.Mesh(coat, smoothVC()); bar.position.y = 1.6; bar.castShadow = true; g.add(bar);
    // (sticks speed up more gently than the rest: you have to read them, not just react)
    sweepers.push({ cx: e.x, cz: e.z, y: e.y + 1.6, len: e.len, speed: e.speed * Math.sqrt(spd(e.zone)), phase: e.phase, zone: e.zone, bar, g });
    solids.push({ shape: 'cyl', cx: e.x, cz: e.z, r: 0.9, min: new V3(e.x - 0.9, e.y, e.z - 0.9), max: new V3(e.x + 0.9, e.y + 2.4, e.z + 0.9), zone: e.zone, mat: 'stud' });
}
// Where a sweeper bar is, for the knock test in main.js: angle now
export const sweeperAngle = (w, t) => w.speed * t + w.phase;

// A checkpoint: a strawberry pad with a pulsing ring and a waving flag (pink, green once reached)
const flagGeoBase = (() => { const g = new T.PlaneGeometry(3.2, 2, 10, 4); g.translate(1.6, 0, 0); return g; })();
function buildCheckpoint(e) {
    const zone = e.zone;
    const pad = new T.Mesh(new RoundedBoxGeometry(7, 0.6, 7, 2, 0.24), cpPadMaterial(false));
    pad.position.set(e.x, e.y + 0.1, e.z); pad.receiveShadow = true;
    zoneGroup(zone).add(pad);
    solidBox(e.x, e.y + 0.1, e.z, 7, 0.6, 7, { zone, mat: 'stud' });
    const label = billboard([{ t: 'Stage ' + (e.i + 2), c: '#ffffff', s: '#b81848', px: 60 }], 6, 512, new V3(e.x, e.y + 10.5, e.z), zoneGroup(zone), true);
    label.material.opacity = 0.92;
    const ringMat = new T.MeshBasicMaterial({ color: 0xff4a7a, toneMapped: false });
    const ring = new T.Mesh(new T.TorusGeometry(5.3, 0.16, 8, 56), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(e.x, e.y + 0.42, e.z);
    zoneGroup(zone).add(ring);
    const flagGeo = flagGeoBase.clone();
    const flag = new T.Mesh(flagGeo, flagMaterial(false));
    flag.castShadow = true;
    // the pole stands on the pad's corner by the walls; the flag flies along the next side, so
    // players arriving along the last side see it broadside
    const fx = e.x + 2.7 * Math.sign(e.x), fz = e.z + 2.7 * Math.sign(e.z);
    addGeo(zone, cylGeo(0.12, 0.14, 8, fx, e.y + 4.4, fz, 8), smoothVC(), true, 0xfff4f8);
    addGeo(zone, berryGeo(0.4, 10).translate(fx, e.y + 9.3, fz), berryMaterial(), true);
    flag.position.set(fx, e.y + 7.1, fz);
    flag.rotation.y = e.yaw - Math.PI / 2;
    zoneGroup(zone).add(flag);
    const base = Float32Array.from(flagGeo.attributes.position.array);
    cpPads[e.i] = { pad, lit: false, label, ring, flag };
    let acc = 0;
    tickers.push((dt, t) => {
        if (!flag.parent.visible) return;
        acc += dt;
        if (acc > 1 / 30) {
            // the flag waves at 30 fps: plenty for cloth, half the work
            acc = 0;
            const p = flagGeo.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = base[i * 3], k = x / 3.2;
                p.array[i * 3 + 2] = Math.sin(x * 1.9 - t * 5 + e.i) * 0.32 * k + Math.sin(base[i * 3 + 1] * 2 + t * 3) * 0.06 * k;
            }
            p.needsUpdate = true;
            flagGeo.computeVertexNormals();
        }
        const pulse = 1.1 + Math.sin(t * 3 + e.i) * 0.25;
        ringMat.color.set(cpPads[e.i].lit ? 0x46ff5a : 0xff4a7a).multiplyScalar(pulse);
        ring.scale.setScalar(1 + Math.sin(t * 3 + e.i) * 0.03);
    });
    triggers.push({ min: new V3(e.x - 3.6, e.y, e.z - 3.6), max: new V3(e.x + 3.6, e.y + 6, e.z + 3.6), zone, enter: () => actions.checkpoint(e.i) });
}
export function lightCheckpoint(i, on) {
    const c = cpPads[i];
    if (!c || c.lit === on) return;
    c.lit = on;
    c.pad.material = cpPadMaterial(on);
    c.flag.material = flagMaterial(on);
}

// The summit: a round shortcake floating in the middle of the tower, the rainbow WIN pad with a
// beam of light, and the giant smiling strawberry watching over it (it pokes above the tower)
function buildSummit(e) {
    const g = new T.Group(); g.position.set(e.x, e.y, e.z); zoneGroup(e.zone).add(g);
    const top = new T.CircleGeometry(e.r, 64); top.rotateX(-Math.PI / 2);
    const tu = top.attributes.uv; for (let i = 0; i < tu.count; i++) tu.setXY(i, tu.getX(i) * 3, tu.getY(i) * 3);
    g.add(new T.Mesh(top, creamTopMaterial()));
    const side = new T.Mesh(new T.CylinderGeometry(e.r, e.r * 0.9, 4, 64, 1, true), cakeSideMaterial());
    side.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 0) a[i] = v * 6; });
    side.position.y = -2; g.add(side);
    const under = new T.Mesh(new T.CircleGeometry(e.r * 0.9, 48), mat(0xf4c870)); under.rotation.x = Math.PI / 2; under.position.y = -4; g.add(under);
    solids.push({ shape: 'cyl', cx: e.x, cz: e.z, r: e.r, min: new V3(e.x - e.r, e.y - 4, e.z - e.r), max: new V3(e.x + e.r, e.y, e.z + e.r), zone: e.zone, mat: 'cake' });
    // The WIN pad: a glowing rainbow disc with a beam of light
    const padTex = rainbowTex().clone(); padTex.needsUpdate = true;
    const pad = new T.Mesh(new T.CircleGeometry(e.pad, 48), new T.MeshBasicMaterial({ map: padTex, toneMapped: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.06; g.add(pad);
    const beam = new T.Mesh(new T.CylinderGeometry(e.pad, e.pad, 40, 32, 1, true), new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
            vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
            void main(){ float a = vUv.y * 0.5 * (0.7 + 0.3 * sin(vUv.y * 20.0 - uTime * 4.0)); gl_FragColor = vec4(hue(vUv.x + uTime * 0.1) * 1.2, a); }`,
    }));
    beam.position.y = 20; g.add(beam);
    const win = billboard([{ t: '🏆 WIN! 🏆', g: ['#fff6b0', '#ffc828'], s: '#7a3a00', px: 90 }, { t: 'Top of Strawberry Tower', c: '#ffffff', s: '#b81848', px: 42 }], 12, 512, new V3(0, 8, 0), g);
    triggers.push({ min: new V3(e.x - e.pad + 0.6, e.y, e.z - e.pad + 0.6), max: new V3(e.x + e.pad - 0.6, e.y + 6, e.z + e.pad - 0.6), zone: e.zone, enter: () => actions.summit() });
    // The giant smiling strawberry floating over the far side of the pad; it pokes out above the
    // tower, so you can see it from the lobby and the terrace
    const BY = e.y + 33, bx = e.x + 9, bz = e.z + 9;
    const big = new T.Group(); big.position.set(bx, BY, bz); big.rotation.y = Math.atan2(-1, -1);
    big.add(new T.Mesh(berryGeo(11, 36), berryMaterial()));
    big.add(new T.Mesh(calyxGeo(11), leafMaterial()));
    const eyeM = new T.MeshBasicMaterial({ color: 0x2a0a14 }), shine = new T.MeshBasicMaterial({ color: 0xffffff }), blush = new T.MeshBasicMaterial({ color: 0xff8ab0, transparent: true, opacity: 0.8 });
    for (const sx of [-1, 1]) {
        const ey = new T.Mesh(new T.SphereGeometry(1.5, 16, 12), eyeM); ey.scale.set(1, 1.3, 0.5); ey.position.set(sx * 3.4, -6.5, 10.5); big.add(ey);
        const sh = new T.Mesh(new T.SphereGeometry(0.5, 8, 6), shine); sh.position.set(sx * 3.4 - 0.5, -5.8, 11.15); big.add(sh);
        const bl = new T.Mesh(new T.CircleGeometry(1.4, 16), blush); bl.position.set(sx * 6.4, -8.6, 9.3); bl.rotation.y = sx * 0.55; big.add(bl);
    }
    const mouth = new T.Mesh(new T.TorusGeometry(1.4, 0.35, 8, 16, Math.PI), eyeM); mouth.position.set(0, -8.9, 10.95); mouth.rotation.z = Math.PI; big.add(mouth);
    big.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.parent.add(big);
    // (its tip floats just out of jumping reach; a collider keeps you from jumping into it)
    solids.push({ shape: 'cyl', cx: bx, cz: bz, r: 8, min: new V3(bx - 8, BY - 26, bz - 8), max: new V3(bx + 8, BY, bz + 8), zone: e.zone, mat: 'berry' });
    tickers.push((dt, t) => {
        padTex.offset.x = (t * 0.25) % 1;
        beam.material.uniforms.uTime.value = t;
        win.position.y = 8 + Math.sin(t * 1.5) * 0.5;
        big.rotation.z = Math.sin(t * 0.8) * 0.03;
        big.position.y = BY + Math.sin(t * 1.1) * 0.6;
    });
}

// =====================================================================================
// Decor: clouds drifting around the island, giant strawberries floating in the sky
// =====================================================================================
const floaters = [];
let lowDecor = false, cloudInst = null;
export function setDecorLow(on) {
    lowDecor = !!on;
    if (berryInst) berryInst.count = leafInst.count = lowDecor ? 8 : FLOATING;
}
// Floating strawberries around the tower (the reference's big pink strawberries), bobbing: all of
// them in two instanced meshes (berries and leaves)
const FLOATING = 14, berryFloat = [];
let berryInst = null, leafInst = null;
function buildDecor() {
    // Clouds: a ring below and around the island, some high up beside the tower. All of them are
    // one instanced mesh of camera-facing cards (one draw call), drawn behind other see-through things
    const cm = new T.MeshBasicMaterial({ map: cloudSpriteTex(), transparent: true, depthWrite: false, fog: false, opacity: 0.92 });
    cloudInst = new T.InstancedMesh(new T.PlaneGeometry(1, 1), cm, 22);
    cloudInst.instanceMatrix.setUsage(T.DynamicDrawUsage);
    cloudInst.frustumCulled = false; cloudInst.renderOrder = -1;
    scene.add(cloudInst);
    const rnd = rngFrom(5);
    for (let k = 0; k < 22; k++) {
        const a = rnd() * Math.PI * 2, r = 170 + rnd() * 320, y = k < 12 ? -60 - rnd() * 140 : 40 + rnd() * 260;
        const s = 100 + rnd() * 130;
        floaters.push({ a, r, y, s, spd: 0.004 + rnd() * 0.006, lowHide: k % 2 === 1, p: new V3(), d: 0 });
    }
    berryInst = new T.InstancedMesh(berryGeo(1, 18), berryMaterial(), FLOATING);
    leafInst = new T.InstancedMesh(calyxGeo(1), leafMaterial(), FLOATING);
    for (let k = 0; k < FLOATING; k++) {
        const a = k / FLOATING * Math.PI * 2 + rnd() * 0.3, r = H + 40 + rnd() * 50;
        berryFloat.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 20 + rnd() * 240, s: 4 + rnd() * 4, ph: rnd() * 6, rot: (rnd() - 0.5) * 0.3, rx: (rnd() - 0.5) * 0.6, ry: rnd() * 6, rz: (rnd() - 0.5) * 0.6 });
    }
    for (const m of [berryInst, leafInst]) { m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
    updateDecor(0, 0);
}
const decoEuler = new T.Euler();
const cloudOrder = [];
function updateDecor(dt, t) {
    // drift, then lay the cards out far to near so they blend over each other properly
    cloudOrder.length = 0;
    for (const f of floaters) {
        f.a += f.spd * dt; f.p.set(Math.cos(f.a) * f.r, f.y, Math.sin(f.a) * f.r);
        if (lowDecor && f.lowHide) continue;
        f.d = f.p.distanceToSquared(camera.position); cloudOrder.push(f);
    }
    cloudOrder.sort((a, b) => b.d - a.d);
    cloudOrder.forEach((f, k) => { m4.compose(f.p, camera.quaternion, s0.set(f.s, f.s / 2, 1)); cloudInst.setMatrixAt(k, m4); });
    cloudInst.count = cloudOrder.length;
    cloudInst.instanceMatrix.needsUpdate = true;
    berryFloat.forEach((b, k) => {
        q0.setFromEuler(decoEuler.set(b.rx, b.ry + b.rot * t, b.rz));
        m4.compose(v0.set(b.x, b.y + Math.sin(t * 0.6 + b.ph) * 2.5, b.z), q0, s0.setScalar(b.s));
        berryInst.setMatrixAt(k, m4); leafInst.setMatrixAt(k, m4);
    });
    berryInst.instanceMatrix.needsUpdate = true; leafInst.instanceMatrix.needsUpdate = true;
    q0.identity();
}

// =====================================================================================
// Per-frame world animation (before the player moves)
// =====================================================================================
const prevPos = new V3();
const UP = new V3(0, 1, 0);
const milkScroll = { u: 0, v: 0 };
export function updateWorld(dt, t, stage) {
    const st = serverT();
    const near = (z) => z < 0 || stage === undefined || Math.abs(z - Math.max(0, stage)) <= 3;
    // Movers: positions from the shared server clock so every player sees the same thing
    for (const s of movers) {
        if (!near(s.zone)) continue;
        prevPos.copy(s.min);
        if (s.piston) {
            const e = s.piston;
            const k = 0.5 - 0.5 * Math.cos((st * spd(s.zone) / e.period + e.phase) * Math.PI * 2);
            const top = e.top - e.amp * k;
            s.min.y = top - 3; s.max.y = top;
            m4.compose(v0.set(e.x, top - 1.5, e.z), q0, s0.set(e.sx / 3.2, 1, e.sz / 3.2));
            s.inst.setMatrixAt(s.idx, m4);
            s.inst.instanceMatrix.needsUpdate = true;
        } else {
            const e = s.e, k = Math.sin((st * spd(s.zone) / e.period + e.phase) * Math.PI * 2);
            const x = e.x + e.ax * k, y = e.y + e.ay * k, z = e.z + e.az * k;
            s.min.set(x - e.sx / 2, y - e.sy / 2, z - e.sz / 2);
            s.max.set(x + e.sx / 2, y + e.sy / 2, z + e.sz / 2);
            s.mesh.position.set(x, y, z);
        }
        s.delta.subVectors(s.min, prevPos);
    }
    // Melting jelly: shake, fade, gone for a while, then back
    for (const s of vanishers) {
        if (s.state === 1) {
            s.t -= dt;
            s.mesh.position.set(s.home.x + (Math.random() - 0.5) * 0.25, s.home.y, s.home.z + (Math.random() - 0.5) * 0.25);
            s.mesh.material.opacity = 0.35 + 0.45 * Math.max(0, s.t / (s.t0 || 0.75));
            if (s.t <= 0) { s.state = 2; s.t = 3; s.off = true; s.mesh.visible = false; }
        } else if (s.state === 2) {
            s.t -= dt;
            if (s.t <= 0) { s.state = 3; s.t = 0.35; s.off = false; s.mesh.visible = true; s.mesh.position.copy(s.home); }
        } else if (s.state === 3) {
            s.t -= dt;
            const k = 1 - Math.max(0, s.t / 0.35);
            s.mesh.material.opacity = 0.82 * k; s.mesh.scale.setScalar(0.6 + 0.4 * k);
            if (s.t <= 0) { s.state = 0; s.mesh.scale.setScalar(1); s.mesh.material.opacity = 0.82; }
        }
    }
    for (const s of spinners) if (near(s.zone)) s.g.rotation.y = -s.spin * st;
    for (const w of sweepers) if (near(w.zone)) w.g.rotation.y = -sweeperAngle(w, st);
    // Cream puffs squish while pressed and wobble back
    for (const s of domes) {
        const target = s.press > 0 ? 1 : 0;
        s.press -= dt;
        if (!target && Math.abs(s.squish) < 0.002 && Math.abs(s.sqv) < 0.01) continue;
        s.sqv += (target - s.squish) * 260 * dt;
        s.sqv *= Math.exp(-11 * dt);
        s.squish += s.sqv * dt;
        setDomeMatrix(s);
    }
    // Floating strawberries
    if (coinBody) {
        COINS.forEach((c, i) => {
            const hide = coinState.collected.has(c.i) || !near(c.zone);
            q0.setFromAxisAngle(UP, t * 2.4 + i);
            m4.compose(v0.set(c.x, c.y + Math.sin(t * 2 + i) * 0.3, c.z), q0, s0.setScalar(hide ? 0.0001 : 1.15));
            coinBody.setMatrixAt(i, m4);
            coinLeaf.setMatrixAt(i, m4);
        });
        coinBody.instanceMatrix.needsUpdate = true;
        coinLeaf.instanceMatrix.needsUpdate = true;
        q0.identity();
    }
    // the strawberry milk swirls
    milkScroll.u = (milkScroll.u + dt * 0.03) % 1; milkScroll.v = (milkScroll.v + dt * 0.017) % 1;
    milkTex().offset.set(milkScroll.u, milkScroll.v);
    updateDecor(dt, t);
}

// =====================================================================================
// Built in slices with a pause between them (pause() returns a promise), so the page stays
// responsive and the server connection that runs alongside keeps moving.
// =====================================================================================
export async function buildWorld(pause) {
    pause = pause || (() => Promise.resolve());
    buildIsland();
    await pause();
    buildShell();
    await pause();
    buildLobby();
    await pause();
    buildCourse();
    await pause();
    buildDecor();
    flushGeo();
    cullZones(-1);
}

// Gets every shader and texture onto the GPU while the loading screen shows, without freezing the
// page: the shaders compile in the background (compileAsync), the depth shaders the sun's shadow
// pass draws with included, then the textures upload and a GPU fence says when they're done. The
// stand-ins made here are kept, so their shaders stay alive.
const SHADOW_SIDE = { [T.FrontSide]: T.BackSide, [T.BackSide]: T.FrontSide, [T.DoubleSide]: T.DoubleSide };
const warmKeep = [];
export async function warmUp(renderer, camera, pause) {
    const vis = [];
    scene.traverse((o) => { if (o !== scene && !o.visible) { vis.push(o); o.visible = true; } });
    try { await renderer.compileAsync(scene, camera); } catch (e) { renderer.compile(scene, camera); }
    if (renderer.shadowMap.enabled) {
        // The shadow pass draws each caster with three's depth material (its side flipped, its
        // colour map kept) into a render target: one stand-in per kind of caster, compiled the
        // same way (and without fog: three draws the shadow pass with an empty scene)
        const kinds = new Map();
        scene.traverse((o) => {
            if (!o.isMesh || !o.castShadow) return;
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
                const side = m.shadowSide ?? SHADOW_SIDE[m.side];
                const key = [o.isSkinnedMesh, o.isInstancedMesh, !!m.map, side, m.alphaTest > 0].join();
                if (kinds.has(key)) continue;
                const d = new T.MeshDepthMaterial({ side, map: m.map, alphaMap: m.alphaMap, alphaTest: m.alphaTest });
                let p;
                if (o.isSkinnedMesh) { p = new T.SkinnedMesh(o.geometry, d); p.bind(o.skeleton, o.bindMatrix); }
                else if (o.isInstancedMesh) { p = new T.InstancedMesh(o.geometry, d, 1); }
                else p = new T.Mesh(o.geometry, d);
                kinds.set(key, p);
            }
        });
        const stand = new T.Group();
        for (const p of kinds.values()) stand.add(p);
        const rt = new T.WebGLRenderTarget(1, 1);
        const prev = renderer.getRenderTarget(), fog = scene.fog;
        let ready = null;
        renderer.setRenderTarget(rt);
        scene.fog = null;
        try { ready = renderer.compileAsync(stand, camera, scene); } catch (e) { /* compiles on first use */ }
        scene.fog = fog;
        renderer.setRenderTarget(prev);
        if (ready) { try { await ready; } catch (e) { /* compiles on first use */ } }
        rt.dispose();
        warmKeep.push(stand);
        // put the lights back the way the next frame draws them
        try { renderer.compile(new T.Group(), camera, scene); } catch (e) { /* next frame */ }
    }
    for (const o of vis) o.visible = false;
    const texs = new Set();
    scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
            for (const k of ['map', 'normalMap', 'emissiveMap', 'alphaMap']) if (m[k]) texs.add(m[k]);
            if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) texs.add(v); }
        }
    });
    let n = 0;
    for (const t of texs) {
        renderer.initTexture(t);
        if (++n % 16 === 0) await pause();
    }
    // Wait until the GPU has the uploads done, polling between tasks instead of blocking
    const gl = renderer.getContext();
    if (gl.fenceSync) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const t0 = performance.now();
        while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 15));
        gl.deleteSync(sync);
    }
    cullZones(-1);
}
export { textCanvas };
