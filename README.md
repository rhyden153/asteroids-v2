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
- **H / Down / S:** hyperspace jump to an unpredictable location; stops momentum and recharges in three seconds. Landings can be dangerous.
- **S:** deploy a shield for exactly one second against rocks, UFOs, and hostile shots, followed by five seconds of recharge.
- **P / Escape:** pause or resume.
- **M:** mute or unmute.
- **Enter:** launch or retry.
- Touch devices get on-screen steering, thrust, and fire controls. Hyperspace and shield buttons show readiness, active time, and recharge on both desktop and mobile.

Classic starts with three lives. Hardcore starts with one and faster asteroids. Large rocks split into two medium rocks; medium rocks split into two small rocks. Hits award 20, 50, and 100 points respectively. Clear every asteroid to advance to a faster wave. The ship wraps around the screen and receives three seconds of protection when respawning.

Your five best flights and sound preference are saved in localStorage on this device. Switching away from the game automatically pauses play. No backend or account is required.

A crisp, electronic tick-tock accompanies each flight, alternating two square-wave tones. It starts slowly and accelerates as you destroy asteroids and their fragments, then resets with the next wave. The pulse pauses with the game, stops on game over or between waves, and follows the **M** / sound-button mute setting in both graphics modes.

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
