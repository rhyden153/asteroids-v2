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
  assert.ok(game.protection > 0);
});

test("last life ends the flight and stops further input", () => {
  game.start("hardcore");
  game.protection = 0;
  game.rocks = [game.makeRock(game.ship.x, game.ship.y, 3)];
  game.update(0);
  assert.equal(game.state.status, "over");
  game.setControl("Space", true);
  game.update(0.03);
  assert.equal(game.bullets.length, 0);
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

test("hyperspace retains the risk of landing on an asteroid", () => {
  game.protection = 0;
  game.useHyperspace();
  game.rocks = [game.makeRock(game.ship.x, game.ship.y, 3)];
  game.update(0);
  assert.equal(game.state.lives, 2);
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

test("holding an ability key never automatically repeats activation", () => {
  game.rocks = [];
  game.setControl("KeyH", true);
  game.setControl("KeyX", true);
  game.update(7);
  const position = { x: game.ship.x, y: game.ship.y };
  game.setControl("KeyH", true);
  game.setControl("KeyX", true);
  assert.equal(game.state.hyperspaceCooldown, 0);
  assert.equal(game.state.shieldRemaining, 0);
  assert.equal(game.ship.x, position.x);
  game.setControl("KeyH", false);
  game.setControl("KeyX", false);
  game.setControl("KeyH", true);
  game.setControl("KeyX", true);
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
