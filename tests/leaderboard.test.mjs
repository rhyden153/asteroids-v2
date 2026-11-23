import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const source = await readFile(new URL("../app/app.vue", import.meta.url), "utf8");
const handler = stripTypeScriptTypes(source.slice(
  source.indexOf("engine = new AsteroidsEngine("),
  source.indexOf("  engine.setMuted("),
));
const cache = new URL("../node_modules/.c12/", import.meta.url);
const layer = (await readdir(cache)).find(name => name.startsWith("github_rhyden153_neogames_"));
const rules = stripTypeScriptTypes(await readFile(
  new URL(`${layer}/shared/utils/leaderboard.ts`, cache), "utf8",
)).replaceAll("export ", "");
const board = cutoff => Array.from({ length: 10 }, () => ({ score: cutoff }));
const settle = () => new Promise(resolve => setImmediate(resolve));

function setup(boards) {
  let update;
  let refreshes = 0;
  let resolveRefresh;
  const response = new Promise(resolve => { resolveRefresh = resolve; });
  const context = vm.createContext({
    AsteroidsEngine: function (_canvas, callback) { update = callback; },
    canvas: { value: {} },
    state: { value: { status: "playing", score: 0 } },
    scores: { value: [{ score: 100000, wave: 10, mode: "classic", date: "Nov 23" }] },
    difficulty: { value: "classic" },
    qualified: { value: [] }, initials: { value: "" }, initialsInput: { value: null },
    localStorage: { setItem() {} }, savedInitials: () => "ABC", nextTick: async () => {},
    refreshLeaderboards: () => { refreshes++; return response; },
  });
  vm.runInContext(rules + "\n" + handler, context);
  return {
    context, update, refreshes: () => refreshes,
    finish: () => resolveRefresh(boards),
    names: () => Array.from(context.qualified.value),
  };
}

test("scores below the machine best can qualify for both global boards", async () => {
  const run = setup({ allTime: board(1000), weekly: board(500) });
  run.update({ status: "over", score: 2000, wave: 2 });
  run.finish();
  await settle();
  assert.equal(run.refreshes(), 1);
  assert.deepEqual(run.names(), ["allTime", "weekly"]);
  assert.equal(run.context.scores.value[0].score, 100000);
  assert.equal(run.context.initials.value, "ABC");
});

test("each board uses its own cutoff and ties do not displace existing entries", async () => {
  for (const [score, expected] of [[2000, ["weekly"]], [500, []]]) {
    const run = setup({ allTime: board(2000), weekly: board(500) });
    run.update({ status: "over", score, wave: 2 });
    run.finish();
    await settle();
    assert.deepEqual(run.names(), expected);
  }
});

test("zero scores and repeated game-over updates do not trigger extra checks", () => {
  const run = setup(null);
  run.update({ status: "over", score: 0, wave: 1 });
  assert.equal(run.refreshes(), 0);
  run.update({ status: "playing", score: 0, wave: 1 });
  run.update({ status: "over", score: 1000, wave: 2 });
  run.update({ status: "over", score: 1000, wave: 2 });
  assert.equal(run.refreshes(), 1);
  run.finish();
});

test("unavailable boards and results arriving during a new game do not prompt", async () => {
  for (const restarted of [false, true]) {
    const run = setup(restarted ? { allTime: [], weekly: [] } : null);
    run.update({ status: "over", score: 1000, wave: 2 });
    if (restarted) run.update({ status: "playing", score: 0, wave: 1 });
    run.finish();
    await settle();
    assert.deepEqual(run.names(), []);
  }
});
