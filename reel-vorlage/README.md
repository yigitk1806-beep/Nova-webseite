# Reel-Vorlage (9:16, kostenlos mit Remotion)

Vorlage für Motivations-Reels: große Überschrift, Untertitel Wort für Wort,
Einblendungen (Steigung / Kraft-Balken), Marke unten links.

## Text ändern

Alles steht in **`src/skript.ts`**:

- `szenen` – pro Szene `ueberschrift`, `satz`, `sekunden`, `hintergrund`, `steigung`, `einblendung`
- `marke` – Name unten links (`teil1` weiß, `teil2` in Akzentfarbe)
- `farben` – Akzentfarbe usw.

Eigene Clips (z. B. KI-Videos) in `public/` legen und bei der Szene `video: "datei.mp4"` setzen –
dann ersetzt der Clip die gezeichnete Grafik, Texte bleiben drüber.

## Starten / Rendern

```bash
npm i
npm run dev                                # Vorschau im Browser (Remotion Studio)
npx remotion render Reel out/reel.mp4      # fertiges Video 1080×1920
```
