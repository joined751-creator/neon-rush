/** Shared highlight budget, including procedural Grid variants. Never mutates theme data. */
export function visualLook(fx) {
  if (!fx) return null;
  return {
    ...fx,
    bloom: { strength:0.5, radius:0.35, threshold:0.95, ...fx.bloom },
    streak:Math.min(fx.streak ?? 0.2, 0.22),
    flare:Math.min(fx.flare ?? 0.3, 0.4),
    grade: { ...fx.grade, sat:Math.min(fx.grade?.sat ?? 1, 1.05) },
  };
}
