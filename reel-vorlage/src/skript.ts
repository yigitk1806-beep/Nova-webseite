// ============================================================
//  HIER BEARBEITEST DU DEIN REEL
//  Jede Szene = eine Überschrift + ein gesprochener Satz.
//  Alles andere (Timing, Untertitel, Animation) passiert automatisch.
// ============================================================

export type Einblendung =
  | { typ: "steigung"; grad: number }
  | { typ: "kraft"; grad: number; kraft: number } // kraft: 0–1
  | { typ: "keine" };

export type Hintergrund =
  | "fussspuren" // Figur geht los, leuchtende Fußspuren
  | "hang" // Figur schiebt Kugel einen Hang hoch
  | "kurve" // Weite Aufnahme: geschwungener Weg + Partikel
  | "gipfel"; // Kugel oben, Weg wird flacher

export type Szene = {
  ueberschrift: string; // groß oben, wird automatisch in GROSSBUCHSTABEN gesetzt
  satz: string; // Untertitel, erscheint Wort für Wort
  sekunden: number; // Länge der Szene
  hintergrund: Hintergrund;
  steigung: number; // Winkel des Hangs in Grad (für die Grafik)
  einblendung: Einblendung;
  // Optional: eigenes Video (z. B. KI-Clip) aus dem Ordner public/
  // statt der gezeichneten Grafik, z. B. "szene1.mp4"
  video?: string;
};

export const marke = {
  teil1: "NOVA", // weiß
  teil2: "REELS", // Akzentfarbe
};

export const farben = {
  hintergrund: "#050505",
  text: "#ffffff",
  textGrau: "#8a8a8a",
  akzent: "#ff4d1a",
};

export const szenen: Szene[] = [
  {
    ueberschrift: "Der erste Schritt",
    satz: "Am Anfang fühlt sich alles leicht an",
    sekunden: 3.2,
    hintergrund: "fussspuren",
    steigung: 0,
    einblendung: { typ: "keine" },
  },
  {
    ueberschrift: "Dann wird es steil",
    satz: "Doch nach ein paar Metern wird der Weg steiler",
    sekunden: 3.6,
    hintergrund: "hang",
    steigung: 11,
    einblendung: { typ: "steigung", grad: 11 },
  },
  {
    ueberschrift: "Jeder Meter zählt",
    satz: "Hier hören die meisten auf",
    sekunden: 3,
    hintergrund: "hang",
    steigung: 25,
    einblendung: { typ: "kraft", grad: 25, kraft: 0.55 },
  },
  {
    ueberschrift: "Am steilsten Punkt",
    satz: "Genau hier fühlt es sich am schwersten an",
    sekunden: 3.6,
    hintergrund: "hang",
    steigung: 40,
    einblendung: { typ: "kraft", grad: 40, kraft: 0.15 },
  },
  {
    ueberschrift: "Nicht ewig steiler",
    satz: "Aber kein Berg wird für immer steiler",
    sekunden: 3.4,
    hintergrund: "kurve",
    steigung: 20,
    einblendung: { typ: "keine" },
  },
  {
    ueberschrift: "Ab hier wird es leichter",
    satz: "Wer jetzt weitermacht wird belohnt",
    sekunden: 3.2,
    hintergrund: "gipfel",
    steigung: 8,
    einblendung: { typ: "kraft", grad: 8, kraft: 0.85 },
  },
  {
    ueberschrift: "Schick das weiter",
    satz: "An jemanden der gerade kurz vor dem Aufgeben ist",
    sekunden: 3.8,
    hintergrund: "gipfel",
    steigung: 4,
    einblendung: { typ: "keine" },
  },
];
