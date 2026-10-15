// The Strawberry Tower obby, as plain data shared by the client (which builds meshes and colliders
// from it) and the server (which checks checkpoints, strawberries and the summit against it).
//
// The course runs around the inside of the square tower, one wall at a time, rising as it goes:
// corner landings at (±50, ±50), 14 x 14 studs; between two corners lies a "side" 100 studs long
// (u = 0 at the first corner, 100 at the next; v = sideways, positive toward the middle of the
// tower, the wall face is at v = -14). Two sides make a stage; every stage ends in a checkpoint on
// its last corner. The last stage ends at the summit platform floating in the middle of the tower,
// under the giant strawberry.
//
// Coordinates are studs; y is the top of whatever you stand on.
import { STAGES } from './config.js';

const K = [[-50, -50], [-50, 50], [50, 50], [50, -50]];
// Top of each corner landing; corner 0 is the lobby floor (the strawberry steps start from it)
export const CORNER_Y = [0, 22, 36, 48, 58, 66, 76, 96, 104, 114, 124, 132, 142, 160, 172, 180, 190, 198, 208, 216, 226, 234, 244, 256, 270];
export const LAND = 14;               // corner landing size
export const cornerXZ = (c) => K[c % 4];

export const COURSE = [];             // every element: { t, zone, ... } (see the builders below)
export const CHECKPOINTS = [];        // { i, x, y, z, yaw }: y = top of the pad
export const COINS = [];              // { i, x, y, z, zone }: floating strawberries, +1 Win each
let coinN = 0;

function side(s, fn) {
    const a = K[s % 4], b = K[(s + 1) % 4];
    const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const nx = mx === 0 ? 0 : -Math.sign(mx), nz = mz === 0 ? 0 : -Math.sign(mz);
    const alongX = dx !== 0;
    const zone = s >> 1;
    const X = (u, v) => a[0] + dx * u + nx * v, Z = (u, v) => a[1] + dz * u + nz * v;
    const SX = (lu, lv) => (alongX ? lu : lv), SZ = (lu, lv) => (alongX ? lv : lu);
    // a world-space offset for a local (du, dv) move
    const OX = (du, dv) => dx * du + nx * dv, OZ = (du, dv) => dz * du + nz * dv;
    const push = (o) => { o.zone = zone; o.side = s; COURSE.push(o); return o; };
    const box = (t, u, v, lu, lv, top, h, extra) => push({ t, x: X(u, v), y: top - h / 2, z: Z(u, v), sx: SX(lu, lv), sy: h, sz: SZ(lu, lv), ...extra });
    const c = {
        s, zone, y0: CORNER_Y[s], y1: CORNER_Y[s + 1], alongX,
        // a giant strawberry to stand on (flat leafy top at `top`)
        berry: (u, v, r, top) => push({ t: 'berry', x: X(u, v), z: Z(u, v), r, top }),
        // a studded plastic block; color: a palette name (rose, red, pink, white, cyan, grey, rainbow:N)
        block: (u, v, lu, lv, top, h, color) => box('block', u, v, lu, lv, top, h || 2, { color: color || 'rose' }),
        // a slab of strawberry shortcake: sponge, cream, berries on top
        cake: (u, v, lu, lv, top) => box('cake', u, v, lu, lv, top, 3.2, { alongX }),
        // a soft whipped cream dome that squishes when you stand on it
        cream: (u, v, r, top, h) => push({ t: 'cream', x: X(u, v), z: Z(u, v), r, h: h || 3, y0: top - (h || 3) }),
        truss: (u, v, lu, lv, bottom, top) => push({ t: 'truss', x: X(u, v), y: (bottom + top) / 2, z: Z(u, v), sx: SX(lu, lv), sy: top - bottom, sz: SZ(lu, lv) }),
        // a tub of strawberry milk: you wade through it slowly
        milk: (u, v, lu, lv, top, h) => push({ t: 'milk', x: X(u, v), top, z: Z(u, v), sx: SX(lu, lv), sz: SZ(lu, lv), h: h || 4 }),
        // glossy pink icing: slippery
        icing: (u, v, lu, lv, top, h) => box('icing', u, v, lu, lv, top, h || 3, { alongX }),
        bounce: (u, v, lu, lv, top, r) => {
            box('block', u, v, lu, lv, top, 2.5, { color: 'white' });
            push({ t: 'bounce', x: X(u, v), z: Z(u, v), top: top + 0.5, r: r || 2.4 });
        },
        // moving platform: du/dv/dy = how far it swings each way, period in seconds
        mover: (u, v, lu, lv, top, h, du, dv, dy, period, phase, look) => push({
            t: 'mover', x: X(u, v), y: top - h / 2, z: Z(u, v), sx: SX(lu, lv), sy: h, sz: SZ(lu, lv),
            ax: OX(du, dv), ay: dy, az: OZ(du, dv), period, phase: phase || 0, look: look || 'plate',
        }),
        // a red piston pumping up and down: top goes from `top` down by amp
        piston: (u, v, lu, lv, top, amp, period, phase) => push({ t: 'piston', x: X(u, v), top, z: Z(u, v), sx: SX(lu, lv), sz: SZ(lu, lv), amp, period, phase }),
        vanish: (u, v, lu, lv, top) => box('vanish', u, v, lu, lv, top, 2),
        spinner: (u, v, r, top, speed) => push({ t: 'spinner', x: X(u, v), z: Z(u, v), top, r, speed }),
        sweeper: (u, v, len, y, speed, phase) => push({ t: 'sweeper', x: X(u, v), z: Z(u, v), y, len, speed, phase: phase || 0 }),
        coin: (u, v, y) => { const o = { i: coinN++, x: X(u, v), y, z: Z(u, v), zone }; COINS.push(o); push({ t: 'coin', ...o }); },
    };
    fn(c);
}

// The stages, hard version (2026-10-15): the same spiral and the same heights as before, but every
// target is smaller and narrower and the side-to-side offsets are bigger, so you have to stop where
// you land. Jump reach at walking speed is about 8.9 studs for a +1 rise, 8.4 for +2, 7.7 for +3;
// every gap here leaves at least a stud of that (checked by the QA bot), and the moving parts are
// timed by the stage speeds in config.js.
// ===================== Stage 1: Strawberry Steps (EASY) =====================
side(0, (c) => {
    // From the lobby floor, giant strawberries climb along the west wall, zig-zagging
    for (let i = 0; i < 10; i++) {
        c.berry(10 + i * 8.6, i % 2 ? 2.5 : -2.5, 2.8, 2.2 + i * 2.1);
        if (i === 3 || i === 7) c.coin(10 + i * 8.6, i % 2 ? 2.5 : -2.5, 2.2 + i * 2.1 + 2.6);
    }
});
side(1, (c) => {
    const us = [13, 25, 37, 49, 61, 73, 86], tops = [23.5, 25, 26.5, 28.5, 30.5, 32.5, 34.5], vs = [0, 3, -2, 2, -3, 1, 0];
    us.forEach((u, i) => {
        if (i % 2) c.berry(u, vs[i], 2.6, tops[i]);
        else c.block(u, vs[i], 4, 4, tops[i], 2.4, 'red');
        if (i === 2 || i === 5) c.coin(u, vs[i], tops[i] + 2.6);
    });
});
// ===================== Stage 2: Shortcake Stairs (MEDIUM) =====================
side(2, (c) => {
    const us = [15, 32, 49, 66, 83], tops = [37.5, 39.5, 41.5, 44, 46.5], vs = [0, 2.5, -2.5, 2.5, 0];
    us.forEach((u, i) => {
        c.cake(u, vs[i], 9, 6.5, tops[i]);
        if (i === 1 || i === 3) c.coin(u, vs[i], tops[i] + 2.6);
    });
});
side(3, (c) => {
    const us = [16, 34, 52, 70, 87], lus = [10, 10, 9, 10, 8], lvs = [6, 6, 3.8, 6, 6], vs = [-2.5, 3, -2, 2.5, 0];
    const tops = [49.5, 51.5, 53, 55, 56.5];
    us.forEach((u, i) => {
        c.cake(u, vs[i], lus[i], lvs[i], tops[i]);
        if (i === 2) c.coin(u, vs[i], tops[i] + 2.6);
    });
});
// ===================== Stage 3: Cream Puffs (MEDIUM) =====================
side(4, (c) => {
    const us = [13, 22.5, 32, 41.5, 52.5, 63.5, 73, 82.5, 90], vs = [0, 2.5, -2.5, 1.5, 0, -2, 2.5, -1.5, 0];
    const tops = [60, 60.5, 61, 61.5, 63, 63, 63.5, 64, 64.5];
    us.forEach((u, i) => {
        if (i === 4) c.cream(u, vs[i], 5, tops[i], 4.2);           // the big cream puff
        else c.cream(u, vs[i], 3.4, tops[i], 3);
    });
    c.coin(52.5, 0, 66);
});
side(5, (c) => {
    const items = [
        ['cube', 12, 0, 67.5], ['puff', 21, 2.5, 69], ['cube', 30, -1.5, 70], ['puff', 39, 1.5, 71], ['cube', 48, -2.5, 72],
        ['puff', 57, 1.5, 73], ['cube', 66, 0, 73.5], ['puff', 75, -1.5, 74], ['cube', 83, 1.5, 75], ['cube', 89, 0, 75],
    ];
    for (const [k, u, v, top] of items) {
        if (k === 'cube') c.block(u, v, 3, 3, top, 2.5, 'red'); else c.cream(u, v, 2.8, top, 2.5);
    }
    c.coin(48, -2.5, 74.6);
    c.coin(75, -1.5, 76.6);
});
// ===================== Stage 4: Milk Pools (HARD) =====================
side(6, (c) => {
    c.milk(20, 0, 22, 7, 77);
    c.truss(32.5, 0, 3, 6, 77, 87);
    c.milk(47, 0, 26, 7, 87);
    c.truss(61.5, 0, 3, 6, 87, 96);
    c.milk(77.5, 0, 29, 7, 96);
    c.coin(47, 0, 89.6);
    c.coin(80, 2, 98.6);
});
side(7, (c) => {
    c.milk(17, 0, 14, 6, 97);
    c.milk(35, 0, 12, 6, 98.5);
    c.truss(42.5, 0, 3, 5, 98.5, 106);
    c.milk(50, 0, 12, 6, 106);
    c.milk(68, 1.5, 14, 5, 103);
    c.milk(86, -1.5, 12, 5, 103.5);
    c.coin(50, 0, 108.6);
});
// ===================== Stage 5: Icing Bridge (HARD) =====================
side(8, (c) => {
    const us = [15, 32, 49, 66, 83], vs = [-2, 2, -2, 2, 0], tops = [105, 106.5, 108, 109.5, 111.5];
    us.forEach((u, i) => c.icing(u, vs[i], 11, 3.6, tops[i], 3));
    c.icing(49, -2, 3, 3, 110, 2);                               // a dollop of icing to hop over
    c.coin(32, 2, 109.1);
    c.coin(83, 0, 115.1);
});
side(9, (c) => {
    [12, 20, 28, 36].forEach((u, i) => c.icing(u, i % 2 ? 2 : -2, 3.6, 3.6, 115 + i * 1.5, 4));
    c.icing(52, 0, 22, 2, 120, 2.5);                             // the narrow icing beam
    [69, 77, 85].forEach((u, i) => c.icing(u, i % 2 ? -1.8 : 1.8, 3.6, 3.6, 120.8 + i, 4));
    c.coin(52, 0, 122.6);
});
// ===================== Stage 6: Lego Run (HARD) =====================
side(10, (c) => {
    const us = [13, 25, 37, 49, 61, 73, 85], vs = [0, 3, -3, 3, -3, 2, 0];
    us.forEach((u, i) => c.block(u, vs[i], 4, 4, 125 + i, 1.4, 'cyan'));
    c.coin(37, -3, 129.6);
    c.coin(73, 2, 132.6);
});
side(11, (c) => {
    c.block(12, 0, 4, 4, 133, 1.4, 'cyan');
    c.mover(25, 0, 4.5, 4.5, 134, 1.4, 0, 7, 0, 3.4, 0, 'lego');
    c.block(38, 0, 4, 4, 135.5, 1.4, 'cyan');
    c.mover(51, 0, 4.5, 4.5, 137, 1.4, 4, 0, 0, 3, 0.3, 'lego');
    c.block(64, 0, 3.5, 3.5, 138.5, 1.4, 'cyan');
    c.mover(76, 0, 4.5, 4.5, 140, 1.4, 0, 8, 0, 3.8, 0.6, 'lego');
    c.block(88, 0, 3.5, 3.5, 141, 1.4, 'cyan');
    c.coin(38, 0, 138.1);
});
// ===================== Stage 7: Cream Bounce (EXTREME) =====================
side(12, (c) => {
    c.bounce(15, 0, 6, 6, 143, 2);
    c.bounce(33, 0, 5.5, 5.5, 151, 1.9);
    c.block(52, 0, 6, 5, 157, 3, 'rose');
    c.block(67, 0, 3.5, 3.5, 158.5, 2, 'pink');
    c.block(80, 0, 3.5, 3.5, 159, 2, 'pink');
    c.block(90, 0, 4, 4, 159.5, 2, 'pink');
    c.coin(24, 0, 158);
    c.coin(52, 0, 159.6);
});
side(13, (c) => {
    [13, 28, 43, 58, 73].forEach((u, i) => c.bounce(u, i % 2 ? 3 : -3, 3.2, 3.2, 161 + i * 2, 1.4));
    c.block(88, 0, 4.5, 6, 171, 2, 'pink');
    c.coin(35.5, 0, 176);
    c.coin(65.5, 0, 180);
});
// ===================== Stage 8: Sky Plates (EXTREME) =====================
side(14, (c) => {
    c.block(13, 0, 4.5, 4.5, 173, 2, 'grey');
    c.mover(26, 0, 4.6, 4.6, 174, 1.5, 7, 0, 0, 3.4, 0);
    c.block(42, 0, 3.6, 3.6, 175, 2, 'grey');
    c.mover(55, 0, 4.6, 4.6, 176.5, 1.5, 0, 8, 0, 3, 0.25);
    c.block(68, 0, 4, 4, 177.5, 2, 'grey');
    c.mover(81, 0, 4.6, 4.6, 179, 1.5, 6, 0, 0, 2.8, 0.5);
    c.coin(42, 0, 177.6);
});
side(15, (c) => {
    c.mover(16, 0, 4.6, 4.6, 184, 1.5, 0, 0, 3.5, 3.2, 0);
    c.block(29, 0, 3.6, 3.6, 186, 2, 'grey');
    c.mover(42, 0, 4.6, 4.6, 187, 1.5, 0, 0, 3.5, 3.4, 0.5);
    c.block(55, 0, 3.6, 3.6, 189, 2, 'grey');
    c.mover(68, 0, 4, 4, 189, 1.5, 0, 7, 0, 3, 0.2);
    c.block(81, 0, 6, 6, 189.5, 2, 'grey');
    c.coin(55, 0, 191.6);
});
// ===================== Stage 9: Piston Press (EXTREME) =====================
side(16, (c) => {
    for (let i = 0; i < 12; i++) c.piston(11 + i * 7, i % 2 ? 1.6 : -1.6, 2.8, 2.8, 191 + i * 0.55, 3.2, 2.4, i * 0.15);
    c.coin(46, 0, 196.5);
});
side(17, (c) => {
    c.block(13, 0, 4.5, 4.5, 199, 2.4, 'red');
    c.mover(27, 0, 2.4, 10, 200.5, 1, 5, 0, 0, 2.6, 0, 'wafer');
    c.block(41, 0, 4.5, 4.5, 202, 2.4, 'red');
    c.piston(50, 0, 2.8, 2.8, 203.5, 2.8, 2, 0);
    c.piston(56, 0, 2.8, 2.8, 204, 2.8, 2, 0.5);
    c.block(66, 0, 4.5, 4.5, 204.5, 2.4, 'red');
    c.mover(77, 0, 2.4, 8, 206, 1, 0, 6, 0, 2.8, 0.3, 'wafer');
    c.block(87, 0, 4, 4.5, 207, 2.4, 'red');
    c.coin(41, 0, 204.6);
});
// ===================== Stage 10: Jelly Drops (INSANE) =====================
side(18, (c) => {
    for (let i = 0; i < 11; i++) c.vanish(12 + i * 7.8, i % 2 ? 3 : -3, 3.2, 3.2, 209 + i * 0.65);
    c.coin(43.2, 3, 213.6);
});
side(19, (c) => {
    c.cream(13, 0, 2.8, 217.5, 2.5);
    c.vanish(21, 2, 3.2, 3.2, 218.5);
    c.cream(29, 0, 2.6, 219.5, 2.5);
    c.vanish(37, -2, 3.2, 3.2, 220.5);
    c.vanish(44, 1, 2.6, 2.6, 221);
    c.cream(52, 0, 2.6, 222, 2.5);
    c.vanish(60, 2, 2.6, 2.6, 222.8);
    c.vanish(67, -1, 2.6, 2.6, 223.4);
    c.cream(75, 0, 2.6, 224, 2.5);
    c.vanish(83, 1, 3.2, 3.2, 224.8);
    c.vanish(90, 0, 2.6, 2.6, 225.3);
    c.coin(52, 0, 225.6);
});
// ===================== Stage 11: Berry Spinners (INSANE) =====================
side(20, (c) => {
    [14, 28, 42, 56, 70, 84].forEach((u, i) => c.spinner(u, 0, 3.5, [227, 228.5, 230, 231, 232, 233][i], i % 2 ? -0.9 : 0.9));
    c.coin(42, 0, 232.6);
});
side(21, (c) => {
    c.block(22, 0, 26, 5, 235, 2, 'pink');
    c.block(48.5, 0, 27, 5, 238, 2, 'pink');
    c.block(77, 0, 30, 5, 241, 2, 'pink');
    // short candy sticks with safe spots between them: wait in one, then time the dash
    c.sweeper(22, 0, 4.2, 235, 1.6, 0);
    c.sweeper(43, 0, 4, 238, -1.8, 1);
    c.sweeper(55, 0, 4, 238, 1.7, 2.4);
    c.sweeper(70, 0, 4.2, 241, 2.0, 2);
    c.sweeper(84, 0, 4.2, 241, -1.9, 0.7);
    c.coin(35, 0, 237.6);
    c.coin(62, 0, 240.6);
});
// ===================== Stage 12: Strawberry Summit (INSANE) =====================
side(22, (c) => {
    c.cake(13, 0, 6, 6, 245);
    c.truss(17.5, 0, 3, 5, 245, 252);
    c.milk(29, 0, 18, 5, 252);
    c.cream(46, 1.5, 2.6, 253, 3);
    c.cream(55, -1.5, 2.6, 253.5, 3);
    c.vanish(63, 0, 2.4, 2.4, 254);
    c.vanish(70, 2, 2.4, 2.4, 254.5);
    c.vanish(77, -1, 2.4, 2.4, 254.8);
    c.cake(87, 0, 6, 6, 255);
    c.coin(29, 0, 254.6);
});
side(23, (c) => {
    for (let i = 0; i < 11; i++) c.block(11 + i * 8, i % 2 ? 2.4 : -2.4, 3, 3.6, 257.2 + i * 1.2, 1.4, 'rainbow:' + i);
    c.coin(51, 2.4, 264.6);
});

// ===================== corners, checkpoints, the summit =====================
// Corner landings 1..24; even corners 2..22 are the checkpoints of stages 1..11
for (let cn = 1; cn < CORNER_Y.length; cn++) {
    const [x, z] = K[cn % 4], y = CORNER_Y[cn];
    const zone = Math.min(STAGES.length - 1, (cn - 1) >> 1);
    COURSE.push({ t: 'land', x, z, top: y, s: LAND, zone, last: cn === CORNER_Y.length - 1 });
    if (cn % 2 === 0 && cn < CORNER_Y.length - 1) {
        // Face along the next side
        const b = K[(cn + 1) % 4];
        const yaw = Math.atan2(b[0] - x, b[1] - z);
        const cp = { i: cn / 2 - 1, x, y, z, yaw };
        CHECKPOINTS.push(cp);
        COURSE.push({ t: 'cp', ...cp, zone: cp.i });
    }
}
// Diagonal sprinkle-coloured stepping stones from the last corner out to the summit in the middle
const SUM_STONES = [[-42, 270.5], [-35, 271], [-28, 271.5], [-21, 272], [-14, 272.5]];
SUM_STONES.forEach(([p, top], i) => COURSE.push({ t: 'block', x: p, y: top - 0.8, z: p, sx: 5, sy: 1.6, sz: 5, zone: STAGES.length - 1, color: 'rainbow:' + (i * 2) }));
export const SUMMIT = { x: 0, y: 273, z: 0, r: 12, pad: 4.5 };
COURSE.push({ t: 'summit', ...SUMMIT, zone: STAGES.length - 1 });

// Gear pads on three landings up the tower (step on one to see the gear)
export const TOWER_GEAR = [
    { gear: 'gravityCoil', corner: 6 }, { gear: 'fusionCoil', corner: 12 }, { gear: 'carpet', corner: 18 },
].map((g) => {
    const [x, z] = K[g.corner % 4];
    // on a small platform between the landing and the east / west wall
    return { gear: g.gear, x: x + Math.sign(x) * 10.5, y: CORNER_Y[g.corner], z, zone: (g.corner >> 1) - 1 };
});

// The lobby's strawberry staircase: giant strawberries rising along the inside of the south wall
// (like the reference) up to a secret golden strawberry worth bonus Wins every few minutes
export const BONUS_STEPS = Array.from({ length: 10 }, (_, i) => ({ x: 40 - i * 7.4, z: -56 + (i % 2 ? 1.2 : -1.2), top: 3.2 + i * 2.55, r: 3.2 }));
export const BONUS = { x: -34.5, y: BONUS_STEPS[9].top + 1.6, z: -57, ledge: { x: -34.5, z: -57, sx: 9, sz: 9, top: BONUS_STEPS[9].top + 1 } };

// Where you stand when teleported to checkpoint i (0-based; -1 = lobby)
export function checkpointSpot(i) {
    const cp = CHECKPOINTS[i];
    return cp ? { x: cp.x, y: cp.y + 0.6, z: cp.z, yaw: cp.yaw } : null;
}
// Stage (0-based) a height belongs to, from the corner heights; -1 below the first stage
export function stageAtY(y) {
    if (y < 1.5) return -1;
    for (let k = 0; k < STAGES.length; k++) if (y < CORNER_Y[2 * k + 2] + 8) return k;
    return STAGES.length - 1;
}
// The same, but the lobby's strawberry staircase (along the south wall) still counts as the lobby
export function stageAt(x, y, z) {
    if (y < 36 && z < -51 && x > -43) return -1;
    return stageAtY(y);
}
export const COURSE_TOP = SUMMIT.y;
