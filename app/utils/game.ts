import {
  drawModernRock,
  drawModernShip,
  drawModernShot,
  drawModernUfo,
  type GraphicsMode,
} from "./sprites";

export type Difficulty = "classic" | "hardcore";
export type GameState = {
  status: "ready" | "playing" | "paused" | "over";
  score: number;
  lives: number;
  wave: number;
  boost: number;
  hyperspaceCooldown: number;
  shieldRemaining: number;
  shieldCooldown: number;
};
export const createGameState = (difficulty?: Difficulty): GameState => ({
  status: difficulty ? "playing" : "ready",
  score: 0,
  lives: difficulty === "hardcore" ? 1 : 3,
  wave: 1,
  boost: 100,
  hyperspaceCooldown: 0,
  shieldRemaining: 0,
  shieldCooldown: 0,
});
const STATE_KEYS = [
  "status", "score", "lives", "wave", "boost", "hyperspaceCooldown",
  "shieldRemaining", "shieldCooldown",
] as const;
export const ABILITIES = {
  hyperspaceCooldown: 3,
  shieldDuration: 2,
  shieldRecharge: 5,
} as const;
type Body = { x: number; y: number; vx: number; vy: number };
type Rock = Body & {
  radius: number;
  size: number;
  angle: number;
  spin: number;
  points: number[];
};
type Particle = Body & {
  life: number;
  max: number;
  color: string;
  radius: number;
};
type Bullet = Body & { life: number };
type Shard = Body & {
  life: number;
  max: number;
  angle: number;
  spin: number;
  points: [number, number][];
};
type Shockwave = { x: number; y: number; life: number; max: number };
// Fireball and smoke puffs swell as they drift; each waits `delay` seconds (part of its life) to appear.
type Puff = Body & {
  life: number;
  max: number;
  delay: number;
  radius: number;
  grow: number;
  smoke: boolean;
};
type Ufo = Body & {
  kind: "large" | "small";
  radius: number;
  shotTimer: number;
  turnTimer: number;
  soundTimer: number;
  soundHigh: boolean;
};
type Threat = Body & { radius: number; life: number };
const TAU = Math.PI * 2;
// Bring synthesized effects closer to the recorded explosions while preserving their mix.
const SYNTH_GAIN = 4;
const EXPLOSION_FILES = {
  rock: ["/rock-hit-1.wav", "/rock-hit-2.wav"],
  ship: ["/ship-explosion.mp3"],
  ufo: ["/ufo-burst.wav"],
} as const;
type ExplosionKind = keyof typeof EXPLOSION_FILES;
// Hyperspace landings keep this much open space around the ship for this many seconds.
const HYPERSPACE_CLEARANCE = 70;
const HYPERSPACE_LOOKAHEAD = 1.5;
const ROCK_RADII = [0, 15, 30, 56] as const;
const ROCK_SCORES = [0, 100, 50, 20] as const;
const random = (min: number, max: number) => min + Math.random() * (max - min);
const tickTimer = (remaining: number, dt: number) =>
  remaining - dt > 1e-9 ? remaining - dt : 0;
const advanceBody = (body: Body, dt: number) => {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
};
const advanceShard = (shard: Shard, dt: number) => {
  advanceBody(shard, dt);
  shard.angle += shard.spin * dt;
};
const advancePuff = (puff: Puff, dt: number) => {
  if (puff.max - puff.life < puff.delay) return;
  advanceBody(puff, dt);
  const drag = Math.pow(0.2, dt);
  puff.vx *= drag;
  puff.vy *= drag;
  puff.radius += puff.grow * dt;
};
// A fireball burns from white-hot through orange to a dull red as it fades.
const FIRE = [[255, 246, 214], [255, 196, 92], [240, 110, 56], [120, 44, 30]] as const;
const fireColor = (t: number, alpha: number) => {
  const s = Math.min(Math.max(t, 0), 0.999) * (FIRE.length - 1),
    i = Math.floor(s),
    f = s - i,
    a = FIRE[i]!,
    b = FIRE[i + 1]!;
  const mix = (k: number) => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return `rgba(${mix(0)},${mix(1)},${mix(2)},${Math.max(0, alpha)})`;
};
// Keep survivor order and array identity without allocating a filtered array.
function updateTimed<T extends { life: number }>(
  items: T[], dt: number, advance?: (item: T, dt: number) => void,
) {
  let live = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    advance?.(item, dt);
    item.life -= dt;
    if (item.life > 0) items[live++] = item;
  }
  items.length = live;
}
const withinRadius = (a: { x: number; y: number }, b: { x: number; y: number }, radius: number) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy < radius * radius;
};

export class AsteroidsEngine {
  private ctx: CanvasRenderingContext2D;
  private state = createGameState();
  private emittedState?: GameState;
  private width = 1200;
  private height = 720;
  private ship = { x: 600, y: 360, vx: 0, vy: 0, angle: -Math.PI / 2 };
  private rocks: Rock[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private ufo: Ufo | null = null;
  private ufoTimer = 0;
  private ufoVisits = 0;
  private particles: Particle[] = [];
  private jumps: { x: number; y: number; life: number }[] = [];
  private shards: Shard[] = [];
  private shockwaves: Shockwave[] = [];
  private puffs: Puff[] = [];
  private keys = new Set<string>();
  private gamepadKeys = new Set<string>();
  private gamepadButtons = new Set<number>();
  private gamepadIndex: number | null = null;
  private focused = true;
  private focus = () => { this.focused = true; };
  private stars = Array.from({ length: 220 }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: random(0.4, 1.5),
    alpha: random(0.12, 0.55),
    phase: random(0, TAU),
  }));
  private frame = 0;
  private last = 0;
  private elapsed = 0;
  private shotTimer = 0;
  private protection = 0;
  private deathTimer = 0;
  private waveTimer = 0;
  private announcement = 0;
  private shake = 0;
  private emitTimer = 0;
  private difficulty: Difficulty = "classic";
  private muted = false;
  private graphics: GraphicsMode = "modern";
  private rockSprites = new WeakMap<Rock, HTMLCanvasElement>();
  private backgroundGlow?: CanvasGradient;
  private needsRedraw = true;
  private destroyed = false;
  private audio?: AudioContext;
  private noiseBuffer?: AudioBuffer;
  private explosionBuffers: Partial<Record<ExplosionKind, AudioBuffer[]>> = {};
  private nextRockImpact = 0;
  private explosionLoad?: Promise<void>;
  private explosionAbort = new AbortController();
  private explosionVoices = new Map<AudioBufferSourceNode, GainNode>();
  private heartbeatPhase = 0;
  private heartbeatLow = false;
  private waveRockWork = 1;
  private stopHeartbeatVoice?: () => void;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private keydown = (event: KeyboardEvent) => {
    if (
      this.state.status !== "playing" ||
      (event.target as HTMLElement).isContentEditable ||
      (event.target as HTMLElement).closest("button, a, input, select, textarea")
    )
      return;
    if (event.repeat && ["KeyH", "ArrowDown", "ControlLeft", "ControlRight"].includes(event.code))
      return;
    if (event.code === "ControlLeft" || event.code === "ControlRight")
      event.preventDefault();
    this.setControl(event.code, true);
  };
  private keyup = (event: KeyboardEvent) => this.keys.delete(event.code);
  private blur = () => {
    this.focused = false;
    this.gamepadKeys.clear();
    this.keys.clear();
    if (this.state.status === "playing") this.togglePause();
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private onState: (state: GameState) => void,
    private controller: {
      enabled?: () => boolean;
      launch?: () => void;
      connected?: (connected: boolean) => void;
    } = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser.");
    this.ctx = ctx;
    this.resize();
    this.seedAmbient();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
    window.addEventListener("focus", this.focus);
    document.addEventListener("visibilitychange", this.visibility);
    this.frame = requestAnimationFrame(this.loop);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldHeight = this.height;
    const oldWidth = this.width;
    const width = Math.max(600, Math.min(1800, rect.width * 1.25));
    const height = (width * rect.height) / rect.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);
    if (width === oldWidth && height === oldHeight &&
      this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return;
    this.width = width;
    this.height = height;
    const scalePosition = (body: { x: number; y: number }) => {
      body.x = (body.x / oldWidth) * width;
      body.y = (body.y / oldHeight) * height;
    };
    scalePosition(this.ship);
    if (this.ufo) scalePosition(this.ufo);
    for (const bodies of [this.rocks, this.bullets, this.enemyBullets,
      this.particles, this.jumps, this.shards, this.shockwaves, this.puffs]) {
      for (const body of bodies) scalePosition(body);
    }
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.ctx.setTransform(
      this.canvas.width / this.width,
      0,
      0,
      this.canvas.height / this.height,
      0,
      0,
    );
    this.backgroundGlow = undefined;
    this.needsRedraw = true;
  }
  private emit() {
    if (this.emittedState) {
      let changed = false;
      for (const key of STATE_KEYS) {
        if (this.state[key] !== this.emittedState[key]) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }
    const snapshot = { ...this.state };
    this.emittedState = snapshot;
    this.onState(snapshot);
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopHeartbeat();
      this.stopExplosions();
    }
    else if (this.state.status === "playing") this.initAudio();
  }
  setGraphics(mode: GraphicsMode) {
    if (this.graphics === mode) return;
    this.graphics = mode;
    if (mode === "vector") this.rockSprites = new WeakMap();
    this.needsRedraw = true;
  }
  setControl(key: string, active: boolean) {
    if (!active) {
      this.keys.delete(key);
      return;
    }
    if (
      this.state.status !== "playing" ||
      this.deathTimer > 0 ||
      this.keys.has(key)
    ) return;
    this.keys.add(key);
    if (["KeyH", "ArrowDown"].includes(key)) this.useHyperspace();
    if (key === "ControlLeft" || key === "ControlRight") this.useShield();
  }
  private controlHeld(key: string) {
    return this.keys.has(key) || this.gamepadKeys.has(key);
  }
  private pollGamepad() {
    let pads: (Gamepad | null)[] = [];
    try {
      pads = Array.from(navigator.getGamepads?.() ?? []);
    } catch {
      // Browsers may disable controller access through their permissions policy.
    }
    const previous = this.gamepadIndex;
    const pad = pads.find(p => p?.connected && p.mapping === "standard" && p.index === previous)
      ?? pads.find(p => p?.connected && p.mapping === "standard");
    this.gamepadKeys.clear();
    if ((pad?.index ?? null) !== previous) {
      this.gamepadIndex = pad?.index ?? null;
      this.gamepadButtons.clear();
      this.controller.connected?.(!!pad);
      if (previous !== null && this.state.status === "playing") this.togglePause();
    }
    if (!pad) return;
    const pressed = new Set<number>();
    pad.buttons.forEach((button, index) => {
      if (button.pressed || button.value > 0.5) pressed.add(index);
    });
    if (previous !== null && previous !== pad.index) {
      this.gamepadButtons = pressed;
      return;
    }
    const tapped = (index: number) => pressed.has(index) && !this.gamepadButtons.has(index);
    const enabled = this.focused && !document.hidden && (this.controller.enabled?.() ?? true);
    if (enabled) {
      if (tapped(9) || (tapped(0) && ["ready", "over"].includes(this.state.status))) {
        if (this.state.status === "ready" || this.state.status === "over") this.controller.launch?.();
        else this.togglePause();
      } else if (this.state.status === "playing" && this.deathTimer <= 0) {
        // Keep controller input separate so releasing it cannot cancel keyboard/touch input.
        const hold = (key: string, active: boolean) => { if (active) this.gamepadKeys.add(key); };
        const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
        hold("ArrowLeft", x < -0.25 || pressed.has(14));
        hold("ArrowRight", x > 0.25 || pressed.has(15));
        hold("ArrowUp", y < -0.25 || pressed.has(12) || pressed.has(7));
        hold("Space", pressed.has(0));
        hold("ShiftLeft", pressed.has(5));
        if (tapped(2)) this.useHyperspace();
        if (tapped(4)) this.useShield();
      }
    }
    this.gamepadButtons = pressed;
  }
  useHyperspace() {
    if (
      this.state.status !== "playing" ||
      this.deathTimer > 0 ||
      this.state.hyperspaceCooldown > 0
    )
      return false;
    const ship = this.ship;
    this.burst(ship.x, ship.y, 28, "#b9a7fa", 210);
    this.jumps.push({ x: ship.x, y: ship.y, life: 0.5 });
    const landing = this.findHyperspaceLanding();
    ship.x = landing.x;
    ship.y = landing.y;
    ship.vx = 0;
    ship.vy = 0;
    this.burst(ship.x, ship.y, 28, "#b9a7fa", 150);
    this.jumps.push({ x: ship.x, y: ship.y, life: 0.5 });
    this.state.hyperspaceCooldown = ABILITIES.hyperspaceCooldown;
    this.tone(120, 0.3, "sine", 0.08, 1500);
    this.emit();
    return true;
  }
  // Sample the central 70% and keep the first spot clear of every threat's
  // projected path; a crowded field falls back to the roomiest spot found.
  private findHyperspaceLanding() {
    const marginX = this.width * 0.15,
      marginY = this.height * 0.15,
      minJump = Math.min(this.width, this.height) * 0.3;
    const threats: Threat[] = [];
    for (const rock of this.rocks) threats.push({ ...rock, life: Infinity });
    if (this.ufo) threats.push({ ...this.ufo, life: Infinity });
    for (const bullet of this.enemyBullets) threats.push({ ...bullet, radius: 4 });
    // A legal fallback is needed even if every random sample is too close to the ship.
    let best = {
      x: this.ship.x < this.width / 2 ? this.width - marginX : marginX,
      y: this.ship.y < this.height / 2 ? this.height - marginY : marginY,
    };
    let bestGap = this.landingGap(best.x, best.y, threats);
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = random(marginX, this.width - marginX),
        y = random(marginY, this.height - marginY);
      if (Math.hypot(x - this.ship.x, y - this.ship.y) < minJump) continue;
      const gap = this.landingGap(x, y, threats);
      if (gap >= HYPERSPACE_CLEARANCE) return { x, y };
      if (gap > bestGap) {
        best = { x, y };
        bestGap = gap;
      }
    }
    return best;
  }
  // Smallest edge-to-edge distance between a landing spot and any threat over the next
  // HYPERSPACE_LOOKAHEAD seconds, measured on the wrapped field.
  private landingGap(
    x: number,
    y: number,
    threats: Threat[],
  ) {
    let gap = Infinity;
    for (const threat of threats) {
      for (let t = 0; t <= Math.min(HYPERSPACE_LOOKAHEAD, threat.life); t += 0.1) {
        let dx = Math.abs(threat.x + threat.vx * t - x) % this.width,
          dy = Math.abs(threat.y + threat.vy * t - y) % this.height;
        dx = Math.min(dx, this.width - dx);
        dy = Math.min(dy, this.height - dy);
        gap = Math.min(gap, Math.hypot(dx, dy) - threat.radius);
      }
    }
    return gap;
  }
  useShield() {
    if (
      this.state.status !== "playing" ||
      this.deathTimer > 0 ||
      this.state.shieldCooldown > 0
    )
      return false;
    this.state.shieldRemaining = ABILITIES.shieldDuration;
    this.state.shieldCooldown =
      ABILITIES.shieldDuration + ABILITIES.shieldRecharge;
    this.tone(280, 0.2, "sine", 0.065, 740);
    this.emit();
    return true;
  }
  private get isProtected() {
    return (
      this.deathTimer > 0 || this.protection > 0 || this.state.shieldRemaining > 0
    );
  }
  start(difficulty: Difficulty) {
    this.stopExplosions();
    this.difficulty = difficulty;
    this.state = createGameState(difficulty);
    this.keys.clear();
    this.gamepadKeys.clear();
    this.rocks.length = 0;
    this.bullets.length = 0;
    this.enemyBullets.length = 0;
    this.rockSprites = new WeakMap();
    this.ufo = null;
    this.ufoTimer = random(12, 18);
    this.ufoVisits = 0;
    this.particles.length = 0;
    this.jumps.length = 0;
    this.shards.length = 0;
    this.shockwaves.length = 0;
    this.puffs.length = 0;
    this.emitTimer = 0;
    this.needsRedraw = true;
    this.waveTimer = 0;
    this.shotTimer = 0;
    this.shake = 0;
    this.deathTimer = 0;
    this.resetShip();
    this.spawnWave();
    this.initAudio();
    this.emit();
    this.tone(330, 0.16, "sine", 0.07, 660);
  }
  togglePause() {
    if (this.state.status !== "playing" && this.state.status !== "paused")
      return;
    this.state.status = this.state.status === "playing" ? "paused" : "playing";
    this.needsRedraw = true;
    if (this.state.status === "paused") {
      this.stopHeartbeat();
      this.stopExplosions();
    }
    this.keys.clear();
    this.gamepadKeys.clear();
    this.emit();
    if (this.state.status === "playing") {
      this.canvas.focus({ preventScroll: true });
      this.initAudio();
    }
  }
  private initAudio() {
    try {
      this.audio ??= new AudioContext();
      void this.loadExplosions(this.audio);
      if (this.audio.state === "suspended")
        void this.audio.resume().catch(() => {});
    } catch {}
  }
  private loadExplosions(audio: AudioContext) {
    // Cache each effect once, using prepared clips where the originals need trimming.
    this.explosionLoad ??= Promise.all((Object.keys(EXPLOSION_FILES) as ExplosionKind[]).map(async kind => {
      const loaded = await Promise.all(EXPLOSION_FILES[kind].map(async url => {
        try {
          const response = await fetch(url, { signal: this.explosionAbort.signal });
          if (!response.ok) return;
          return await audio.decodeAudioData(await response.arrayBuffer());
        } catch {
          // Keep the synthesized effect if a file is unavailable or cannot be decoded.
        }
      }));
      const buffers = loaded.filter((buffer): buffer is AudioBuffer => !!buffer);
      if (!this.destroyed && buffers.length) this.explosionBuffers[kind] = buffers;
    })).then(() => {});
    return this.explosionLoad;
  }
  private playExplosion(kind: ExplosionKind, volume: number) {
    const audio = this.audio, buffers = this.explosionBuffers[kind];
    if (this.muted || !audio || audio.state !== "running" || !buffers?.length) return false;
    const source = audio.createBufferSource(), gain = audio.createGain();
    const index = kind === "rock" ? this.nextRockImpact % buffers.length : 0;
    source.buffer = buffers[index]!;
    if (kind === "rock") this.nextRockImpact = (index + 1) % buffers.length;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    source.connect(gain);
    gain.connect(audio.destination);
    this.explosionVoices.set(source, gain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.explosionVoices.delete(source);
    };
    source.start();
    return true;
  }
  private stopExplosions() {
    for (const [source, gain] of this.explosionVoices) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.explosionVoices.clear();
  }
  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency = 50,
  ) {
    if (this.muted || !this.audio || this.audio.state !== "running") return;
    const oscillator = this.audio.createOscillator(),
      gain = this.audio.createGain(),
      now = this.audio.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      now + duration,
    );
    gain.gain.setValueAtTime(volume * SYNTH_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(0.001 * SYNTH_GAIN, now + duration);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  // Filtered white noise, for explosions: the lowpass sweeps from `from` to `to` Hz as it fades.
  private noise(duration: number, volume: number, from: number, to: number) {
    if (this.muted || !this.audio || this.audio.state !== "running") return;
    const audio = this.audio,
      now = audio.currentTime;
    if (!this.noiseBuffer) {
      this.noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource(),
      filter = audio.createBiquadFilter(),
      gain = audio.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001 * SYNTH_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(volume * SYNTH_GAIN, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001 * SYNTH_GAIN, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(now);
    source.stop(now + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  private stopHeartbeat() {
    this.stopHeartbeatVoice?.();
    this.stopHeartbeatVoice = undefined;
  }
  private get remainingRockWork() {
    // A large rock takes seven hits to clear its entire family: 7 -> 3 + 3 -> 1 + 1.
    // Each hit removes exactly one unit, even when it creates more visible rocks.
    let total = 0;
    for (const rock of this.rocks) total += 2 ** rock.size - 1;
    return total;
  }
  private get heartbeatInterval() {
    const remaining = Math.min(1, this.remainingRockWork / this.waveRockWork);
    return 0.16 + 0.74 * remaining;
  }
  private playHeartbeat() {
    if (this.muted || !this.audio || this.audio.state !== "running") return;
    this.stopHeartbeat();
    const audio = this.audio,
      now = audio.currentTime,
      oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      pitch = this.heartbeatLow ? 165 : 220;
    // Steady square-wave notes give the tick-tock a clear arcade-computer timbre.
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.012 * SYNTH_GAIN, now + 0.002);
    gain.gain.setValueAtTime(0.012 * SYNTH_GAIN, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001 * SYNTH_GAIN, now + 0.065);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
    let ended = false;
    oscillator.onended = () => {
      ended = true;
      oscillator.disconnect();
      gain.disconnect();
      if (this.stopHeartbeatVoice === stop) this.stopHeartbeatVoice = undefined;
    };
    const stop = () => {
      if (ended) return;
      // Fade any in-flight pulse quickly when muted, paused, or leaving play.
      gain.gain.cancelAndHoldAtTime(audio.currentTime);
      gain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.01);
      oscillator.stop(audio.currentTime + 0.012);
    };
    this.stopHeartbeatVoice = stop;
  }
  private updateHeartbeat(dt: number) {
    if (
      this.state.status !== "playing" ||
      this.muted ||
      this.deathTimer > 0 ||
      (!this.rocks.length && !this.ufo && !this.enemyBullets.length)
    ) {
      this.stopHeartbeat();
      return;
    }
    // Simulation time prevents background-tab catch-up and freezes the beat on pause.
    this.heartbeatPhase += dt / this.heartbeatInterval;
    if (this.heartbeatPhase >= 1) {
      this.heartbeatPhase %= 1;
      this.playHeartbeat();
      this.heartbeatLow = !this.heartbeatLow;
    }
  }
  private resetShip() {
    this.ship = {
      x: this.width / 2,
      y: this.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
    };
    this.protection = 3;
  }
  private makeRock(x: number, y: number, size: number): Rock {
    const angle = random(0, TAU),
      speed =
        random(22, 48) *
        Math.min(4, 1 + (this.state.wave - 1) * 0.25) *
        (this.difficulty === "hardcore" ? 1.6 : 1) *
        (1 + (3 - size) * 0.45);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      radius: ROCK_RADII[size]!,
      angle: random(0, TAU),
      spin: random(-0.3, 0.3),
      points: Array.from({ length: 11 }, () => random(0.72, 1.2)),
    };
  }
  private seedAmbient() {
    const positions = [
      [0.13, 0.25, 3],
      [0.85, 0.2, 2],
      [0.91, 0.62, 3],
      [0.18, 0.81, 2],
      [0.52, 0.92, 1],
      [0.63, 0.11, 1],
    ];
    this.rocks = positions.map(([x, y, size]) =>
      this.makeRock(x! * this.width, y! * this.height, size!),
    );
    for (const rock of this.rocks) {
      rock.vx *= 0.15;
      rock.vy *= 0.15;
      rock.spin *= 0.3;
    }
  }
  private spawnWave() {
    for (let i = 0; i < Math.min(4 + this.state.wave, 15); i++) {
      let x = random(0, this.width),
        y = random(0, this.height);
      if (Math.hypot(x - this.ship.x, y - this.ship.y) < 240) {
        x = Math.random() < 0.5 ? 40 : this.width - 40;
        y = random(0, this.height);
      }
      this.rocks.push(this.makeRock(x, y, 3));
    }
    this.announcement = 2.2;
    this.waveTimer = 0;
    this.stopHeartbeat();
    this.waveRockWork = Math.max(1, this.remainingRockWork);
    this.heartbeatPhase = 0;
    this.heartbeatLow = false;
  }
  private wrap(body: Body, margin = 0) {
    if (body.x < -margin) body.x += this.width + margin * 2;
    if (body.x > this.width + margin) body.x -= this.width + margin * 2;
    if (body.y < -margin) body.y += this.height + margin * 2;
    if (body.y > this.height + margin) body.y -= this.height + margin * 2;
  }
  private spawnUfo(kind?: Ufo["kind"]) {
    const smallChance = Math.min(
      0.75,
      0.25 + this.state.wave * 0.07 + this.state.score / 20000,
    );
    const canBeSmall =
      this.ufoVisits > 0 || this.state.wave > 1 || this.state.score >= 2000;
    kind ??= canBeSmall && Math.random() < smallChance ? "small" : "large";
    const direction = Math.random() < 0.5 ? 1 : -1;
    const radius = kind === "small" ? 20 : 34;
    const speed =
      (kind === "small" ? 140 : 105) *
      (this.difficulty === "hardcore" ? 1.2 : 1);
    this.ufo = {
      x: direction === 1 ? -radius : this.width + radius,
      y: random(this.height * 0.2, this.height * 0.75),
      vx: direction * speed,
      vy: 0,
      kind,
      radius,
      shotTimer: 1.2,
      turnTimer: random(1, 2),
      soundTimer: 0,
      soundHigh: false,
    };
    this.ufoVisits++;
  }
  private removeUfo(explode: boolean, awardPoints = false) {
    if (!this.ufo) return;
    if (explode) {
      this.burst(this.ufo.x, this.ufo.y, 30, "#f28b71", 190);
      if (!this.playExplosion("ufo", 0.55))
        this.tone(240, 0.3, "sawtooth", 0.06, 35);
      this.shake = this.reducedMotion ? 0 : 3;
    }
    if (awardPoints) this.state.score += this.ufo.kind === "small" ? 1000 : 200;
    this.ufo = null;
    this.ufoTimer = random(18, 30) / (this.difficulty === "hardcore" ? 1.2 : 1);
    if (awardPoints) this.emit();
  }
  private hitsUfo(x: number, y: number, padding = 0) {
    if (!this.ufo) return false;
    return (
      ((x - this.ufo.x) / (this.ufo.radius + padding)) ** 2 +
        ((y - this.ufo.y) / (this.ufo.radius * 0.55 + padding)) ** 2 <
      1
    );
  }
  private updateUfo(dt: number) {
    if (!this.ufo) {
      this.ufoTimer -= dt;
      // Let the next wave start before introducing another visitor.
      if (this.ufoTimer <= 0 && this.rocks.length) this.spawnUfo();
      return;
    }
    const ufo = this.ufo;
    ufo.x += ufo.vx * dt;
    ufo.y += ufo.vy * dt;
    ufo.turnTimer -= dt;
    ufo.shotTimer -= dt;
    ufo.soundTimer -= dt;
    if (ufo.x < -ufo.radius * 2 || ufo.x > this.width + ufo.radius * 2) {
      this.removeUfo(false);
      return;
    }
    if (ufo.turnTimer <= 0) {
      ufo.vy = random(-75, 75);
      ufo.turnTimer = random(1.2, 2.5);
    }
    const top = 70,
      bottom = this.height - 80;
    if (ufo.y < top || ufo.y > bottom) {
      ufo.y = Math.max(top, Math.min(bottom, ufo.y));
      ufo.vy *= -1;
    }
    if (ufo.soundTimer <= 0) {
      const pitch = ufo.kind === "small" ? 580 : 310;
      this.tone(
        ufo.soundHigh ? pitch * 1.35 : pitch,
        0.22,
        "triangle",
        0.025,
        ufo.soundHigh ? pitch : pitch * 1.35,
      );
      ufo.soundHigh = !ufo.soundHigh;
      ufo.soundTimer = ufo.kind === "small" ? 0.28 : 0.42;
    }
    if (ufo.shotTimer <= 0 && ufo.x > 0 && ufo.x < this.width) {
      const spread = Math.max(0.05, 0.22 - this.state.wave * 0.025);
      const angle =
        ufo.kind === "small"
          ? Math.atan2(
              this.ship.y + this.ship.vy * 0.2 - ufo.y,
              this.ship.x + this.ship.vx * 0.2 - ufo.x,
            ) + random(-spread, spread)
          : random(0, TAU);
      const speed = ufo.kind === "small" ? 310 : 250;
      this.enemyBullets.push({
        x: ufo.x + Math.cos(angle) * (ufo.radius + 5),
        y: ufo.y + Math.sin(angle) * (ufo.radius + 5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 2.6,
      });
      ufo.shotTimer =
        (ufo.kind === "small" ? 0.95 : 1.45) /
        (this.difficulty === "hardcore" ? 1.2 : 1);
      this.tone(420, 0.1, "square", 0.018, 110);
    }
  }
  private breakRock(index: number, awardPoints: boolean) {
    const rock = this.rocks.splice(index, 1)[0]!;
    this.rockSprites.delete(rock);
    if (awardPoints) this.state.score += ROCK_SCORES[rock.size]!;
    this.burst(rock.x, rock.y, rock.size * 7, "#c3cf9d", 130);
    if (rock.size > 1) {
      for (let i = 0; i < 2; i++) {
        this.rocks.push(
          this.makeRock(
            rock.x + random(-8, 8),
            rock.y + random(-8, 8),
            rock.size - 1,
          ),
        );
      }
    }
    if (!this.playExplosion("rock", 0.45))
      this.tone(80 + rock.size * 20, 0.16, "sawtooth", 0.045, 25);
    this.shake = this.reducedMotion ? 0 : rock.size * 0.8;
    if (awardPoints) this.emit();
  }
  private hitShip() {
    if (this.isProtected || this.state.status !== "playing") return;
    this.shatterShip();
    this.explodeShip();
    this.burst(this.ship.x, this.ship.y, 45, "#f38254", 240);
    if (!this.playExplosion("ship", 0.65)) {
      this.tone(120, 0.6, "sine", 0.12, 28);
      this.tone(160, 0.45, "sawtooth", 0.05, 20);
      this.noise(1.4, 0.14, 3800, 140);
    }
    this.shake = this.reducedMotion ? 0 : 8;
    this.state.lives--;
    this.deathTimer = 1;
    this.stopHeartbeat();
    this.keys.clear();
    this.gamepadKeys.clear();
    this.emit();
  }
  private shatterShip() {
    if (this.reducedMotion) return;
    const ship = this.ship,
      shipAngle = ship.angle + Math.PI / 2,
      pieces: [number, number][][] = [
        [
          [0, -20],
          [14, 15],
        ],
        [
          [14, 15],
          [0, 9],
          [-14, 15],
        ],
        [
          [-14, 15],
          [0, -20],
        ],
      ];
    for (const points of pieces) {
      const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length,
        cy = points.reduce((sum, p) => sum + p[1], 0) / points.length,
        cos = Math.cos(shipAngle),
        sin = Math.sin(shipAngle),
        wx = cx * cos - cy * sin,
        wy = cx * sin + cy * cos,
        outward = Math.hypot(wx, wy) || 1,
        speed = random(70, 160),
        life = random(0.5, 0.85);
      this.shards.push({
        x: ship.x,
        y: ship.y,
        vx: (wx / outward) * speed + ship.vx * 0.3,
        vy: (wy / outward) * speed + ship.vy * 0.3,
        angle: shipAngle,
        spin: random(-9, 9),
        life,
        max: life,
        points: points.map(([px, py]) => [px - cx, py - cy]),
      });
    }
    this.shockwaves.push({
      x: ship.x,
      y: ship.y,
      life: 0.4,
      max: 0.4,
    });
  }
  // A quick fireball, then smoke billowing out of it as it burns down.
  private explodeShip() {
    if (this.reducedMotion) return;
    const { x, y, vx, vy } = this.ship;
    const puff = (smoke: boolean, delay: number, life: number, speed: number, radius: number, grow: number) => {
      const angle = random(0, TAU),
        velocity = random(0, speed);
      this.puffs.push({
        x: x + random(-5, 5),
        y: y + random(-5, 5),
        vx: vx * 0.25 + Math.cos(angle) * velocity,
        vy: vy * 0.25 + Math.sin(angle) * velocity,
        life: delay + life,
        max: delay + life,
        delay,
        radius,
        grow,
        smoke,
      });
    };
    for (let i = 0; i < 9; i++)
      puff(true, random(0.15, 0.35), random(1.1, 1.7), 50, random(9, 14), random(20, 32));
    for (let i = 0; i < 7; i++)
      puff(false, random(0, 0.06), random(0.4, 0.65), 100, random(7, 12), random(50, 80));
  }
  private burst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed: number,
  ) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU),
        velocity = random(20, speed),
        life = random(0.2, 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life,
        max: life,
        color,
        radius: random(1, 2.6),
      });
    }
  }
  private update(dt: number) {
    if (this.state.status === "paused") return;
    if (this.state.status === "ready") {
      if (!this.reducedMotion)
        for (const rock of this.rocks) {
          rock.x += rock.vx * dt;
          rock.y += rock.vy * dt;
          rock.angle += rock.spin * dt;
          this.wrap(rock, rock.radius);
        }
      return;
    }
    updateTimed(this.particles, dt, advanceBody);
    updateTimed(this.jumps, dt);
    updateTimed(this.shards, dt, advanceShard);
    updateTimed(this.shockwaves, dt);
    updateTimed(this.puffs, dt, advancePuff);
    this.shake = Math.max(0, this.shake - dt * 20);
    if (this.state.status !== "playing") return;
    const waitingForShip = this.deathTimer > 0;
    // Ability durations use simulation time, so pausing freezes protection and recharge.
    this.state.hyperspaceCooldown = tickTimer(
      this.state.hyperspaceCooldown,
      dt,
    );
    this.state.shieldRemaining = tickTimer(this.state.shieldRemaining, dt);
    this.state.shieldCooldown = tickTimer(this.state.shieldCooldown, dt);
    if (!waitingForShip) {
      const ship = this.ship;
      const left = this.controlHeld("ArrowLeft") || this.controlHeld("KeyA"),
        right = this.controlHeld("ArrowRight") || this.controlHeld("KeyD");
      const thrust = this.controlHeld("ArrowUp") || this.controlHeld("KeyW");
      const boosting =
        thrust &&
        (this.controlHeld("ShiftLeft") || this.controlHeld("ShiftRight")) &&
        this.state.boost > 1;
      ship.angle += ((right ? 1 : 0) - (left ? 1 : 0)) * 4.4 * dt;
      this.state.boost = Math.max(
        0,
        Math.min(100, this.state.boost + (boosting ? -40 : 18) * dt),
      );
      if (thrust) {
        const acceleration = boosting ? 670 : 310;
        ship.vx += Math.cos(ship.angle) * acceleration * dt;
        ship.vy += Math.sin(ship.angle) * acceleration * dt;
        const life = random(0.15, 0.4),
          spread = random(-0.4, 0.4),
          angle = ship.angle + Math.PI + spread;
        this.particles.push({
          x: ship.x - Math.cos(ship.angle) * 15,
          y: ship.y - Math.sin(ship.angle) * 15,
          vx: ship.vx + Math.cos(angle) * 110,
          vy: ship.vy + Math.sin(angle) * 110,
          life,
          max: life,
          color: boosting ? "#d4eab2" : "#ed774b",
          radius: random(1.3, 3),
        });
      }
      const friction = Math.pow(0.995, dt * 60);
      ship.vx *= friction;
      ship.vy *= friction;
      const speed = Math.hypot(ship.vx, ship.vy),
        max = boosting ? 650 : 440;
      if (speed > max) {
        ship.vx *= max / speed;
        ship.vy *= max / speed;
      }
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      this.wrap(ship);
      this.protection -= dt;
      this.shotTimer -= dt;
      if (this.controlHeld("Space") && this.shotTimer <= 0) {
        const bulletSpeed = 700;
        this.bullets.push({
          x: ship.x + Math.cos(ship.angle) * 21,
          y: ship.y + Math.sin(ship.angle) * 21,
          vx: Math.cos(ship.angle) * bulletSpeed + ship.vx * 0.4,
          vy: Math.sin(ship.angle) * bulletSpeed + ship.vy * 0.4,
          life: (this.width * 0.5) / bulletSpeed,
        });
        this.shotTimer = 0.16;
        this.tone(880, 0.07, "triangle", 0.045, 160);
      }
    }
    this.announcement -= dt;
    this.updateUfo(dt);
    this.updateBullets(this.bullets, dt);
    this.updateBullets(this.enemyBullets, dt);
    for (const rock of this.rocks) {
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.angle += rock.spin * dt;
      this.wrap(rock, rock.radius);
    }
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      if (this.hitsUfo(bullet.x, bullet.y, 3)) {
        bullet.life = 0;
        this.removeUfo(true, true);
        continue;
      }
      const index = this.findHitRock(bullet);
      if (index < 0) continue;
      bullet.life = 0;
      this.breakRock(index, true);
    }
    for (const bullet of this.enemyBullets) {
      if (this.state.status !== "playing") break;
      const index = this.findHitRock(bullet);
      if (index >= 0) {
        bullet.life = 0;
        this.breakRock(index, false);
      } else if (
        this.deathTimer === 0 &&
        withinRadius(this.ship, bullet, this.state.shieldRemaining > 0 ? 32 : 15)
      ) {
        bullet.life = 0;
        this.hitShip();
      }
    }
    updateTimed(this.enemyBullets, 0);
    if (
      !this.isProtected &&
      this.findHitRock(this.ship, 0.84, 10) >= 0
    ) {
      this.hitShip();
    }
    if (
      !this.isProtected &&
      this.state.status === "playing" &&
      this.hitsUfo(this.ship.x, this.ship.y, 10)
    ) {
      this.removeUfo(true);
      this.hitShip();
    }
    if (
      !this.rocks.length &&
      !this.ufo &&
      !this.enemyBullets.length &&
      this.state.status === "playing"
    ) {
      this.waveTimer += dt;
      if (this.waveTimer > 1.5) {
        this.state.wave++;
        this.spawnWave();
        this.protection = Math.max(this.protection, 2);
        this.emit();
        this.tone(440, 0.25, "sine", 0.07, 880);
      }
    }
    // Only the ship waits; the field keeps moving throughout the death delay.
    // A hit during this update starts its full second on the next update.
    if (waitingForShip) {
      this.deathTimer = tickTimer(this.deathTimer, dt);
      if (this.deathTimer === 0) {
        if (this.state.lives <= 0) this.state.status = "over";
        else this.resetShip();
        this.emit();
      }
    }
    this.updateHeartbeat(dt);
    this.emitTimer += dt;
    if (this.emitTimer > 0.1) {
      this.emitTimer = 0;
      this.emit();
    }
  }
  private updateBullets(bullets: Bullet[], dt: number) {
    updateTimed(bullets, dt, advanceBody);
    for (const bullet of bullets) this.wrap(bullet);
  }
  private findHitRock(body: { x: number; y: number }, scale = 1, padding = 3) {
    for (let i = 0; i < this.rocks.length; i++) {
      const rock = this.rocks[i]!;
      if (withinRadius(rock, body, rock.radius * scale + padding)) return i;
    }
    return -1;
  }
  private draw() {
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    let glow = this.backgroundGlow;
    if (!glow) {
      glow = ctx.createRadialGradient(
        w * 0.5,
        h * 0.47,
        0,
        w * 0.5,
        h * 0.47,
        w * 0.65,
      );
      glow.addColorStop(0, "#1c2a2255");
      glow.addColorStop(1, "#00000000");
      this.backgroundGlow = glow;
    }
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (const star of this.stars) {
      ctx.globalAlpha =
        star.alpha *
        (this.reducedMotion
          ? 0.8
          : 0.7 + 0.3 * Math.sin(this.elapsed * 0.45 + star.phase));
      ctx.fillStyle = "#c6d9bf";
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.radius, 0, TAU);
      ctx.fill();
      if (star.radius > 1.42) {
        ctx.strokeStyle = "#b6c9ad";
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(star.x * w - 3, star.y * h);
        ctx.lineTo(star.x * w + 3, star.y * h);
        ctx.moveTo(star.x * w, star.y * h - 3);
        ctx.lineTo(star.x * w, star.y * h + 3);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.save();
    if (this.shake > 0)
      ctx.translate(
        random(-this.shake, this.shake),
        random(-this.shake, this.shake),
      );
    const ambient = this.state.status === "ready";
    for (const rock of this.rocks) {
      ctx.save();
      ctx.translate(rock.x, rock.y);
      ctx.rotate(rock.angle);
      if (this.graphics === "modern") {
        // Cache the textured surface once per rock, then rotate a bitmap each frame.
        let sprite = this.rockSprites.get(rock);
        const extent = Math.ceil(rock.radius * 1.25);
        if (!sprite) {
          sprite = document.createElement("canvas");
          sprite.width = sprite.height = extent * 4;
          const surface = sprite.getContext("2d")!;
          surface.scale(2, 2);
          surface.translate(extent, extent);
          drawModernRock(surface, rock.radius, rock.points);
          this.rockSprites.set(rock, sprite);
        }
        ctx.globalAlpha = ambient ? 0.65 : 1;
        ctx.drawImage(sprite, -extent, -extent, extent * 2, extent * 2);
        ctx.restore();
        continue;
      }
      ctx.strokeStyle = ambient ? "#798c735b" : "#adbb96";
      ctx.lineWidth = ambient ? 1.35 : 1.8;
      ctx.fillStyle = ambient ? "#1f2c2625" : "#24302755";
      ctx.beginPath();
      for (let i = 0; i < rock.points.length; i++) {
        const point = rock.points[i]!;
        const a = (i / rock.points.length) * TAU,
          x = Math.cos(a) * rock.radius * point,
          y = Math.sin(a) * rock.radius * point;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = ambient ? "#758b6d20" : "#a9bb9040";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-rock.radius * 0.7, -rock.radius * 0.25);
      ctx.lineTo(-rock.radius * 0.1, rock.radius * 0.1);
      ctx.lineTo(rock.radius * 0.4, -rock.radius * 0.65);
      ctx.moveTo(-rock.radius * 0.1, rock.radius * 0.1);
      ctx.lineTo(rock.radius * 0.25, rock.radius * 0.75);
      ctx.stroke();
      ctx.restore();
    }
    ctx.shadowBlur = 9;
    ctx.shadowColor = "#f5eac0";
    ctx.fillStyle = "#f3e8bb";
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      if (this.graphics === "modern") {
        drawModernShot(ctx, b.x, b.y, b.vx, b.vy);
        continue;
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.3, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff9a7e";
    ctx.shadowColor = "#ed6949";
    ctx.shadowBlur = 12;
    for (const bullet of this.enemyBullets) {
      if (this.graphics === "modern") {
        drawModernShot(ctx, bullet.x, bullet.y, bullet.vx, bullet.vy, true);
        continue;
      }
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 3.5, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (this.ufo) {
      const ufo = this.ufo,
        r = ufo.radius;
      ctx.save();
      ctx.translate(ufo.x, ufo.y);
      if (this.graphics === "modern") {
        drawModernUfo(
          ctx,
          r,
          ufo.kind === "small",
          this.reducedMotion ? 0 : this.elapsed,
        );
      } else {
        ctx.strokeStyle = "#f58d73";
        ctx.fillStyle = "#302426";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ed6949";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r * 0.5, -r * 0.28);
        ctx.lineTo(-r * 0.25, -r * 0.62);
        ctx.lineTo(r * 0.25, -r * 0.62);
        ctx.lineTo(r * 0.5, -r * 0.28);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.55, r * 0.32);
        ctx.lineTo(-r * 0.55, r * 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(-r * 0.5, -r * 0.28);
        ctx.lineTo(r * 0.5, -r * 0.28);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const jump of this.jumps) {
      ctx.save();
      ctx.globalAlpha = jump.life / 0.5;
      ctx.strokeStyle = "#b9a7fa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        jump.x,
        jump.y,
        this.reducedMotion ? 34 : 20 + (0.5 - jump.life) * 100,
        0,
        TAU,
      );
      ctx.stroke();
      ctx.restore();
    }
    for (const wave of this.shockwaves) {
      ctx.save();
      ctx.globalAlpha = wave.life / wave.max;
      ctx.strokeStyle = "#f38254";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, 8 + (1 - wave.life / wave.max) * 90, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // Smoke behind the fireball; the fire adds light. Vector mode outlines both.
    for (const smoke of [true, false]) {
      ctx.save();
      if (!smoke) ctx.globalCompositeOperation = "lighter";
      for (const puff of this.puffs) {
        const age = puff.max - puff.life - puff.delay;
        if (puff.smoke !== smoke || age < 0) continue;
        const t = age / (puff.max - puff.delay),
          alpha = smoke ? Math.min(1, t / 0.2) * (1 - t) * 0.6 : (1 - t) ** 1.5;
        ctx.beginPath();
        ctx.arc(puff.x, puff.y, puff.radius, 0, TAU);
        if (this.graphics === "vector") {
          ctx.lineWidth = smoke ? 1.2 : 1.8;
          ctx.strokeStyle = smoke ? `rgba(150,156,146,${alpha * 1.6})` : fireColor(t, alpha);
          ctx.stroke();
          continue;
        }
        const glow = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, puff.radius);
        if (smoke) {
          glow.addColorStop(0, `rgba(118,122,114,${alpha})`);
          glow.addColorStop(1, "rgba(118,122,114,0)");
        } else {
          glow.addColorStop(0, fireColor(t * 0.7, alpha));
          glow.addColorStop(0.5, fireColor(t, alpha * 0.8));
          glow.addColorStop(1, fireColor(t + 0.2, 0));
        }
        ctx.fillStyle = glow;
        ctx.fill();
      }
      ctx.restore();
    }
    for (const shard of this.shards) {
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.angle);
      ctx.globalAlpha = shard.life / shard.max;
      ctx.strokeStyle = "#f0c9a8";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#f38254";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < shard.points.length; i++) {
        const [px, py] = shard.points[i]!;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      if (this.graphics === "modern") {
        ctx.closePath();
        ctx.fillStyle = "#91aebd";
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (
      this.deathTimer === 0 &&
      (this.state.status === "playing" || this.state.status === "paused")
    ) {
      if (this.ufo || (this.ufoTimer < 2 && this.rocks.length)) {
        ctx.fillStyle = "#f58d73";
        ctx.font = '11px "Space Mono", monospace';
        ctx.textAlign = "center";
        ctx.fillText(
          this.ufo
            ? `HOSTILE CONTACT / ${this.ufo.kind.toUpperCase()} SAUCER`
            : "UNIDENTIFIED SIGNAL APPROACHING",
          w / 2,
          78,
        );
      }
      const ship = this.ship;
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle + Math.PI / 2);
      if (this.state.shieldRemaining > 0) {
        ctx.strokeStyle = "#87e6ed";
        ctx.fillStyle = "#67dbe91c";
        ctx.shadowColor = "#67dbe9";
        ctx.shadowBlur = 16;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          37,
          -Math.PI / 2,
          -Math.PI / 2 +
            (TAU * this.state.shieldRemaining) / ABILITIES.shieldDuration,
        );
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (this.protection > 0) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.elapsed * 15);
        ctx.strokeStyle = "#b9d59b40";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 29, 0, TAU);
        ctx.stroke();
      }
      if (this.graphics === "modern") {
        const thrust = this.controlHeld("ArrowUp") || this.controlHeld("KeyW");
        const boost =
          (this.controlHeld("ShiftLeft") || this.controlHeld("ShiftRight")) &&
          this.state.boost > 1;
        drawModernShip(
          ctx,
          thrust,
          boost,
          this.reducedMotion ? 0 : this.elapsed,
        );
      } else {
        ctx.strokeStyle = "#d9e9bb";
        ctx.fillStyle = "#1a2924";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#b8d29a";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(14, 15);
        ctx.lineTo(0, 9);
        ctx.lineTo(-14, 15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      if (this.announcement > 0) {
        ctx.globalAlpha = Math.min(1, this.announcement);
        ctx.fillStyle = "#c5d8a9";
        ctx.font = '14px "Space Mono", monospace';
        ctx.textAlign = "center";
        ctx.fillText(
          `W A V E  ${String(this.state.wave).padStart(2, "0")}`,
          w / 2,
          h * 0.24,
        );
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  private loop = (now: number) => {
    if (this.destroyed) return;
    this.pollGamepad();
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.033) : 0;
    this.last = now;
    if (!document.hidden) {
      const animate = this.state.status !== "paused" &&
        !(this.reducedMotion && this.state.status === "ready");
      if (animate) {
        this.elapsed += dt;
        this.update(dt);
      }
      if (animate || this.needsRedraw) {
        this.draw();
        this.needsRedraw = false;
      }
    }
    this.frame = requestAnimationFrame(this.loop);
  };
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.explosionAbort.abort();
    this.stopExplosions();
    this.explosionBuffers = {};
    this.stopHeartbeat();
    cancelAnimationFrame(this.frame);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    window.removeEventListener("focus", this.focus);
    document.removeEventListener("visibilitychange", this.visibility);
    if (this.audio) void this.audio.close().catch(() => {});
    this.audio = undefined;
    this.noiseBuffer = undefined;
    this.keys.clear();
    this.gamepadKeys.clear();
    this.gamepadButtons.clear();
    this.rocks.length = this.bullets.length = this.enemyBullets.length = 0;
    this.particles.length = this.jumps.length = this.shards.length = this.shockwaves.length = 0;
    this.puffs.length = 0;
    this.ufo = null;
    this.rockSprites = new WeakMap();
    this.backgroundGlow = undefined;
    this.emittedState = undefined;
  }
}
