// HUD and panels, laid out like the reference: the studded Admin / Nuke / Fly / Troll! buttons on
// the left, Teleport / Speed! / Gravity! on the right, Wins and the menu icons top right (the top
// left stays free for the Bloxity overlay), the tower progress bar along the top, the gear hotbar,
// gear pad popups, the "Oops! You fell?" card, the win banner and every panel.
import { $ } from './engine.js';
import { S, actions, net } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume } from './audio.js';
import * as BX from './bloxity.js';
import { getQuality, setQuality } from './fx.js';
import {
    CFG, STAGES, DIFFS, PETS, petById, RARITY, TRAILS, GEAR, gearById, PASSES, PRODUCTS, priceOf, tpPrice, ADMIN,
    GIFTS, DAILY, dailyStatus, rewardText, winsMult, passForGear, fmt, fmtComma, clock, playtimeText,
} from '../../shared/config.js';
import { CHECKPOINTS } from '../../shared/course.js';

const C = (n) => '<span class="cup">🏆</span>' + fmt(n);
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, t) { if (node && node.textContent !== t) node.textContent = t; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const promptEl = $('#promptBtn'), promptTxtEl = $('#promptTxt');

// Every button clicks
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) sfx(b.classList.contains('g-green') ? 'clickBuy' : 'click'); }, true);

// ----- Wins counter (counts up smoothly) -----
let shownCoins = 0;
export function animateCounters(dt) {
    if (Math.abs(shownCoins - S.wins) < 0.5) shownCoins = S.wins;
    else shownCoins += (S.wins - shownCoins) * Math.min(1, dt * 8);
    setText($('#coinVal'), fmtComma(Math.round(shownCoins)));
}
export function bumpCoins() { const p = $('#coinPill'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }

// ----- HUD refresh (10x a second) -----
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
export function updateHud() {
    const now = net.now();
    const secs = sessionSecs();
    const next = GIFTS.findIndex((g, k) => !S.giftClaimed[k]);
    const ready = GIFTS.some((g, k) => !S.giftClaimed[k] && secs >= g.min * 60);
    $('#giftBadge').hidden = !ready;
    setText($('#giftLb'), ready ? 'READY' : next < 0 ? 'DONE' : Math.max(1, Math.ceil((GIFTS[next].min * 60 - secs) / 60)) + 'm');
    $('#dailyBadge').hidden = !dailyStatus(S.daily, now).can;
    $('#boostTag').hidden = !((S.boostUntil || 0) > now || (S.passes && S.passes.DoubleWins));
    setText($('#friendBoost'), 'Friend Boost: ' + Math.round(Math.min(CFG.friendMax, S.friends || 0) * CFG.friendBoost * 100) + '%');
    $('#skipBtn').hidden = (S.stage ?? -1) >= CHECKPOINTS.length - 1;
    // the side buttons light up while their gear is on
    for (const [id, gear] of [['#btnFly', 'carpet'], ['#btnTroll', 'trollGun'], ['#btnSpeed', 'speedCoil'], ['#btnGravity', 'gravityCoil']]) $(id).classList.toggle('on', S.tool === gear);
    $('#btnAdmin').classList.toggle('on', !!S.fx);
}

// ----- toasts, banners -----
export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o';
    d.style.color = color || '#fff';
    d.textContent = text;
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 2900);
}
let titleTimer;
export function showStageTitle(i) {
    const s = STAGES[i];
    if (!s) return;
    setText($('#stageName'), s.ic + ' Stage ' + (i + 1) + ': ' + s.name);
    const d = DIFFS[s.diff];
    setHtml($('#stageSub'), `<span class="diff" style="background:${d.color}">${d.label}</span> ${esc(s.sub)}${s.wins ? ' · <span class="cup">🏆</span>+' + s.wins : ''}`);
    const t = $('#stageTitle');
    t.style.opacity = 1;
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => { t.style.opacity = 0; }, 2600);
}
export function showWin(m) {
    setText($('#winSub'), '+' + fmt(m.wins) + ' Wins · climb #' + m.climbs + ' · ' + m.secs + 's' + (m.best && m.best === m.secs ? ' (new best!)' : '') + (m.short ? ' · shortcut' : ''));
    $('#winBanner').hidden = false;
    setTimeout(() => { $('#winBanner').hidden = true; }, 3800);
}
let clearTimer;
export function showStageClear(i, n) {
    const next = STAGES[i + 1];
    setText($('#clearT'), 'STAGE ' + (i + 1) + ' CLEAR!');
    const d = next && DIFFS[next.diff];
    setHtml($('#clearS'), '<span class="cup">🏆</span>+' + fmt(n) + ' Wins' + (d ? ' · next: <span class="diff" style="background:' + d.color + '">' + d.label + '</span>' : ''));
    const b = $('#clearBanner');
    b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { b.hidden = true; }, 1900);
}
export function showOof() { const o = $('#oof'); o.hidden = false; setTimeout(() => { o.hidden = true; }, 900); }
export function flash(color, ms) {
    const f = $('#flash');
    f.style.transition = 'none'; f.style.background = color || '#fff'; f.style.opacity = 0.9;
    requestAnimationFrame(() => { f.style.transition = 'opacity ' + ((ms || 600) / 1000) + 's ease'; f.style.opacity = 0; });
}
export function teleportFx() { const t = $('#tpFx'); t.classList.remove('go'); void t.offsetWidth; t.classList.add('go'); }

// ----- "Oops! You fell?" -----
let oopsTimer = null, oopsUntil = 0;
export function showOops(text, title) {
    if (S.stage < 0) return;
    const price = tpPrice(S.stage, true);
    setText($('#oopsTitle'), title || 'Oops! You fell?');
    setText($('#oopsText'), text || 'Teleport back to your checkpoint, or climb up again.');
    setHtml($('#oopsTp'), 'Teleport ' + C(price));
    $('#oopsTp').disabled = (S.wins || 0) < price;
    $('#oops').hidden = false;
    oopsUntil = Date.now() + 15000;
    clearInterval(oopsTimer);
    oopsTimer = setInterval(() => {
        const k = Math.max(0, (oopsUntil - Date.now()) / 15000);
        $('#oopsTimer').style.width = (k * 100) + '%';
        if (k <= 0) hideOops();
    }, 100);
}
export function hideOops() { $('#oops').hidden = true; clearInterval(oopsTimer); }
$('#oopsTp').addEventListener('click', () => { hideOops(); actions.teleportCheckpoint(); });
$('#oopsClose').addEventListener('click', hideOops);

// ----- gear pad popup -----
let gearPopId = null, gearPopTimer;
export function showGearPop(id) {
    const g = gearById[id], pass = PASSES[passForGear(id)];
    gearPopId = id;
    setText($('#gpIc'), g.ic); setText($('#gpName'), g.name); setText($('#gpDesc'), g.desc + '.');
    setHtml($('#gpBuy'), S.gear[id] ? (S.tool === id ? 'Unequip' : 'Equip') : C(pass.price));
    $('#gearPop').hidden = false;
    clearTimeout(gearPopTimer);
    gearPopTimer = setTimeout(() => { $('#gearPop').hidden = true; }, 7000);
}
$('#gpBuy').addEventListener('click', () => {
    $('#gearPop').hidden = true;
    if (!gearPopId) return;
    if (S.gear[gearPopId]) actions.equip(gearPopId); else buy('pass', passForGear(gearPopId));
});
$('#gpClose').addEventListener('click', () => { $('#gearPop').hidden = true; });

// ----- hotbar (gear you own) -----
let hotKey = '';
export function renderHotbar() {
    const owned = GEAR.filter((g) => S.gear[g.id]);
    const key = owned.map((g) => g.id).join(',') + '|' + S.tool;
    if (key === hotKey) return;
    hotKey = key;
    const bar = $('#hotbar');
    bar.innerHTML = '';
    owned.forEach((g, i) => {
        const b = document.createElement('button');
        b.className = 'slot' + (S.tool === g.id ? ' on' : '');
        b.innerHTML = `<span class="n o1">${i + 1}</span>${g.ic}<span class="nm o1">${esc(g.name)}</span>`;
        b.title = g.name + ' (' + (i + 1) + ')';
        b.addEventListener('click', () => actions.equip(g.id));
        bar.appendChild(b);
    });
}
export const hotbarGear = () => GEAR.filter((g) => S.gear[g.id]);

// ----- the tower progress bar along the top: every player's height up the tower -----
{
    const bar = $('#progBar');
    STAGES.forEach((s) => { const d = document.createElement('div'); d.className = 'seg'; d.style.background = '#' + s.bar.toString(16).padStart(6, '0'); bar.appendChild(d); });
}
const markEls = new Map();
// list: [{ id, name, k (0..1), me, color }]
export function renderProgress(list, stage) {
    const box = $('#progMarks'), W = $('#progBar').clientWidth;
    const seen = new Set();
    for (const p of list) {
        seen.add(p.id);
        let el = markEls.get(p.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'mk o1' + (p.me ? ' me' : '');
            el.style.background = p.color;
            el.textContent = (p.name || '?').slice(0, 1).toUpperCase();
            el.title = p.name;
            box.appendChild(el); markEls.set(p.id, el);
        }
        el.style.left = Math.round(p.k * W) + 'px';
    }
    for (const [id, el] of markEls) if (!seen.has(id)) { el.remove(); markEls.delete(id); }
    const s = STAGES[Math.max(0, stage)];
    setText($('#progLabel'), stage < 0 ? '🏠 Lobby' : s.ic + ' ' + (stage + 1) + '/' + STAGES.length);
}

// =====================================================================================
// Purchases: everything costs Wins. A confirm shows the price; the server checks it and takes
// the Wins.
// =====================================================================================
let pendingBuy = null;
export function buy(kind, key) {
    const item = kind === 'pass' ? PASSES[key] : kind === 'pet' ? petById[key] : PRODUCTS[key];
    if (!item) return;
    if (kind === 'pass' && S.passes[key]) { toast(item.name + ' already owned!', '#6fe0ff'); if (item.gear) actions.equip(item.gear); return; }
    if (kind === 'pet' && S.pets[key]) { actions.petPad(key); return; }
    pendingBuy = { kind, key };
    const price = kind === 'pet' ? item.price : priceOf(kind, key, S);
    const short = price - (S.wins || 0);
    setText($('#confirmIc'), item.ic || '🛒');
    setText($('#confirmTitle'), item.name);
    setText($('#confirmText'), kind === 'pet' ? 'x' + item.mult + ' Wins while equipped · ' + RARITY[item.rarity].name : item.desc || '');
    setHtml($('#confirmCost'), C(price) + ' Wins');
    const yes = $('#confirmYes');
    yes.disabled = short > 0;
    setText(yes, short > 0 ? 'Need ' + fmt(short) + ' more' : 'Buy');
    setText($('#confirmNote'), short > 0 ? 'Climb the tower to earn Wins: every checkpoint pays more the higher you go!' : 'You have ' + fmtComma(S.wins) + ' Wins');
    $('#confirm').hidden = false;
    setMusicDuck(true);
}
// The server said you can't afford it (prices can change while the dialog is open)
export function notEnough(m) { toast('Not enough Wins! You need ' + fmt(m.need) + ' more for ' + m.name, '#ff5a7a'); }
function closeConfirm() { $('#confirm').hidden = true; pendingBuy = null; if (!modalOpen()) setMusicDuck(false); }
$('#confirmYes').addEventListener('click', () => { const p = pendingBuy; closeConfirm(); if (p) net.send(p.kind === 'pet' ? 'buyPet' : 'buy', p.kind === 'pet' ? { id: p.key } : p); });
$('#confirmNo').addEventListener('click', closeConfirm);
$('#confirmClose').addEventListener('click', closeConfirm);

// =====================================================================================
// Panels
// =====================================================================================
let modalKind = null, modalTab = null;
export function openModal(kind, tab) { modalKind = kind; modalTab = tab || null; renderModal(); $('#modal').hidden = false; setMusicDuck(true); }
export function closeModal() { $('#modal').hidden = true; modalKind = null; setMusicDuck(false); }
export function refreshModal() { if (!$('#modal').hidden) renderModal(); }
export const modalOpen = () => !$('#modal').hidden;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

function el(tag, cls, html) { const d = document.createElement(tag); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; }
function sec(body, text) { body.appendChild(el('div', 'sec o1', esc(text))); }
function note(body, text) { body.appendChild(el('p', 'note o1', text)); }
function card(o) {
    const d = el('div', 'card' + (o.cls ? ' ' + o.cls : ''));
    d.innerHTML = `<div class="ic">${o.ic}</div><div class="nm o1">${esc(o.name)}</div>${o.desc ? `<div class="ds o1">${esc(o.desc)}</div>` : ''}`;
    if (o.btn) {
        const b = el('button', 'btn ' + (o.btnCls || 'g-green') + ' o1', o.btn);
        b.disabled = !!o.disabled;
        b.addEventListener('click', o.onClick);
        d.appendChild(b);
    }
    return d;
}
function tabs(list) {
    const t = $('#modalTabs');
    t.innerHTML = '';
    if (!list) return;
    for (const [id, label] of list) {
        const b = el('button', 'btn g-pink o1' + (modalTab === id ? ' on' : ''), label);
        b.addEventListener('click', () => { modalTab = id; renderModal(); });
        t.appendChild(b);
    }
}
function renderModal() {
    const body = $('#modalBody');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const titles = { store: 'SHOP!', pets: 'PETS', trails: 'TRAILS', config: 'SETTINGS', gifts: 'GIFTS', invite: 'INVITE', teleport: 'TELEPORT', admin: 'ADMIN', worlds: 'WORLDS' };
    setText($('#modalTitle'), titles[modalKind] || '');
    tabs(null);
    ({ store: renderStore, pets: renderPets, trails: renderTrails, config: renderConfig, gifts: renderGifts, invite: renderInvite, teleport: renderTeleport, admin: renderAdmin, worlds: renderWorlds }[modalKind] || (() => {}))(body);
    body.scrollTop = scroll;
}

// ----- Shop -----
function passCard(key, cls) {
    const p = PASSES[key], own = !!S.passes[key];
    return card({ ic: p.ic, name: p.name, desc: p.desc, cls: (cls || '') + (own ? ' own' : ''), btn: own ? (p.gear ? (S.tool === p.gear ? 'Equipped' : 'Equip') : key === 'Admin' ? 'Open' : 'Owned') : C(p.price), btnCls: own ? 'g-blue' : S.wins >= p.price ? 'g-green' : 'g-grey', disabled: own && !p.gear && key !== 'Admin', onClick: () => (own && p.gear ? actions.equip(p.gear) : own && key === 'Admin' ? openModal('admin') : buy('pass', key)) });
}
function prodCard(key, cls) {
    const p = PRODUCTS[key];
    const price = priceOf('product', key, S);
    return card({ ic: p.ic, name: p.name, desc: p.desc, cls, btn: C(price), btnCls: S.wins >= price ? 'g-green' : 'g-grey', onClick: () => buy('product', key) });
}
function renderStore(body) {
    tabs([['gear', '🌀 Gear'], ['boosts', '⏱️ Boosts'], ['fun', '🛡️ Fun']]);
    const tab = modalTab || 'gear';
    const g = el('div', 'grid');
    if (tab === 'gear') for (const k of ['SpeedCoil', 'GravityCoil', 'FusionCoil', 'TrollGun', 'RainbowCarpet']) g.appendChild(passCard(k, k === 'RainbowCarpet' ? 'carpet' : ''));
    else if (tab === 'boosts') { g.appendChild(prodCard('WinsBoost')); g.appendChild(passCard('DoubleWins', 'hot')); g.appendChild(prodCard('Skip')); }
    else { g.appendChild(passCard('Admin', 'admin')); g.appendChild(prodCard('NukeAll', 'nuke')); }
    body.appendChild(g);
    note(body, 'Everything is bought with Wins. Earn them at every checkpoint (more on the harder stages), from floating strawberries and at the top of the tower!');
}

// ----- Pets -----
function renderPets(body) {
    const eq = new Set(S.equippedPets || []);
    const mult = winsMult({ ...S, passes: {}, boostUntil: 0 }, 0, 0);
    const top = el('div', 'row');
    top.innerHTML = `<span class="ic">🐾</span><span class="tx"><b class="o1">Equipped ${eq.size}/${CFG.petSlots} · Wins x${(Math.round(mult * 100) / 100)}</b><small class="o1">Pets live on the PET SHOP pads in the lobby. Click one to buy, equip or unequip it.</small></span>`;
    body.appendChild(top);
    const grid = el('div', 'petgrid');
    for (const d of PETS) {
        const own = !!(S.pets && S.pets[d.id]), on = eq.has(d.id), r = RARITY[d.rarity];
        const c = el('div', 'pet' + (on ? ' on' : '') + (own ? '' : ' locked'));
        c.innerHTML = `${on ? '<span class="chk">✅</span>' : ''}<div class="ic" style="background:radial-gradient(circle,${r.color}66,transparent 70%)">${d.ic}</div><div class="nm o1">${esc(d.name)}</div><div class="rr o1" style="color:${r.color}">${r.name}</div><div class="m o1">x${d.mult}</div><div class="pr o1">${own ? (on ? 'Equipped' : 'Owned') : C(d.price)}</div>`;
        c.addEventListener('click', () => (own ? net.send('petEquip', { id: d.id, on: !on }) : buy('pet', d.id)));
        grid.appendChild(c);
    }
    body.appendChild(grid);
}

// ----- Trails -----
function renderTrails(body) {
    const g = el('div', 'grid');
    for (const t of TRAILS) {
        const own = !!S.trails[t.id], on = S.trail === t.id;
        const hex = '#' + t.color.toString(16).padStart(6, '0');
        const sw = `<span style="display:inline-block;width:3.6rem;height:1.2rem;border-radius:1rem;border:3px solid #5a1030;background:${t.rainbow ? 'linear-gradient(90deg,#ff3c5a,#ffb51c,#46ec50,#28c8ff,#8a5aff)' : hex};box-shadow:0 0 0.8rem ${hex}"></span>`;
        g.appendChild(card({
            ic: sw, name: t.name, desc: t.price ? '' : 'Free', cls: on ? 'own' : '',
            btn: on ? 'Equipped' : own ? 'Equip' : C(t.price), btnCls: own ? 'g-blue' : 'g-green',
            disabled: on || (!own && S.wins < t.price),
            onClick: () => net.send('trail', { id: t.id }),
        }));
    }
    body.appendChild(g);
}

// ----- Teleport -----
function renderTeleport(body) {
    const g = el('div', 'grid');
    g.appendChild(card({ ic: '🏠', name: 'Lobby', desc: 'Back down to the bottom', btn: 'Free', onClick: () => { closeModal(); actions.teleportLobby(); } }));
    if (S.stage >= 0) {
        const price = tpPrice(S.stage, true);
        g.appendChild(card({ ic: '🚩', name: 'My checkpoint', desc: 'Stage ' + Math.min(STAGES.length, S.stage + 2), btn: C(price), btnCls: S.wins >= price ? 'g-green' : 'g-grey', onClick: () => { closeModal(); actions.teleportCheckpoint(); } }));
    }
    if ((S.stage ?? -1) < CHECKPOINTS.length - 1) g.appendChild(prodCard('Skip', 'hot'));
    body.appendChild(g);
    sec(body, 'Stages you have reached');
    const r = el('div', 'grid');
    CHECKPOINTS.forEach((cp, i) => {
        const ok = i < (S.maxStage || 0) || i === S.stage, s = STAGES[i + 1], price = tpPrice(i, i === S.stage);
        r.appendChild(card({ ic: ok ? s.ic : '🔒', name: 'Stage ' + (i + 2), desc: s.name, btn: ok ? C(price) : 'Not reached', btnCls: ok && S.wins >= price ? 'g-green' : 'g-grey', disabled: !ok, onClick: () => { closeModal(); actions.teleportTo(i); } }));
    });
    body.appendChild(r);
    note(body, 'Teleporting costs Wins: back to your own checkpoint is twice what it paid, up to another stage you reached is four times. A climb that starts with a teleport up pays a quarter at the top.');
}

// ----- Admin -----
function renderAdmin(body) {
    if (!S.passes.Admin) {
        note(body, 'Admin gives you fun commands everyone in the server can see: grow Giant, shrink Tiny, Spin, Sparkles, a Rainbow aura and Fireworks!');
        const g = el('div', 'grid'); g.appendChild(passCard('Admin', 'admin')); body.appendChild(g);
        return;
    }
    const g = el('div', 'grid');
    for (const a of ADMIN) {
        const on = (S.fx || '').includes(a.id);
        g.appendChild(card({ ic: a.ic, name: a.name, desc: a.desc, cls: on ? 'own' : '', btn: on ? 'ON' : 'OFF', btnCls: on ? 'g-green' : 'g-grey', onClick: () => { actions.adminFx(a.id); setTimeout(renderModal, 60); } }));
    }
    g.appendChild(card({ ic: '🎆', name: 'Fireworks', desc: 'A firework show where you stand', btn: 'Launch!', btnCls: 'g-rainbow', onClick: () => actions.adminFireworks() }));
    body.appendChild(g);
}

// ----- Worlds -----
function renderWorlds(body) {
    const g = el('div', 'grid');
    g.appendChild(card({ ic: '🍓', name: 'World 1: Strawberry Tower', desc: STAGES.length + ' stages', cls: 'own', btn: 'You are here', btnCls: 'g-blue', disabled: true }));
    g.appendChild(card({ ic: '🍫', name: 'World 2: Chocolate Tower', desc: 'Coming soon!', btn: '🔒 Locked', btnCls: 'g-grey', disabled: true }));
    body.appendChild(g);
}

// ----- Settings -----
function slider(body, ic, label, kind) {
    const r = el('div', 'row');
    r.innerHTML = `<span class="ic">${ic}</span><span class="tx" style="flex:0 0 9rem"><b class="o1">${label}</b></span>`;
    const s = el('input');
    s.type = 'range'; s.min = 0; s.max = 100; s.value = Math.round((getVolumes()[kind] ?? 1) * 100);
    s.setAttribute('aria-label', label);
    s.addEventListener('input', () => setVolume(kind, s.value / 100));
    r.appendChild(s);
    body.appendChild(r);
}
function renderConfig(body) {
    sec(body, 'Sound');
    slider(body, '🎵', 'Music', 'music');
    slider(body, '👣', 'Footsteps', 'asmr');
    slider(body, '🔔', 'Effects', 'sfx');
    sec(body, 'Graphics');
    const q = el('div', 'row');
    q.innerHTML = '<span class="ic">✨</span><span class="tx"><b class="o1">Quality</b><small class="o1">Low is smoothest on older PCs and phones</small></span>';
    for (const [k, n] of [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) {
        const b = el('button', 'btn ' + (getQuality() === k ? 'g-green' : 'g-grey') + ' o1', n);
        b.addEventListener('click', () => { setQuality(k); renderModal(); });
        q.appendChild(b);
    }
    body.appendChild(q);
    const pets = el('div', 'row');
    pets.innerHTML = '<span class="ic">🐾</span><span class="tx"><b class="o1">Other players\' pets</b><small class="o1">Hide them for a calmer view</small></span>';
    const pb = el('button', 'btn ' + (actions.showOtherPets() ? 'g-green' : 'g-grey') + ' o1', actions.showOtherPets() ? 'Shown' : 'Hidden');
    pb.addEventListener('click', () => { actions.toggleOtherPets(); renderModal(); });
    pets.appendChild(pb);
    body.appendChild(pets);
    sec(body, 'Codes');
    const c = el('div', 'row');
    c.innerHTML = '<span class="ic">🎟️</span>';
    const inp = el('input', 'input'); inp.placeholder = 'Enter a code'; inp.maxLength = 24;
    const go = el('button', 'btn g-green o1', 'Redeem');
    go.addEventListener('click', () => { if (inp.value.trim()) net.send('code', { code: inp.value.trim() }); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); e.stopPropagation(); });
    c.appendChild(inp); c.appendChild(go);
    body.appendChild(c);
    const stats = el('div', 'row');
    stats.innerHTML = `<span class="ic">📊</span><span class="tx"><b class="o1">Climbs ${fmt(S.climbs)} · Best climb ${S.best ? S.best + 's' : '—'}</b><small class="o1">Playtime ${playtimeText(S.playtime)} · Wins earned ${fmt(S.totalWins)}</small></span>`;
    body.appendChild(stats);
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff5a7a'); }

// ----- Gifts (playtime) -----
function renderGifts(body) {
    note(body, 'Keep playing to unlock gifts! (' + Math.floor(sessionSecs() / 60) + ' min played this session)');
    const g = el('div', 'grid');
    const secs = sessionSecs();
    GIFTS.forEach((gift, k) => {
        const claimed = !!S.giftClaimed[k], ready = secs >= gift.min * 60;
        const left = Math.max(0, gift.min * 60 - secs);
        g.appendChild(card({
            ic: gift.boost ? '⏱️' : '🎁', name: rewardText(gift), desc: gift.min + ' min',
            cls: claimed ? 'own' : ready ? 'hot' : '', btn: claimed ? 'Claimed' : ready ? 'CLAIM' : clock(left), btnCls: ready && !claimed ? 'g-green' : 'g-grey',
            disabled: claimed || !ready, onClick: () => net.send('gift', { k }),
        }));
    });
    body.appendChild(g);
}

// ----- Invite -----
function renderInvite(body) {
    note(body, 'Play with friends! Friend Boost gives +' + Math.round(CFG.friendBoost * 100) + '% Wins for every Bloxity friend in your server (up to +' + Math.round(CFG.friendBoost * CFG.friendMax * 100) + '%).');
    const r = el('div', 'row');
    r.innerHTML = '<span class="ic">🔗</span><span class="tx"><b class="o1">Invite link</b><small class="o1">Send it to a friend</small></span>';
    const b = el('button', 'btn g-green o1', 'Copy');
    b.addEventListener('click', async () => {
        const link = BX.getInviteLink() || location.href;
        try { await navigator.clipboard.writeText(link); toast('Invite link copied!', '#7dff6b'); } catch (e) { toast(link, '#ffffff'); }
    });
    r.appendChild(b);
    body.appendChild(r);
    const list = el('div', 'grid');
    body.appendChild(list);
    if (BX.bloxity.ready && BX.identity().loggedIn) {
        BX.getFriends().then((fr) => {
            if (!fr.length) { list.appendChild(el('p', 'note o1', 'No Bloxity friends yet.')); return; }
            for (const f of fr.slice(0, 24)) {
                const nm = f.displayName || f.username || 'Friend';
                list.appendChild(card({ ic: '🙂', name: nm, btn: 'Invite', onClick: async () => { const ok = await BX.inviteFriend(f._id || f.id); toast(ok ? 'Invited ' + nm + '!' : 'Could not invite ' + nm, ok ? '#7dff6b' : '#ff5a7a'); } }));
            }
        });
    } else note(body, 'Log in to Bloxity to invite your friends directly.');
}

// =====================================================================================
// Daily rewards
// =====================================================================================
export function openDailyOnJoin() {
    if (dailyStatus(S.daily, net.now()).can && !openDailyOnJoin.done) { openDailyOnJoin.done = true; setTimeout(openDaily, 1500); }
}
function openDaily() { renderDaily(); $('#daily').hidden = false; setMusicDuck(true); }
function renderDaily() {
    const st = dailyStatus(S.daily, net.now());
    const cards = $('#dailyCards');
    cards.innerHTML = '';
    DAILY.forEach((r, i) => {
        const done = i < st.day || (!st.can && i === st.day);
        const now = st.can && i === st.day;
        const d = el('div', 'dcard o1' + (done ? ' done' : '') + (now ? ' now' : ''));
        d.innerHTML = `<span class="d">Day ${i + 1}</span><span class="i">${r.pet ? petById[r.pet].ic : r.boost ? '⏱️' : '🏆'}</span><span>${esc(rewardText(r))}</span>`;
        cards.appendChild(d);
    });
    $('#dailyClaim').disabled = !st.can;
    setText($('#dailyLeft'), st.can ? 'Your daily reward is ready!' : 'Come back tomorrow for Day ' + ((st.streak % 7) + 1) + '!');
}
$('#dailyClaim').addEventListener('click', () => { net.send('daily'); setTimeout(renderDaily, 300); });
$('#dailyClose').addEventListener('click', () => { $('#daily').hidden = true; setMusicDuck(false); });
export const refreshDaily = () => { if (!$('#daily').hidden) renderDaily(); };

// =====================================================================================
// HUD buttons (the reference's studded side buttons and the icon row)
// =====================================================================================
// A gear button: equip / unequip it if you own it, otherwise offer it
const gearBtn = (id) => () => (S.gear[id] ? actions.equip(id) : buy('pass', passForGear(id)));
$('#btnAdmin').addEventListener('click', () => openModal('admin'));
$('#btnNuke').addEventListener('click', () => buy('product', 'NukeAll'));
$('#btnFly').addEventListener('click', gearBtn('carpet'));
$('#btnTroll').addEventListener('click', gearBtn('trollGun'));
$('#btnTeleport').addEventListener('click', () => openModal('teleport'));
$('#btnSpeed').addEventListener('click', gearBtn('speedCoil'));
$('#btnGravity').addEventListener('click', gearBtn('gravityCoil'));
$('#btnStore').addEventListener('click', () => openModal('store'));
$('#btnPets').addEventListener('click', () => openModal('pets'));
$('#btnTrails').addEventListener('click', () => openModal('trails'));
$('#btnConfig').addEventListener('click', () => openModal('config'));
$('#coinPlus').addEventListener('click', () => openModal('store', 'boosts'));
$('#btnInvite').addEventListener('click', () => openModal('invite'));
$('#btnGift').addEventListener('click', () => openModal('gifts'));
$('#btnDaily').addEventListener('click', openDaily);
$('#skipBtn').addEventListener('click', () => buy('product', 'Skip'));
actions.openWorlds = () => openModal('worlds');
actions.openStore = () => openModal('store');
actions.openTrails = () => openModal('trails');
actions.openTeleport = () => openModal('teleport');
actions.buy = buy;

// Closes the topmost popup (Escape / controller B); false when nothing was open
export function closeTop() {
    for (const id of ['#confirm', '#daily']) {
        if (!$(id).hidden) {
            if (id === '#confirm') closeConfirm(); else $('#dailyClose').click();
            return true;
        }
    }
    if (modalOpen()) { closeModal(); return true; }
    if (!$('#gearPop').hidden) { $('#gearPop').hidden = true; return true; }
    return false;
}
export const anyPopup = () => ['#confirm', '#daily', '#modal'].some((id) => !$(id).hidden);
