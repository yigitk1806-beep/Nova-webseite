import { loadFont } from "@remotion/fonts";
import { Video } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Hintergrund } from "./Hintergruende";
import { Einblendung, farben, marke, Szene, szenen } from "./skript";

// Schriften liegen lokal in public/fonts (funktioniert auch offline)
const ANTON = "Anton";
const MONTSERRAT = "Montserrat";
loadFont({ family: ANTON, url: staticFile("fonts/Anton.woff2"), weight: "400" });
loadFont({ family: MONTSERRAT, url: staticFile("fonts/Montserrat-800.woff2"), weight: "800" });

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const MAX_WOERTER = 4; // Wörter pro Untertitel-Zeile

// ---------- Überschrift oben ----------
const Ueberschrift: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: 190,
        left: 60,
        right: 60,
        textAlign: "center",
        fontFamily: ANTON,
        fontSize: 104,
        lineHeight: 1.05,
        color: farben.text,
        textTransform: "uppercase",
        textShadow: "0 6px 30px rgba(0,0,0,0.9)",
        opacity: interpolate(frame, [0, 5], [0, 1], clamp),
        scale: interpolate(frame, [0, 9], [1.18, 1], { ...clamp, easing: Easing.out(Easing.back(2)) }),
      }}
    >
      {text}
    </div>
  );
};

// ---------- Untertitel Wort für Wort ----------
const Untertitel: React.FC<{ satz: string }> = ({ satz }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const woerter = satz.split(/\s+/).filter(Boolean);
  // Zeit pro Wort nach Länge gewichtet, Start nach 6 Frames, fertig bei 88 %
  const start = 6;
  const ende = durationInFrames * 0.88;
  const gewichte = woerter.map((w) => w.length + 3);
  const summe = gewichte.reduce((a, b) => a + b, 0);
  let t = start;
  const zeiten = gewichte.map((g) => {
    const s = t;
    t += ((ende - start) * g) / summe;
    return s;
  });
  // aktuelle Gruppe (max. MAX_WOERTER Wörter)
  let aktiv = 0;
  zeiten.forEach((z, i) => {
    if (frame >= z) aktiv = i;
  });
  const gruppe = Math.floor(aktiv / MAX_WOERTER);
  const von = gruppe * MAX_WOERTER;
  const sichtbar = woerter.slice(von, von + MAX_WOERTER);

  return (
    <div
      style={{
        position: "absolute",
        top: 1330,
        left: 80,
        right: 80,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 22px",
        fontFamily: MONTSERRAT,
        fontWeight: 800,
        fontSize: 66,
        textShadow: "0 4px 18px rgba(0,0,0,0.95)",
      }}
    >
      {sichtbar.map((w, j) => {
        const i = von + j;
        const z = zeiten[i];
        const gesprochen = frame >= z;
        return (
          <span
            key={i}
            style={{
              color: gesprochen ? farben.text : farben.textGrau,
              display: "inline-block",
              scale: interpolate(frame, [z, z + 3, z + 7], [1, 1.12, 1], clamp),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// ---------- Einblendungen: Steigung / Kraft ----------
const Grad: React.FC<{ grad: number; style: React.CSSProperties }> = ({ grad, style }) => {
  const frame = useCurrentFrame();
  const wert = Math.round(interpolate(frame, [4, 24], [0, grad], { ...clamp, easing: Easing.out(Easing.cubic) }));
  return (
    <div
      style={{
        position: "absolute",
        textAlign: "center",
        color: farben.text,
        opacity: interpolate(frame, [2, 8], [0, 1], clamp),
        ...style,
      }}
    >
      <div style={{ fontFamily: ANTON, fontSize: 150, lineHeight: 1 }}>{wert}°</div>
      <div style={{ fontFamily: MONTSERRAT, fontWeight: 800, fontSize: 38, letterSpacing: 6 }}>STEIGUNG</div>
    </div>
  );
};

const Kraft: React.FC<{ kraft: number }> = ({ kraft }) => {
  const frame = useCurrentFrame();
  const fuellung = interpolate(frame, [4, 30], [1, kraft], { ...clamp, easing: Easing.out(Easing.cubic) });
  const knapp = kraft < 0.35;
  return (
    <div
      style={{
        position: "absolute",
        right: 90,
        top: 560,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        opacity: interpolate(frame, [2, 8], [0, 1], clamp),
      }}
    >
      <div
        style={{
          width: 34,
          height: 330,
          borderRadius: 17,
          border: "4px solid #fff",
          padding: 5,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            width: "100%",
            height: `${fuellung * 100}%`,
            borderRadius: 12,
            background: knapp ? farben.akzent : "#fff",
            boxShadow: knapp ? `0 0 24px ${farben.akzent}` : "none",
          }}
        />
      </div>
      <div style={{ fontFamily: MONTSERRAT, fontWeight: 800, fontSize: 34, letterSpacing: 4, color: "#fff" }}>
        KRAFT
      </div>
    </div>
  );
};

const Einblendungen: React.FC<{ e: Einblendung }> = ({ e }) => {
  if (e.typ === "steigung") return <Grad grad={e.grad} style={{ left: 90, top: 470 }} />;
  if (e.typ === "kraft")
    return (
      <>
        <Grad grad={e.grad} style={{ right: 190, top: 640 }} />
        <Kraft kraft={e.kraft} />
      </>
    );
  return null;
};

// ---------- Marke ----------
const Marke: React.FC = () => (
  <div style={{ position: "absolute", left: 80, top: 1560, fontFamily: ANTON, fontSize: 44, letterSpacing: 1 }}>
    <span style={{ color: farben.text }}>{marke.teil1}</span>
    <span style={{ color: farben.akzent }}>{marke.teil2}</span>
  </div>
);

// ---------- Szene ----------
const SzeneView: React.FC<{ szene: Szene }> = ({ szene }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: farben.hintergrund }}>
      <AbsoluteFill style={{ opacity: interpolate(frame, [0, 5], [0, 1], clamp) }}>
        {szene.video ? (
          <Video src={staticFile(szene.video)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Hintergrund szene={szene} />
        )}
      </AbsoluteFill>
      <Ueberschrift text={szene.ueberschrift} />
      <Einblendungen e={szene.einblendung} />
      <Untertitel satz={szene.satz} />
    </AbsoluteFill>
  );
};

export const Reel: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: farben.hintergrund }}>
      <Series>
        {szenen.map((s, i) => (
          <Series.Sequence key={i} durationInFrames={Math.round(s.sekunden * fps)} name={s.ueberschrift}>
            <SzeneView szene={s} />
          </Series.Sequence>
        ))}
      </Series>
      <Marke />
    </AbsoluteFill>
  );
};
