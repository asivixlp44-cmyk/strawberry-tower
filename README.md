# Strawberry Tower

A multiplayer pink tower obby for the browser, built with **Three.js** and **Colyseus** for Bloxity. Climb twelve strawberry stages up the inside of a giant studded pink tower that floats above a sea of clouds, from the giant strawberry steps to the giant smiling strawberry at the top. It clones the Roblox game *[Strawberry Tower](https://www.roblox.com/games/139733286702777/Strawberry-Tower)* (see `reference/Gameplay.mp4`).

**There are no in-app purchases.** Gear, Admin, Nuke, pets and trails are all bought with **Wins**, earned by climbing.

It shares its engine with the other Legion games (server, Bloxity login and avatars, profiles, saves). The tower, the course, the lobby, the HUD, the pets, the gear and the soundtrack are new.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (player, physics, gear, Troll Gun, Admin effects, network, camera, the loading warm-up), `world.js` (the strawberry island, the tower, the lobby, every course element), `materials.js` (strawberry, shortcake, cream, milk, icing, truss, jelly, berry-slice and flag textures), `engine.js` (renderer, sky, lights, Roblox studs, text), `fx.js` (quality presets, one-draw-call particles, trails, rings, fireworks), `gear.js`, `pets.js`, `audio.js` (music and sounds), `ui.js` + `index.html` (HUD and panels) |
| `server/` | Colyseus 0.18 server: the `tower` room (`TowerRoom.js`), profiles, leaderboards, play stats |
| `shared/` | `config.js` (stages and difficulty, Wins economy, pets, trails, gear, Admin commands, rewards) and `course.js` (the obby layout as data, used by both sides) |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2611
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5191 (the client talks to the server on port 2611; `VITE_SERVER_URL` overrides that). Dev builds (or a build with `VITE_QA=1`) expose `window.__qa` for automated test runs.

## Gameplay (from the reference)

- **The lobby** is the tower's ground floor, on a pink studded island that is the top of a giant strawberry floating above the clouds:
  - the shortcake spawn dais (with the reference's sparkly forcefield bubble when you spawn)
  - the **SHOP**: spring pads for the Speed, Gravity and Fusion Coils, the Rainbow Carpet and the Troll Gun, with ad screens
  - the **PET SHOP**: pets standing on pads (Berry Bunny, Choco Puppy, Midnight Kitty, Sunny Tiger, Strawberry Slime, Cotton Unicorn, Berry Dragon), bought straight off the pad
  - a strawberry staircase up the south wall (like the reference's strawberries climbing the wall) to the **secret golden strawberry** (+15 Wins every 10 minutes)
  - the **TRAILS** rack, the **Most Wins / Top Climbers / Playtime** leaderboards high on the north wall
  - the terrace outside with glass panels looking down on the clouds, and the reference's grey bridge with red stripes out to the **World 2** portal (coming soon)
- **The course** spirals up the inside walls, one wall per half-stage, to the summit floating in the middle under the giant strawberry. 12 stages, each ending on a checkpoint with a strawberry flag, and **every stage is harder than the one before** (EASY → MEDIUM → HARD → EXTREME → INSANE; smaller platforms, longer jumps, moving parts up to 2.1x faster, jelly that melts sooner):

  | # | Stage | Difficulty | Moving parts | Checkpoint pays |
  |---|---|---|---|---|
  | 1 | **Strawberry Steps**: giant strawberries up from the lobby | EASY | 1x | 3 Wins |
  | 2 | **Shortcake Stairs**: small slices of strawberry shortcake, offset left and right | MEDIUM | 1x | 4 |
  | 3 | **Cream Puffs**: whipped cream domes that squish | MEDIUM | 1.1x | 6 |
  | 4 | **Milk Pools**: trusses and thick strawberry milk | HARD | 1.15x | 8 |
  | 5 | **Icing Bridge**: glossy, slippery icing and a narrow beam | HARD | 1.2x | 11 |
  | 6 | **Lego Run**: small blue lego blocks, some sliding | HARD | 1.35x | 15 |
  | 7 | **Cream Bounce**: tiny cream trampolines over big gaps | EXTREME | 1.45x | 20 |
  | 8 | **Sky Plates**: grey plates gliding and rising | EXTREME | 1.55x | 27 |
  | 9 | **Piston Press**: red pistons pumping fast, sliding wafers | EXTREME | 1.7x | 36 |
  | 10 | **Jelly Drops**: strawberry jelly that melts 0.4 s after you touch it | INSANE | 1.8x | 48 |
  | 11 | **Berry Spinners**: spinning strawberry slices, then candy sticks sweeping narrow walkways | INSANE | 1.95x | 64 |
  | 12 | **Strawberry Summit**: everything at once (jelly melts in 0.34 s), then the WIN pad | INSANE | 2.1x | +150 at the top |

  The course follows ASMR Tower's spiral, re-skinned and made harder. Bots played every jump: every static side passes, and every moving side passes with timed jumps (the candy-stick walkways need waiting for the stick to pass).
- **Falling** drops you to the floor below (nothing kills you): climb back up, or use the **"Oops! You fell?"** card to teleport back to your checkpoint, which costs Wins. Falling off the island puts you back at the spawn.
- **Teleports cost Wins** (only the lobby is free): your own checkpoint costs twice its stage's checkpoint Wins, an earlier stage you have reached four times (at least 5 Wins). Back to Stage 2 is 6 Wins and back to Stage 12 is 128. The server checks the price and refuses the teleport when you're short.
- **Wins**: each new checkpoint of a climb pays its stage's Wins, floating strawberries +1, the summit +150 (a climb must take at least 45 s). A climb that starts with a teleport up the tower pays a quarter at the top. Wins are multiplied by pets, x2 Wins, the x2 boost and Friend Boost (+10% per Bloxity friend in the server, up to +50%).
- **The reference's buttons**:
  - **Admin** (2.5K): commands everyone sees: Giant, Tiny, Spin, Sparkles, a Rainbow aura and Fireworks.
  - **Nuke** (300): everyone else is blown up and lands back on their own checkpoint (like a Roblox reset), losing their place on the stage (1 minute recharge).
  - **Fly**: the Rainbow Carpet (6K): Space to rise, Shift to sink.
  - **Troll!**: the Troll Gun (400): click a player to zap them and fling them away.
  - **Teleport**: the lobby (free), your checkpoint or any stage you have reached (Wins, see above), or Skip Stage (Wins).
  - **Speed!**: the Speed Coil (75): run 60% faster. **Gravity!**: the Gravity Coil (200): floaty jumps. The Fusion Coil (800) does both.
- **Pets** (50 to 10K, from x1.2 to x5 Wins, 3 equipped at once), **trails** (40 to 12K), **x2 Wins** (4K), **x2 Wins Boost** (150, 15 min), **Daily Rewards** (7 days, a Berry Bunny on day 7), **playtime gifts** and **codes** (`STRAWBERRY`, `BERRY`, `SWEET`, `LEGION`, `RELEASE`).
- **HUD**: the studded Lego buttons as in the reference (Admin / Nuke / Fly / Troll! on the left, Teleport / Speed! / Gravity! on the right), Wins and the Shop / Pets / Trails / Daily / Gifts / Invite / Settings icons top right, the tower progress bar with every player's height along the top, the gear hotbar, Skip, Friend Boost. The top-left corner is kept free for the Bloxity overlay.

## Sound

- **Music**, "Strawberry Pop": an original code-generated 112 BPM bubblegum-pop loop in F major (electric piano, bouncy octave bass, kick and claps, shaker, a marimba-bell hook).
- **Footsteps** per surface, all synthesized: clicky lego studs, juicy strawberries, soft sponge cake, puffy cream, splashy strawberry milk, squeaky icing, wobbly jelly, hollow sky plates. Separate Music / Footsteps / Effects volumes in Settings.

## Graphics and performance

- The reference's look, richer: Roblox studs everywhere as a bevelled normal map (one vertex-coloured material for every studded block, the moving blocks and the pistons), pink tower walls with white-framed windows on a bright sky, a sea of clouds below the island seen past the edge and through glass panels in the floor, giant strawberries with seeds, shortcake, whipped cream, a waving strawberry flag at every checkpoint, clouds and giant strawberries floating around the tower, sugar glitter in the air.
- **Built for weak PCs**: only matte (Lambert) and unlit materials, no reflections, no environment map, no post-processing (the vignette is CSS). Static geometry is merged per stage and material; cream puffs, pistons, the clouds, the trail ribbons and the floating strawberries are instanced; every pet and every piece of gear is one or two meshes (its colours are in the vertices); every particle is in one of two point clouds (two draw calls for all effects). Only the stages near you are drawn. About 95-150 draw calls a frame (down from 135-260).
- **Low quality** also swaps the studs' normal map for a texture with the light painted in, so the studs look the same for less GPU work. The HUD's button shine and glow animate only transform and opacity, so they never repaint the page.
- **No stutter**: the world is built in slices while the server join runs in parallel; every shader (including the shadow pass's) is compiled in the background and every texture uploaded before you spawn. The shader count stays at 40 for a whole session (all gear, pets, Admin effects and stages checked).
- **Quality**: Low (no shadows, no glitter or vignette, 0.8 resolution), Medium (default on desktop) and High; phones start on Low. A slow PC steps down automatically; that step is never saved.
- Measured on this PC (headless Chrome, real GPU, GPU-bound at 4K): High 36-40 FPS (was about 32), Medium 60-74 FPS, Low about 138 FPS. Loads in about 3.3 s.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | Joystick |
| Jump / fly up | Space | A | JUMP |
| Climb a truss | Walk into it | Push into it | Push into it |
| Fly down (carpet) | Shift / Q / C | LT/RT | ⬇ |
| Zap (Troll Gun) / interact | Click or E | X | 🔫 button |
| Gear | 1-5 | LB / RB | Hotbar |
| Camera | Drag, wheel to zoom | Right stick, D-pad | Drag |

## Multiplayer and saves

- One shared `tower` room (up to 24 players). Movement is client-side; Wins, checkpoints, floating strawberries and the secret strawberry (all position-checked), pets, trails, gear, Admin effects, Troll Gun zaps (range and cooldown), the Nuke (cooldown) and purchases are decided by the server.
- Progress is saved per browser or per Bloxity account: MongoDB on Legion (`MONGODB_URI`), `server/data/profiles.json` locally.
- Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo; locally the stats are open).

## Deploy (Bloxity hosting)

Pushing `main` (prod) or `dev` runs `.github/workflows/deploy.yml`: server image `ghcr.io/asivixlp44-cmyk/strawberry-tower-server`, Legion rollout, client upload. Play at https://strawberry-tower.play.bloxity.io once the app `strawberry-tower` exists on hosting.bloxity.io and the repo has the `LEGION_DEPLOY_TOKEN` secret. `bloxity-setup.html` has every field of the Create New Game form with copy buttons (no IAPs).
