import { CalculateMetadataFunction, Composition } from "remotion";
import { Reel } from "./Reel";
import { szenen } from "./skript";

const FPS = 30;

const calculateMetadata: CalculateMetadataFunction<Record<string, unknown>> = () => {
  const frames = szenen.reduce((s, sz) => s + Math.round(sz.sekunden * FPS), 0);
  return { durationInFrames: frames };
};

export const MyComposition = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={300}
      fps={FPS}
      width={1080}
      height={1920}
      calculateMetadata={calculateMetadata}
    />
  );
};
