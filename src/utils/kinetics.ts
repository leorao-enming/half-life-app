/**
 * First-order decay kinetics engine.
 *
 * Models the biological elimination of a substance over time using
 * the standard pharmacokinetic half-life formula:
 *   C(t) = C₀ × (1/2)^(t / t½)
 */

export interface DecayParams {
  /** Initial dose / concentration at t=0 (mg) */
  initialDose: number;
  /** Time elapsed since ingestion (hours) */
  elapsedHours: number;
  /** Biological half-life of the substance (hours) */
  halfLifeHours: number;
}

export interface DecayResult {
  /** Remaining active amount (mg) */
  remaining: number;
  /** Fraction of original dose still active [0, 1] */
  fractionRemaining: number;
  /** Fraction of original dose that has been eliminated [0, 1] */
  fractionEliminated: number;
}

/**
 * Calculates the remaining active amount of a substance at a given time
 * using first-order (exponential) decay kinetics.
 *
 * Clamps results to zero for negative elapsed time or non-positive inputs.
 */
export function calcDecay({
  initialDose,
  elapsedHours,
  halfLifeHours,
}: DecayParams): DecayResult {
  if (initialDose <= 0 || halfLifeHours <= 0 || elapsedHours < 0) {
    return { remaining: 0, fractionRemaining: 0, fractionEliminated: 1 };
  }

  const fractionRemaining = Math.pow(0.5, elapsedHours / halfLifeHours);
  const remaining = initialDose * fractionRemaining;

  return {
    remaining,
    fractionRemaining,
    fractionEliminated: 1 - fractionRemaining,
  };
}

/**
 * Convenience overload — accepts positional arguments instead of a params object.
 */
export function calcDecaySimple(
  initialDose: number,
  elapsedHours: number,
  halfLifeHours: number,
): number {
  return calcDecay({ initialDose, elapsedHours, halfLifeHours }).remaining;
}

// ─── Substance-specific half-life constants (hours) ─────────────────────────

export const HALF_LIVES = {
  /** Average caffeine half-life in a healthy adult */
  CAFFEINE: 5.7,
  /** Blood glucose returns roughly to baseline in ~1–2 h for simple sugars */
  SUGAR: 1.5,
  /** Dietary sodium clears much more slowly via renal excretion */
  SODIUM: 24,
} as const;

export type SubstanceKey = keyof typeof HALF_LIVES;
