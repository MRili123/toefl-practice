/* eslint-disable @next/next/no-img-element -- local scene image with an SVG overlay sized to it */
import type { SpeakingMeta } from "@/engine/bank/types";

/** The Listen-and-Repeat scene, with the part being described outlined. */
export function SceneImage({ meta, partIndex }: { meta: SpeakingMeta; partIndex: number | null }) {
  if (!meta.sceneImage) return null;
  const region = partIndex !== null ? meta.partRegions[partIndex] : null;
  return (
    <figure className="relative overflow-hidden rounded-lg border border-line bg-surface">
      <img src={meta.sceneImage} alt={meta.sceneTheme ? `Scene: ${meta.sceneTheme}` : "Scene"} className="block h-auto w-full" />
      {region && meta.sceneSize && (
        <svg viewBox={`0 0 ${meta.sceneSize.width} ${meta.sceneSize.height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <path d={region.path} fill="rgba(253, 224, 71, 0.28)" stroke="#f5b400" strokeWidth={5} strokeLinejoin="round" />
        </svg>
      )}
    </figure>
  );
}
