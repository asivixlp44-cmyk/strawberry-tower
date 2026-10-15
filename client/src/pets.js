// Pets: cute animals that float after you (the reference's pet pads: a unicorn, a black kitty, a
// tiger, a puppy), plus a berry bunny, a strawberry slime and a berry dragon. Each is built from a
// few matte shapes with a face, then merged into a couple of meshes.
import { T, mergeChildren, tintMat, bakeTints } from './engine.js';

const S = (r, w, h) => new T.SphereGeometry(r, Math.min(w || 14, 14), Math.min(h || 10, 10));
// every colour ends up in the vertices of one shared material (see bakeTints)
const bodyMat = (c) => tintMat(c);
const eyeMat = () => tintMat(0x1a1420, true);
const whiteMat = () => tintMat(0xffffff, true);
const blushMat = () => tintMat(0xffa0c4, true);
const leafMat = () => tintMat(0x5ad86a);
const goldMat = () => tintMat(0xffd028);

// Two shiny eyes, rosy cheeks and a little smile on the front (+z) of a head of radius r at (0, cy, cz)
function face(g, r, cy, cz) {
    for (const sx of [-1, 1]) {
        const e = new T.Mesh(S(r * 0.16, 10, 8), eyeMat()); e.scale.set(1, 1.25, 0.6); e.position.set(sx * r * 0.36, cy + r * 0.12, cz + r * 0.86); g.add(e);
        const s = new T.Mesh(S(r * 0.055, 6, 5), whiteMat()); s.position.set(sx * r * 0.36 - r * 0.05, cy + r * 0.22, cz + r * 0.94); g.add(s);
        const b = new T.Mesh(new T.CircleGeometry(r * 0.13, 12), blushMat()); b.position.set(sx * r * 0.6, cy - r * 0.08, cz + r * 0.78); b.rotation.y = sx * 0.6; g.add(b);
    }
    const mouth = new T.Mesh(new T.TorusGeometry(r * 0.1, r * 0.03, 5, 10, Math.PI), eyeMat()); mouth.position.set(0, cy - r * 0.12, cz + r * 0.97); mouth.rotation.z = Math.PI; g.add(mouth);
}
const part = (g, geo, m, x, y, z, sx, sy, sz) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); g.add(o); return o; };
function stripes(g, def, cy, r) {
    // dark tiger stripes wrapped over the head and back
    for (let k = -1; k <= 1; k++) part(g, new T.TorusGeometry(r * 1.0, r * 0.08, 5, 16, Math.PI * 0.7), bodyMat(def.accent), 0, cy, k * r * 0.4, 1, 1, 1).rotation.set(0, Math.PI / 2, Math.PI * 0.15);
}

const KINDS = {
    bunny(g, def) {
        part(g, S(0.85), bodyMat(def.color), 0, 0.85, 0, 1, 0.95, 0.95);
        part(g, S(0.72), bodyMat(def.color), 0, 1.85, 0.25);
        for (const sx of [-1, 1]) {
            const ear = part(g, new T.CapsuleGeometry(0.2, 0.85, 4, 8), bodyMat(def.color), sx * 0.32, 2.75, 0.15);
            ear.rotation.z = sx * -0.18;
            part(g, new T.CapsuleGeometry(0.1, 0.6, 4, 6), bodyMat(def.accent), sx * 0.34, 2.75, 0.3).rotation.z = sx * -0.18;
        }
        // a strawberry on its belly
        part(g, S(0.3, 10, 8), bodyMat(0xff3a5a), 0, 0.85, 0.85, 1, 1.2, 0.6);
        part(g, new T.ConeGeometry(0.2, 0.15, 6), leafMat(), 0, 1.18, 0.82);
        face(g, 0.72, 1.85, 0.25);
    },
    dog(g, def) {
        part(g, S(0.8), bodyMat(def.color), 0, 0.8, -0.1, 1, 0.9, 1.15);
        part(g, S(0.7), bodyMat(def.color), 0, 1.7, 0.35);
        for (const sx of [-1, 1]) part(g, S(0.3, 10, 8), bodyMat(def.accent), sx * 0.7, 1.75, 0.3, 0.55, 1.35, 0.45).rotation.z = sx * 0.4;
        part(g, S(0.26, 10, 8), bodyMat(0xffe8d0), 0, 1.5, 0.95, 1.1, 0.8, 0.8);
        part(g, S(0.09, 8, 6), eyeMat(), 0, 1.62, 1.16);
        part(g, new T.CapsuleGeometry(0.1, 0.5, 4, 6), bodyMat(def.color), 0, 1.1, -1.0).rotation.x = -0.8;
        face(g, 0.7, 1.75, 0.35);
    },
    cat(g, def) {
        part(g, S(0.8), bodyMat(def.color), 0, 0.8, -0.1, 1, 0.9, 1.15);
        part(g, S(0.72), bodyMat(def.color), 0, 1.75, 0.3);
        for (const sx of [-1, 1]) part(g, new T.ConeGeometry(0.28, 0.55, 4), bodyMat(def.color), sx * 0.42, 2.45, 0.25).rotation.set(0, Math.PI / 4, sx * -0.2);
        part(g, new T.CapsuleGeometry(0.1, 1.0, 4, 6), bodyMat(def.color), 0, 1.4, -1.05).rotation.x = -0.4;
        // golden eyes for the midnight kitty
        for (const sx of [-1, 1]) part(g, S(0.14, 8, 6), bodyMat(def.accent), sx * 0.26, 1.86, 0.92, 1, 1.2, 0.5);
        face(g, 0.72, 1.75, 0.3);
    },
    tiger(g, def) {
        KINDS.cat(g, def);
        stripes(g, def, 1.75, 0.72);
        part(g, S(0.3, 10, 8), bodyMat(0xfff0e0), 0, 1.55, 0.88, 1.2, 0.8, 0.6);
    },
    slime(g, def) {
        part(g, S(1, 24, 16), bodyMat(def.color), 0, 0.85, 0, 1.12, 0.85, 1.1);
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; part(g, new T.ConeGeometry(0.28, 0.7, 5), leafMat(), Math.cos(a) * 0.45, 1.62, Math.sin(a) * 0.45).rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
        part(g, new T.CylinderGeometry(0.08, 0.1, 0.4, 6), leafMat(), 0, 1.8, 0);
        for (let k = 0; k < 10; k++) { const a = k * 2.4, y = 0.5 + (k % 3) * 0.3; part(g, S(0.06, 6, 4), goldMat(), Math.cos(a) * 1.05, y, Math.sin(a) * 1.0); }
        face(g, 1.0, 0.95, 0.12);
    },
    unicorn(g, def) {
        part(g, S(0.85), bodyMat(def.color), 0, 0.95, -0.15, 1, 0.9, 1.2);
        part(g, S(0.7), bodyMat(def.color), 0, 1.9, 0.45);
        part(g, new T.ConeGeometry(0.16, 0.85, 10), goldMat(), 0, 2.75, 0.65).rotation.x = 0.35;
        for (const sx of [-1, 1]) part(g, new T.ConeGeometry(0.16, 0.4, 5), bodyMat(def.color), sx * 0.38, 2.5, 0.35);
        // pastel mane and tail
        const mane = [0xff7ad8, 0xb88aff, 0x7ad8ff, 0xffe07a];
        mane.forEach((c, i) => part(g, S(0.24, 10, 8), bodyMat(c), 0, 2.35 - i * 0.28, 0.0 - i * 0.18));
        part(g, S(0.3, 10, 8), bodyMat(0xb88aff), 0, 1.1, -1.25, 0.8, 1.4, 0.8);
        for (const [x, z] of [[-0.45, 0.35], [0.45, 0.35], [-0.45, -0.6], [0.45, -0.6]]) part(g, new T.CylinderGeometry(0.17, 0.15, 0.6, 8), bodyMat(def.color), x, 0.3, z);
        face(g, 0.7, 1.9, 0.45);
    },
    dragon(g, def) {
        part(g, S(0.95, 22, 16), bodyMat(def.color), 0, 1, 0, 1, 0.95, 1.05);
        for (const sx of [-1, 1]) {
            part(g, new T.ConeGeometry(0.62, 1.45, 3), bodyMat(def.accent), sx * 1.05, 1.4, -0.3).rotation.set(0.3, 0, sx * -1.1);
            part(g, new T.ConeGeometry(0.14, 0.5, 8), goldMat(), sx * 0.4, 1.98, 0);
        }
        part(g, S(0.45, 12, 8), bodyMat(0xffe0b0), 0, 0.8, 0.7, 1.1, 1, 0.6);
        // a leafy strawberry crown on the berry dragon
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; part(g, new T.ConeGeometry(0.16, 0.45, 5), leafMat(), Math.cos(a) * 0.25, 2.05, Math.sin(a) * 0.25 - 0.2).rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); }
        face(g, 0.95, 1.05, 0.0);
    },
};

// A pet about 2-3 studs tall, standing on its own origin, facing +z
export function petModel(def) {
    const g = new T.Group();
    (KINDS[def.kind] || KINDS.slime)(g, def);
    bakeTints(g);
    mergeChildren(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
}

// ----- following: up to three pets float in a little arc behind their owner -----
const SLOTS = [[-2.6, -2.2], [2.6, -2.2], [0, -3.6], [-4.2, -0.4]];
export class PetTrain {
    constructor(scene) { this.scene = scene; this.ids = ''; this.list = []; }
    set(defs) {
        const key = (defs || []).map((d) => d.id).join(',');
        if (key === this.ids) return;
        this.ids = key;
        for (const p of this.list) this.scene.remove(p.g);
        this.list = (defs || []).slice(0, 4).map((def, i) => {
            const g = petModel(def);
            g.scale.setScalar(0.85);
            this.scene.add(g);
            return { g, i, def, pos: null, phase: Math.random() * 6 };
        });
    }
    update(owner, yaw, dt, t, visible) {
        const k = 1 - Math.exp(-dt * 6);
        for (const p of this.list) {
            const [sx, sz] = SLOTS[p.i];
            const c = Math.cos(yaw), s = Math.sin(yaw);
            const tx = owner.x + sx * c + sz * s, tz = owner.z - sx * s + sz * c;
            const ty = owner.y + 1.2 + Math.sin(t * 3 + p.phase) * 0.35;
            if (!p.pos) p.pos = new T.Vector3(tx, ty, tz);
            const dx = tx - p.pos.x, dz = tz - p.pos.z;
            if (dx * dx + dz * dz > 900) p.pos.set(tx, ty, tz);
            p.pos.x += dx * k; p.pos.y += (ty - p.pos.y) * k; p.pos.z += dz * k;
            p.g.position.copy(p.pos);
            // face the way it's going, or the owner's way when settled
            const want = dx * dx + dz * dz > 0.3 ? Math.atan2(dx, dz) : yaw;
            let d = want - p.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
            p.g.rotation.y += d * Math.min(1, dt * 6);
            // squish bounce
            const sq = 1 + Math.sin(t * 6 + p.phase) * 0.05;
            p.g.scale.set(0.85 / Math.sqrt(sq), 0.85 * sq, 0.85 / Math.sqrt(sq));
            p.g.visible = visible;
        }
    }
    dispose() { for (const p of this.list) this.scene.remove(p.g); this.list = []; }
}
