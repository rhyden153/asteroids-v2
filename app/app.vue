<script setup lang="ts">
import {
  ABILITIES,
  AsteroidsEngine,
  type GameState,
  type Difficulty,
} from "./utils/game";

useHead({
  title: "Asteroids — A little space to play.",
  meta: [
    {
      name: "description",
      content:
        "An old-school space adventure, reimagined. Pilot your ship, break some rocks, and chase your next high score.",
    },
    { name: "theme-color", content: "#f5f3ed" },
  ],
  link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
});
const canvas = ref<HTMLCanvasElement>();
const arena = ref<HTMLElement>();
const state = ref<GameState>({
  status: "ready",
  score: 0,
  lives: 3,
  wave: 1,
  boost: 100,
  hyperspaceCooldown: 0,
  shieldRemaining: 0,
  shieldCooldown: 0,
});
const difficulty = ref<Difficulty>("classic");
const muted = ref(false);
const modal = ref<"scores" | "about" | null>(null);
const dialog = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;
watch(modal, async (value) => {
  if (value) {
    previousFocus = document.activeElement as HTMLElement;
    await nextTick();
    dialog.value?.querySelector<HTMLButtonElement>("button")?.focus();
  } else if (state.value.status !== "playing")
    previousFocus?.focus({ preventScroll: true });
});
const scores = ref<
  { score: number; wave: number; mode: string; date: string }[]
>([]);
const best = computed(() => Math.max(0, ...scores.value.map((s) => s.score)));
const formatScore = (value: number) => String(value).padStart(6, "0");
const isPlaying = computed(() => state.value.status === "playing");
const fullscreen = ref(false);
let engine: AsteroidsEngine | undefined;
let observer: ResizeObserver | undefined;
function start() {
  modal.value = null;
  engine?.start(difficulty.value);
  canvas.value?.focus({ preventScroll: true });
  arena.value?.scrollIntoView({
    block: "center",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
function toggleSound() {
  muted.value = !muted.value;
  engine?.setMuted(muted.value);
  try {
    localStorage.setItem("asteroids-muted", String(muted.value));
  } catch {}
  if (isPlaying.value) canvas.value?.focus({ preventScroll: true });
}
function togglePause() {
  engine?.togglePause();
}
function activateAbility(ability: "hyperspace" | "shield") {
  if (ability === "hyperspace") engine?.useHyperspace();
  else engine?.useShield();
  canvas.value?.focus({ preventScroll: true });
}
function openModal(value: "scores" | "about") {
  if (isPlaying.value) engine?.togglePause();
  modal.value = value;
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await arena.value?.requestFullscreen();
  } catch {
    fullscreen.value = !fullscreen.value;
  }
  canvas.value?.focus({ preventScroll: true });
}
function onFullscreen() {
  fullscreen.value = !!document.fullscreenElement;
}
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (modal.value) {
    if (event.code === "Escape") modal.value = null;
    if (event.code === "Tab") {
      const buttons =
        dialog.value?.querySelectorAll<HTMLButtonElement>("button");
      const first = buttons?.[0],
        last = buttons?.[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if (target.closest("button, a, select, input")) return;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      event.code,
    )
  )
    event.preventDefault();
  if (event.repeat) return;
  if (event.code === "Enter" && ["ready", "over"].includes(state.value.status))
    start();
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  if (event.code === "KeyM") toggleSound();
}
function touch(event: PointerEvent, key: string, down: boolean) {
  event.preventDefault();
  if (down)
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  engine?.setControl(key, down);
}
onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem("asteroids-scores") || "[]");
    if (Array.isArray(stored))
      scores.value = stored
        .filter(
          (s) =>
            Number.isFinite(s.score) &&
            Number.isFinite(s.wave) &&
            typeof s.date === "string",
        )
        .slice(0, 5);
    muted.value = localStorage.getItem("asteroids-muted") === "true";
  } catch {}
  if (!canvas.value) return;
  engine = new AsteroidsEngine(canvas.value, (next) => {
    if (
      next.status === "over" &&
      state.value.status !== "over" &&
      next.score > 0
    ) {
      scores.value = [
        ...scores.value,
        {
          score: next.score,
          wave: next.wave,
          mode: difficulty.value,
          date: new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        },
      ]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      try {
        localStorage.setItem("asteroids-scores", JSON.stringify(scores.value));
      } catch {}
    }
    state.value = next;
  });
  engine.setMuted(muted.value);
  observer = new ResizeObserver(() => engine?.resize());
  observer.observe(canvas.value);
  window.addEventListener("keydown", onKey);
  document.addEventListener("fullscreenchange", onFullscreen);
});
onBeforeUnmount(() => {
  engine?.destroy();
  observer?.disconnect();
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("fullscreenchange", onFullscreen);
});
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="/" aria-label="Asteroids home"
        ><span class="brand-symbol"><AppIcon name="asteroid" /></span>
        ASTEROIDS<span class="wordmark-dot">®</span></a
      >
      <span class="header-caption">THE CLASSIC. BACK IN ORBIT.</span>
      <nav aria-label="Main navigation">
        <button class="nav-button" @click="openModal('scores')">
          <AppIcon name="trophy" /><span>High scores</span></button
        ><button
          class="about-button"
          aria-label="About Asteroids"
          @click="openModal('about')"
        >
          <AppIcon name="info" />
        </button>
      </nav>
    </header>
    <main>
      <section class="page-intro">
        <div>
          <div class="eyebrow">
            <span class="tiny-cross">+</span> EST. 1979 · REIMAGINED FOR NOW
          </div>
          <h1>A little space to play<span>.</span></h1>
        </div>
        <p>
          No downloads. No quarters.<br />Just you and a whole lot of asteroids.
        </p>
      </section>
      <div class="game-layout">
        <section class="game-panel" aria-label="Asteroids arcade game">
          <div class="instrument-bar">
            <div class="instrument">
              <span class="instrument-label">SCORE</span
              ><strong>{{ formatScore(state.score) }}</strong>
            </div>
            <div class="instrument best-instrument">
              <span class="instrument-label"
                ><AppIcon name="trophy" /> PERSONAL BEST</span
              ><strong>{{ formatScore(best) }}</strong>
            </div>
            <div class="instrument wave-instrument">
              <span class="instrument-label">WAVE</span
              ><strong>{{ String(state.wave).padStart(2, "0") }}</strong>
            </div>
            <div class="instrument lives-instrument">
              <span class="instrument-label">LIVES</span>
              <div class="life-ships">
                <AppIcon
                  v-for="life in 3"
                  :key="life"
                  name="ship"
                  :class="{ lost: life > state.lives }"
                />
              </div>
            </div>
          </div>
          <div
            ref="arena"
            class="arena"
            :class="{
              'fallback-fullscreen': fullscreen,
              'is-playing': isPlaying,
            }"
          >
            <canvas
              ref="canvas"
              tabindex="0"
              aria-label="Asteroids playfield. Use left/right arrows or A/D to rotate, Up or W to thrust, Space to fire, Shift to boost, H or Down to hyperspace, S for a one-second shield, and P to pause."
            />
            <div class="arena-coordinates" aria-hidden="true">
              <span>SECTOR 07 / DEEP SPACE</span
              ><span class="signal"><i></i> SYSTEMS ONLINE</span>
            </div>
            <span class="corner-mark top-left" aria-hidden="true"></span
            ><span class="corner-mark top-right" aria-hidden="true"></span
            ><span class="corner-mark bottom-left" aria-hidden="true"></span
            ><span class="corner-mark bottom-right" aria-hidden="true"></span>
            <div
              v-if="state.status === 'ready'"
              class="game-overlay launch-overlay"
            >
              <div class="orbit-badge">
                <AppIcon name="ship" /><span class="orbit-dot"></span>
              </div>
              <div class="space-eyebrow">ONE SHIP. ENDLESS POSSIBILITIES.</div>
              <h2>HELLO, SPACE.</h2>
              <p>Break rocks. Dodge debris. Stay a little longer.</p>
              <button class="launch-button" @click="start">
                <AppIcon name="play" /> LET’S PLAY <span>↗</span></button
              ><span class="enter-hint"
                >or press <kbd>enter</kbd> to launch</span
              >
            </div>
            <div
              v-if="state.status === 'paused'"
              class="game-overlay pause-overlay"
            >
              <div class="space-eyebrow">TAKE A BREATHER</div>
              <h2>IN A HOLDING<br />ORBIT.</h2>
              <p>The universe can wait a minute.</p>
              <button class="launch-button" @click="togglePause">
                <AppIcon name="play" /> KEEP FLYING <span>↗</span></button
              ><button class="text-button" @click="start">
                Start a new flight
              </button>
            </div>
            <div
              v-if="state.status === 'over'"
              class="game-overlay pause-overlay"
            >
              <div class="space-eyebrow">
                {{
                  state.score > 0 && state.score >= best
                    ? "A NEW PERSONAL BEST"
                    : "A GOOD RUN, PILOT"
                }}
              </div>
              <h2>SPACE WINS.<br />THIS TIME.</h2>
              <p>
                <span class="end-score">{{
                  state.score.toLocaleString()
                }}</span>
                points · {{ state.wave }}
                {{ state.wave === 1 ? "wave" : "waves" }} reached
              </p>
              <button class="launch-button" @click="start">
                <AppIcon name="restart" /> ONE MORE GO <span>↗</span></button
              ><span class="enter-hint"
                >or press <kbd>enter</kbd> to try again</span
              >
            </div>
            <div v-if="isPlaying" class="boost-meter">
              <span>BOOST</span>
              <div><i :style="{ width: `${state.boost}%` }"></i></div>
              <kbd>SHIFT</kbd>
            </div>
            <div
              v-if="isPlaying"
              class="flight-abilities"
              aria-label="Ship abilities"
            >
              <button
                class="ability-button hyperspace-ability"
                aria-label="Hyperspace"
                title="Hyperspace (H / ↓) · random jump · 3-second cooldown"
                :disabled="state.hyperspaceCooldown > 0"
                @click="activateAbility('hyperspace')"
              >
                <AppIcon name="hyperspace" />
                <span
                  >HYPERSPACE<small>{{
                    state.hyperspaceCooldown > 0
                      ? `${state.hyperspaceCooldown.toFixed(1)}s RECHARGE`
                      : "READY TO JUMP"
                  }}</small></span
                ><kbd>H / ↓</kbd>
                <i
                  class="ability-charge"
                  :style="{
                    width: `${(1 - state.hyperspaceCooldown / ABILITIES.hyperspaceCooldown) * 100}%`,
                  }"
                ></i>
              </button>
              <button
                class="ability-button shield-ability"
                :class="{ 'shield-active': state.shieldRemaining > 0 }"
                aria-label="Deploy shield"
                title="Shield (S) · 1 second of protection · 5-second recharge"
                :disabled="state.shieldCooldown > 0"
                @click="activateAbility('shield')"
              >
                <AppIcon name="shield" />
                <span
                  >SHIELD<small>{{
                    state.shieldRemaining > 0
                      ? `ACTIVE · ${state.shieldRemaining.toFixed(1)}s`
                      : state.shieldCooldown > 0
                        ? `${state.shieldCooldown.toFixed(1)}s RECHARGE`
                        : "1 SECOND · READY"
                  }}</small></span
                ><kbd>S</kbd>
                <i
                  class="ability-charge"
                  :style="{
                    width: `${(state.shieldRemaining > 0 ? state.shieldRemaining / ABILITIES.shieldDuration : Math.max(0, 1 - state.shieldCooldown / ABILITIES.shieldRecharge)) * 100}%`,
                  }"
                ></i>
              </button>
            </div>
            <div class="arena-bottom">
              <span
                ><i></i>
                {{
                  state.status === "playing"
                    ? "FLIGHT IN PROGRESS"
                    : state.status === "paused"
                      ? "FLIGHT PAUSED"
                      : state.status === "over"
                        ? "SIGNAL LOST"
                        : "AWAITING PILOT"
                }}</span
              ><span>∞ &nbsp; THE UNIVERSE IS YOURS</span>
            </div>
            <button
              v-if="fullscreen"
              class="exit-fullscreen"
              aria-label="Exit fullscreen"
              @click="toggleFullscreen"
            >
              <AppIcon name="fullscreen" />
            </button>
            <div
              v-if="isPlaying"
              class="touch-controls"
              aria-label="Touch game controls"
            >
              <div>
                <button
                  aria-label="Rotate left"
                  @pointerdown="touch($event, 'ArrowLeft', true)"
                  @pointerup="touch($event, 'ArrowLeft', false)"
                  @pointercancel="touch($event, 'ArrowLeft', false)"
                >
                  ↶</button
                ><button
                  aria-label="Thrust"
                  @pointerdown="touch($event, 'ArrowUp', true)"
                  @pointerup="touch($event, 'ArrowUp', false)"
                  @pointercancel="touch($event, 'ArrowUp', false)"
                >
                  ↑</button
                ><button
                  aria-label="Rotate right"
                  @pointerdown="touch($event, 'ArrowRight', true)"
                  @pointerup="touch($event, 'ArrowRight', false)"
                  @pointercancel="touch($event, 'ArrowRight', false)"
                >
                  ↷
                </button>
              </div>
              <button
                class="touch-fire"
                aria-label="Fire"
                @pointerdown="touch($event, 'Space', true)"
                @pointerup="touch($event, 'Space', false)"
                @pointercancel="touch($event, 'Space', false)"
              >
                FIRE
              </button>
            </div>
          </div>
          <div class="game-toolbar">
            <div class="mode-picker">
              <span>FLIGHT MODE</span
              ><button
                :class="{ selected: difficulty === 'classic' }"
                :disabled="
                  state.status === 'playing' || state.status === 'paused'
                "
                @click="difficulty = 'classic'"
              >
                Classic</button
              ><button
                :class="{ selected: difficulty === 'hardcore' }"
                :disabled="
                  state.status === 'playing' || state.status === 'paused'
                "
                @click="difficulty = 'hardcore'"
              >
                Hardcore<AppIcon name="bolt" />
              </button>
            </div>
            <div class="game-tools">
              <button
                :aria-label="muted ? 'Enable sound' : 'Mute sound'"
                :title="muted ? 'Enable sound (M)' : 'Mute sound (M)'"
                @click="toggleSound"
              >
                <AppIcon :name="muted ? 'muted' : 'sound'" /></button
              ><button
                aria-label="Pause or resume game"
                title="Pause / resume (P)"
                :disabled="state.status === 'ready' || state.status === 'over'"
                @click="togglePause"
              >
                <AppIcon
                  :name="state.status === 'paused' ? 'play' : 'pause'"
                /></button
              ><span class="tool-divider"></span
              ><button
                aria-label="Toggle fullscreen"
                title="Fullscreen"
                @click="toggleFullscreen"
              >
                <AppIcon name="fullscreen" />
              </button>
            </div>
          </div>
        </section>
        <aside class="sidebar">
          <section class="manual-card">
            <div class="card-heading">
              <span class="eyebrow">THE FLIGHT MANUAL</span
              ><AppIcon name="crosshair" />
            </div>
            <h2>Small ship.<br />Big universe.</h2>
            <p>
              You know the drill. Keep moving,<br class="desktop-break" />
              keep shooting, don’t hit the rocks.
            </p>
            <div class="controls-list">
              <div>
                <span>Rotate</span
                ><span class="key-group"
                  ><kbd>←</kbd><kbd>→</kbd><small> / A D</small></span
                >
              </div>
              <div>
                <span>Thrust</span
                ><span class="key-group"><kbd>↑</kbd><small> / W</small></span>
              </div>
              <div><span>Fire</span><kbd class="wide-key">SPACE</kbd></div>
              <div><span>Boost</span><kbd class="wide-key">SHIFT</kbd></div>
              <div>
                <span>Hyperspace</span
                ><span class="key-group"><kbd>H</kbd><kbd>↓</kbd></span>
              </div>
              <div><span>Shield · 1 sec</span><kbd>E</kbd></div>
              <div><span>Pause</span><kbd>P</kbd></div>
            </div>
            <div class="pilot-tip">
              <AppIcon name="spark" />
              <p>
                <strong>A little tip</strong>The edges aren’t the end.<br />Fly
                off one side, appear on the other.
              </p>
            </div>
          </section>
          <section class="score-card">
            <div class="card-heading">
              <span class="eyebrow">KNOW YOUR TARGETS</span
              ><AppIcon name="asteroid" />
            </div>
            <div class="rock-scores">
              <div>
                <AppIcon class="rock-large" name="asteroid" /><strong
                  >20 <span>PTS</span></strong
                ><small>LARGE</small>
              </div>
              <div>
                <AppIcon class="rock-medium" name="asteroid" /><strong
                  >50 <span>PTS</span></strong
                ><small>MEDIUM</small>
              </div>
              <div>
                <AppIcon class="rock-small" name="asteroid" /><strong
                  >100 <span>PTS</span></strong
                ><small>SMALL</small>
              </div>
            </div>
            <div class="ufo-scores">
              <div>
                <AppIcon name="ufo" />
                <p>200<small>LARGE UFO</small></p>
              </div>
              <div>
                <AppIcon name="ufo" class="small-ufo" />
                <p>1,000<small>SMALL UFO</small></p>
              </div>
            </div>
            <p class="ufo-note">Small saucers aim. Keep moving.</p>
          </section>
          <div class="sidebar-note">
            <span class="status-dot"></span> Old-school soul. New-school orbit.
          </div>
        </aside>
      </div>
      <footer class="site-footer">
        <span>A LOVE LETTER TO THE ARCADE.</span
        ><span
          >Made for your five-minute break<span class="footer-star"
            >✳</span
          ></span
        ><span>INSERT COIN? <s>NAH.</s> JUST PLAY.</span>
      </footer>
    </main>
    <div
      v-if="modal"
      class="modal-backdrop"
      @click.self="modal = null"
      @keydown.esc="modal = null"
    >
      <section
        ref="dialog"
        class="modal"
        role="dialog"
        aria-modal="true"
        :aria-label="
          modal === 'scores' ? 'Personal high scores' : 'About the game'
        "
        tabindex="-1"
      >
        <button
          class="modal-close"
          aria-label="Close dialog"
          autofocus
          @click="modal = null"
        >
          ×
        </button>
        <template v-if="modal === 'scores'"
          ><div class="eyebrow">YOUR PERSONAL HALL OF FAME</div>
          <h2>Written in the stars.</h2>
          <p>Your top five flights, saved on this device.</p>
          <div v-if="!scores.length" class="empty-scores">
            <AppIcon name="trophy" />
            <h3>A legend starts somewhere.</h3>
            <p>Launch a flight and make your mark.</p>
          </div>
          <ol v-else class="score-list">
            <li v-for="(entry, index) in scores" :key="index">
              <span class="rank">{{ String(index + 1).padStart(2, "0") }}</span>
              <div>
                <strong>{{ formatScore(entry.score) }}</strong
                ><small>{{ entry.mode }} · Wave {{ entry.wave }}</small>
              </div>
              <span>{{ entry.date }}</span>
            </li>
          </ol>
          <button class="launch-button" @click="start">
            {{ state.status === "paused" ? "START NEW FLIGHT" : "LET’S PLAY" }}
            <span>↗</span>
          </button></template
        >
        <template v-else
          ><div class="eyebrow">THE CLASSIC. BACK IN ORBIT.</div>
          <h2>Some things never<br />get old.</h2>
          <p>
            A little tribute to the 1979 arcade classic. Same simple mission:
            survive, break rocks, and beat your best.
          </p>
          <p>
            Classic gives you three lives. Hardcore gives you one, with faster
            asteroids. Clear the field to advance to the next wave. Hold Shift
            while thrusting for a rechargeable boost.
          </p>
          <p>
            Watch for occasional UFO flybys. Large saucers fire in random
            directions; small saucers aim at your ship. Shoot them down for 200
            or 1,000 points.
          </p>
          <p>
            Press H or ↓ to jump to a random location and stop your momentum.
            Hyperspace recharges in three seconds, but your landing may be
            dangerous. Press S for a one-second shield against rocks, UFOs, and
            enemy shots; it recharges for five seconds after use. Both abilities
            also have on-screen buttons.
          </p>
          <p class="about-footnote">
            No accounts. No tracking. Just a little space to play.
          </p>
          <button class="launch-button" @click="modal = null">
            GOT IT, PILOT <span>↗</span>
          </button></template
        >
      </section>
    </div>
    <span class="sr-only" aria-live="polite">{{
      state.status === "over"
        ? `Game over. Your score is ${state.score}.`
        : state.status === "paused"
          ? "Game paused."
          : ""
    }}</span>
  </div>
</template>
<style>
@import "./assets/main.css";
</style>
