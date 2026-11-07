// Einfache "Gliederpuppe" aus Linien – Platzhalter für eine 3D-Figur.
type P = { x: number; y: number };

const FARBE = "#e9e6e1";
const SCHATTEN = "#9d9a95";

// Zwei-Segment-Gelenk (Hüfte→Knie→Fuß, Schulter→Ellbogen→Hand)
const gelenk = (a: P, b: P, l1: number, l2: number, knick: 1 | -1): P => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const winkel = Math.atan2(dy, dx) + knick * Math.acos(Math.max(-1, Math.min(1, cosA)));
  return { x: a.x + l1 * Math.cos(winkel), y: a.y + l1 * Math.sin(winkel) };
};

const Glied: React.FC<{ pts: P[]; w: number; c?: string }> = ({ pts, w, c = FARBE }) => (
  <polyline
    points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
    fill="none"
    stroke={c}
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

// Pose "schieben": Hände bei `hand`, Boden bei y=0, Blick nach +x
export const SchiebeFigur: React.FC<{ hand: P; phase: number; s?: number }> = ({
  hand,
  phase,
  s = 1,
}) => {
  const schulter = { x: hand.x - 80 * s, y: hand.y + 12 * s };
  const huefte = { x: schulter.x - 82 * s, y: schulter.y + 58 * s };
  const kopf = { x: schulter.x + 14 * s, y: schulter.y - 30 * s };
  const schritt = 70 * s;
  const fuss = (off: number): P => {
    const t = (phase + off) % 1;
    // Fuß gleitet nach hinten (Stand), springt dann nach vorne (Schwung)
    const vorne = huefte.x - 10 * s;
    const hinten = huefte.x - 10 * s - schritt;
    if (t < 0.7) return { x: vorne + (hinten - vorne) * (t / 0.7), y: 0 };
    const u = (t - 0.7) / 0.3;
    return { x: hinten + (vorne - hinten) * u, y: -Math.sin(u * Math.PI) * 18 * s };
  };
  const f1 = fuss(0);
  const f2 = fuss(0.5);
  const l = 62 * s;
  const ellbogen = gelenk(schulter, hand, 45 * s, 45 * s, 1);
  return (
    <g>
      {/* hinteres Bein + Arm etwas dunkler */}
      <Glied pts={[huefte, gelenk(huefte, f2, l, l, -1), f2]} w={22 * s} c={SCHATTEN} />
      <Glied pts={[schulter, gelenk(schulter, { x: hand.x, y: hand.y + 18 * s }, 45 * s, 45 * s, 1), { x: hand.x, y: hand.y + 18 * s }]} w={16 * s} c={SCHATTEN} />
      <Glied pts={[huefte, schulter]} w={40 * s} />
      <Glied pts={[huefte, gelenk(huefte, f1, l, l, -1), f1]} w={24 * s} />
      <Glied pts={[schulter, ellbogen, hand]} w={17 * s} />
      <circle cx={kopf.x} cy={kopf.y} r={22 * s} fill={FARBE} />
    </g>
  );
};

// Pose "gehen": aufrecht, Füße bei y=0, Blick nach +x
export const GehFigur: React.FC<{ x: number; phase: number; s?: number }> = ({ x, phase, s = 1 }) => {
  const huefte = { x, y: -118 * s };
  const schulter = { x: x + 10 * s, y: -205 * s };
  const kopf = { x: x + 16 * s, y: -240 * s };
  const l = 60 * s;
  const fuss = (off: number): P => {
    const w = Math.sin((phase + off) * Math.PI * 2);
    return { x: x + w * 38 * s, y: -Math.max(0, Math.cos((phase + off) * Math.PI * 2)) * 14 * s };
  };
  const hand = (off: number): P => {
    const w = Math.sin((phase + off) * Math.PI * 2);
    return { x: schulter.x - w * 34 * s, y: schulter.y + 82 * s };
  };
  const f1 = fuss(0);
  const f2 = fuss(0.5);
  const h1 = hand(0);
  const h2 = hand(0.5);
  return (
    <g>
      <Glied pts={[huefte, gelenk(huefte, f2, l, l, -1), f2]} w={22 * s} c={SCHATTEN} />
      <Glied pts={[schulter, gelenk(schulter, h2, 44 * s, 44 * s, -1), h2]} w={15 * s} c={SCHATTEN} />
      <Glied pts={[huefte, schulter]} w={42 * s} />
      <Glied pts={[huefte, gelenk(huefte, f1, l, l, -1), f1]} w={24 * s} />
      <Glied pts={[schulter, gelenk(schulter, h1, 44 * s, 44 * s, -1), h1]} w={16 * s} />
      <circle cx={kopf.x} cy={kopf.y} r={22 * s} fill={FARBE} />
    </g>
  );
};
