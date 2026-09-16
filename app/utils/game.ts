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
export const ABILITIES = {
  hyperspaceCooldown: 3,
  shieldDuration: 1,
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
type Ufo = Body & {
  kind: "large" | "small";
  radius: number;
  shotTimer: number;
  turnTimer: number;
  soundTimer: number;
  soundHigh: boolean;
};
const TAU = Math.PI * 2;
const random = (min: number, max: number) => min + Math.random() * (max - min);
const tickTimer = (remaining: number, dt: number) =>
  remaining - dt > 1e-9 ? remaining - dt : 0;

export class AsteroidsEngine {
  private ctx: CanvasRenderingContext2D;
  private state: GameState = {
    status: "ready",
    score: 0,
    lives: 3,
    wave: 1,
    boost: 100,
    hyperspaceCooldown: 0,
    shieldRemaining: 0,
    shieldCooldown: 0,
  };
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
  private keys = new Set<string>();
  private stars = Array.from({ length: 180 }, () => ({
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
  private waveTimer = 0;
  private announcement = 0;
  private shake = 0;
  private emitTimer = 0;
  private difficulty: Difficulty = "classic";
  private muted = false;
  private audio?: AudioContext;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private keydown = (event: KeyboardEvent) => {
    if (
      this.state.status !== "playing" ||
      (event.target as HTMLElement).closest("button, a, input, select")
    )
      return;
    if (
      event.repeat &&
      ["KeyH", "ArrowDown", "KeyS"].includes(event.code)
    )
      return;
    this.setControl(event.code, true);
  };
  private keyup = (event: KeyboardEvent) => this.keys.delete(event.code);
  private blur = () => {
    this.keys.clear();
    if (this.state.status === "playing") this.togglePause();
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private onState: (state: GameState) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser.");
    this.ctx = ctx;
    this.resize();
    this.seedAmbient();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
    this.frame = requestAnimationFrame(this.loop);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldHeight = this.height;
    const oldWidth = this.width;
    this.width = Math.max(600, Math.min(1800, rect.width * 1.25));
    this.height = (this.width * rect.height) / rect.width;
    for (const body of [
      this.ship,
      ...this.rocks,
      ...this.bullets,
      ...this.enemyBullets,
      ...(this.ufo ? [this.ufo] : []),
      ...this.particles,
      ...this.jumps,
    ]) {
      body.x = (body.x / oldWidth) * this.width;
      body.y = (body.y / oldHeight) * this.height;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(
      this.canvas.width / this.width,
      0,
      0,
      this.canvas.height / this.height,
      0,
      0,
    );
  }
  private emit() {
    this.onState({ ...this.state });
  }
  setMuted(muted: boolean) {
    this.muted = muted;
  }
  setControl(key: string, active: boolean) {
    if (!active) {
      this.keys.delete(key);
      return;
    }
    if (this.state.status !== "playing" || this.keys.has(key)) return;
    this.keys.add(key);
    if (["KeyH", "ArrowDown"].includes(key)) this.useHyperspace();
    if (key === "KeyS") this.useShield();
  }
  useHyperspace() {
    if (this.state.status !== "playing" || this.state.hyperspaceCooldown > 0)
      return false;
    const ship = this.ship;
    this.burst(ship.x, ship.y, 28, "#b9a7fa", 210);
    this.jumps.push({ x: ship.x, y: ship.y, life: 0.5 });
    // Offset on the wrapped field guarantees a noticeable jump without promising a safe landing.
    ship.x =
      (ship.x + random(this.width * 0.25, this.width * 0.75)) % this.width;
    ship.y =
      (ship.y + random(this.height * 0.25, this.height * 0.75)) % this.height;
    ship.vx = 0;
    ship.vy = 0;
    this.burst(ship.x, ship.y, 28, "#b9a7fa", 150);
    this.jumps.push({ x: ship.x, y: ship.y, life: 0.5 });
    this.state.hyperspaceCooldown = ABILITIES.hyperspaceCooldown;
    this.tone(120, 0.3, "sine", 0.08, 1500);
    this.emit();
    return true;
  }
  useShield() {
    if (this.state.status !== "playing" || this.state.shieldCooldown > 0)
      return false;
    this.state.shieldRemaining = ABILITIES.shieldDuration;
    this.state.shieldCooldown =
      ABILITIES.shieldDuration + ABILITIES.shieldRecharge;
    this.tone(280, 0.2, "sine", 0.065, 740);
    this.emit();
    return true;
  }
  private get isProtected() {
    return this.protection > 0 || this.state.shieldRemaining > 0;
  }
  start(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.state = {
      status: "playing",
      score: 0,
      wave: 1,
      lives: difficulty === "hardcore" ? 1 : 3,
      boost: 100,
      hyperspaceCooldown: 0,
      shieldRemaining: 0,
      shieldCooldown: 0,
    };
    this.keys.clear();
    this.rocks = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.ufo = null;
    this.ufoTimer = random(12, 18);
    this.ufoVisits = 0;
    this.particles = [];
    this.jumps = [];
    this.waveTimer = 0;
    this.shotTimer = 0;
    this.shake = 0;
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
    this.keys.clear();
    this.emit();
    if (this.state.status === "playing") {
      this.canvas.focus({ preventScroll: true });
      this.initAudio();
    }
  }
  private initAudio() {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === "suspended")
        void this.audio.resume().catch(() => {});
    } catch {}
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
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
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
        (1 + (this.state.wave - 1) * 0.12) *
        (this.difficulty === "hardcore" ? 1.6 : 1) *
        (1 + (3 - size) * 0.45);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      radius: [0, 15, 30, 56][size]!,
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
    if (awardPoints) this.state.score += [0, 100, 50, 20][rock.size]!;
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
    this.tone(80 + rock.size * 20, 0.16, "sawtooth", 0.045, 25);
    this.shake = this.reducedMotion ? 0 : rock.size * 0.8;
    if (awardPoints) this.emit();
  }
  private hitShip() {
    if (this.isProtected || this.state.status !== "playing") return;
    this.burst(this.ship.x, this.ship.y, 45, "#f38254", 240);
    this.tone(160, 0.45, "sawtooth", 0.08, 20);
    this.shake = this.reducedMotion ? 0 : 8;
    this.state.lives--;
    if (this.state.lives <= 0) {
      this.state.status = "over";
      this.keys.clear();
    } else this.resetShip();
    this.emit();
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
    this.particles = this.particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });
    this.jumps = this.jumps.filter((jump) => {
      jump.life -= dt;
      return jump.life > 0;
    });
    this.shake = Math.max(0, this.shake - dt * 20);
    if (this.state.status !== "playing") return;
    // Ability durations use simulation time, so pausing freezes protection and recharge.
    this.state.hyperspaceCooldown = tickTimer(
      this.state.hyperspaceCooldown,
      dt,
    );
    this.state.shieldRemaining = tickTimer(this.state.shieldRemaining, dt);
    this.state.shieldCooldown = tickTimer(this.state.shieldCooldown, dt);
    const ship = this.ship;
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA"),
      right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const thrust = this.keys.has("ArrowUp") || this.keys.has("KeyW");
    const boosting =
      thrust &&
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
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
    this.announcement -= dt;
    if (this.keys.has("Space") && this.shotTimer <= 0) {
      this.bullets.push({
        x: ship.x + Math.cos(ship.angle) * 21,
        y: ship.y + Math.sin(ship.angle) * 21,
        vx: Math.cos(ship.angle) * 700 + ship.vx * 0.4,
        vy: Math.sin(ship.angle) * 700 + ship.vy * 0.4,
        life: 1.1,
      });
      this.shotTimer = 0.16;
      this.tone(880, 0.07, "triangle", 0.045, 160);
    }
    this.updateUfo(dt);
    const advanceBullet = (b: Bullet) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      this.wrap(b);
      return b.life > 0;
    };
    this.bullets = this.bullets.filter(advanceBullet);
    this.enemyBullets = this.enemyBullets.filter(advanceBullet);
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
      const index = this.rocks.findIndex(
        (rock) =>
          Math.hypot(rock.x - bullet.x, rock.y - bullet.y) < rock.radius + 3,
      );
      if (index < 0) continue;
      bullet.life = 0;
      this.breakRock(index, true);
    }
    for (const bullet of this.enemyBullets) {
      if (this.state.status !== "playing") break;
      const index = this.rocks.findIndex(
        (rock) =>
          Math.hypot(rock.x - bullet.x, rock.y - bullet.y) < rock.radius + 3,
      );
      if (index >= 0) {
        bullet.life = 0;
        this.breakRock(index, false);
      } else if (
        Math.hypot(this.ship.x - bullet.x, this.ship.y - bullet.y) <
        (this.state.shieldRemaining > 0 ? 32 : 15)
      ) {
        bullet.life = 0;
        this.hitShip();
      }
    }
    this.enemyBullets = this.enemyBullets.filter((b) => b.life > 0);
    if (
      !this.isProtected &&
      this.rocks.some(
        (rock) =>
          Math.hypot(rock.x - this.ship.x, rock.y - this.ship.y) <
          rock.radius * 0.84 + 10,
      )
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
    this.emitTimer += dt;
    if (this.emitTimer > 0.1) {
      this.emitTimer = 0;
      this.emit();
    }
  }
  private draw() {
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#111a1c";
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(
      w * 0.5,
      h * 0.47,
      0,
      w * 0.5,
      h * 0.47,
      w * 0.65,
    );
    glow.addColorStop(0, "#26352d55");
    glow.addColorStop(1, "#10191c00");
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
      ctx.strokeStyle = ambient ? "#798c735b" : "#adbb96";
      ctx.lineWidth = ambient ? 1.35 : 1.8;
      ctx.fillStyle = ambient ? "#1f2c2625" : "#24302755";
      ctx.beginPath();
      rock.points.forEach((point, i) => {
        const a = (i / rock.points.length) * TAU,
          x = Math.cos(a) * rock.radius * point,
          y = Math.sin(a) * rock.radius * point;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
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
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.3, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff9a7e";
    ctx.shadowColor = "#ed6949";
    ctx.shadowBlur = 12;
    for (const bullet of this.enemyBullets) {
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
    if (this.state.status === "playing" || this.state.status === "paused") {
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
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.033) : 0;
    this.last = now;
    this.elapsed += dt;
    this.update(dt);
    this.draw();
    this.frame = requestAnimationFrame(this.loop);
  };
  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    if (this.audio) void this.audio.close().catch(() => {});
  }
}
