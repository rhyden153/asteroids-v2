# Asteroids

A modern take on the 1979 arcade classic, built with Nuxt 4, Vue 3, TypeScript, and Canvas 2D. A warm mission-control interface surrounds shaded, cratered asteroids, a metallic fighter with illuminated engines, and detailed enemy saucers, with procedural stars, particles, and synthesized sound.

Use **Graphics → Modern / Vector** below the playfield to switch artwork at any time. Modern is the default; Vector keeps the original outlined sprites. This preference is saved on your device and changes only rendering, preserving movement, collisions, scoring, and difficulty. The target guide uses the same modern artwork as the game. Asteroid textures are cached per rock for efficient animation.

## Run locally

Use Node.js 24 LTS and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Nuxt (usually http://localhost:3000).

## Play

- **Arrow keys / A, D, W:** rotate and thrust.
- **Space:** fire; hold for continuous shots.
- **Shift + thrust:** rechargeable boost.
- **H / Down:** hyperspace jump to a random location at least 15% of the playfield width/height away from each edge, clear of rocks, saucers, and shots (and their paths) when one exists; stops momentum and recharges in three seconds. A crowded field may leave no safe landing, but the edge exclusion always applies.
- **Ctrl (either key):** deploy a shield for exactly two seconds against rocks, UFOs, and hostile shots, followed by five seconds of recharge.
- **P / Escape:** pause or resume.
- **M:** mute or unmute.
- **F:** toggle fullscreen.
- **Enter:** launch or retry.
- Touch devices get on-screen steering, thrust, and fire controls. Compact Hyperspace and Shield buttons appear only during mobile/touch browser play, with single-word labels and charge bars for readiness and recharge. Ability buttons are hidden on desktop and in installed app display modes; keyboard shortcuts remain available.

Classic starts with three lives. Hardcore starts with one and faster asteroids. Large rocks split into two medium rocks; medium rocks split into two small rocks. Hits award 20, 50, and 100 points respectively. Clear every asteroid to advance to a faster wave. The ship wraps around the screen and receives three seconds of protection when respawning.

### PC controllers

Plug in a controller and press a button while the game page is focused. Controllers that the browser recognizes with the standard Gamepad API layout work automatically, including compatible Xbox and PlayStation controllers. Use HTTPS or localhost; browsers may not expose controller input on insecure sites. Devices with custom/raw layouts are not mapped.

- **Left stick / D-pad left and right:** rotate. A 25% stick dead zone prevents drift.
- **Left stick up / D-pad up / RT (R2):** thrust.
- **A (Cross):** fire continuously while held; launch or retry from the ready/game-over screen.
- **RB (R1) + thrust:** boost.
- **X (Square):** hyperspace.
- **LB (L1):** shield.
- **Start (Options):** launch, pause, or resume.

Keyboard and touch controls remain available alongside the controller. Abilities and pause activate once per press. Disconnecting the active controller pauses play; reconnect and press Start to resume. Controller input is ignored while the page is unfocused, a dialog is open, or a score field is being edited. The flight manual shows connection status and button mappings.

Your five best flights and sound preference are saved in localStorage on this device. Every positive score at game over is checked against the weekly and all-time global top ten, even if it is below your device's best. Qualifying scores can be submitted with three-letter initials. Global leaderboards require the Redis backend; playing and local scores work without it. Switching away from the game automatically pauses play. No account is required.

A crisp, electronic tick-tock accompanies each flight, alternating two square-wave tones. It starts slowly and accelerates as you destroy asteroids and their fragments, then resets with the next wave. The pulse pauses with the game, stops on game over or between waves, and follows the **M** / sound-button mute setting in both graphics modes.

Rock hits alternate between `public/rock-hit-1.wav` and `public/rock-hit-2.wav`, and player ship destruction plays `public/ship-explosion.mp3`. Each rock impact is 0.48 seconds, cut from the loud middle burst of `rock-impact-1.mp3` (2.451–2.931 seconds) and `rock-impact-2.mp3` (2.411–2.891 seconds). Short fades and a decaying envelope turn the original swells into immediate impacts, with balanced levels and headroom for overlapping hits. The files load and decode once when audio starts. Mute, pause, and restart stop active explosion sounds. The original synthesized effects provide a fallback while samples load or if a file cannot be played.

To regenerate the rock impacts, install Python 3 and VLC, then run `py scripts/prepare-rock-impacts.py` (or `python3 scripts/prepare-rock-impacts.py` on other platforms). Pass `--vlc PATH` if VLC is not found automatically. The game uses the prepared WAVs directly and needs neither tool at runtime; all original MP3s are preserved.

UFO destruction plays `public/ufo-burst.wav`, a 1.345-second effect derived from `public/ufo-explosion.mp3` (0.105–1.450 seconds). The prepared effect removes quiet padding, adds short fades, and balances the level with the other explosions. It shares the same mute, pause, and cleanup behavior and uses a synthesized fallback if unavailable. Regenerate it with `py scripts/prepare-ufo-explosion.py`, using the same Python/VLC setup as the rock impacts.

The playfield uses the full page width, with the flight manual below it. UFOs first appear after 12–18 seconds of active play, then return 18–30 seconds after leaving or being destroyed (more often in Hardcore). Large saucers fire randomly and award 200 points. Smaller, faster saucers aim at you and award 1,000 points; they become more common as you progress. Watch for the incoming-signal warning and listen for the saucer's alternating tone. UFO shots can break rocks, but those hits do not score points. Clear the asteroids and any active UFO before the next wave.

## Production

```sh
npm run build
npm run preview
```

## Tests

```sh
npm test
```

Engine tests cover splitting and scoring, wave progression, life loss, spawn protection, game over, wrapping, pause/resume, boost, focus loss, resizing, UFO scheduling and targeting, hostile shots, and UFO scoring and cleanup. They use Node's built-in test runner and TypeScript transform, without additional dependencies. In environments that disallow child processes, run `node --test --test-isolation=none tests/game.test.mjs`.

## Project structure

- `app/app.vue` — interface, keyboard shortcuts, score persistence, dialogs.
- `app/utils/game.ts` — canvas renderer, simulation, input, synthesized audio.
- `app/assets/main.css` — responsive layout and visual design.
- `app/components/AppIcon.vue` — shared SVG icons.
- `tests/game.test.mjs` — deterministic gameplay checks.

Fonts load from Google Fonts, with local system fallbacks. All game artwork is rendered locally with canvas and SVG.
