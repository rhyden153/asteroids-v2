// Canvas artwork only: no simulation state or random-number consumption.
export type GraphicsMode = "modern" | "vector";
type Context = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const ENGINE_X = [-6, 6] as const;
const SHIP_HULL = [[0, -20], [6, -5], [14, 15], [5, 11], [0, 8], [-5, 11], [-14, 15], [-6, -5]] as const;
const SHIP_LEFT_WING = [[-5, -3], [-11, 11], [-5, 8], [-2, -11]] as const;
const SHIP_RIGHT_WING = [[5, -3], [11, 11], [5, 8], [2, -11]] as const;
const SHIP_SPINE = [[0, -19], [4, 7], [0, 10], [-4, 7]] as const;
const SHIP_GLASS = [[0, -11], [3, -3], [2, 3], [-2, 3], [-3, -3]] as const;
const UFO_HULL = [[-1, 0], [-0.52, -0.27], [0.52, -0.27], [1, 0], [0.56, 0.32], [-0.56, 0.32]] as const;

function polygon(
  ctx: Context,
  points: readonly (readonly number[])[],
  fill: string | CanvasGradient,
  stroke?: string,
) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]!;
    if (i) ctx.lineTo(x!, y!);
    else ctx.moveTo(x!, y!);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// Small background cameo ships, facing right. Keep their silhouettes in both styles.
export function drawFalcon(ctx: Context, mode: GraphicsMode) {
  const modern = mode === "modern";
  ctx.save();
  ctx.lineWidth = 0.85;
  ctx.strokeStyle = modern ? "#bdc9cd" : "#a8bbab";
  ctx.fillStyle = modern ? "#89979b" : "#172522";
  ctx.beginPath();
  ctx.ellipse(-2, 0, 14, 14, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // The two forward mandibles and the starboard cockpit make the freighter recognizable.
  polygon(ctx, [[4, -11], [21, -8], [21, -3], [6, -3]], modern ? "#b4bcb6" : "#172522", ctx.strokeStyle);
  polygon(ctx, [[6, 3], [21, 3], [21, 8], [4, 11]], modern ? "#929f9c" : "#172522", ctx.strokeStyle);
  polygon(ctx, [[-2, 9], [9, 14], [15, 10], [8, 5]], modern ? "#9eafb1" : "#172522", ctx.strokeStyle);
  polygon(ctx, [[9, 10], [14, 10], [11, 13], [7, 12]], "#3b6573", "#85bbc8");
  // Cool blue exhaust follows the curved stern, rather than a fighter's point flame.
  ctx.beginPath();
  ctx.arc(-2, 0, 13.5, Math.PI * 0.7, Math.PI * 1.3);
  ctx.strokeStyle = "#8bdeed";
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = modern ? "#435c64" : "#71978a";
  for (const y of [-7, 7]) {
    ctx.beginPath();
    ctx.moveTo(-12, y);
    ctx.lineTo(-5, y * 0.5);
    ctx.lineTo(8, y * 0.5);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(-2, 0, 5.5, 0, TAU);
  ctx.fillStyle = modern ? "#bdc6bd" : "#172522";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-2, 0, 2.4, 0, TAU);
  ctx.stroke();
  // Offset radar dish and engine vents, visible even at the native 38 px size.
  ctx.beginPath();
  ctx.ellipse(-3, -8, 3.5, 2.5, -0.35, 0, TAU);
  ctx.fillStyle = modern ? "#d0d4c7" : "#172522";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = modern ? "#344850" : "#71978a";
  for (const y of [-5, 0, 5]) ctx.fillRect(-11, y - 1, 3, 2);
  ctx.restore();
}

export function drawTieFighter(ctx: Context, mode: GraphicsMode) {
  const modern = mode === "modern";
  ctx.save();
  ctx.lineWidth = 0.85;
  // Twin hexagonal solar panels, joined to the central ball cockpit by pylons.
  ctx.strokeStyle = "#96acb7";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(0, 11);
  ctx.stroke();
  ctx.lineWidth = 0.85;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);
    polygon(ctx, [[-12, 9], [-7, 6], [8, 6], [12, 9], [8, 15], [-8, 15]],
      modern ? "#14232d" : "#101c20", "#9aaeb6");
    ctx.strokeStyle = modern ? "#506773" : "#5d837a";
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(10, 10);
    ctx.moveTo(-5, 7);
    ctx.lineTo(-5, 14);
    ctx.moveTo(5, 7);
    ctx.lineTo(5, 14);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, TAU);
  ctx.fillStyle = modern ? "#879da7" : "#172522";
  ctx.strokeStyle = "#b0c3c8";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1, 0, 3, 0, TAU);
  ctx.fillStyle = "#152c35";
  ctx.fill();
  ctx.strokeStyle = "#718f9b";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = "#e7957d";
  ctx.fillRect(4, -1, 1, 2);
  ctx.restore();
}

export function drawModernRock(ctx: Context, radius: number, points: number[]) {
  ctx.save();
  ctx.scale(radius, radius);
  ctx.lineWidth = 1 / radius;
  const vertices = points.map((p, i) => [
    Math.cos((i / points.length) * TAU) * p,
    Math.sin((i / points.length) * TAU) * p,
  ]);
  const stone = ctx.createLinearGradient(-0.8, -0.9, 0.8, 1);
  stone.addColorStop(0, "#b6ac98");
  stone.addColorStop(0.35, "#807c70");
  stone.addColorStop(0.7, "#4a4b46");
  stone.addColorStop(1, "#252f32");
  polygon(ctx, vertices, stone, "#adb4a0");
  ctx.clip();

  // Facets and mineral veins follow each rock's existing silhouette.
  vertices.forEach((vertex, i) => {
    const next = vertices[(i + 1) % vertices.length]!;
    polygon(
      ctx,
      [vertex, next, [-0.14, -0.08]],
      i % 3 === 0 ? "#e2d9bd19" : "#111b2524",
    );
  });
  for (let i = 0; i < 7; i++) {
    const seed = points[i % points.length]!;
    const angle = i * 2.399 + seed * 3;
    const distance = 0.18 + (i % 3) * 0.22;
    const x = Math.cos(angle) * distance,
      y = Math.sin(angle) * distance;
    const r = 0.09 + (seed - 0.72) * 0.24;
    ctx.beginPath();
    ctx.ellipse(x, y + 0.018, r * 1.15, r * 0.84, angle, 0, TAU);
    ctx.fillStyle = "#c1b7a269";
    ctx.fill();
    const crater = ctx.createRadialGradient(
      x - r * 0.3,
      y - r * 0.4,
      0,
      x,
      y,
      r,
    );
    crater.addColorStop(0, "#222c30");
    crater.addColorStop(0.7, "#41443f");
    crater.addColorStop(1, "#77776a");
    ctx.beginPath();
    ctx.ellipse(x, y - 0.02, r, r * 0.74, angle, 0, TAU);
    ctx.fillStyle = crater;
    ctx.fill();
  }
  // Deterministic fine grain stays fixed to the rotating surface.
  for (let i = 0; i < 36; i++) {
    const x = Math.sin(i * 127.1 + points[0]! * 19) * 0.93;
    const y = Math.sin(i * 311.7 + points[1]! * 23) * 0.93;
    ctx.fillStyle = i % 3 ? "#e4dab726" : "#111c284d";
    ctx.fillRect(x, y, 0.018, 0.025);
  }
  ctx.restore();
}

export function drawModernShip(
  ctx: Context,
  thrust = false,
  boost = false,
  time = 0,
) {
  ctx.save();
  ctx.lineWidth = 0.8;
  if (thrust) {
    const length = (boost ? 34 : 21) + Math.sin(time * 35) * 3;
    const flame = ctx.createLinearGradient(0, 10, 0, 14 + length);
    flame.addColorStop(0, "#edffff");
    flame.addColorStop(0.25, boost ? "#a9bbff" : "#6be8ff");
    flame.addColorStop(1, "#4197ff00");
    ctx.shadowColor = "#59cfff";
    ctx.shadowBlur = 12;
    for (const x of ENGINE_X) {
      polygon(
        ctx,
        [
          [x - 3, 11],
          [x + 3, 11],
          [x + 2, 20],
          [x, 14 + length],
          [x - 2, 20],
        ],
        flame,
      );
    }
    ctx.shadowBlur = 0;
  }
  const hull = ctx.createLinearGradient(-14, -12, 14, 15);
  hull.addColorStop(0, "#f0f5e8");
  hull.addColorStop(0.4, "#b5c8c9");
  hull.addColorStop(0.48, "#6c899b");
  hull.addColorStop(1, "#253d52");
  polygon(ctx, SHIP_HULL, hull, "#d1e6eb");
  polygon(ctx, SHIP_LEFT_WING, "#557481", "#93b4c0");
  polygon(ctx, SHIP_RIGHT_WING, "#314c60", "#7898ab");
  polygon(ctx, SHIP_SPINE, "#d4ded4");
  const glass = ctx.createLinearGradient(-3, -10, 3, 3);
  glass.addColorStop(0, "#e3ffff");
  glass.addColorStop(0.35, "#5ed8ed");
  glass.addColorStop(1, "#126284");
  polygon(ctx, SHIP_GLASS, glass, "#95edff");
  ctx.fillStyle = "#f58050";
  ctx.fillRect(-10, 7, 2, 4);
  ctx.fillRect(8, 7, 2, 4);
  for (const x of ENGINE_X) {
    ctx.fillStyle = "#1c3045";
    ctx.fillRect(x - 2.4, 9, 4.8, 4);
    ctx.fillStyle = "#b2f6ff";
    ctx.shadowColor = "#53cbff";
    ctx.shadowBlur = 6;
    ctx.fillRect(x - 1.6, 12, 3.2, 1.5);
  }
  ctx.restore();
}

export function drawModernUfo(
  ctx: Context,
  radius: number,
  small = false,
  time = 0,
) {
  ctx.save();
  ctx.scale(radius, radius);
  ctx.lineWidth = 1 / radius;
  const accent = small ? "#ff748e" : "#ffc082";
  const aura = ctx.createRadialGradient(0, 0.2, 0, 0, 0.2, 0.8);
  aura.addColorStop(0, small ? "#ff466f55" : "#ff983a55");
  aura.addColorStop(1, "#ff744400");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.ellipse(0, 0.22, 0.85, 0.5, 0, 0, TAU);
  ctx.fill();
  const dome = ctx.createLinearGradient(-0.3, -0.65, 0.35, -0.1);
  dome.addColorStop(0, "#d6ffff");
  dome.addColorStop(0.35, "#5f9fa8");
  dome.addColorStop(1, "#243449");
  ctx.beginPath();
  ctx.ellipse(0, -0.23, 0.43, 0.39, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.strokeStyle = "#a2ccd0";
  ctx.stroke();
  const metal = ctx.createLinearGradient(0, -0.3, 0, 0.34);
  metal.addColorStop(0, "#d0bab1");
  metal.addColorStop(0.42, "#807883");
  metal.addColorStop(0.49, "#ead8ca");
  metal.addColorStop(0.55, "#424257");
  metal.addColorStop(1, "#202a3e");
  polygon(ctx, UFO_HULL, metal, "#bba7a2");
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-0.87, 0.035);
  ctx.lineTo(0.87, 0.035);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i === Math.floor(time * 4) % 5 ? "#fff5db" : accent;
    ctx.beginPath();
    ctx.ellipse(-0.56 + i * 0.28, 0.14, 0.055, 0.035, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawModernShot(
  ctx: Context,
  x: number,
  y: number,
  vx: number,
  vy: number,
  hostile = false,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(vy, vx));
  const trail = ctx.createLinearGradient(-14, 0, 3, 0);
  trail.addColorStop(0, hostile ? "#ff583900" : "#63ddff00");
  trail.addColorStop(0.7, hostile ? "#ff7048" : "#6be4ff");
  trail.addColorStop(1, "#ffffff");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.ellipse(-4, 0, hostile ? 10 : 9, hostile ? 3 : 2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
