// Game data shared by the client and the Colyseus server.
// Strawberry Tower: a sweet pink tower obby floating above the clouds. Climb twelve strawberry
// stages up the inside of the tower (giant strawberries, shortcake, cream puffs, strawberry milk,
// icing, lego, pistons, melting jelly and spinning berry slices); every checkpoint pays Wins and the
// giant strawberry at the top pays a big pile. There are no in-app purchases: gear (Speed and
// Gravity Coils, the Rainbow Carpet, the Troll Gun), Admin, Nuke, pets and trails all cost Wins.

export const CFG = {
    // Roblox defaults: jump power 50, gravity 196.2 (a jump rises about 6.4 studs)
    grav: 196.2,
    jumpV: 50,
    walk: 18,
    climb: 13,                // truss climbing speed
    bounceV: 92,              // cream trampolines
    maxPlayers: 24,
    // Wins: each new checkpoint of a climb pays its stage's Wins (STAGES[i].wins), the summit pays
    // summitWins, every floating strawberry +1 (all times the Wins multiplier)
    summitWins: 150,
    pickupWins: 1,
    // The secret strawberry at the top of the lobby's strawberry staircase
    bonusWins: 15,
    bonusMinutes: 10,
    // A climb must take at least this long for the summit to pay (and a Win can't repeat faster)
    minClimbSecs: 45,
    boostMinutes: 15,
    // Friend Boost: +10% Wins per Bloxity friend in the same server, up to 5
    friendBoost: 0.1,
    friendMax: 5,
    petSlots: 3,
    // Gear
    speedCoil: 1.6,           // walk speed x
    gravityCoil: 0.36,        // gravity x (floaty high jumps)
    fusionCoil: { walk: 1.45, grav: 0.55 },
    carpetSpeed: 28,
    trollRange: 90,
    trollCooldown: 1.6,
    trollForce: 78,
    nukeCooldown: 60,
    spawnShield: 3,           // seconds of the sparkly forcefield bubble after spawning
};

// ----- the tower -----
// Interior half-size; the lobby floor is y = 0. The course spirals up the inside walls (course.js).
// The tower stands on a pink island floating above the clouds (the terrace around it is TERRACE wide).
export const TOWER = { half: 64, wall: 4, top: 292, door: 18, terrace: 34 };
export const LOBBY = { spawn: { x: 0, y: 1.2, z: 6 }, yaw: Math.PI };

// Twelve stages, each two sides of the tower ending in a checkpoint. bar: the stage's colour (the
// progress bar, the neon trims). diff: how hard it is (they get harder all the way up); wins: what
// its checkpoint pays; speed: how fast its moving parts go.
export const DIFFS = {
    EASY: { label: 'EASY', color: '#46e85a' },
    MEDIUM: { label: 'MEDIUM', color: '#ffc828' },
    HARD: { label: 'HARD', color: '#ff8a2a' },
    EXTREME: { label: 'EXTREME', color: '#ff3a4a' },
    INSANE: { label: 'INSANE', color: '#c84aff' },
};
export const STAGES = [
    { name: 'Strawberry Steps', sub: 'Hop up the giant strawberries', bar: 0xff4a6e, accent: 0xff6a8a, diff: 'EASY', wins: 3, speed: 1, ic: '🍓' },
    { name: 'Shortcake Stairs', sub: 'Slices of strawberry shortcake', bar: 0xff7a9a, accent: 0xffd0dc, diff: 'MEDIUM', wins: 4, speed: 1, ic: '🍰' },
    { name: 'Cream Puffs', sub: 'Soft whipped cream that squishes', bar: 0xffa8c4, accent: 0xffffff, diff: 'MEDIUM', wins: 6, speed: 1.1, ic: '☁️' },
    { name: 'Milk Pools', sub: 'Climb the trusses, wade through strawberry milk', bar: 0xff8ad0, accent: 0xffc8e8, diff: 'HARD', wins: 8, speed: 1.15, ic: '🥛' },
    { name: 'Icing Bridge', sub: 'Glossy icing: narrow and slippery', bar: 0xe86ae0, accent: 0xffe0f8, diff: 'HARD', wins: 11, speed: 1.2, ic: '🧁' },
    { name: 'Lego Run', sub: 'Blue lego blocks that slide away', bar: 0x3ac8ff, accent: 0x8ae8ff, diff: 'HARD', wins: 15, speed: 1.35, ic: '🧱' },
    { name: 'Cream Bounce', sub: 'Tiny cream trampolines over big gaps', bar: 0x5ad8c8, accent: 0xffffff, diff: 'EXTREME', wins: 20, speed: 1.45, ic: '🍦' },
    { name: 'Sky Plates', sub: 'Grey plates gliding over the sky', bar: 0x8a94b8, accent: 0xff3a5a, diff: 'EXTREME', wins: 27, speed: 1.55, ic: '🌥️' },
    { name: 'Piston Press', sub: 'The red pistons pump fast: time your steps', bar: 0xff5a4a, accent: 0xffd0c8, diff: 'EXTREME', wins: 36, speed: 1.7, ic: '🔴' },
    { name: 'Jelly Drops', sub: 'The jelly melts the moment you touch it', bar: 0xff6ab8, accent: 0xffb8e0, diff: 'INSANE', wins: 48, speed: 1.8, ic: '🍮' },
    { name: 'Berry Spinners', sub: 'Spinning berry slices and sweeping candy sticks', bar: 0xd84aff, accent: 0xffb8f0, diff: 'INSANE', wins: 64, speed: 1.95, ic: '🌀' },
    { name: 'Strawberry Summit', sub: 'Everything at once, then the giant strawberry!', bar: 0xffd028, accent: 0xff4a6e, diff: 'INSANE', wins: 0, speed: 2.1, ic: '👑' },
];
// How long a melting jelly lasts after you touch it, per stage (seconds)
export const meltTime = (stage) => (stage >= 11 ? 0.34 : stage >= 9 ? 0.42 : 0.6);

// ----- pets: they stand on the PET SHOP pads in the lobby and are bought straight off the pad -----
// mult: Wins multiplier while equipped (equipped pets add up: 1 + sum of (mult - 1))
export const RARITY = {
    common: { name: 'Common', color: '#b8c4d8' },
    rare: { name: 'Rare', color: '#3aa8ff' },
    epic: { name: 'Epic', color: '#c45aff' },
    legendary: { name: 'Legendary', color: '#ffb81c' },
    mythic: { name: 'Mythic', color: '#ff3f7a' },
};
export const PETS = [
    { id: 'bunny', name: 'Berry Bunny', rarity: 'common', mult: 1.2, price: 50, kind: 'bunny', color: 0xfff0f4, accent: 0xff6a8a, ic: '🐰' },
    { id: 'puppy', name: 'Choco Puppy', rarity: 'common', mult: 1.4, price: 150, kind: 'dog', color: 0xc8864a, accent: 0x6a3a1a, ic: '🐶' },
    { id: 'kitty', name: 'Midnight Kitty', rarity: 'rare', mult: 1.7, price: 400, kind: 'cat', color: 0x3a3a4a, accent: 0xffd028, ic: '🐱' },
    { id: 'tiger', name: 'Sunny Tiger', rarity: 'rare', mult: 2.2, price: 1000, kind: 'tiger', color: 0xffa83a, accent: 0x2a1a10, ic: '🐯' },
    { id: 'slime', name: 'Strawberry Slime', rarity: 'epic', mult: 2.8, price: 2200, kind: 'slime', color: 0xff4a6e, accent: 0x7ed98a, ic: '🍓' },
    { id: 'unicorn', name: 'Cotton Unicorn', rarity: 'legendary', mult: 3.5, price: 4500, kind: 'unicorn', color: 0xffffff, accent: 0xff7ad8, ic: '🦄' },
    { id: 'dragon', name: 'Berry Dragon', rarity: 'mythic', mult: 5, price: 10000, kind: 'dragon', color: 0xff3a5a, accent: 0xffd028, ic: '🐉' },
];
export const petById = Object.fromEntries(PETS.map((d) => [d.id, d]));
// Equipped pets add up: 1 + sum of (mult - 1)
export function petMult(list) {
    let m = 1;
    for (const id of list || []) { const d = petById[id]; if (d) m += d.mult - 1; }
    return m;
}

// ----- trails (Wins) -----
export const TRAILS = [
    { id: 'starter', name: 'Sugar Sparkle', price: 0, color: 0xfff0f6 },
    { id: 'pink', name: 'Pink Sugar', price: 40, color: 0xff8ad0 },
    { id: 'berry', name: 'Berry Red', price: 120, color: 0xff3a5a },
    { id: 'mint', name: 'Mint Leaf', price: 350, color: 0x6affa0 },
    { id: 'sky', name: 'Sky Blue', price: 900, color: 0x3ac8ff },
    { id: 'lemon', name: 'Lemon Drop', price: 2000, color: 0xffe03a },
    { id: 'galaxy', name: 'Galaxy Dust', price: 5000, color: 0x9a5aff },
    { id: 'rainbow', name: 'Rainbow Sprinkles', price: 12000, color: 0xff5ad8, rainbow: true },
];
export const trailById = Object.fromEntries(TRAILS.map((d) => [d.id, d]));

// ----- gear (bought with Wins on the SHOP pads); tools sit in the hotbar -----
export const GEAR = [
    { id: 'speedCoil', name: 'Speed Coil', desc: 'Run 60% faster', ic: '🌀', color: 0xff3a4a },
    { id: 'gravityCoil', name: 'Gravity Coil', desc: 'Low gravity: huge floaty jumps', ic: '🪐', color: 0x3a8aff },
    { id: 'fusionCoil', name: 'Fusion Coil', desc: 'Faster and floatier at once', ic: '💫', color: 0xc45aff },
    { id: 'carpet', name: 'Rainbow Carpet', desc: 'Fly anywhere: Space up, Shift down', ic: '🌈', color: 0xffd028 },
    { id: 'trollGun', name: 'Troll Gun', desc: 'Zap other players and fling them away', ic: '🔫', color: 0x2ae8d8 },
];
export const gearById = Object.fromEntries(GEAR.map((d) => [d.id, d]));

// ----- the Wins shop -----
// Passes are owned forever; products can be bought again. Every price is in Wins.
export const PASSES = {
    SpeedCoil: { name: 'Speed Coil', price: 75, ic: '🌀', desc: 'Run 60% faster', gear: 'speedCoil' },
    GravityCoil: { name: 'Gravity Coil', price: 200, ic: '🪐', desc: 'Low gravity: huge floaty jumps', gear: 'gravityCoil' },
    TrollGun: { name: 'Troll Gun', price: 400, ic: '🔫', desc: 'Zap other players and fling them away', gear: 'trollGun' },
    FusionCoil: { name: 'Fusion Coil', price: 800, ic: '💫', desc: 'Faster and floatier at once', gear: 'fusionCoil' },
    Admin: { name: 'Admin', price: 2500, ic: '🛡️', desc: 'Admin commands: Giant, Tiny, Spin, Sparkles, Rainbow and Fireworks' },
    DoubleWins: { name: 'x2 Wins', price: 4000, ic: '🏆', desc: 'Double Wins forever' },
    RainbowCarpet: { name: 'Rainbow Carpet', price: 6000, ic: '🌈', desc: 'Fly anywhere: Space up, Shift down', gear: 'carpet' },
};
export const PRODUCTS = {
    Skip: { name: 'Skip Stage', price: 10, ic: '⏩', desc: 'Teleport to the next checkpoint' },
    NukeAll: { name: 'Nuke', price: 300, ic: '☢️', desc: 'Nuke everyone else back to the lobby!' },
    WinsBoost: { name: 'x2 Wins Boost', price: 150, ic: '⏱️', desc: 'Double Wins for 15 minutes' },
};
// Skipping costs more the higher you are: five times what the next checkpoint pays
export const skipPrice = (stage) => Math.max(10, 5 * ((STAGES[Math.min(STAGES.length - 1, (stage ?? -1) + 1)] || {}).wins || 2));
// Teleporting is never free (only the lobby is, since that's down): back to your own checkpoint
// costs twice what it paid, up to another stage you've reached costs four times
export const tpPrice = (i, own) => Math.max(5, Math.round(((STAGES[i] || {}).wins || 2) * (own ? 2 : 4)));
export const priceOf = (kind, key, p) => (kind === 'product' && key === 'Skip' ? skipPrice(p ? p.stage : -1) : ((kind === 'pass' ? PASSES : PRODUCTS)[key] || {}).price);
export const passForGear = (gearId) => Object.keys(PASSES).find((k) => PASSES[k].gear === gearId);

// ----- Admin commands (cosmetic; everyone sees them). Letters are what the server syncs. -----
export const ADMIN = [
    { id: 'g', name: 'Giant', ic: '🦖', desc: 'Grow huge', group: 'size' },
    { id: 't', name: 'Tiny', ic: '🐜', desc: 'Shrink down', group: 'size' },
    { id: 'p', name: 'Spin', ic: '🌀', desc: 'Spin like a top' },
    { id: 's', name: 'Sparkles', ic: '✨', desc: 'Sparkle wherever you go' },
    { id: 'r', name: 'Rainbow', ic: '🌈', desc: 'A rainbow aura' },
];
export const cleanFx = (s) => {
    let out = '';
    for (const a of ADMIN) if (String(s || '').includes(a.id) && !(a.group && ADMIN.some((b) => b.group === a.group && out.includes(b.id)))) out += a.id;
    return out;
};

// ----- playtime gifts (minutes played this session) -----
export const GIFTS = [
    { min: 2, wins: 10 }, { min: 5, wins: 15 }, { min: 10, wins: 25 }, { min: 15, boost: true },
    { min: 20, wins: 50 }, { min: 30, wins: 75 }, { min: 45, wins: 120 }, { min: 60, wins: 200 },
];
// ----- daily rewards (7-day streak) -----
export const DAILY = [
    { wins: 15 }, { wins: 25 }, { wins: 40 }, { boost: true }, { wins: 75 }, { wins: 120 }, { wins: 300, pet: 'bunny' },
];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
export const rewardText = (r) => [
    r.wins ? '+' + fmt(r.wins) + ' Wins' : '',
    r.boost ? '15 min x2 Wins' : '',
    r.pet ? 'a ' + petById[r.pet].name : '',
].filter(Boolean).join(' + ');

export const CODES = {
    STRAWBERRY: { wins: 50 },
    BERRY: { wins: 75 },
    SWEET: { wins: 30 },
    LEGION: { wins: 100 },
    RELEASE: { boost: true },
};

export const petSlots = () => CFG.petSlots;
// Wins multiplier: pets, x2 Wins pass, x2 boost, Friend Boost
export function winsMult(p, now, friends) {
    let m = petMult(p.equippedPets);
    if (p.passes && p.passes.DoubleWins) m *= 2;
    if ((p.boostUntil || 0) > now) m *= 2;
    m *= 1 + CFG.friendBoost * Math.min(CFG.friendMax, friends || 0);
    return m;
}

// Player outfits for the blocky fallback body (cycle by join order); the reference's default
// black hoodie first
export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x24242c, socks: 0x1c1c22, hair: 0x8a4a1a },
    { shirt: 0xff7ab0, shorts: 0x3a3a5a, socks: 0xffffff, hair: 0x3a2618 },
    { shirt: 0x3ac8ff, shorts: 0x2a2a4a, socks: 0xffffff, hair: 0xffd028 },
    { shirt: 0x6aff5a, shorts: 0x2a3a2a, socks: 0xffffff, hair: 0x3a2618 },
    { shirt: 0xffd028, shorts: 0x3a2a1a, socks: 0xffffff, hair: 0xb8541c },
    { shirt: 0xc45aff, shorts: 0x2a1a3a, socks: 0xffffff, hair: 0xff8ad8 },
];
export const SKINS = [0xf2c9a0, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

// ----- formatting -----
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 10) / 10) + u[i];
}
export const fmtComma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}
export function playtimeText(s) {
    s = Math.floor(s || 0);
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
