import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const source = await readFile(new URL("../app/app.vue", import.meta.url), "utf8");
const handler = stripTypeScriptTypes(source.slice(
  source.indexOf("engine = new AsteroidsEngine("),
  source.indexOf("  engine.setMuted("),
));
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup(names = []) {
  let update;
  const recorded = [];
  let resolveRecord;
  const response = new Promise(resolve => { resolveRecord = resolve; });
  const context = vm.createContext({
    AsteroidsEngine: function (_canvas, callback) { update = callback; },
    canvas: { value: {} },
    state: { value: { status: "playing", score: 0 } },
    scores: { value: [{ score: 100000, wave: 10, mode: "classic", date: "Nov 23" }] },
    difficulty: { value: "classic" },
    qualified: { value: [] }, initials: { value: "" }, initialsInput: { value: null },
    localStorage: { setItem() {} }, savedInitials: () => "ABC", nextTick: async () => {},
    recordGame: score => { recorded.push(score); return response; },
  });
  vm.runInContext(handler, context);
  return {
    context, update, recorded,
    finish: () => resolveRecord(names),
    names: () => Array.from(context.qualified.value),
  };
}

test("game over delegates qualification to the layer even below the machine best", async () => {
  const run = setup(["allTime", "weekly"]);
  run.update({ status: "over", score: 2000, wave: 2 });
  run.finish();
  await settle();
  assert.deepEqual(run.recorded, [2000]);
  assert.deepEqual(run.names(), ["allTime", "weekly"]);
  assert.equal(run.context.scores.value[0].score, 100000);
  assert.equal(run.context.initials.value, "ABC");
});

test("the initials prompt follows the boards returned by the layer", async () => {
  for (const expected of [["weekly"], []]) {
    const run = setup(expected);
    run.update({ status: "over", score: 2000, wave: 2 });
    run.finish();
    await settle();
    assert.deepEqual(run.names(), expected);
    assert.equal(run.context.initials.value, expected.length ? "ABC" : "");
  }
});

test("zero scores and repeated game-over updates do not trigger extra checks", () => {
  const run = setup();
  run.update({ status: "over", score: 0, wave: 1 });
  assert.deepEqual(run.recorded, []);
  run.update({ status: "playing", score: 0, wave: 1 });
  run.update({ status: "over", score: 1000, wave: 2 });
  run.update({ status: "over", score: 1000, wave: 2 });
  assert.deepEqual(run.recorded, [1000]);
  run.finish();
});

test("no qualifying boards and results arriving during a new game do not prompt", async () => {
  for (const restarted of [false, true]) {
    const run = setup(restarted ? ["allTime", "weekly"] : []);
    run.update({ status: "over", score: 1000, wave: 2 });
    if (restarted) run.update({ status: "playing", score: 0, wave: 1 });
    run.finish();
    await settle();
    assert.deepEqual(run.names(), []);
  }
});
