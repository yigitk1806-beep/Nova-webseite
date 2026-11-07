import { interpolate, random, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { GehFigur, SchiebeFigur } from "./Figur";
import { farben, Szene } from "./skript";

const W = 1080;
const H = 1920;

const Defs: React.FC = () => (
  <defs>
    <radialGradient id="kugel" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stopColor="#f4f2ee" />
      <stop offset="55%" stopColor="#c9c6c0" />
      <stop offset="100%" stopColor="#5d5b58" />
    </radialGradient>
    <linearGradient id="weg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#3a3937" />
      <stop offset="100%" stopColor="#0d0d0d" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="weich">
      <feGaussianBlur stdDeviation="18" />
    </filter>
    <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stopColor="#000" stopOpacity="0" />
      <stop offset="100%" stopColor="#000" stopOpacity="0.85" />
    </radialGradient>
    <radialGradient id="licht" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor={farben.akzent} stopOpacity="0.55" />
      <stop offset="100%" stopColor={farben.akzent} stopOpacity="0" />
    </radialGradient>
  </defs>
);

const Kugel: React.FC<{ x: number; r: number; dreh: number }> = ({ x, r, dreh }) => (
  <g>
    <ellipse cx={x - r * 0.1} cy={4} rx={r * 1.05} ry={r * 0.18} fill="#000" opacity={0.6} filter="url(#weich)" />
    <circle cx={x} cy={-r} r={r} fill="url(#kugel)" />
    {/* Struktur, damit man die Drehung sieht */}
    <g transform={`rotate(${dreh} ${x} ${-r})`} opacity={0.22}>
      {[0, 70, 150, 215, 290].map((a, i) => (
        <circle
          key={i}
          cx={x + Math.cos((a * Math.PI) / 180) * r * (0.35 + (i % 3) * 0.17)}
          cy={-r + Math.sin((a * Math.PI) / 180) * r * (0.35 + (i % 3) * 0.17)}
          r={r * (0.05 + (i % 2) * 0.04)}
          fill="#6b6964"
        />
      ))}
    </g>
  </g>
);

// Weg mit leuchtender Kante, Boden bei y=0, sehr lang
const Weg: React.FC<{ markerX: number }> = ({ markerX }) => (
  <g>
    <rect x={-4000} y={0} width={8000} height={1400} fill="url(#weg)" />
    <line x1={-4000} y1={0} x2={4000} y2={0} stroke="#fff" strokeWidth={5} filter="url(#glow)" />
    <circle cx={markerX} cy={70} r={9} fill={farben.akzent} filter="url(#glow)" />
  </g>
);

// ---------- Hang: Figur schiebt Kugel ----------
const Hang: React.FC<{ szene: Szene; gipfel?: boolean }> = ({ szene, gipfel }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const r = 175;
  // je steiler, desto langsamer
  const tempo = interpolate(szene.steigung, [0, 45], [3.2, 0.9], { extrapolateRight: "clamp" }) * (gipfel ? 1.6 : 1);
  const weg = frame * tempo;
  const kugelX = 120 + weg;
  const dreh = (weg / r) * (180 / Math.PI);
  const phase = (weg / 95) % 1;
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.07]);
  return (
    <svg width={W} height={H} style={{ position: "absolute" }}>
      <Defs />
      {gipfel && <circle cx={W * 0.85} cy={H * 0.28} r={620} fill="url(#licht)" />}
      <g transform={`translate(${W / 2 - 40} ${H * 0.6}) scale(${zoom}) rotate(${-szene.steigung}) translate(${-kugelX + 40} 0)`}>
        <Weg markerX={kugelX - 380} />
        <SchiebeFigur hand={{ x: kugelX - r * 0.97, y: -r + 35 }} phase={phase} />
        <Kugel x={kugelX} r={r} dreh={dreh} />
      </g>
      <rect width={W} height={H} fill="url(#vignette)" />
    </svg>
  );
};

// ---------- Fußspuren ----------
const Fussspuren: React.FC = () => {
  const frame = useCurrentFrame();
  const x = 40 + frame * 4.2;
  const spuren = Array.from({ length: 6 }, (_, i) => i);
  return (
    <svg width={W} height={H} style={{ position: "absolute" }}>
      <Defs />
      <g transform={`translate(${W / 2 - 200} ${H * 0.62}) rotate(-14)`}>
        <Weg markerX={-600} />
        {spuren.map((i) => {
          const sx = 260 + i * 110;
          const an = interpolate(frame, [10 + i * 9, 18 + i * 9], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const sy = i % 2 === 0 ? 40 : 95;
          return (
            <g key={i} opacity={an} filter="url(#glow)" transform={`translate(${sx} ${sy})`}>
              <ellipse cx={0} cy={0} rx={30} ry={13} fill="#fff" />
              <circle cx={38} cy={-6} r={6} fill="#fff" />
              <circle cx={40} cy={6} r={5} fill="#fff" />
            </g>
          );
        })}
        <g transform="translate(0 70)">
          <GehFigur x={x - 300} phase={(frame / 22) % 1} s={1.15} />
        </g>
      </g>
      <rect width={W} height={H} fill="url(#vignette)" />
    </svg>
  );
};

// ---------- Kurve + Partikel ----------
const bezier = (t: number, p: number[][]) => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((d) => k.reduce((s, kk, i) => s + kk * p[i][d], 0));
};

const Kurve: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pts = [
    [-100, 1450],
    [500, 1400],
    [520, 700],
    [1200, 620],
  ];
  const t = interpolate(frame, [0, durationInFrames], [0.2, 0.32], { easing: Easing.inOut(Easing.quad) });
  const [bx, by] = bezier(t, pts);
  const [nx, ny] = bezier(t + 0.01, pts);
  const winkel = (Math.atan2(ny - by, nx - bx) * 180) / Math.PI;
  const d = `M${pts[0]} C${pts[1]} ${pts[2]} ${pts[3]}`;
  return (
    <svg width={W} height={H} style={{ position: "absolute" }}>
      <Defs />
      {Array.from({ length: 140 }, (_, i) => {
        const px = random(`x${i}`) * W;
        const py = (random(`y${i}`) * H + frame * (1 + random(`v${i}`) * 3)) % H;
        const a = random(`a${i}`) * 180;
        return (
          <line key={i} x1={px} y1={py} x2={px + Math.cos(a) * 12} y2={py + Math.sin(a) * 12}
            stroke="#fff" strokeWidth={2} opacity={0.25 + random(`o${i}`) * 0.5} />
        );
      })}
      <path d={`${d} L1200 2000 L-100 2000 Z`} fill="url(#weg)" opacity={0.9} />
      <path d={d} stroke="#fff" strokeWidth={5} fill="none" filter="url(#glow)" />
      <g transform={`translate(${bx} ${by}) rotate(${winkel}) scale(0.22)`}>
        <SchiebeFigur hand={{ x: -170, y: -140 }} phase={(frame / 20) % 1} />
        <Kugel x={0} r={175} dreh={frame * 2} />
      </g>
      <rect width={W} height={H} fill="url(#vignette)" />
    </svg>
  );
};

export const Hintergrund: React.FC<{ szene: Szene }> = ({ szene }) => {
  switch (szene.hintergrund) {
    case "fussspuren":
      return <Fussspuren />;
    case "kurve":
      return <Kurve />;
    case "gipfel":
      return <Hang szene={szene} gipfel />;
    default:
      return <Hang szene={szene} />;
  }
};
