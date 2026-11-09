/**
 * CPU Steal stays in real percentage units in the API and timeline model.
 * Only the ECharts display series is exaggerated 10x and capped at 100%.
 */
export const STEAL_DISPLAY_MULTIPLIER = 10

export function scaleStealForChart(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value))
    return null
  return Math.min(100, Math.max(0, value * STEAL_DISPLAY_MULTIPLIER))
}

export function formatRealSteal(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '-%' : `${value.toFixed(2)}%`
}
