/**
 * Amplification is presentation-only. APIs, history and tooltip keep raw Steal %.
 */
export const DEFAULT_STEAL_MULTIPLIER = 10
export const STEAL_MULTIPLIERS = [1, 5, 10, 20, 50] as const

export function scaleStealForChart(value: number | null | undefined, multiplier = DEFAULT_STEAL_MULTIPLIER): number | null {
  if (value == null || !Number.isFinite(value))
    return null
  return Math.min(100, Math.max(0, value * multiplier))
}

export function formatRealSteal(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '-%' : `${value.toFixed(2)}%`
}
