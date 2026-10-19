import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

// Exercise the component's real handlers, including native fullscreen state.
const source = await readFile(new URL("../app/app.vue", import.meta.url), "utf8");
const handlers = stripTypeScriptTypes(source.slice(
  source.indexOf("async function toggleFullscreen("),
  source.indexOf("function touch("),
));
function setup() {
  const document = { fullscreenElement: null };
  let requests = 0;
  const panel = {
    async requestFullscreen() {
      requests++;
      document.fullscreenElement = this;
    },
  };
  document.exitFullscreen = async () => { document.fullscreenElement = null; };
  const context = vm.createContext({
    document, arena: { value: panel }, canvas: { value: { focus() {} } },
    fullscreen: { value: false }, fullscreenPending: false, modal: { value: null },
  });
  vm.runInContext(handlers, context);
  return { context, panel, document, requests: () => requests };
}
const event = (extra = {}) => ({
  code: "KeyF", target: { closest: () => null },
  preventDefault() { this.prevented = true; }, ...extra,
});
const settle = () => new Promise(resolve => setImmediate(resolve));

test("F enters and exits native fullscreen, including when a button has focus", async () => {
  const { context: c, panel, document, requests } = setup();
  const key = event({ target: { closest: selector => selector.includes("button") ? {} : null } });
  c.onKey(key);
  await settle();
  assert.equal(key.prevented, true);
  assert.equal(requests(), 1);
  assert.equal(document.fullscreenElement, panel);
  assert.equal(c.fullscreen.value, true);
  c.onKey(event());
  await settle();
  assert.equal(document.fullscreenElement, null);
  assert.equal(c.fullscreen.value, false);
});

test("F ignores repeat, modifiers, editable targets, and open dialogs", () => {
  const { context: c, requests } = setup();
  for (const prop of ["repeat", "altKey", "ctrlKey", "metaKey", "shiftKey"])
    c.onKey(event({ [prop]: true }));
  c.onKey(event({ target: { isContentEditable: true } }));
  c.onKey(event({ target: { closest: () => ({}) } }));
  c.modal.value = "about";
  c.onKey(event());
  assert.equal(requests(), 0);
});

test("native fullscreen exits synchronize state, and other elements are excluded", async () => {
  const { context: c, document } = setup();
  await c.toggleFullscreen();
  document.fullscreenElement = null;
  c.onFullscreen();
  assert.equal(c.fullscreen.value, false);
  document.fullscreenElement = {};
  c.onFullscreen();
  assert.equal(c.fullscreen.value, false);
});

test("F toggles fallback fullscreen when native support is missing or denied", async () => {
  for (const request of [undefined, async () => { throw Error("Denied"); }]) {
    const { context: c, panel } = setup();
    panel.requestFullscreen = request;
    c.onKey(event());
    await settle();
    assert.equal(c.fullscreen.value, true);
    c.onKey(event());
    await settle();
    assert.equal(c.fullscreen.value, false);
    c.onKey(event());
    await settle();
    c.onKey(event({ code: "Escape" }));
    await settle();
    assert.equal(c.fullscreen.value, false);
  }
});

test("a rejected native exit keeps the UI synchronized with the browser", async () => {
  const { context: c, document, panel } = setup();
  await c.toggleFullscreen();
  document.exitFullscreen = async () => { throw Error("Denied"); };
  await c.toggleFullscreen();
  assert.equal(c.fullscreen.value, true);
  assert.equal(document.fullscreenElement, panel);
  assert.equal(c.fullscreenPending, false);
});

test("fullscreen requests cannot overlap", async () => {
  const { context: c, panel, document } = setup();
  let finish;
  let calls = 0;
  panel.requestFullscreen = () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  };
  const pending = c.toggleFullscreen();
  await c.toggleFullscreen();
  assert.equal(calls, 1);
  document.fullscreenElement = panel;
  finish();
  await pending;
  assert.equal(c.fullscreen.value, true);
});
