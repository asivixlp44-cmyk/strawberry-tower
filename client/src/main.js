import { Client } from '@colyseus/sdk';
import {
    T, V3, $, canvas, scene, camera, sun, renderer, solids, triggers, prompts, tickers,
    billboard, buildRig, animRig, airPose, climbPose, holdPose, floatText, updateEffects, lerpAngle, updateSky, SUN_DIRECTION,
} from './engine.js';
import { S, actions, net } from './state.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, step as surfStep, setVolume, audioSuspended, loopSound } from './audio.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar, unpackAvatar } from './avatar.js';
import { pad, pollGamepad, rumble, onGamepadConnection } from './gamepad.js';
import {
    render, updateFx, dust, sparkleColumn, ring, fireworks, setQuality, getQuality, autoQualityAllowed, makeTrail, splash, popSpark,
    coinBurst, nukeFx, zapFx, auraFx, confetti, updateAmbient, setSpeedLines, fxWarmGroup, fxShowAll,
} from './fx.js';
import {
    buildWorld, warmUp, SPAWN, SPAWN_YAW, renderBoards, updateWorld, cullZones, refreshGearPads, refreshPetPads, lightCheckpoint, coinState,
    pressDome, touchVanish, jiggle, sweepers, sweeperAngle, bonusState, islandClamp, setDecorLow,
} from './world.js';
import { heldModel, carpet as carpetModel, waveCarpet } from './gear.js';
import { PetTrain } from './pets.js';
import {
    updateHud, toast, showStageTitle, showWin, showOof, flash, teleportFx, showOops, hideOops, showGearPop, renderHotbar, hotbarGear,
    renderProgress, animateCounters, bumpCoins, openDailyOnJoin, refreshModal, refreshDaily, openModal, notEnough, showStageClear,
    promptEl, promptTxtEl, codeResult, buy, closeTop, anyPopup,
} from './ui.js';
import { CFG, STAGES, KITS, SKINS, trailById, petById, passForGear, fmt, clamp, cleanFx, tpPrice } from '../../shared/config.js';
import { CHECKPOINTS, COINS, SUMMIT, checkpointSpot, stageAt, COURSE_TOP, COURSE, CORNER_Y, cornerXZ, LAND } from '../../shared/course.js';

// =====================================================================================
// Local player
// =====================================================================================
const HW = 1, PH = 5, STEP = 1.25, PIVOT = 2.6;
const P = {
    pos: SPAWN.clone(), vel: new V3(), kv: new V3(), onGround: false, ground: null, facing: SPAWN_YAW, moving: false,
    animPhase: 0, airTime: 0, peakY: 0, climbing: null, climbT: 0, stage: -1, lastStepN: 0, squash: 1, squashV: 0,
    flying: false, lastZap: -9, swing: 0, sweepHit: -9, jumpPress: -9, coyote: 0, shield: 0,
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let shake = 0;
function addShake(a) { if (!reduceMotion) shake = Math.min(1.2, shake + a); }
let rig = null, headLabel, nameLabelText = '', myPets = null;

// The sparkly forcefield bubble you get for a moment after spawning (like the reference)
const shieldMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uA: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vP = position; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main(){
            float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
            vec3 q = floor(vP * 5.0 + vec3(0.0, uTime * 2.0, 0.0));
            float sp = step(0.93, h(q)) * (0.5 + 0.5 * sin(uTime * 9.0 + h(q + 1.7) * 30.0));
            vec3 c = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.75, 0.95), 0.5 + 0.5 * sin(uTime * 2.0 + vP.y));
            gl_FragColor = vec4(c, (f * 0.7 + sp * 0.5 + 0.06) * uA);
        }`,
});
const shieldGeo = new T.SphereGeometry(3.6, 28, 18);
tickers.push((dt, t) => { shieldMat.uniforms.uTime.value = t; });
function setShield(g, secs) {
    const u = g.userData;
    if (!u.shield) { u.shield = new T.Mesh(shieldGeo, shieldMat); u.shield.position.y = 2.6; u.shield.renderOrder = 7; g.add(u.shield); }
    u.shieldT = secs;
    u.shield.visible = secs > 0;
}
function tickShield(g, dt) {
    const u = g.userData;
    if (!u.shield || u.shieldT <= 0) return;
    u.shieldT -= dt;
    u.shield.visible = u.shieldT > 0;
    u.shield.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.03);
}

// ----- a character: rig (feet, yaw) -> pivot (hips) -> body (blocky or Bloxity) + held tool -----
function buildCharacter(kit, skin) {
    const g = new T.Group();
    const pivot = new T.Group(); pivot.position.y = PIVOT; g.add(pivot);
    const k = KITS[kit % KITS.length];
    const body = buildRig({ ...k, skin: SKINS[skin % SKINS.length] });
    body.position.y = -PIVOT;
    pivot.add(body);
    g.userData = { pivot, body, tool: '', held: null, carpet: null, trail: null, trailId: '', fxScale: 1, spinA: 0, fx: '' };
    return g;
}
// The tool in the right hand; the carpet under the feet
function setTool(g, id) {
    const u = g.userData;
    if (u.tool === (id || '')) return;
    u.tool = id || '';
    for (const k of ['held', 'carpet']) if (u[k]) { u[k].parent && u[k].parent.remove(u[k]); u[k] = null; }
    if (!id) return;
    if (id === 'carpet') { u.carpet = carpetModel(0.95); u.carpet.position.y = 0.25; u.carpet.visible = false; g.add(u.carpet); return; }
    const h = heldModel(id);
    if (h) { h.position.set(1.5, 2.2, 0.3); u.body.add(h); u.held = h; }
}
function setTrail(g, id) {
    const u = g.userData;
    const d = trailById[id] || trailById.starter;
    if (!u.trail) u.trail = makeTrail(d.color);
    if (u.trailId !== d.id) {
        u.trailId = d.id;
        u.trail.setColor(d.color, d.rainbow);
        u.trail.width = d.id === 'starter' ? 0.5 : 0.8;
    }
}
// Admin commands: Giant / Tiny (size), Spin, Sparkles, Rainbow aura. Everyone sees them.
function applyFx(g, fx, dt) {
    const u = g.userData;
    const want = fx.includes('g') ? 1.7 : fx.includes('t') ? 0.55 : 1;
    u.fxScale += (want - u.fxScale) * Math.min(1, dt * 6);
    u.spinA = fx.includes('p') ? (u.spinA + dt * 10) % (Math.PI * 2) : 0;
    if ((fx.includes('s') || fx.includes('r')) && g.visible) auraFx(g.position, fx.includes('r'), dt);
}

// ----- Bloxity avatars: replace the blocky body's meshes, keep the pivot, tools and labels -----
function dressRig(group, avatar) {
    const u = group.userData, body = u.body;
    body.children.forEach((c) => { if (c !== u.held) c.visible = false; });
    body.add(avatar.root);
    u.blox = avatar;
}
let localAvatar = null, localAvatarReq = 0;
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !rig) { a.dispose(); return; }
    if (localAvatar) localAvatar.dispose();
    localAvatar = a;
    dressRig(rig, a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (localAvatar && av) { localAvatar.setProportions(av.proportions); localAvatar.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
async function playEmoteOn(avatar, id) {
    if (!avatar) return;
    const cat = await BX.loadEmotes();
    const e = cat.get(id);
    if (e && e.clip) avatar.playEmote(e.clip);
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubble) { group.remove(group.userData.bubble); group.userData.bubble.material.map.dispose(); }
    const b = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#5a1030', px: 44 }], 9, 1024, new V3(0, 10, 0), group);
    group.userData.bubble = b;
    setTimeout(() => { if (group.userData.bubble === b) { group.remove(b); b.material.map.dispose(); group.userData.bubble = null; } }, 5000);
}
const nameLines = (name, admin) => (admin ? [{ t: '🛡️ ADMIN', c: '#ffd028', s: '#3a2000', px: 40 }, { t: name || ' ', c: '#ffffff', s: '#5a1030', px: 60 }] : [{ t: name || ' ', c: '#ffffff', s: '#5a1030', px: 60 }]);

function buildPlayer(kit, skin) {
    if (rig) { scene.remove(rig); if (rig.userData.trail) rig.userData.trail.dispose(); }
    rig = buildCharacter(kit, skin);
    scene.add(rig);
    nameLabelText = '';
    headLabel = billboard(nameLines(S.name), 6.5, 512, new V3(0, 7.8, 0), rig);
    headLabel.material.depthTest = false; headLabel.renderOrder = 10;
    rig.position.copy(P.pos);
    localAvatar = null;
    setupLocalAvatar();
    if (!myPets) myPets = new PetTrain(scene);
}

// =====================================================================================
// Collision: boxes, plus round shapes (cream domes, berry tops, discs) with their own surface tests
// =====================================================================================
let nearBoxes = [], nearRound = [], nearTriggers = triggers, nearPrompts = prompts, nearZoneKey = '';
function refreshNear(stage) {
    const zs = new Set([stage - 1, stage, stage + 1]);
    const key = [...zs].join(',');
    if (key === nearZoneKey) return;
    nearZoneKey = key;
    const ok = (o) => o.zone === undefined || o.zone < 0 || zs.has(o.zone);
    const list = solids.filter(ok);
    nearBoxes = list.filter((s) => !s.shape);
    nearRound = list.filter((s) => s.shape);
    nearTriggers = triggers.filter(ok);
    nearPrompts = prompts.filter(ok);
    cullZones(stage);
}
const overlaps = (c, x, y, z) => !c.off && c.max.x > x - HW && c.min.x < x + HW && c.max.y > y && c.min.y < y + PH && c.max.z > z - HW && c.min.z < z + HW;
function freeAt(x, y, z) {
    for (const c of nearBoxes) if (overlaps(c, x, y, z)) return false;
    return true;
}
function moveAxis(axis, d) {
    if (d === 0) return;
    const p = P.pos;
    p[axis] += d;
    for (const c of nearBoxes) {
        if (!overlaps(c, p.x, p.y, p.z)) continue;
        if (axis === 'y') {
            if (d < 0) { p.y = c.max.y; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; }
            else { p.y = c.min.y - PH - 1e-4; if (P.vel.y > 0) P.vel.y = 0; }
        } else {
            const rise = c.max.y - p.y;
            if (rise > 0 && rise <= STEP && (P.onGround || P.vel.y <= 0) && !c.climb && freeAt(p.x, c.max.y + 0.01, p.z)) { p.y = c.max.y + 0.001; continue; }
            if (d > 0) p[axis] = c.min[axis] - HW - 1e-4; else p[axis] = c.max[axis] + HW + 1e-4;
        }
    }
}
// Top of a round shape under (x, z), for feet with a little footprint; null if not over it
function surfaceY(s, x, z) {
    const d = Math.hypot(x - s.cx, z - s.cz);
    if (s.shape === 'cyl') return d <= s.r + 0.55 ? s.max.y : null;
    const dd = Math.max(0, d - 0.9);
    if (dd >= s.r) return null;
    return s.y0 + s.h * (1 - 0.2 * (s.squish || 0)) * Math.sqrt(1 - (dd / s.r) ** 2);
}
function resolveRound() {
    const p = P.pos;
    for (const s of nearRound) {
        if (s.off) continue;
        if (p.x + HW < s.min.x || p.x - HW > s.max.x || p.z + HW < s.min.z || p.z - HW > s.max.z) continue;
        if (p.y > s.max.y + 0.01 || p.y + PH < s.min.y) continue;
        const top = surfaceY(s, p.x, p.z);
        if (top === null || p.y >= top - 0.001) continue;
        const pen = top - p.y;
        if (pen <= (s.shape === 'dome' ? 1.6 : STEP) || (P.vel.y <= 0 && pen < 2.2)) {
            p.y = top; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = s;
            continue;
        }
        if (P.vel.y > 0 && p.y + PH - P.vel.y * 0.02 <= s.min.y + 0.5) { p.y = s.min.y - PH - 0.01; P.vel.y = 0; continue; }
        // push out sideways
        const dx = p.x - s.cx, dz = p.z - s.cz, d = Math.hypot(dx, dz) || 0.001;
        let R = s.r + HW * 0.8;
        if (s.shape === 'dome') {
            const h = s.h * (1 - 0.2 * (s.squish || 0)), k = clamp((p.y - s.y0) / h, 0, 1);
            R = s.r * Math.sqrt(1 - k * k) + 0.95;
        }
        if (d < R) { p.x = s.cx + dx / d * R; p.z = s.cz + dz / d * R; }
    }
}
// Snap down onto ground just below (walking down domes, off a step)
function groundProbe(maxDrop) {
    const p = P.pos;
    let best = -Infinity, bs = null;
    for (const c of nearBoxes) {
        if (c.off || c.climb) continue;
        if (c.max.x <= p.x - HW || c.min.x >= p.x + HW || c.max.z <= p.z - HW || c.min.z >= p.z + HW) continue;
        if (c.max.y <= p.y + 0.01 && c.max.y >= p.y - maxDrop && c.max.y > best) { best = c.max.y; bs = c; }
    }
    for (const s of nearRound) {
        if (s.off) continue;
        const top = surfaceY(s, p.x, p.z);
        if (top !== null && top <= p.y + 0.01 && top >= p.y - maxDrop && top > best) { best = top; bs = s; }
    }
    if (bs) { p.y = best; P.onGround = true; P.ground = bs; P.vel.y = Math.max(0, P.vel.y); }
    return !!bs;
}
// Moving platforms that moved into the player lift them out (or push them aside)
function depenetrate() {
    const p = P.pos;
    for (const c of nearBoxes) {
        if (!c.mover || !overlaps(c, p.x, p.y, p.z)) continue;
        if (p.y >= c.max.y - 1.6) { p.y = c.max.y + 0.001; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.ground = c; continue; }
        const dxp = c.max.x - (p.x - HW), dxn = (p.x + HW) - c.min.x, dzp = c.max.z - (p.z - HW), dzn = (p.z + HW) - c.min.z;
        const m = Math.min(dxp, dxn, dzp, dzn);
        if (m === dxp) p.x += dxp; else if (m === dxn) p.x -= dxn; else if (m === dzp) p.z += dzp; else p.z -= dzn;
    }
}
function trussTouching() {
    const p = P.pos, e = 0.4;
    for (const c of nearBoxes) {
        if (!c.climb) continue;
        if (c.max.x > p.x - HW - e && c.min.x < p.x + HW + e && c.max.z > p.z - HW - e && c.min.z < p.z + HW + e && c.max.y > p.y + 0.2 && c.min.y < p.y + PH) return c;
    }
    return null;
}
const overlapsBox = (t, p) => t.max.x > p.x - HW && t.min.x < p.x + HW && t.max.y > p.y && t.min.y < p.y + PH && t.max.z > p.z - HW && t.min.z < p.z + HW;

// ----- gear stats -----
const tool = () => S.tool || '';
function walkSpeed() {
    let w = CFG.walk;
    if (tool() === 'speedCoil') w *= CFG.speedCoil;
    if (tool() === 'fusionCoil') w *= CFG.fusionCoil.walk;
    return qaWalk || w;
}
const gravity = () => CFG.grav * (tool() === 'gravityCoil' ? CFG.gravityCoil : tool() === 'fusionCoil' ? CFG.fusionCoil.grav : 1);
const jumpV = () => CFG.jumpV;

function teleport(pos, yaw, fx) {
    P.pos.copy(pos); P.vel.set(0, 0, 0); P.kv.set(0, 0, 0); if (P.hv) P.hv.set(0, 0, 0);
    P.facing = yaw || 0; cam.yaw = (yaw || 0) + Math.PI;
    P.climbing = null; P.peakY = pos.y; P.airTime = 0;
    if (rig && rig.userData.trail) rig.userData.trail.reset();
    P.stage = stageAt(pos.x, pos.y, pos.z);
    refreshNear(Math.max(-1, P.stage));
    for (const t of nearTriggers) t.inside = overlapsBox(t, pos);
    sendMove(true);
    if (fx) { teleportFx(); sfx('teleport'); }
}
function teleportLobby() {
    teleport(SPAWN, SPAWN_YAW, true);
    net.send('lobby');
    if (rig) { setShield(rig, CFG.spawnShield); sfx('shield'); }
}
// Down to the lobby is free; every teleport up the tower costs Wins (the server charges and then
// answers 'tpTo', which moves you)
actions.teleportLobby = () => { hideOops(); teleportLobby(); };
actions.teleportCheckpoint = () => {
    if (!checkpointSpot(S.stage)) { teleportLobby(); return; }
    actions.teleportTo(S.stage);
};
actions.teleportTo = (i) => {
    if (!checkpointSpot(i) || (i !== S.stage && i >= (S.maxStage || 0))) return;
    const price = tpPrice(i, i === S.stage);
    if ((S.wins || 0) < price) { notEnough({ need: price - (S.wins || 0), name: 'this teleport' }); sfx('denied'); return; }
    net.send('tp', { i });
};
// Sent home by a nuke: like a respawn in the reference, you come back at your own checkpoint
function respawnAtCheckpoint() {
    const spot = checkpointSpot(S.stage);
    if (spot) teleport(new V3(spot.x, spot.y, spot.z), spot.yaw, true); else teleportLobby();
}

// =====================================================================================
// Checkpoints, floating strawberries, the summit, gear pads, pet pads
// =====================================================================================
actions.checkpoint = (i) => net.send('cp', { i });
let summitLock = 0;
actions.summit = () => {
    if (clockT - summitLock < 4) return;
    summitLock = clockT;
    net.send('win');
};
actions.bonus = () => { if (bonusState.ready) net.send('bonus'); };
actions.gearPad = (id, fromPrompt) => {
    if (S.gear[id]) { if (fromPrompt) actions.equip(id); else showGearPop(id); return; }
    if (fromPrompt) buy('pass', passForGear(id)); else showGearPop(id);
};
// Equip (or put away) a gear; buy it first if you don't own it
actions.equip = (id) => {
    if (!S.gear[id]) { buy('pass', passForGear(id)); return; }
    const next = S.tool === id ? '' : id;
    S.tool = next;
    net.send('tool', { id: next });
    sfx('equip');
    renderHotbar(); refreshGearPads();
    if (next === 'carpet') toast('🌈 Rainbow Carpet: Space to rise, Shift to sink', '#ffd028');
    else if (next === 'trollGun') toast('🔫 Troll Gun: click a player to zap them!', '#2ae8d8');
    else if (next === 'speedCoil') toast('🌀 Speed Coil: zoom!', '#ff6a7a');
    else if (next === 'gravityCoil') toast('🪐 Gravity Coil: floaty jumps!', '#6aa8ff');
    else if (next === 'fusionCoil') toast('💫 Fusion Coil: fast and floaty!', '#c45aff');
};
actions.petPad = (id) => {
    const def = petById[id];
    if (!def) return;
    if (!S.pets[id]) { buy('pet', id); return; }
    const on = !(S.equippedPets || []).includes(id);
    net.send('petEquip', { id, on });
    sfx('equip');
};
actions.adminFx = (id) => {
    if (!S.passes.Admin) { buy('pass', 'Admin'); return; }
    let fx = S.fx || '';
    fx = fx.includes(id) ? fx.replace(id, '') : fx + id;
    if (id === 'g') fx = fx.replace('t', '');
    if (id === 't') fx = fx.replace('g', '');
    S.fx = cleanFx(fx);
    net.send('fx', { fx: S.fx });
    sfx('admin');
};
actions.adminFireworks = () => {
    if (!S.passes.Admin) { buy('pass', 'Admin'); return; }
    net.send('fireworks');
};
let showOther = true;
try { showOther = localStorage.getItem('stw_pets') !== '0'; } catch (e) { /* default */ }
actions.showOtherPets = () => showOther;
actions.toggleOtherPets = () => { showOther = !showOther; try { localStorage.setItem('stw_pets', showOther ? '1' : '0'); } catch (e) { /* ignore */ } };

function checkCoins() {
    const p = P.pos;
    for (const c of COINS) {
        if (coinState.collected.has(c.i)) continue;
        const dx = c.x - p.x, dy = c.y - (p.y + 2.5), dz = c.z - p.z;
        if (dx * dx + dy * dy + dz * dz < 4.2 * 4.2) {
            coinState.collected.add(c.i);
            coinBurst(new V3(c.x, c.y, c.z));
            sfx('coin');
            net.send('coin', { i: c.i });
        }
    }
}

// =====================================================================================
// Friend Boost
// =====================================================================================
let friendNames = [], friendsT = 3, friendSyncT = 5;
async function refreshFriends() {
    if (!BX.bloxity.ready || !BX.identity().loggedIn) return;
    const list = await BX.getFriends();
    friendNames = list.map((f) => f.displayName || f.username).filter(Boolean);
    syncFriends();
}
function syncFriends() {
    const room = net.room;
    if (!room || !room.state || !room.state.players || !friendNames.length) return;
    const here = [];
    room.state.players.forEach((p, id) => { if (id !== room.sessionId && friendNames.includes(p.name)) here.push(p.name); });
    net.send('friends', { names: here });
}

// =====================================================================================
// Other players
// =====================================================================================
const remotes = new Map();
let joinSynced = false;
const KIT_COLORS = ['#ff7ab0', '#3ac8ff', '#6aff5a', '#ffd028', '#c45aff', '#ff8a3a'];
class Remote {
    constructor(p) {
        this.rig = buildCharacter(p.kit, p.skin);
        this.rig.position.set(p.x, p.y, p.z);
        this.rig.rotation.y = p.ry;
        scene.add(this.rig);
        this.label = billboard(nameLines(p.name, p.admin), 6, 512, new V3(0, 7.8, 0), this.rig);
        this.labelKey = p.name + '|' + p.admin;
        this.av = null; this.blox = null; this.dead = false; this.phase = 0; this.vel = 0;
        this.lastX = p.x; this.lastZ = p.z; this.stepN = 0; this.swing = 0;
        this.pets = new PetTrain(scene); this.petKey = '';
        this.setAvatar(p.av);
        if (Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 14 && p.y < 4) setShield(this.rig, CFG.spawnShield);
    }
    setAvatar(av) {
        this.av = av;
        const data = av ? unpackAvatar(av) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        createAvatar(data).then((a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.blox = a;
            dressRig(this.rig, a);
            if (this.av !== av) this.setAvatar(this.av);
        });
    }
    update(p, dt, t) {
        const r = this.rig, u = r.userData;
        const k = 1 - Math.exp(-dt * 12);
        const far = (r.position.x - p.x) ** 2 + (r.position.z - p.z) ** 2 + (r.position.y - p.y) ** 2 > 900;
        if (far) {
            r.position.set(p.x, p.y, p.z); if (u.trail) u.trail.reset();
            // jumped back to the spawn: the forcefield bubble, like ours
            if (Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 14 && p.y < 4) setShield(r, CFG.spawnShield);
        } else { r.position.x += (p.x - r.position.x) * k; r.position.y += (p.y - r.position.y) * k; r.position.z += (p.z - r.position.z) * k; }
        r.rotation.y = lerpAngle(r.rotation.y, p.ry, k);
        if (p.av !== this.av) this.setAvatar(p.av);
        const moved = Math.hypot(r.position.x - this.lastX, r.position.z - this.lastZ);
        this.vel += ((dt > 0 ? moved / dt : 0) - this.vel) * Math.min(1, dt * 6);
        this.lastX = r.position.x; this.lastZ = r.position.z;
        const air = p.anim === 2, climb = p.anim === 3, fly = p.anim === 4;
        const moving = p.anim === 1 && this.vel > 1;
        this.phase += dt * (moving ? Math.min(18, 4 + this.vel * 0.3) : climb ? 9 : 0);
        if (climb) climbPose(u.body, this.phase); else if (air) airPose(u.body); else if (moving) animRig(u.body, this.phase, 0.85); else animRig(u.body, 0, 0);
        if (u.tool && u.held && !climb) holdPose(u.body);
        if (this.swing > 0) { this.swing -= dt; u.body.userData.arms[1].rotation.set(-1.6 - Math.sin((1 - this.swing / 0.3) * Math.PI) * 0.5, 0, 0); }
        if (this.blox) this.blox.update(dt, { moving, air: air || fly, speed: this.vel, t, pose: climb ? 'climb' : undefined });
        // their footsteps make sounds too when close by
        const stepN = Math.floor(this.phase / Math.PI);
        if (moving && stepN !== this.stepN && camera.position.distanceToSquared(r.position) < 900) {
            const s = groundUnder(r.position);
            if (s) stepQuiet(s.mat);
        }
        this.stepN = stepN;
        // a Bloxity avatar bobs and leans by itself (animator.js); this is for the blocky stand-in
        const own = !this.blox;
        u.pivot.position.y = PIVOT + (moving && own ? Math.abs(Math.sin(this.phase)) * 0.16 : 0);
        this.lean = (this.lean || 0) + ((moving && own ? 0.13 : fly ? 0.2 : 0) - (this.lean || 0)) * Math.min(1, dt * 8);
        applyFx(r, p.fx || '', dt);
        u.pivot.rotation.set(this.lean, u.spinA, 0);
        r.scale.setScalar(u.fxScale);
        setTool(r, p.tool); setTrail(r, p.trail);
        if (u.carpet) { u.carpet.visible = fly; if (fly) waveCarpet(u.carpet, t, 1); }
        u.trail.update(trailAt(r), (moving || air || fly) && r.visible, dt, t);
        tickShield(r, dt);
        const key = p.name + '|' + p.admin;
        if (key !== this.labelKey) { this.labelKey = key; this.label.userData.set(nameLines(p.name, p.admin)); }
        if (p.pets !== this.petKey) { this.petKey = p.pets; this.pets.set(String(p.pets || '').split(',').map((id) => petById[id]).filter(Boolean)); }
        this.pets.update(r.position, r.rotation.y, dt, t, showOther && r.visible);
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        if (this.rig.userData.trail) this.rig.userData.trail.dispose();
        this.pets.dispose();
        scene.remove(this.rig);
    }
}
const trailTmp = new V3();
function trailAt(r) { return trailTmp.set(r.position.x - Math.sin(r.rotation.y) * 0.9, r.position.y + 2.4, r.position.z - Math.cos(r.rotation.y) * 0.9); }
// The solid right under a position (for other players' footstep sounds)
function groundUnder(pos) {
    for (const c of nearBoxes) if (!c.off && pos.x > c.min.x && pos.x < c.max.x && pos.z > c.min.z && pos.z < c.max.z && Math.abs(c.max.y - pos.y) < 0.6) return c;
    for (const s of nearRound) { const top = surfaceY(s, pos.x, pos.z); if (top !== null && Math.abs(top - pos.y) < 0.8) return s; }
    return null;
}
let quietT = 0;
function stepQuiet(m) { if (clockT - quietT < 0.06) return; quietT = clockT; surfStep(surfaceSound(m), false); }

function syncRemotes(dt, t) {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return [];
    const seen = new Set(), marks = [];
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            S.name = p.name; S.friends = p.friends;
            if (!rig || rig.userData.kit !== p.kit) { buildPlayer(p.kit, p.skin); rig.userData.kit = p.kit; setShield(rig, CFG.spawnShield); }
            return;
        }
        seen.add(id);
        let r = remotes.get(id);
        if (!r) {
            r = new Remote(p); remotes.set(id, r);
            if (joinSynced) BX.playerJoined(p.name); else BX.playerInRoom(p.name);
        }
        r.update(p, dt, t);
        marks.push({ id, name: p.name, k: clamp(p.y / COURSE_TOP, 0, 1), color: KIT_COLORS[p.kit % KIT_COLORS.length] });
    });
    for (const [id, r] of remotes) if (!seen.has(id)) { r.dispose(); remotes.delete(id); }
    joinSynced = true;
    return marks;
}

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:2611` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) $('#loading').textContent = 'Waking up a server…';
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        $('#loading').textContent = 'Waking up a server…';
        const until = Date.now() + 60000;
        while (Date.now() < until) {
            await new Promise((res) => setTimeout(res, 2000));
            if (await serverUp(url)) break;
        }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    const now = performance.now();
    if (!force && now - lastMoveSent < 66) return;
    const a = P.flying ? 4 : P.climbing ? 3 : !P.onGround ? 2 : P.moving ? 1 : 0;
    const m = { x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), ry: +P.facing.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    net.send('move', m);
}

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function playerUid() {
    let uid = storageGet('stw_uid');
    if (!uid) {
        uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
        storageSet('stw_uid', uid);
    }
    return uid;
}

let lastCoins = null, lastStage = -2;
async function connect(name, endpoint) {
    const client = new Client(endpoint || await serverEndpoint());
    const id = BX.identity();
    const room = await client.joinOrCreate('tower', {
        uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()),
        save: storageGet('stw_save') || '',
    });
    net.room = room;
    joinSynced = false;
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); net.bloxity = !!m.bloxity; });
    room.onMessage('authed', () => { net.bloxity = true; });
    room.onMessage('emote', (m) => { const r = remotes.get(m.s); if (r) playEmoteOn(r.blox, m.id); });
    room.onMessage('chat', (m) => {
        toast(m.name + ': ' + m.text, '#ffffff');
        chatBubble(m.s === room.sessionId ? rig : remotes.get(m.s) && remotes.get(m.s).rig, m.text);
    });
    BX.updateRoom(room.roomId);
    BX.gameplayStart();
    room.onMessage('profile', (m) => {
        if (m.save) storageSet('stw_save', m.save);
        delete m.save;
        const first = lastCoins === null;
        Object.assign(S, m);
        S.profileAt = Date.now();
        if (!first && S.wins > lastCoins) bumpCoins();
        lastCoins = S.wins;
        if (S.stage !== lastStage) {
            for (let i = 0; i < CHECKPOINTS.length; i++) lightCheckpoint(i, i <= S.stage);
            if (lastStage === -2 && S.stage >= 0) setTimeout(() => showOops('Continue from Stage ' + (S.stage + 2) + ' for ' + fmt(tpPrice(S.stage, true)) + ' Wins, or climb from the bottom.', 'Welcome back!'), 2500);
            lastStage = S.stage;
        }
        refreshGearPads(); refreshPetPads();
        renderHotbar();
        refreshModal(); refreshDaily();
        openDailyOnJoin();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('announce', (m) => toast(m.text, m.color));
    room.onMessage('earn', (m) => {
        floatText('+' + fmt(m.n) + ' 🏆', '#ffd028', P.pos.clone().add(new V3(0, 6.5, 0)), 4.4);
        if (m.why === 'cp') {
            // Stage clear: a celebration, then the next (harder) stage's title
            showStageClear(m.i, m.n);
            sfx('checkpoint'); rumble(0.4, 180);
            sparkleColumn(P.pos, 0xff7ab0);
            ring(P.pos, 0xff7ab0, 9, 0.7);
            confetti(P.pos);
            setTimeout(() => showStageTitle(Math.min(STAGES.length - 1, m.i + 1)), 1900);
        } else if (m.why === 'bonus') {
            sfx('bonus'); sparkleColumn(P.pos, 0xffd028); coinBurst(P.pos.clone().add(new V3(0, 3, 0)));
            toast('⭐ Secret Strawberry! +' + fmt(m.n) + ' Wins', '#ffd028');
        }
    });
    room.onMessage('broke', (m) => { notEnough(m); sfx('denied'); });
    room.onMessage('won', (m) => {
        showWin(m);
        sfx('win'); rumble(0.8, 600);
        fireworks(P.pos, 12, () => sfx('firework'));
        sparkleColumn(P.pos, 0xffd028);
        coinState.collected.clear();
        setTimeout(() => { if (P.pos.y > SUMMIT.y - 5) teleportLobby(); }, 4200);
    });
    room.onMessage('tpTo', (m) => {
        const spot = checkpointSpot(m.i);
        if (!spot) return;
        hideOops();
        teleport(new V3(spot.x, spot.y, spot.z), spot.yaw, true);
        showStageTitle(Math.min(STAGES.length - 1, m.i + 1));
    });
    room.onMessage('skipTo', (m) => {
        const spot = checkpointSpot(m.i);
        if (spot) { teleport(new V3(spot.x, spot.y, spot.z), spot.yaw, true); showStageTitle(Math.min(STAGES.length - 1, m.i + 1)); }
    });
    room.onMessage('codeResult', (m) => codeResult(m));
    room.onMessage('boards', renderBoards);
    room.onMessage('fx', (m) => {
        sparkleColumn(P.pos, m.kind === 'unlock' ? 0xff7ab0 : 0xffd028);
        ring(P.pos, 0xffd028, 10, 0.8);
        confetti(P.pos);
        sfx('buy');
    });
    // Admin fireworks: someone set off a show where they stand
    room.onMessage('fireworks', (m) => {
        const pos = m.s === room.sessionId ? P.pos : remotes.get(m.s) && remotes.get(m.s).rig.position;
        if (pos) fireworks(pos, 10, () => { if (camera.position.distanceTo(pos) < 160) sfx('firework'); });
    });
    // Nuked by someone: a blinding flash, flung into the air, then down to the lobby
    room.onMessage('nuke', (m) => {
        flash('#fff6d0', 1400); nukeFx(P.pos); sfx('nuke'); addShake(1.2); rumble(1, 900);
        P.vel.y = 70; P.kv.set((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60); P.onGround = false; P.climbing = null;
        toast('☢️ ' + m.by + ' nuked everyone!', '#ffd028');
        setTimeout(respawnAtCheckpoint, 1300);
    });
    room.onMessage('nukeSent', () => { flash('#fff6d0', 900); sfx('nuke'); addShake(0.6); });
    // Zapped by a Troll Gun: flung up and away
    room.onMessage('zapped', (m) => {
        P.kv.set(m.dx * CFG.trollForce, 0, m.dz * CFG.trollForce);
        P.vel.y = 46; P.onGround = false; P.climbing = null;
        flash('#a8fff4', 350); sfx('zapped'); addShake(0.6); rumble(0.7, 250);
        toast('🔫 ' + m.by + ' trolled you!', '#2ae8d8');
    });
    room.onMessage('zapFx', (m) => {
        if (m.s === room.sessionId) return;
        const r = remotes.get(m.s); if (r) r.swing = 0.3;
        const tgt = m.t === room.sessionId ? rig : remotes.get(m.t) && remotes.get(m.t).rig;
        if (r && tgt) {
            zapFx(r.rig.localToWorld(new V3(1.5, 2.4, 2.4)), tgt.position.clone().add(new V3(0, 2.5, 0)));
            if (camera.position.distanceTo(r.rig.position) < 70) sfx('zap');
        }
    });
    room.onLeave((code, reason) => {
        console.warn('[net] left room', code, reason || '');
        net.room = null;
        if (code !== 1000) $('#offline').hidden = false;
    });
    return room;
}

// =====================================================================================
// Camera & input
// =====================================================================================
const cam = { yaw: SPAWN_YAW + Math.PI, pitch: 0.3, dist: 22, target: new V3() };
let camSens = 1;
const keys = {};
const touchMove = { x: 0, y: 0 };
let touchJump = false, touchDown = false, running = false;

function pressJump() { P.jumpPress = clockT; }
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' && !e.repeat && running) pressJump();
    keys[e.code] = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code === 'KeyE' && running) { if (activePrompt) usePrompt(); else useTool(true); }
    if (running && /^Digit[1-9]$/.test(e.code)) { const g = hotbarGear()[+e.code.slice(5) - 1]; if (g) actions.equip(g.id); }
    if (e.code === 'Escape') {
        if (closeTop()) return;
        if (running && BX.isEmbedded()) BX.showPortalMenu();
    }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const drags = new Map();
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() }); canvas.focus(); });
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    const k = (e.pointerType === 'touch' ? 0.008 : 0.005) * camSens;
    cam.yaw -= (e.clientX - d.x) * k;
    cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * k, -0.6, 1.35);
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => {
    const d = drags.get(e.pointerId);
    drags.delete(e.pointerId);
    // A tap / click without dragging uses the tool at that spot
    if (d && e.type === 'pointerup' && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 7 && performance.now() - d.t0 < 350 && running) useTool(false, e.clientX, e.clientY);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 2.5, 6, 70); e.preventDefault(); }, { passive: false });

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
(function joystick() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null;
    const set = (e) => {
        const r = stick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, l = Math.hypot(dx, dy);
        if (l > max) { dx *= max / l; dy *= max / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        touchMove.x = dx / max; touchMove.y = dy / max;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const hold = (el, on, off) => {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
        el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    hold($('#jumpBtn'), () => { touchJump = true; pressJump(); }, () => { touchJump = false; });
    hold($('#downBtn'), () => { touchDown = true; }, () => { touchDown = false; });
    $('#useBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); useTool(true); });
})();

// Ray against the boxes (and optionally round shapes' boxes) near the player (camera collision)
function rayHit(o, d, maxT, opts) {
    let best = maxT;
    const test = (c) => {
        let t0 = 0, t1 = best;
        for (const a of ['x', 'y', 'z']) {
            if (Math.abs(d[a]) < 1e-9) { if (o[a] < c.min[a] || o[a] > c.max[a]) return; continue; }
            let ta = (c.min[a] - o[a]) / d[a], tb = (c.max[a] - o[a]) / d[a];
            if (ta > tb) { const q = ta; ta = tb; tb = q; }
            t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
            if (t0 > t1) return;
        }
        if (t0 > 0 && t0 < best) best = t0;
    };
    for (const c of nearBoxes) {
        if (c.off || c.mover || (c.mat === 'glass' && !(opts && opts.glass))) continue;
        test(c);
    }
    if (opts && opts.floor) {
        // the island floor (a flat disc at y = 0)
        if (d.y < -1e-6 && o.y > 0) { const t = -o.y / d.y; if (t > 0 && t < best && Math.hypot(o.x + d.x * t, o.z + d.z * t) < 110) best = t; }
    }
    return best;
}

// ----- the Troll Gun: click a player to zap them away -----
const ray = new T.Raycaster(), ndc = new T.Vector2();
function useTool(center, sx, sy) {
    if (tool() !== 'trollGun' || !rig) return;
    if (clockT - P.lastZap < CFG.trollCooldown) return;
    P.lastZap = clockT;
    const x = center || sx === undefined ? innerWidth / 2 : sx, y = center || sy === undefined ? innerHeight / 2 : sy;
    ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = null, bd = Infinity;
    const c = new V3();
    for (const [rid, r] of remotes) {
        c.copy(r.rig.position).setY(r.rig.position.y + 2.5);
        if (c.clone().sub(ray.ray.origin).dot(ray.ray.direction) < 0) continue;
        const range = c.distanceTo(P.pos);
        if (range > CFG.trollRange) continue;
        const miss = ray.ray.distanceToPoint(c);
        if (miss < 2.8 + range * 0.035 && miss < bd) { bd = miss; best = rid; }
    }
    P.swing = 0.3;
    sfx('zap');
    const from = rig.localToWorld(new V3(1.5, 2.4, 2.4));
    if (best) {
        const tr = remotes.get(best).rig;
        zapFx(from, tr.position.clone().add(new V3(0, 2.5, 0)));
        net.send('troll', { t: best });
    } else zapFx(from, ray.ray.at(45, new V3()));
}

const camDir = new V3(), camGoal = new V3(), camPos = new V3();
let baseFov = camera.fov;
function updateCamera(dt) {
    const t = performance.now() / 1000;
    cam.target.lerp(camGoal.set(P.pos.x, P.pos.y + 5 * (rig ? rig.userData.fxScale : 1), P.pos.z), 1 - Math.exp(-dt * 16));
    const cp = Math.cos(cam.pitch);
    camDir.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    const dist = Math.max(2.5, rayHit(cam.target, camDir, cam.dist, { glass: true, floor: true }) - 0.8);
    camPos.copy(cam.target).addScaledVector(camDir, dist);
    camera.position.copy(camPos);
    camera.lookAt(cam.target);
    if (shake > 0.001) {
        const s = shake * shake * 0.9;
        camera.position.x += (Math.random() * 2 - 1) * s;
        camera.position.y += (Math.random() * 2 - 1) * s;
        shake = Math.max(0, shake - dt * 2.2);
    }
    const fovBase = innerWidth < innerHeight ? 85 : 70;
    const fast = tool() === 'speedCoil' || tool() === 'fusionCoil';
    const want = fovBase + (P.flying && P.moving ? 5 : 0) + (fast && P.moving ? 4 : 0);
    baseFov += (want - baseFov) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - baseFov) > 0.01) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    sun.position.copy(P.pos).addScaledVector(SUN_DIRECTION, 160);
    sun.target.position.copy(P.pos);
    updateSky(camera.position, t);
    const st = STAGES[Math.max(0, P.stage)];
    updateAmbient(camera.position, t, P.stage < 0 ? 0xffb8d8 : st.accent);
}

// Proximity prompts
let activePrompt = null;
const projV = new V3();
function updatePrompt() {
    let best = null, bd = Infinity;
    for (const p of nearPrompts) {
        const d = p.pos.distanceTo(P.pos);
        if (d < p.r && d < bd) { bd = d; best = p; }
    }
    activePrompt = best;
    if (!best || anyPopup()) { promptEl.hidden = true; return; }
    projV.copy(best.pos).setY(best.pos.y + 2).project(camera);
    if (projV.z > 1) { promptEl.hidden = true; return; }
    promptEl.hidden = false;
    promptEl.style.left = ((projV.x + 1) / 2 * innerWidth) + 'px';
    promptEl.style.top = ((1 - projV.y) / 2 * innerHeight) + 'px';
    const txt = best.label();
    if (promptTxtEl.textContent !== txt) promptTxtEl.textContent = txt;
}
function usePrompt() { if (activePrompt) activePrompt.act(); }
promptEl.addEventListener('click', usePrompt);

// Controller: popups first, then gameplay
let padJumpWas = false;
function padButtons() {
    if (pad.jump && !padJumpWas && running) pressJump();
    padJumpWas = pad.jump;
    const p = pad.pressed;
    if (!p.size) return;
    if (p.has('B') && closeTop()) return;
    if (!running) return;
    if (p.has('X')) { if (activePrompt) usePrompt(); else useTool(true); }
    if (p.has('Y')) openModal('store');
    if (p.has('LB') || p.has('RB')) {
        const list = hotbarGear();
        if (list.length) {
            const i = list.findIndex((g) => g.id === S.tool);
            const n = list[((i < 0 ? (p.has('RB') ? -1 : 0) : i) + (p.has('RB') ? 1 : -1) + list.length) % list.length];
            actions.equip(n.id);
        }
    }
    if (p.has('BACK')) openModal('teleport');
    if (p.has('START')) openModal('config');
    if (p.has('UP')) cam.dist = clamp(cam.dist - 4, 6, 70);
    if (p.has('DOWN')) cam.dist = clamp(cam.dist + 4, 6, 70);
}
onGamepadConnection((g, on) => { if (running) toast(on ? '🎮 Controller connected' : '🎮 Controller disconnected', on ? '#7dff6b' : '#ffb51c'); });

// =====================================================================================
// Main update
// =====================================================================================
const botInput = { f: 0, r: 0, jump: false, down: false };
let qaWalk = 0;
let clockT = 0, hudT = 0, progT = 0;
const tmpF = new V3(), tmpR = new V3(), mv = new V3();
// Sounds per surface (solids carry a material tag)
function surfaceSound(m) {
    return { stud: 'stud', wall: 'stud', plate: 'plate', berry: 'berry', cake: 'cake', cream: 'cream', milk: 'milk', icing: 'icing', jelly: 'jelly', truss: 'truss', bounce: 'bounce', glass: 'tile' }[m] || 'stud';
}
const SPLASH = { berry: 0xff3a5a, milk: 0xffb6d2, cream: 0xfff4f8, jelly: 0xff6ab0, icing: 0xff8ad0, cake: 0xffe2a0, bounce: 0xff7ab0 };
function footStep(g) {
    const m = g.mat;
    surfStep(surfaceSound(m), false);
    if (m === 'milk' && Math.random() < 0.6) splash(new V3(P.pos.x, P.pos.y, P.pos.z), 0xffb6d2, 3, 0.6);
    else if (m === 'berry' && Math.random() < 0.25) splash(P.pos, 0xff3a5a, 2, 0.4);
}
function land(g, hard) {
    const m = g.mat;
    surfStep(surfaceSound(m), true);
    if (SPLASH[m]) splash(P.pos, SPLASH[m], hard ? 14 : 7, hard ? 1.2 : 0.8);
    else dust(P.pos, hard ? 10 : 5, hard ? 1.3 : 0.9);
    if (hard) ring(P.pos, 0xffffff, 4, 0.35);
    P.squashV -= hard ? 8 : 4;
}

function update(dt) {
    clockT += dt;
    const t = clockT;
    let f = botInput.f, r = botInput.r;
    if (keys.KeyW || keys.ArrowUp) f += 1;
    if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD || keys.ArrowRight) r += 1;
    if (keys.KeyA || keys.ArrowLeft) r -= 1;
    f -= touchMove.y + pad.ly; r += touchMove.x + pad.lx;
    cam.yaw -= pad.rx * 2.8 * dt;
    cam.pitch = clamp(cam.pitch + pad.ry * 1.8 * dt, -0.6, 1.35);
    tmpF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    tmpR.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    mv.set(0, 0, 0).addScaledVector(tmpF, f).addScaledVector(tmpR, r);
    if (mv.lengthSq() > 1) mv.normalize();
    if (anyPopup() && !isTouch) mv.set(0, 0, 0);
    P.moving = mv.lengthSq() > 0.01;
    const jumpHeld = keys.Space || touchJump || pad.jump || botInput.jump;
    const downHeld = keys.ShiftLeft || keys.ShiftRight || keys.KeyQ || keys.KeyC || touchDown || pad.sprint || botInput.down;

    // The world moves first, so riders are carried and hits line up
    updateWorld(dt, t, P.stage);

    const id = tool();
    P.flying = id === 'carpet';
    const ws = P.flying ? CFG.carpetSpeed : walkSpeed();
    const g = gravity();
    // Carried by moving platforms and spinning berry slices
    if (P.onGround && P.ground) {
        if (P.ground.mover) P.pos.add(P.ground.delta);
        if (P.ground.spin) {
            const a = -P.ground.spin * dt, dx = P.pos.x - P.ground.cx, dz = P.pos.z - P.ground.cz;
            const c = Math.cos(a), s = Math.sin(a);
            P.pos.x = P.ground.cx + dx * c + dz * s; P.pos.z = P.ground.cz - dx * s + dz * c;
            P.facing += a; cam.yaw += a;
        }
    }
    depenetrate();

    // ----- vertical: jump, climb, fly -----
    const truss = !P.flying ? trussTouching() : null;
    if (truss) {
        // pushing toward the truss (or hanging on it already): climb
        const cx = clamp(P.pos.x, truss.min.x, truss.max.x) - P.pos.x, cz = clamp(P.pos.z, truss.min.z, truss.max.z) - P.pos.z;
        const l = Math.hypot(cx, cz) || 1;
        const into = mv.lengthSq() > 0.01 ? (mv.x * cx + mv.z * cz) / l / Math.sqrt(mv.lengthSq()) : 0;
        if (into > 0.25 || (P.climbing && into > -0.4 && !P.onGround)) {
            if (!P.climbing) P.climbT = 0;
            P.climbing = truss;
        } else P.climbing = null;
    } else P.climbing = null;
    const pressed = t - P.jumpPress < 0.2;
    if (P.onGround) P.coyote = 0.1; else P.coyote -= dt;
    if (P.flying) {
        const vy = jumpHeld ? CFG.carpetSpeed * 0.75 : downHeld ? -CFG.carpetSpeed * 0.75 : 0;
        P.vel.y += (vy - P.vel.y) * Math.min(1, dt * 6);
    } else if (P.climbing) {
        P.climbT += dt;
        P.vel.y = P.moving ? CFG.climb : 0;
        if (pressed) { P.vel.y = jumpV() * 0.85; P.climbing = null; P.jumpPress = -9; sfx('jump'); }
    } else {
        if (pressed && (P.onGround || P.coyote > 0)) {
            P.vel.y = jumpV(); P.onGround = false; P.coyote = 0; P.jumpPress = -9; P.ground = null;
            sfx('jump'); P.squashV += 5;
        }
        P.vel.y -= g * dt;
    }
    loopSound('carpet', P.flying ? (P.moving || Math.abs(P.vel.y) > 1 ? 1 : 0.6) : 0);

    // ----- horizontal: instant on most things, slippery on icing, knockback on top -----
    const tx = mv.x * ws, tz = mv.z * ws;
    const ice = P.ground && P.ground.ice;
    if (!P.hv) P.hv = new V3();
    if (ice || (P.onIce && !P.onGround)) {
        const k = 1 - Math.exp(-dt * (P.onGround ? 3.6 : 2.6));
        P.hv.x += (tx - P.hv.x) * k; P.hv.z += (tz - P.hv.z) * k;
    } else P.hv.set(tx, 0, tz);
    if (P.onGround) P.onIce = !!ice;
    let vx = P.hv.x + P.kv.x, vz = P.hv.z + P.kv.z;
    P.kv.multiplyScalar(Math.exp(-dt * (P.onGround ? 9 : 1.6)));
    // strawberry milk is thick: you wade through it
    if (P.onGround && P.ground && P.ground.slime) { vx *= 0.88; vz *= 0.88; }

    const dist = Math.max(Math.abs(vx), Math.abs(vz), Math.abs(P.vel.y)) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.5));
    const sdt = dt / n;
    const wasGround = P.ground, wasOn = P.onGround;
    P.onGround = false; P.ground = null;
    let vy = P.flying || P.climbing ? P.vel.y : P.vel.y + 0.5 * g * dt;
    for (let i = 0; i < n; i++) {
        moveAxis('x', vx * sdt);
        moveAxis('z', vz * sdt);
        const before = P.vel.y;
        moveAxis('y', vy * sdt);
        if (P.vel.y !== before) vy = P.vel.y;
        resolveRound();
    }
    if (!P.onGround && wasOn && P.vel.y <= 0 && !P.flying && !P.climbing && !(wasGround && wasGround.bounce)) groundProbe(0.7);
    else if (!P.onGround && P.vel.y <= 0 && !P.flying && !P.climbing) groundProbe(0.05);
    islandClamp(P.pos);

    // ----- landing, bouncing, surfaces -----
    if (P.onGround) {
        const gr = P.ground;
        if (gr && gr.bounce && !P.flying) {
            P.vel.y = gr.bounce; P.onGround = false; P.ground = null;
            surfStep('bounce', true);
            jiggle(gr);
            splash(P.pos, 0xfff4f8, 12, 1.2);
            addShake(0.2); P.squashV -= 6; P.airTime = 0.01; P.peakY = P.pos.y;
        } else {
            if (P.airTime > 0.25 && gr) land(gr, P.airTime > 0.8);
            // a long fall: down to the lobby, or well below your checkpoint
            const fell = P.peakY - P.pos.y;
            if (fell > 26 && !P.flying) {
                sfx('oops'); addShake(0.6); rumble(0.6, 250); showOof();
                net.send('fell');
                const cp = CHECKPOINTS[S.stage];
                if (S.stage >= 0 && cp && P.pos.y < cp.y - 8) showOops();
            }
            P.airTime = 0; P.peakY = P.pos.y;
        }
    } else {
        P.airTime += dt;
        P.peakY = Math.max(P.peakY, P.pos.y);
        if (P.flying || P.climbing) P.peakY = P.pos.y;
    }
    if (P.flying || P.climbing) { P.airTime = 0; }
    // cream puff squish, melting jelly
    const gr = P.onGround ? P.ground : null;
    if (gr && gr.shape === 'dome') pressDome(gr);
    if (gr && gr.vanish) touchVanish(gr);

    // facing
    if (P.moving && mv.lengthSq() > 0.01 && !P.climbing) P.facing = lerpAngle(P.facing, Math.atan2(mv.x, mv.z), 1 - Math.exp(-dt * 14));
    else if (P.climbing) {
        const c = P.climbing, cx = clamp(P.pos.x, c.min.x, c.max.x) - P.pos.x, cz = clamp(P.pos.z, c.min.z, c.max.z) - P.pos.z;
        if (Math.hypot(cx, cz) > 0.01) P.facing = lerpAngle(P.facing, Math.atan2(cx, cz), 1 - Math.exp(-dt * 10));
    }

    // ----- where you are -----
    const here = stageAt(P.pos.x, P.pos.y, P.pos.z);
    if (here !== P.stage) {
        if (here > P.stage && here >= 0 && P.onGround && here > (S.stage ?? -1)) showStageTitle(here);
        P.stage = here;
        refreshNear(Math.max(-1, here));
    }
    // safety net: fell off the island (or out of the world): back to the spawn
    if (P.pos.y < -40 || Math.abs(P.pos.x) > 260 || Math.abs(P.pos.z) > 260) {
        teleportLobby(); sfx('oops'); showOof();
        if (S.stage >= 0) showOops();
    }
    // sweeping candy sticks knock you off
    const st = net.now() / 1000;
    for (const w of sweepers) {
        if (Math.abs(w.zone - P.stage) > 1 || t - P.sweepHit < 0.5) continue;
        if (P.pos.y > w.y + 0.6 || P.pos.y + PH < w.y - 0.6) continue;
        const a = sweeperAngle(w, st), dx = Math.cos(a), dz = Math.sin(a);
        const px = P.pos.x - w.cx, pz = P.pos.z - w.cz;
        const proj = clamp(px * dx + pz * dz, -w.len, w.len);
        const ex = px - dx * proj, ez = pz - dz * proj;
        if (Math.hypot(ex, ez) < 0.6 + HW * 0.9) {
            P.sweepHit = t;
            const sgn = Math.sign(proj * w.speed) || 1;
            P.kv.set(-dz * sgn * 34 + ex * 6, 0, dx * sgn * 34 + ez * 6);
            P.vel.y = 24; P.onGround = false;
            surfStep('jelly', true); sfx('slapped'); addShake(0.4);
        }
    }
    // triggers (checkpoints, summit, gear pads, the secret strawberry)
    for (const tr of nearTriggers) {
        const inside = overlapsBox(tr, P.pos);
        if (inside && !tr.inside && tr.enter) tr.enter();
        tr.inside = inside;
    }
    checkCoins();
    bonusState.ready = net.now() - (S.bonusAt || 0) > CFG.bonusMinutes * 60000;

    if (S.name && headLabel) {
        const key = S.name + '|' + !!S.passes.Admin;
        if (key !== nameLabelText) { nameLabelText = key; headLabel.userData.set(nameLines(S.name, S.passes.Admin)); }
    }
    updateEffects(dt);
    updateFx(dt);
    for (const fn of tickers) fn(dt, t);

    const marks = syncRemotes(dt, t);
    friendsT -= dt; friendSyncT -= dt;
    if (friendsT <= 0) { friendsT = 30; friendSyncT = 5; refreshFriends(); }
    else if (friendSyncT <= 0) { friendSyncT = 5; syncFriends(); }

    // ----- the local character -----
    if (rig) {
        const u = rig.userData;
        rig.position.copy(P.pos);
        rig.rotation.y = P.facing;
        const hs = P.moving ? ws : 0;
        P.animPhase += dt * (P.onGround ? Math.min(18, 4 + hs * 0.3) : P.climbing && P.vel.y > 0 ? 9 : 0);
        if (P.climbing) climbPose(u.body, P.animPhase);
        else if (P.flying) { animRig(u.body, 0, 0); u.body.userData.legs[0].rotation.set(-0.9, 0, 0); u.body.userData.legs[1].rotation.set(-0.9, 0, 0); }
        else if (!P.onGround) airPose(u.body);
        else if (P.moving) animRig(u.body, P.animPhase, 0.85);
        else animRig(u.body, 0, 0);
        if (u.held && !P.climbing) holdPose(u.body);
        if (P.swing > 0) { P.swing -= dt; u.body.userData.arms[1].rotation.set(-1.6 - Math.sin((1 - P.swing / 0.3) * Math.PI) * 0.5, 0, 0); }
        if (localAvatar) localAvatar.update(dt, { moving: P.moving && P.onGround, air: !P.onGround && !P.climbing, vy: P.climbing ? 0 : P.vel.y, speed: hs, t, pose: P.climbing ? 'climb' : undefined });
        setTool(rig, id); setTrail(rig, S.trail);
        if (u.carpet) { u.carpet.visible = P.flying; waveCarpet(u.carpet, t, P.moving ? 1.4 : 0.8); }
        u.trail.update(trailAt(rig), (P.moving || !P.onGround), dt, t);
        // footsteps: every half stride, the surface under you makes its sound
        const stepN = Math.floor(P.animPhase / Math.PI);
        if (P.onGround && P.moving && stepN !== P.lastStepN && P.ground) footStep(P.ground);
        if (P.climbing && stepN !== P.lastStepN && P.vel.y > 0) surfStep('truss', false);
        P.lastStepN = stepN;
        // the Bloxity avatar bobs, leans and lands by itself (animator.js): the whole-body bob, lean,
        // roll and squash below are for the blocky stand-in only
        const own = !localAvatar;
        const runBob = own && P.onGround && P.moving && !P.climbing ? Math.abs(Math.sin(P.animPhase)) * 0.18 : 0;
        u.pivot.position.y = PIVOT + runBob;
        const leanTo = P.climbing ? 0 : P.flying ? (P.moving ? 0.28 : 0) : !own ? 0 : P.onGround && P.moving ? Math.min(0.17, ws * 0.007) : !P.onGround ? -0.06 : 0;
        P.lean = (P.lean || 0) + (leanTo - (P.lean || 0)) * Math.min(1, dt * 9);
        let turn = P.facing - (P.prevFacing ?? P.facing);
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        P.prevFacing = P.facing;
        const rollTo = clamp(-turn / Math.max(dt, 1e-3) * 0.045, -0.22, 0.22) * (P.moving && own ? 1 : 0);
        P.roll = (P.roll || 0) + (rollTo - (P.roll || 0)) * Math.min(1, dt * 7);
        applyFx(rig, S.fx || '', dt);
        u.pivot.rotation.set(P.lean, u.spinA, P.roll);
        P.squashV += (1 - P.squash) * 180 * dt;
        P.squashV *= Math.exp(-12 * dt);
        P.squash = clamp(P.squash + P.squashV * dt, 0.72, 1.28);
        const sc = u.fxScale, sq = own ? P.squash : 1;
        rig.scale.set(sc / Math.sqrt(sq), sc * sq, sc / Math.sqrt(sq));
        tickShield(rig, dt);
        if (myPets) {
            myPets.set(equippedPetDefs());
            myPets.update(P.pos, P.facing, dt, t, true);
        }
    }
    const fastNow = Math.hypot(P.hv.x + P.kv.x, P.hv.z + P.kv.z);
    setSpeedLines(!reduceMotion && fastNow > 26 && P.moving ? Math.min(0.7, (fastNow - 26) * 0.05 + 0.25) : 0, dt);
    $('#crosshair').hidden = !(id === 'trollGun' && !isTouch && !anyPopup());
    $('#useBtn').hidden = !(isTouch && id === 'trollGun');
    $('#downBtn').hidden = !(isTouch && id === 'carpet');

    sendMove(false);
    updatePrompt();
    animateCounters(dt);
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.1; updateHud(); renderHotbar(); setDecorLow(getQuality() === 'low'); }
    progT -= dt;
    if (progT <= 0) {
        progT = 0.25;
        marks.push({ id: 'me', name: S.name, k: clamp(P.pos.y / COURSE_TOP, 0, 1), me: true, color: '#ffffff' });
        renderProgress(marks, P.stage);
    }
}
let petKeyCache = '', petDefsCache = [];
function equippedPetDefs() {
    const key = (S.equippedPets || []).join(',');
    if (key !== petKeyCache) {
        petKeyCache = key;
        petDefsCache = (S.equippedPets || []).map((id) => petById[id]).filter(Boolean);
    }
    return petDefsCache;
}

// =====================================================================================
// Boot
// =====================================================================================
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, showFps = false;
// Slow PC? After joining, if the game keeps running under ~40 FPS for 3 s (and the tab is visible),
// step the graphics down one level (never saved, never below Low). It stops once the player picks one.
const fpsWatch = { t: 0, low: 0 };
function watchFps(fps) {
    if (!running || document.hidden || !autoQualityAllowed()) return;
    fpsWatch.t += 0.5;
    if (fpsWatch.t < 4) return;
    fpsWatch.low = fps < 40 ? fpsWatch.low + 0.5 : 0;
    if (fpsWatch.low < 3) return;
    fpsWatch.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
function frame(now) {
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) { if (showFps) $('#fps').textContent = Math.round(fpsFrames / fpsAcc) + ' FPS'; watchFps(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    // one bad frame (a broken avatar item, say) must never stop the game: log it and keep going
    try {
        pollGamepad();
        padButtons();
        // Nothing is drawn behind the loading screen: the page stays free to load and connect
        if (running) { update(dt); updateCamera(dt); render(); }
    } catch (e) { if (frameErrors++ < 5) console.error('frame error', e); }
    requestAnimationFrame(frame);
}

// Straight into the game: no menu. Joins with the Bloxity name (or guest name) automatically.
// The server join starts right away and runs while the world is being built.
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    // Ask the Bloxity matchmaker for a server straight away while a Bloxity login gets a short
    // moment to arrive; a login that comes later upgrades the session
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('stw_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            $('#loading').textContent = 'Waking up a server…';
            await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        }
    }
}
async function play() {
    if (joining || running) return;
    joining = true;
    const err = $('#connectErr'), retry = $('#playBtn');
    err.hidden = true; retry.hidden = true;
    $('#loading').hidden = false;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        $('#loading').textContent = 'Joining…';
        BX.loadingStep('Joining a server…');
        const room = await joinTask;
        const me = room.state.players && room.state.players.get(room.sessionId);
        S.name = me ? me.name : S.name;
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        $('#loading').hidden = true;
        err.hidden = false;
        err.textContent = 'Could not reach the game server. Check your connection and try again.';
        retry.hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    running = true;
    S.joinedAt = Date.now();
    startMusic();
    $('#start').hidden = true;
    $('#hud').hidden = false;
    $('#touch').hidden = !isTouch;
    if (!rig) buildPlayer(0, 0);
    teleport(SPAWN, SPAWN_YAW);
    setShield(rig, CFG.spawnShield);
    cam.target.set(P.pos.x, P.pos.y + 5, P.pos.z);
    showTips();
    toast('🍓 Climb Strawberry Tower! The strawberry steps start in the corner ↙', '#ffd0e0');
    setTimeout(() => { if (audioSuspended()) toast('🔊 Click or tap anywhere for the music!', '#ff8ad0'); }, 3500);
    canvas.focus();
    BX.loadingEnd();
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => {
        const t0 = performance.now();
        (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })();
    });
}
function showTips() {
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = isTouch
        ? '<span>Joystick to move · JUMP · walk into white trusses to climb · drag to look</span>'
        : pad.connected
            ? k('L', 'Move') + k('A', 'Jump') + k('X', 'Use / Zap') + k('LB/RB', 'Gear') + k('R', 'Camera')
            : k('WASD', 'Move') + k('Space', 'Jump') + k('W into truss', 'Climb') + k('1-5', 'Gear') + k('E', 'Use') + k('Drag', 'Camera');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 10000);
    setTimeout(() => { el.hidden = true; }, 10900);
}
function unlockAudioOnGesture() {
    const unlock = () => {
        resumeAudio();
        if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true);
    };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        // the portal's Respawn goes down to the lobby (going back up costs Wins)
        if (event === 'respawn_request') { if (running) actions.teleportLobby(); }
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
        else if (event === 'play_emote' && data) { playEmoteOn(localAvatar, String(data)); net.send('emote', { id: String(data) }); }
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}

// ----- build the world and warm up the GPU while the loading screen is up -----
// On Windows every new shader is compiled the first time it's drawn and every texture uploaded the
// first time it's used: both freeze the game for a moment. Doing it all here, in parallel with
// joining the server, means nothing new has to be prepared once you spawn.
const pause = () => new Promise((r) => setTimeout(r, 0));
async function prepareWorld() {
    const step = (t) => { $('#loading').textContent = t; BX.loadingStep(t); };
    step('Loading fonts…');
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('800 40px Montserrat')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fallback font */ }
    step('Baking the strawberry tower…');
    await buildWorld(pause);
    refreshNear(-1);
    step('Preparing graphics…');
    // From the spawn view, so the first frame needs nothing new
    camera.position.set(SPAWN.x + 12, 9, SPAWN.z + 16); camera.lookAt(SPAWN.x, 4, SPAWN.z); camera.updateMatrixWorld();
    // A stand-in player model (with its textured variants), the forcefield bubble, a carpet and one
    // of each effect join the warm-up. They leave the scene after one hidden frame but are never
    // disposed, which keeps their shaders alive.
    const extras = [fxWarmGroup()];
    const bubble = new T.Mesh(shieldGeo, shieldMat); bubble.position.copy(SPAWN); extras.push(bubble);
    const cp = carpetModel(0.95); cp.position.copy(SPAWN); extras.push(cp);
    const blocky = buildRig({ ...KITS[0], skin: SKINS[0] }); blocky.position.copy(SPAWN); extras.push(blocky);
    try {
        const base = await Promise.race([loadBase(), new Promise((r) => setTimeout(r, 4000))]);
        const a = base ? await createAvatar(null) : null;
        if (a) {
            a.root.position.copy(SPAWN);
            a.update(1 / 60, { t: 0 });
            extras.push(a.root, avatarVariants(a.root));
        }
    } catch (e) { /* the player model's shaders compile when it first shows instead */ }
    for (const o of extras) scene.add(o);
    fxShowAll(true);
    await warmUp(renderer, camera, pause);
    render();
    fxShowAll(false);
    for (const o of extras) scene.remove(o);
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
// The textured versions of the player material: the skin arrives after the model shows, hats and
// back items are plain meshes with a texture
function avatarVariants(root) {
    const tex = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tex.needsUpdate = true;
    const g = new T.Group();
    g.position.copy(SPAWN);
    let sk = null;
    root.traverse((c) => { if (!sk && c.isSkinnedMesh) sk = c; });
    if (sk) {
        const s = new T.SkinnedMesh(sk.geometry, new T.MeshLambertMaterial({ map: tex }));
        s.bind(sk.skeleton, sk.bindMatrix);
        s.castShadow = true;
        g.add(s);
    }
    const m = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), new T.MeshLambertMaterial({ map: tex }));
    m.castShadow = true;
    g.add(m);
    return g;
}
async function boot() {
    BX.initBloxity();
    // Join the server and load the player model while the world is being built
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    $('#playBtn').addEventListener('click', play);
    $('#reconnectBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// Dev-only hooks for automated QA runs (stripped from production builds)
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        audio: () => audioDebug(), input: (o) => Object.assign(botInput, o), jump: () => pressJump(), solids, cam, P, S, scene, camera, net, renderer: () => renderer,
        teleport: (x, y, z, yaw) => teleport(new V3(x, y, z), yaw || 0),
        walk: (n) => { qaWalk = n; }, near: () => nearBoxes.length + nearRound.length, quality: (q) => setQuality(q),
        // Runs the game at 60 steps a second without rendering: hold forward f, press jump every N steps
        sim: (secs, f, jumpEvery) => { for (let i = 0; i < Math.round(secs * 60); i++) { if (jumpEvery && i % jumpEvery === 0) pressJump(); botInput.f = f || 0; if (net.fixedNow !== null) net.fixedNow += 1000 / 60; update(1 / 60); } botInput.f = 0; return window.__qa.state(); },
        // pin the shared clock (seconds) so moving parts follow the simulation; null = real time
        clock: (s) => { net.fixedNow = s === null ? null : s * 1000; },
        look: (yaw, pitch, dist) => { cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; },
        face: (yaw) => { cam.yaw = yaw + Math.PI; P.facing = yaw; },
        state: () => ({ x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), onGround: P.onGround, ground: P.ground && P.ground.mat, gi: P.ground ? solids.indexOf(P.ground) : -1, vy: +P.vel.y.toFixed(2), stage: P.stage, cp: S.stage, wins: S.wins, climbs: S.climbs, climbing: !!P.climbing, tool: S.tool }),
        tool: (id) => { S.gear[id] = true; actions.equip(id); },
        course: { COURSE, CORNER_Y, cornerXZ, LAND }, sweepers,
        frame: () => { updateCamera(1 / 60); render(); },
    };
}
