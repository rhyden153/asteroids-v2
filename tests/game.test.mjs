import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

// Use Node's TypeScript transform to exercise the actual engine without a bundler.
let source = await readFile(
  new URL("../app/utils/game.ts", import.meta.url),
  "utf8",
);
const sprites = await readFile(
  new URL("../app/utils/sprites.ts", import.meta.url),
  "utf8",
);
const spriteModule = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(sprites, { mode: "transform" })).toString("base64")}`;
source = source.replace('"./sprites"', JSON.stringify(spriteModule));
const { AsteroidsEngine } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source, { mode: "transform" })).toString("base64")}`
);
let game;
let rect;
beforeEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true, value: { getGamepads: () => [] },
  });
  globalThis.window = Object.assign(new EventTarget(), {
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 1,
  });
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  rect = { width: 960, height: 570 };
  const canvas = {
    getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => rect,
    focus() {},
  };
  game = new AsteroidsEngine(canvas, () => {});
  game.start("classic");
});
afterEach(() => game.destroy());

test("the background chase begins at 25 asteroids and finishes even if the field thins", () => {
  game.rocks = Array.from({ length: 24 }, () => game.makeRock(30, 30, 1));
  game.update(0);
  assert.equal(game.asteroidChase, null);
  game.rocks.push(game.makeRock(30, 30, 1));
  game.update(0);
  assert.equal(game.asteroidChase.age, 0);
  game.rocks.pop();
  game.update(0.1);
  assert.equal(game.asteroidChase.age, 0.1);
  game.updateAsteroidChase(9);
  assert.equal(game.asteroidChase, null);
  assert.equal(game.chaseCooldown, 45);
});

test("the chase has a cooldown, alternates direction, and never changes gameplay or RNG", (t) => {
  game.rocks = Array.from({ length: 25 }, () => game.makeRock(30, 30, 1));
  const rocks = [...game.rocks], state = { ...game.state }, ship = { ...game.ship };
  t.mock.method(Math, "random", () => assert.fail("cosmetic animation consumed gameplay randomness"));
  game.updateAsteroidChase(0);
  assert.equal(game.asteroidChase.direction, 1);
  game.updateAsteroidChase(9);
  game.state.wave += 2;
  state.wave += 2;
  game.updateAsteroidChase(44);
  assert.equal(game.asteroidChase, null);
  game.updateAsteroidChase(1);
  assert.equal(game.asteroidChase.direction, -1);
  assert.deepEqual(game.rocks, rocks);
  assert.deepEqual(game.state, state);
  assert.deepEqual(game.ship, ship);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.ufo, null);
});

test("chase animation pauses with play, clears on game over/restart/destroy, and respects reduced motion", () => {
  game.rocks = Array.from({ length: 25 }, () => game.makeRock(30, 30, 1));
  game.update(0);
  game.togglePause();
  game.update(3);
  assert.equal(game.asteroidChase.age, 0);
  game.togglePause();
  game.update(0.1);
  assert.equal(game.asteroidChase.age, 0.1);
  game.state.status = "over";
  game.update(0);
  assert.equal(game.asteroidChase, null);
  game.start("classic");
  game.rocks = Array.from({ length: 25 }, () => game.makeRock(30, 30, 1));
  game.reducedMotion = true;
  game.update(0);
  assert.equal(game.asteroidChase, null);
  game.reducedMotion = false;
  game.update(0);
  assert.ok(game.asteroidChase);
  game.start("classic");
  assert.equal(game.asteroidChase, null);
  assert.equal(game.chaseCooldown, 0);
  assert.equal(game.chasePasses, 0);
  assert.equal(game.lastChaseWave, null);
  game.rocks = Array.from({ length: 25 }, () => game.makeRock(30, 30, 1));
  game.update(0);
  game.destroy();
  assert.equal(game.asteroidChase, null);
});

test("the chase appears once per level and skips the following level, including unfinished flybys", () => {
  game.rocks = Array.from({ length: 25 }, () => game.makeRock(30, 30, 1));
  game.state.wave = 4;
  game.updateAsteroidChase(0);
  assert.ok(game.asteroidChase);
  game.updateAsteroidChase(9);
  game.updateAsteroidChase(60);
  assert.equal(game.asteroidChase, null);
  game.state.wave = 5;
  game.updateAsteroidChase(60);
  assert.equal(game.asteroidChase, null);
  game.state.wave = 6;
  game.updateAsteroidChase(0);
  assert.ok(game.asteroidChase);
  // A new level ends a flyby rather than carrying it into consecutive levels.
  game.state.wave = 7;
  game.updateAsteroidChase(0);
  assert.equal(game.asteroidChase, null);
  game.updateAsteroidChase(60);
  assert.equal(game.asteroidChase, null);
  game.state.wave = 8;
  game.updateAsteroidChase(0);
  assert.ok(game.asteroidChase);
});

test("the chase renders behind gameplay in both graphics modes", () => {
  for (const mode of ["modern", "vector"]) {
    const order = [];
    game.setGraphics(mode);
    game.rocks = [game.makeRock(30, 30, 1)];
    game.rockSprites.set(game.rocks[0], {});
    game.drawAsteroidChase = () => order.push("chase");
    game.ctx = new Proxy({}, {
      get(_target, key) {
        if (key === "createRadialGradient" || key === "createLinearGradient")
          return () => ({ addColorStop() {} });
        if (key === "translate") return () => order.push("world");
        return () => {};
      },
    });
    game.draw();
    assert.equal(order[0], "chase");
    assert.ok(order.includes("world"));
  }
});

function controller(buttons = [], axes = [0, 0], index = 0) {
  return { connected: true, mapping: "standard", index, axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
  };
}

test("controllers steer, thrust, boost, and fire alongside keyboard input", () => {
  let pad = controller([0, 5, 7], [-0.7, 0]);
  navigator.getGamepads = () => [null, pad];
  game.rocks = [];
  game.pollGamepad();
  const angle = game.ship.angle;
  game.update(0.1);
  assert.ok(game.ship.angle < angle);
  assert.ok(Math.hypot(game.ship.vx, game.ship.vy) > 0);
  assert.ok(game.state.boost < 100);
  assert.equal(game.bullets.length, 1);
  game.setControl("Space", true);
  pad = controller();
  game.pollGamepad();
  assert.equal(game.controlHeld("Space"), true);
  game.setControl("Space", false);
  assert.equal(game.controlHeld("Space"), false);
});

test("stick dead zone suppresses drift and the D-pad provides digital controls", () => {
  navigator.getGamepads = () => [controller([], [0.2, -0.2])];
  game.pollGamepad();
  assert.equal(game.gamepadKeys.size, 0);
  navigator.getGamepads = () => [controller([12, 15])];
  game.pollGamepad();
  assert.equal(game.controlHeld("ArrowUp"), true);
  assert.equal(game.controlHeld("ArrowRight"), true);
  navigator.getGamepads = () => [controller([14])];
  game.pollGamepad();
  assert.equal(game.controlHeld("ArrowLeft"), true);
  assert.equal(game.controlHeld("ArrowRight"), false);
});

test("controller abilities require a fresh press after cooldown", () => {
  let pad = controller([2, 4]);
  navigator.getGamepads = () => [pad];
  game.rocks = [];
  game.pollGamepad();
  assert.equal(game.state.hyperspaceCooldown, 3);
  assert.equal(game.state.shieldRemaining, 2);
  game.update(7);
  game.pollGamepad();
  assert.equal(game.state.hyperspaceCooldown, 0);
  assert.equal(game.state.shieldRemaining, 0);
  pad = controller();
  game.pollGamepad();
  pad = controller([2, 4]);
  game.pollGamepad();
  assert.equal(game.state.hyperspaceCooldown, 3);
  assert.equal(game.state.shieldRemaining, 2);
});

test("Start pauses and resumes once per press; A and Start can launch", () => {
  let pad = controller([9]);
  navigator.getGamepads = () => [pad];
  game.pollGamepad();
  assert.equal(game.state.status, "paused");
  game.pollGamepad();
  assert.equal(game.state.status, "paused");
  pad = controller(); game.pollGamepad();
  pad = controller([9]); game.pollGamepad();
  assert.equal(game.state.status, "playing");
  let launches = 0;
  game.controller.launch = () => { launches++; };
  for (const [status, button] of [["ready", 0], ["over", 9]]) {
    game.state.status = status;
    pad = controller(); game.pollGamepad();
    pad = controller([button]); game.pollGamepad(); game.pollGamepad();
  }
  assert.equal(launches, 2);
});

test("disconnect pauses, releases controller input, and allows reconnect", () => {
  let pad = controller([0, 7]);
  const connections = [];
  game.controller.connected = connected => connections.push(connected);
  navigator.getGamepads = () => [pad];
  game.pollGamepad();
  pad = null; game.pollGamepad();
  assert.equal(game.state.status, "paused");
  assert.equal(game.gamepadKeys.size, 0);
  pad = controller([9]); game.pollGamepad();
  assert.equal(game.state.status, "playing");
  assert.deepEqual(connections, [true, false, true]);
});

test("dialogs, focus loss, and hidden pages block input and consume button edges", () => {
  let pad = controller();
  navigator.getGamepads = () => [pad];
  game.pollGamepad();
  game.controller.enabled = () => false;
  pad = controller([2, 4, 9, 0, 7]); game.pollGamepad();
  assert.equal(game.state.status, "playing");
  assert.equal(game.state.shieldRemaining, 0);
  assert.equal(game.gamepadKeys.size, 0);
  game.controller.enabled = () => true;
  game.pollGamepad();
  assert.equal(game.state.status, "playing");
  assert.equal(game.state.shieldRemaining, 0);
  game.blur();
  pad = controller(); game.pollGamepad();
  pad = controller([9]); game.pollGamepad();
  assert.equal(game.state.status, "paused");
  game.focus(); document.hidden = true;
  pad = controller(); game.pollGamepad();
  pad = controller([9]); game.pollGamepad();
  assert.equal(game.state.status, "paused");
});

test("missing/denied APIs and unrecognized controllers leave keyboard play available", () => {
  for (const getGamepads of [undefined, () => { throw Error("Denied"); },
    () => [{ ...controller([9]), mapping: "" }]]) {
    navigator.getGamepads = getGamepads;
    assert.doesNotThrow(() => game.pollGamepad());
    assert.equal(game.state.status, "playing");
    assert.equal(game.gamepadIndex, null);
  }
  game.setControl("Space", true);
  assert.equal(game.controlHeld("Space"), true);
});

test("background pulse alternates at a slow initial cadence", () => {
  const beats = [];
  game.playHeartbeat = () => beats.push(game.heartbeatLow);
  game.updateHeartbeat(0.89);
  assert.deepEqual(beats, []);
  game.updateHeartbeat(0.02);
  game.updateHeartbeat(0.9);
  game.updateHeartbeat(0.9);
  assert.deepEqual(beats, [false, true, false]);
});

test("each asteroid hit accelerates the pulse, including splitting and hostile hits", () => {
  assert.ok(Math.abs(game.heartbeatInterval - 0.9) < 1e-9);
  let previous = game.heartbeatInterval;
  while (game.rocks.length) {
    const work = game.remainingRockWork;
    game.breakRock(0, false);
    assert.equal(game.remainingRockWork, work - 1);
    assert.ok(game.heartbeatInterval < previous);
    assert.ok(game.heartbeatInterval >= 0.16);
    previous = game.heartbeatInterval;
  }
  assert.equal(game.heartbeatInterval, 0.16);
  game.spawnWave();
  assert.ok(Math.abs(game.heartbeatInterval - 0.9) < 1e-9);
  assert.equal(game.heartbeatPhase, 0);
  assert.equal(game.heartbeatLow, false);
});

test("near-clear fields produce more beats without replaying a backlog", () => {
  let beats = 0;
  game.playHeartbeat = () => beats++;
  for (let i = 0; i < 300; i++) game.updateHeartbeat(0.01);
  assert.equal(beats, 3);
  game.rocks = [game.makeRock(50, 50, 1)];
  game.heartbeatPhase = 0;
  beats = 0;
  for (let i = 0; i < 300; i++) game.updateHeartbeat(0.01);
  assert.ok(beats >= 16);
  beats = 0;
  game.updateHeartbeat(30);
  assert.equal(beats, 1);
});

test("pause and mute stop the active pulse and freeze its phase", () => {
  let stops = 0,
    beats = 0;
  game.playHeartbeat = () => beats++;
  game.heartbeatPhase = 0.4;
  game.stopHeartbeatVoice = () => stops++;
  game.togglePause();
  game.update(10);
  assert.equal(stops, 1);
  assert.equal(game.heartbeatPhase, 0.4);
  game.togglePause();
  game.stopHeartbeatVoice = () => stops++;
  game.setMuted(true);
  game.updateHeartbeat(10);
  assert.equal(stops, 2);
  assert.equal(game.heartbeatPhase, 0.4);
  assert.equal(beats, 0);
  game.setMuted(false);
  game.updateHeartbeat(0.6);
  assert.equal(beats, 1);
});

test("pulse waits through wave breaks but continues for remaining UFO threats", () => {
  let beats = 0;
  game.playHeartbeat = () => beats++;
  game.rocks = [];
  game.updateHeartbeat(2);
  assert.equal(beats, 0);
  game.spawnUfo("large");
  game.updateHeartbeat(0.17);
  assert.equal(beats, 1);
  game.ufo = null;
  game.enemyBullets = [{ x: 50, y: 50, vx: 1, vy: 1, life: 1 }];
  game.updateHeartbeat(0.17);
  assert.equal(beats, 2);
});

test("game over, restart, and destruction cancel the background voice", () => {
  let stops = 0;
  game.stopHeartbeatVoice = () => stops++;
  game.state.lives = 1;
  game.protection = 0;
  game.hitShip();
  assert.equal(stops, 1);
  game.playHeartbeat = () => assert.fail("pulse outside play");
  for (const status of ["over", "ready"]) {
    game.state.status = status;
    game.updateHeartbeat(5);
  }
  game.stopHeartbeatVoice = () => stops++;
  game.start("classic");
  assert.equal(stops, 2);
  assert.equal(game.heartbeatLow, false);
  assert.equal(game.heartbeatPhase, 0);
  game.stopHeartbeatVoice = () => stops++;
  game.destroy();
  assert.equal(stops, 3);
});

test("classic starts with three lives; hardcore restarts cleanly with one", () => {
  assert.equal(game.state.lives, 3);
  game.state.score = 400;
  game.setControl("Space", true);
  game.update(0.02);
  game.start("hardcore");
  assert.equal(game.state.lives, 1);
  assert.equal(game.state.score, 0);
  assert.equal(game.state.wave, 1);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.keys.size, 0);
});

test("a large asteroid splits twice and awards the full 520 points", () => {
  game.rocks = [game.makeRock(100, 100, 3)];
  let hits = 0;
  while (game.rocks.length) {
    const rock = game.rocks[0];
    game.bullets = [{ x: rock.x, y: rock.y, vx: 0, vy: 0, life: 1 }];
    game.update(0);
    hits++;
    assert.ok(hits <= 7);
  }
  assert.equal(hits, 7);
  assert.equal(game.state.score, 520);
});

test("clearing the field advances the wave after a short break", () => {
  game.rocks = [];
  for (let i = 0; i < 50; i++) game.update(0.033);
  assert.equal(game.state.wave, 2);
  assert.equal(game.rocks.length, 6);
});

test("spawn protection prevents hits; an unprotected hit costs one life", () => {
  game.rocks = [game.makeRock(game.ship.x, game.ship.y, 3)];
  game.update(0);
  assert.equal(game.state.lives, 3);
  game.protection = 0;
  game.update(0);
  assert.equal(game.state.lives, 2);
  game.update(0);
  assert.equal(game.state.lives, 2);
  game.update(1);
  assert.ok(game.protection > 0);
});

test("last life waits one second before ending the flight and stops further input", () => {
  game.start("hardcore");
  game.protection = 0;
  game.rocks = [game.makeRock(game.ship.x, game.ship.y, 3)];
  game.update(0);
  assert.equal(game.state.status, "playing");
  game.setControl("Space", true);
  game.update(0.999);
  assert.equal(game.state.status, "playing");
  assert.equal(game.bullets.length, 0);
  game.update(0.001);
  assert.equal(game.state.status, "over");
});

test("respawn waits a full second, animates debris, and blocks ship actions", () => {
  game.protection = 0;
  game.ship.x = 100;
  game.hitShip();
  const ship = { ...game.ship };
  const shardLife = game.shards[0].life;
  game.setControl("Space", true);
  game.setControl("ArrowUp", true);
  assert.equal(game.useShield(), false);
  assert.equal(game.useHyperspace(), false);
  game.hitShip();
  game.update(0.5);
  assert.ok(game.shards[0].life < shardLife);
  game.update(0.499);
  assert.deepEqual(game.ship, ship);
  assert.equal(game.state.lives, 2);
  assert.equal(game.bullets.length, 0);
  game.update(0.001);
  assert.equal(game.ship.x, game.width / 2);
  assert.equal(game.protection, 3);
});

test("pause freezes the death delay and restarting cancels it", () => {
  game.protection = 0;
  game.hitShip();
  game.update(0.5);
  game.togglePause();
  game.update(2);
  assert.equal(game.deathTimer, 0.5);
  game.togglePause();
  game.update(0.5);
  assert.equal(game.deathTimer, 0);
  game.protection = 0;
  game.hitShip();
  game.start("hardcore");
  assert.equal(game.deathTimer, 0);
  assert.equal(game.state.status, "playing");
  assert.equal(game.state.lives, 1);
});

test("asteroids, UFOs, and shots keep moving during both death delays", (t) => {
  t.mock.method(Math, "random", () => 0.5);
  for (const lives of [2, 1]) {
    game.start("classic");
    game.state.lives = lives;
    game.protection = 0;
    game.rocks = [game.makeRock(100, 500, 3)];
    Object.assign(game.rocks[0], { vx: 40, vy: 0 });
    game.spawnUfo("large");
    Object.assign(game.ufo, {
      x: 200, y: 200, vx: 100, vy: 0, shotTimer: 0, turnTimer: 2,
    });
    game.bullets = [{ x: 50, y: 50, vx: 100, vy: 0, life: 2 }];
    const hostileShot = {
      x: game.ship.x - 20, y: game.ship.y, vx: 40, vy: 0, life: 2,
    };
    game.enemyBullets = [hostileShot];
    game.hitShip();
    const ship = { ...game.ship };
    game.update(0.5);
    assert.equal(game.rocks[0].x, 120);
    assert.equal(game.ufo.x, 250);
    assert.equal(game.bullets[0].x, 100);
    assert.equal(hostileShot.x, ship.x);
    assert.ok(game.enemyBullets.includes(hostileShot));
    assert.ok(game.enemyBullets.length > 1, "UFO keeps firing");
    assert.deepEqual(game.ship, ship);
    assert.equal(game.state.lives, lives - 1);
    assert.equal(game.state.status, "playing");
    game.update(0.5);
    assert.equal(game.rocks[0].x, 140);
    assert.equal(game.ufo.x, 300);
    assert.equal(game.state.status, lives === 1 ? "over" : "playing");
  }
});

test("ship wraps across both screen boundaries without losing momentum", () => {
  game.ship.x = game.width + 5;
  game.ship.y = -5;
  game.ship.vx = 100;
  game.update(0);
  assert.equal(game.ship.x, 5);
  assert.equal(game.ship.y, game.height - 5);
  assert.equal(game.ship.vx, 100);
});

test("pause freezes the simulation and clears held controls", () => {
  game.setControl("ArrowUp", true);
  game.setControl("Space", true);
  game.togglePause();
  const ship = { ...game.ship };
  game.update(0.033);
  assert.deepEqual(game.ship, ship);
  assert.equal(game.keys.size, 0);
  game.togglePause();
  game.update(0.033);
  assert.equal(game.bullets.length, 0);
});

test("boost drains during use and recharges when released", () => {
  game.setControl("ArrowUp", true);
  game.setControl("ShiftLeft", true);
  game.update(0.033);
  const depleted = game.state.boost;
  assert.ok(depleted < 100);
  game.setControl("ShiftLeft", false);
  game.update(0.033);
  assert.ok(game.state.boost > depleted);
  assert.ok(game.state.boost <= 100);
});

test("losing window focus pauses play", () => {
  window.dispatchEvent(new Event("blur"));
  assert.equal(game.state.status, "paused");
});

test("mobile resize preserves relative position and a playable ship size", () => {
  game.ship.x = game.width / 2;
  game.ship.y = game.height / 2;
  rect = { width: 350, height: 450 };
  game.resize();
  assert.equal(game.ship.x, game.width / 2);
  assert.equal(game.ship.y, game.height / 2);
  assert.equal(game.width, 600);
});

test("UFO arrivals use gameplay time and stop counting down while paused", () => {
  assert.ok(game.ufoTimer >= 12 && game.ufoTimer <= 18);
  game.ufoTimer = 0.01;
  game.togglePause();
  game.update(1);
  assert.equal(game.ufo, null);
  assert.equal(game.ufoTimer, 0.01);
  game.togglePause();
  game.update(0.02);
  assert.equal(game.ufo.kind, "large");
  const x = game.ufo.x;
  game.togglePause();
  game.update(1);
  assert.equal(game.ufo.x, x);
  assert.equal(game.enemyBullets.length, 0);
});

test("large UFOs shoot randomly; small UFOs aim toward the ship", (t) => {
  t.mock.method(Math, "random", () => 0.5);
  game.ship.x = 600;
  game.ship.y = 350;
  for (const kind of ["large", "small"]) {
    game.spawnUfo(kind);
    Object.assign(game.ufo, { x: 100, y: 350, vx: 0, vy: 0, shotTimer: 0 });
    game.updateUfo(0);
    const bullet = game.enemyBullets.at(-1);
    assert.ok(kind === "small" ? bullet.vx > 0 : bullet.vx < 0);
    assert.ok(Math.abs(bullet.vy) < 0.001);
  }
});

test("shooting each UFO awards its points once and starts a new cooldown", () => {
  game.rocks = [];
  for (const [kind, expected] of [
    ["large", 200],
    ["small", 1200],
  ]) {
    game.spawnUfo(kind);
    Object.assign(game.ufo, { x: 150, y: 150, vx: 0, vy: 0 });
    game.bullets = Array.from({ length: 2 }, () => ({
      x: 150,
      y: 150,
      vx: 0,
      vy: 0,
      life: 1,
    }));
    game.update(0);
    assert.equal(game.ufo, null);
    assert.equal(game.state.score, expected);
    assert.ok(game.ufoTimer >= 18 && game.ufoTimer <= 30);
  }
});

test("enemy shots cost a life but respect respawn protection", () => {
  game.rocks = [];
  const shotAtShip = () => ({
    x: game.ship.x,
    y: game.ship.y,
    vx: 0,
    vy: 0,
    life: 1,
  });
  game.enemyBullets = [shotAtShip()];
  game.update(0);
  assert.equal(game.state.lives, 3);
  assert.equal(game.enemyBullets.length, 0);
  game.protection = 0;
  game.enemyBullets = [shotAtShip(), shotAtShip()];
  game.update(0);
  assert.equal(game.state.lives, 2);
  game.update(1);
  assert.ok(game.protection > 0);
});

test("UFO projectiles split rocks without awarding player points", () => {
  game.rocks = [game.makeRock(100, 100, 3)];
  game.enemyBullets = [{ x: 100, y: 100, vx: 0, vy: 0, life: 1 }];
  game.update(0);
  assert.equal(game.state.score, 0);
  assert.equal(game.rocks.length, 2);
  assert.ok(game.rocks.every((rock) => rock.size === 2));
  assert.equal(game.enemyBullets.length, 0);
});

test("UFOs leave the far edge instead of wrapping or spawning immediately again", () => {
  game.spawnUfo("large");
  Object.assign(game.ufo, { x: game.width + 100, vx: 100 });
  game.updateUfo(0.01);
  assert.equal(game.ufo, null);
  assert.equal(game.state.score, 0);
  game.updateUfo(1);
  assert.equal(game.ufo, null);
});

test("colliding with a UFO destroys both ships without awarding points", () => {
  game.rocks = [];
  game.protection = 0;
  game.spawnUfo("large");
  Object.assign(game.ufo, { x: game.ship.x, y: game.ship.y, vx: 0, vy: 0 });
  game.update(0);
  assert.equal(game.ufo, null);
  assert.equal(game.state.lives, 2);
  assert.equal(game.state.score, 0);
});

test("wave progression waits for an active UFO and its remaining shots", () => {
  game.rocks = [];
  game.spawnUfo("large");
  for (let i = 0; i < 50; i++) game.update(0.033);
  assert.equal(game.state.wave, 1);
  game.removeUfo(false);
  game.enemyBullets = [{ x: 20, y: 20, vx: 0, vy: 0, life: 2 }];
  for (let i = 0; i < 50; i++) game.update(0.033);
  assert.equal(game.state.wave, 1);
  for (let i = 0; i < 65; i++) game.update(0.033);
  assert.equal(game.state.wave, 2);
});

test("restarting clears UFOs and hostile shots; resizing keeps them in position", () => {
  game.spawnUfo("small");
  Object.assign(game.ufo, { x: game.width / 2, y: game.height / 2 });
  game.enemyBullets = [
    { x: game.width / 2, y: game.height / 2, vx: 0, vy: 0, life: 2 },
  ];
  rect = { width: 1400, height: 720 };
  game.resize();
  assert.ok(game.width > 1200);
  assert.equal(game.ufo.x, game.width / 2);
  assert.equal(game.ufo.y, game.height / 2);
  assert.equal(game.enemyBullets[0].x, game.width / 2);
  game.start("classic");
  assert.equal(game.ufo, null);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.ufoVisits, 0);
});

test("hyperspace relocates the ship, stops momentum, and preserves its heading", () => {
  Object.assign(game.ship, { vx: 200, vy: -100, angle: 1.2 });
  game.protection = 0;
  const before = { ...game.ship };
  assert.equal(game.useHyperspace(), true);
  assert.notEqual(game.ship.x, before.x);
  assert.notEqual(game.ship.y, before.y);
  assert.ok(game.ship.x >= 0 && game.ship.x < game.width);
  assert.ok(game.ship.y >= 0 && game.ship.y < game.height);
  assert.equal(game.ship.vx, 0);
  assert.equal(game.ship.vy, 0);
  assert.equal(game.ship.angle, before.angle);
  assert.equal(game.protection, 0);
  assert.equal(game.state.hyperspaceCooldown, 3);
  assert.equal(game.useHyperspace(), false);
});

test("hyperspace lands clear of rocks, saucers, shots, and their paths", () => {
  game.spawnUfo("small");
  game.ufo.x = game.width / 2;
  game.enemyBullets.push({ x: 100, y: 100, vx: 300, vy: 0, life: 2 });
  for (let i = 0; i < 100; i++) {
    game.state.hyperspaceCooldown = 0;
    assert.equal(game.useHyperspace(), true);
    const threats = [
      ...game.rocks.map((rock) => ({ ...rock, life: Infinity })),
      { ...game.ufo, life: Infinity },
      ...game.enemyBullets.map((bullet) => ({ ...bullet, radius: 4 })),
    ];
    assert.ok(game.landingGap(game.ship.x, game.ship.y, threats) >= 70);
  }
});

test("hyperspace can land centrally within the allowed area", () => {
  game.rocks = [];
  let central = 0;
  for (let i = 0; i < 200; i++) {
    Object.assign(game.ship, { x: game.width / 2, y: game.height / 2 });
    game.state.hyperspaceCooldown = 0;
    game.useHyperspace();
    const { x, y } = game.ship;
    if (x > game.width * 0.25 && x < game.width * 0.75 &&
      y > game.height * 0.25 && y < game.height * 0.75) central++;
  }
  assert.ok(central > 10);
});

test("hyperspace excludes the outer 15% on every edge, including its fallback after resizing", (t) => {
  let sample = 0.5;
  t.mock.method(Math, "random", () => sample);
  for (const size of [{ width: 960, height: 570 }, { width: 350, height: 700 }]) {
    rect = size;
    game.resize();
    game.rocks = [];
    for (sample of [0, 0.5, 1]) {
      for (const origin of [0, 0.5, 1]) {
        Object.assign(game.ship, { x: game.width * origin, y: game.height * origin });
        game.state.hyperspaceCooldown = 0;
        assert.equal(game.useHyperspace(), true);
        assert.ok(game.ship.x >= game.width * 0.15 && game.ship.x <= game.width * 0.85);
        assert.ok(game.ship.y >= game.height * 0.15 && game.ship.y <= game.height * 0.85);
        assert.ok(Math.hypot(game.ship.x - game.width * origin,
          game.ship.y - game.height * origin) >= Math.min(game.width, game.height) * 0.3);
      }
    }
  }
});

test("hyperspace still jumps when no landing is fully clear", () => {
  game.rocks = [];
  for (let x = 0; x < game.width; x += 60)
    for (let y = 0; y < game.height; y += 60) game.rocks.push(game.makeRock(x, y, 2));
  const before = { ...game.ship };
  assert.equal(game.useHyperspace(), true);
  assert.notDeepEqual({ x: game.ship.x, y: game.ship.y }, { x: before.x, y: before.y });
  assert.ok(game.ship.x >= game.width * 0.15 && game.ship.x <= game.width * 0.85);
  assert.ok(game.ship.y >= game.height * 0.15 && game.ship.y <= game.height * 0.85);
});

test("shield blocks rocks for exactly two seconds, then expires", () => {
  game.protection = 0;
  const rock = game.makeRock(game.ship.x, game.ship.y, 3);
  rock.vx = rock.vy = 0;
  game.rocks = [rock];
  assert.equal(game.useShield(), true);
  game.update(1.999);
  assert.equal(game.state.lives, 3);
  assert.ok(game.state.shieldRemaining > 0);
  game.update(0.001);
  assert.equal(game.state.shieldRemaining, 0);
  assert.equal(game.state.lives, 2);
  assert.ok(Math.abs(game.state.shieldCooldown - 5) < 1e-8);
});

test("active shield absorbs enemy shots and survives UFO contact without awarding points", () => {
  game.rocks = [];
  game.protection = 0;
  game.useShield();
  game.spawnUfo("large");
  Object.assign(game.ufo, { x: game.ship.x, y: game.ship.y, vx: 0, vy: 0 });
  game.enemyBullets = [
    { x: game.ship.x + 25, y: game.ship.y, vx: 0, vy: 0, life: 1 },
  ];
  game.update(0.1);
  assert.equal(game.enemyBullets.length, 0);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.score, 0);
  assert.ok(game.ufo);
  assert.ok(game.state.shieldRemaining < 2);
});

test("shield recharges for five seconds after its two-second deployment", () => {
  game.rocks = [];
  game.useShield();
  assert.equal(game.useShield(), false);
  game.update(2);
  assert.equal(game.state.shieldRemaining, 0);
  assert.equal(game.state.shieldCooldown, 5);
  game.update(4.999);
  assert.equal(game.useShield(), false);
  game.update(0.001);
  assert.equal(game.useShield(), true);
  assert.equal(game.state.shieldRemaining, 2);
});

test("either Ctrl key activates the shield, ignores repeats, and replaces X", () => {
  const key = (code, repeat = false, target = { closest: () => null }) => ({
    code, repeat, target, preventDefault() {},
  });
  game.keydown(key("KeyX"));
  assert.equal(game.state.shieldRemaining, 0);
  for (const code of ["ControlLeft", "ControlRight"]) {
    game.start("classic");
    game.keydown(key(code, false, { closest: () => ({}) }));
    game.keydown(key(code, false, { isContentEditable: true }));
    game.keydown(key(code, true));
    assert.equal(game.state.shieldRemaining, 0);
    game.keydown(key(code));
    assert.equal(game.state.shieldRemaining, 2);
    game.rocks = [];
    game.update(7);
    game.keydown(key(code, true));
    assert.equal(game.state.shieldRemaining, 0);
    game.keyup(key(code));
    game.keydown(key(code));
    assert.equal(game.state.shieldRemaining, 2);
  }
});

test("holding an ability key never automatically repeats activation", () => {
  game.rocks = [];
  game.setControl("KeyH", true);
  game.setControl("ControlLeft", true);
  game.update(7);
  const position = { x: game.ship.x, y: game.ship.y };
  game.setControl("KeyH", true);
  game.setControl("ControlLeft", true);
  assert.equal(game.state.hyperspaceCooldown, 0);
  assert.equal(game.state.shieldRemaining, 0);
  assert.equal(game.ship.x, position.x);
  game.setControl("KeyH", false);
  game.setControl("ControlLeft", false);
  game.setControl("KeyH", true);
  game.setControl("ControlLeft", true);
  assert.equal(game.state.hyperspaceCooldown, 3);
  assert.equal(game.state.shieldRemaining, 2);
});

test("ability timers freeze when paused, and abilities are unavailable outside play", () => {
  game.useShield();
  game.useHyperspace();
  game.togglePause();
  game.update(5);
  assert.equal(game.state.shieldRemaining, 2);
  assert.equal(game.state.hyperspaceCooldown, 3);
  for (const status of ["paused", "ready", "over"]) {
    game.state.status = status;
    game.state.shieldCooldown = 0;
    game.state.hyperspaceCooldown = 0;
    assert.equal(game.useShield(), false);
    assert.equal(game.useHyperspace(), false);
  }
});

test("down-arrow activates hyperspace and a new flight resets both abilities", () => {
  game.setControl("ArrowDown", true);
  assert.equal(game.state.hyperspaceCooldown, 3);
  game.useShield();
  game.start("classic");
  assert.equal(game.state.hyperspaceCooldown, 0);
  assert.equal(game.state.shieldRemaining, 0);
  assert.equal(game.state.shieldCooldown, 0);
  assert.equal(game.jumps.length, 0);
});

test("effect cleanup reuses arrays and preserves survivor order and motion", () => {
  game.state.status = "over";
  const particle = (life) => ({ x: 10, y: 20, vx: 8, vy: -4, life, max: life, radius: 2, color: "white" });
  const first = particle(1), expired = particle(0.05), last = particle(2);
  game.particles.push(first, expired, last);
  game.jumps.push({ x: 0, y: 0, life: 0.05 }, { x: 1, y: 1, life: 1 });
  const shard = { ...particle(1), angle: 1, spin: 2, points: [[0, 0], [1, 1]] };
  game.shards.push(shard);
  game.shockwaves.push({ x: 0, y: 0, life: 0.05, max: 0.05 });
  const arrays = [game.particles, game.jumps, game.shards, game.shockwaves];
  game.update(0.1);
  assert.equal(game.particles, arrays[0]);
  assert.equal(game.jumps, arrays[1]);
  assert.equal(game.shards, arrays[2]);
  assert.equal(game.shockwaves, arrays[3]);
  assert.deepEqual(game.particles, [first, last]);
  assert.equal(first.x, 10.8);
  assert.equal(first.y, 19.6);
  assert.equal(game.jumps.length, 1);
  assert.equal(shard.angle, 1.2);
  assert.equal(game.shockwaves.length, 0);
});

test("projectiles compact in place, wrap, and remove consumed hostile shots", () => {
  game.rocks = [];
  const shot = (x, life) => ({ x, y: 10, vx: 10, vy: 0, life });
  const first = shot(game.width, 1), last = shot(30, 2);
  game.bullets.push(first, shot(20, 0.05), last);
  game.enemyBullets.push({ ...shot(game.ship.x, 1), y: game.ship.y, vx: 0 });
  const bullets = game.bullets, enemyBullets = game.enemyBullets;
  game.update(0.1);
  assert.equal(game.bullets, bullets);
  assert.equal(game.enemyBullets, enemyBullets);
  assert.deepEqual(game.bullets, [first, last]);
  assert.equal(first.x, 1);
  assert.equal(last.x, 31);
  assert.equal(enemyBullets.length, 0);
});

test("unchanged HUD state emits nothing and changed snapshots stay independent", () => {
  const states = [];
  game.onState = state => states.push(state);
  game.update(0.11);
  game.update(0.11);
  assert.equal(states.length, 0);
  game.useShield();
  assert.equal(states.length, 1);
  assert.equal(states[0].shieldRemaining, 2);
  game.update(0.11);
  assert.equal(states.length, 2);
  assert.equal(states[0].shieldRemaining, 2);
  assert.equal(states[1].shieldRemaining, 1.89);
});

test("paused frames skip drawing but resize and graphics changes refresh once", () => {
  let draws = 0;
  game.draw = () => draws++;
  game.togglePause();
  game.loop(100);
  const elapsed = game.elapsed;
  for (let i = 1; i <= 120; i++) game.loop(100 + i * 16);
  assert.equal(draws, 1);
  assert.equal(game.elapsed, elapsed);
  game.setGraphics("vector");
  game.loop(2100);
  game.loop(2116);
  assert.equal(draws, 2);
  rect = { width: 350, height: 450 };
  game.resize();
  game.loop(2132);
  game.loop(2148);
  assert.equal(draws, 3);
  game.togglePause();
  game.loop(2164);
  assert.equal(draws, 4);
  assert.ok(game.elapsed > elapsed);
});

test("background gradient is reused and unchanged resizing keeps the canvas intact", () => {
  let gradients = 0, transforms = 0;
  game.ctx = new Proxy({}, {
    get(_target, key) {
      if (key === "createRadialGradient") return () => {
        gradients++;
        return { addColorStop() {} };
      };
      if (key === "setTransform") return () => transforms++;
      return () => {};
    },
  });
  game.setGraphics("vector");
  game.draw();
  game.draw();
  assert.equal(gradients, 1);
  game.resize();
  game.draw();
  assert.equal(gradients, 1);
  assert.equal(transforms, 0);
  rect = { width: 350, height: 450 };
  game.resize();
  game.draw();
  assert.equal(gradients, 2);
  assert.equal(transforms, 1);
});

test("hidden and reduced-motion idle frames skip rendering", () => {
  let draws = 0;
  game.draw = () => draws++;
  game.reducedMotion = true;
  game.state.status = "ready";
  game.loop(100);
  game.loop(116);
  assert.equal(draws, 1);
  document.hidden = true;
  game.needsRedraw = true;
  game.loop(132);
  assert.equal(draws, 1);
  document.hidden = false;
  game.loop(148);
  assert.equal(draws, 2);
});

test("restart drops texture caches and reuses cleared effect arrays", () => {
  const cache = game.rockSprites;
  const particles = game.particles, bullets = game.bullets;
  game.burst(10, 10, 20, "white", 100);
  game.setControl("Space", true);
  game.update(0.01);
  game.start("hardcore");
  assert.notEqual(game.rockSprites, cache);
  assert.equal(game.particles, particles);
  assert.equal(game.bullets, bullets);
  assert.equal(particles.length, 0);
  assert.equal(bullets.length, 0);
});

test("destroy releases retained resources once and prevents further frames", () => {
  let closes = 0, draws = 0;
  game.audio = { close: async () => { closes++; } };
  game.draw = () => draws++;
  game.burst(10, 10, 20, "white", 100);
  game.spawnUfo("large");
  game.destroy();
  game.destroy();
  game.loop(100);
  assert.equal(closes, 1);
  assert.equal(draws, 0);
  assert.equal(game.audio, undefined);
  assert.equal(game.ufo, null);
  for (const key of ["rocks", "bullets", "enemyBullets", "particles", "jumps", "shards", "shockwaves"])
    assert.equal(game[key].length, 0);
});

test("finished audio pulses release their stopper without clearing a newer voice", () => {
  const oscillators = [];
  const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelAndHoldAtTime() {} };
  game.audio = {
    state: "running", currentTime: 0, destination: {}, close: async () => {},
    createOscillator() {
      const oscillator = { frequency: parameter, connect() {}, disconnect() {},
        start() {}, stop() {}, onended: null };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => ({ gain: parameter, connect() {}, disconnect() {} }),
  };
  game.playHeartbeat();
  oscillators[0].onended();
  assert.equal(game.stopHeartbeatVoice, undefined);
  game.playHeartbeat();
  game.playHeartbeat();
  const currentStopper = game.stopHeartbeatVoice;
  oscillators[1].onended();
  assert.equal(game.stopHeartbeatVoice, currentStopper);
  oscillators[2].onended();
  assert.equal(game.stopHeartbeatVoice, undefined);
});

test("a destroyed ship leaves a fireball that fades into smoke", () => {
  game.protection = 0;
  game.hitShip();
  const fire = game.puffs.filter((puff) => !puff.smoke);
  const smoke = game.puffs.filter((puff) => puff.smoke);
  assert.ok(fire.length > 0 && smoke.length > 0);
  // Smoke appears as the fire burns down, and outlasts it.
  assert.ok(Math.min(...smoke.map((puff) => puff.delay)) > Math.max(...fire.map((puff) => puff.delay)));
  assert.ok(Math.min(...smoke.map((puff) => puff.max)) > Math.max(...fire.map((puff) => puff.max)));
  const waiting = smoke[0], start = { x: waiting.x, radius: waiting.radius };
  game.update(0.1);
  assert.equal(waiting.x, start.x);
  assert.equal(waiting.radius, start.radius);
  for (let i = 0; i < 15; i++) game.update(0.033);
  assert.ok(waiting.radius > start.radius);
  for (let i = 0; i < 5; i++) game.update(0.033);
  assert.ok(game.puffs.length > 0 && game.puffs.every((puff) => puff.smoke));
  for (let i = 0; i < 55; i++) game.update(0.033);
  assert.equal(game.puffs.length, 0);
});

test("ship explosions fall back to filtered noise, and reduced motion skips the fireball", () => {
  const nodes = [];
  const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = (extra) => { const n = { connect() {}, disconnect() {}, ...extra }; nodes.push(n); return n; };
  game.audio = {
    state: "running", currentTime: 0, sampleRate: 100, destination: {}, close: async () => {},
    createOscillator: () => node({ frequency: parameter, start() {}, stop() {} }),
    createGain: () => node({ gain: parameter }),
    createBiquadFilter: () => node({ frequency: parameter }),
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node({ start() {}, stop() {}, kind: "noise" }),
  };
  game.reducedMotion = true;
  game.protection = 0;
  game.hitShip();
  assert.equal(nodes.filter((n) => n.kind === "noise").length, 1);
  assert.equal(game.puffs.length, 0);
});

test("explosion files are fetched and decoded once, with failures handled", async (t) => {
  const requests = [], decoded = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    return { ok: true, arrayBuffer: async () => url };
  });
  const audio = { decodeAudioData: async data => {
    const buffer = { data };
    decoded.push(buffer);
    return buffer;
  } };
  await game.loadExplosions(audio);
  await game.loadExplosions(audio);
  assert.deepEqual(requests, ["/rock-hit-1.wav", "/rock-hit-2.wav", "/ship-explosion.mp3", "/ufo-burst.wav"]);
  assert.deepEqual(game.explosionBuffers.rock, [decoded[0], decoded[1]]);
  assert.deepEqual(game.explosionBuffers.ship, [decoded[2]]);
  assert.deepEqual(game.explosionBuffers.ufo, [decoded[3]]);
});

function sampleAudio() {
  const sources = [];
  const audio = {
    state: "running", currentTime: 0, destination: {}, close: async () => {},
    createBufferSource() {
      const source = { connect() {}, disconnect() { this.disconnected = true; },
        start() { this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
    createGain: () => ({ gain: { setValueAtTime() {} }, connect() {}, disconnect() {} }),
  };
  game.audio = audio;
  game.explosionBuffers = {
    rock: [{ name: "rock1" }, { name: "rock2" }], ship: [{ name: "ship" }],
    ufo: [{ name: "ufo" }],
  };
  return { audio, sources };
}

test("rock hits and ship destruction play their respective samples and allow overlap", () => {
  const { sources } = sampleAudio();
  const tones = [];
  game.tone = (...args) => tones.push(args);
  game.breakRock(0, true);
  game.breakRock(0, false);
  game.protection = 0;
  game.hitShip();
  assert.deepEqual(sources.map(source => source.buffer.name), ["rock1", "rock2", "ship"]);
  assert.ok(sources.every(source => source.started));
  assert.equal(tones.length, 0);
  assert.equal(game.explosionVoices.size, 3);
  sources[0].onended();
  assert.equal(game.explosionVoices.size, 2);
  assert.equal(sources[0].disconnected, true);
  game.playExplosion("rock", 0.45);
  assert.equal(sources.at(-1).buffer.name, "rock1");
});

test("one failed impact file still allows playback of the other variant", async (t) => {
  const { sources, audio } = sampleAudio();
  t.mock.method(globalThis, "fetch", async url => {
    if (url === "/rock-hit-1.wav") throw Error("Unavailable");
    return { ok: true, arrayBuffer: async () => url };
  });
  audio.decodeAudioData = async data => ({ name: data });
  await game.loadExplosions(audio);
  for (let i = 0; i < 3; i++) assert.equal(game.playExplosion("rock", 0.45), true);
  assert.ok(sources.every(source => source.buffer.name === "/rock-hit-2.wav"));
});

test("shooting either UFO plays its explosion sample; leaving the field stays silent", () => {
  const { sources } = sampleAudio();
  game.rocks = [];
  const tones = [];
  game.tone = (...args) => tones.push(args);
  for (const kind of ["large", "small"]) {
    game.spawnUfo(kind);
    Object.assign(game.ufo, { x: 150, y: 150, vx: 0, vy: 0, soundTimer: 1 });
    game.bullets = [{ x: 150, y: 150, vx: 0, vy: 0, life: 1 }];
    game.update(0);
    assert.equal(game.ufo, null);
    assert.equal(sources.at(-1).buffer.name, "ufo");
    assert.equal(sources.at(-1).started, true);
  }
  assert.equal(sources.length, 2);
  assert.equal(tones.length, 0);
  game.spawnUfo("large");
  game.removeUfo(false);
  assert.equal(sources.length, 2);
});

test("UFO explosions fall back to synthesis when the sample is unavailable", () => {
  const tones = [];
  game.tone = (...args) => tones.push(args);
  game.spawnUfo("large");
  game.removeUfo(true);
  assert.equal(tones.length, 1);
  assert.equal(tones[0][0], 240);
});

test("mute, pause, restart, and destroy stop active explosion samples", () => {
  const { sources, audio } = sampleAudio();
  for (const stop of [() => game.setMuted(true), () => game.togglePause(),
    () => game.start("classic"), () => game.destroy()]) {
    game.muted = false;
    game.state.status = "playing";
    // Keep restart from initiating another load in this playback-only test.
    game.initAudio = () => {};
    game.tone = () => {};
    assert.equal(game.playExplosion("rock", 0.45), true);
    stop();
    assert.equal(sources.at(-1).stopped, true);
    assert.equal(game.explosionVoices.size, 0);
  }
  game.audio = audio;
  game.muted = true;
  assert.equal(game.playExplosion("ship", 0.65), false);
});

test("failed audio requests preserve fallback effects and destroy cancels pending loads", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw Error("Unavailable"); });
  await game.loadExplosions({});
  assert.deepEqual(game.explosionBuffers, {});
  assert.equal(game.playExplosion("rock", 0.45), false);
  game.destroy();
  assert.equal(game.explosionAbort.signal.aborted, true);
});
