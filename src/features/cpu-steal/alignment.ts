import type { StealSample } from './api'

/**
 * Align each measured interval to the existing LoadChart x-axis.
 * bucketMs=0: real-time - each point carries a completed two-minute average
 * only where the original observation interval actually covers it.
 * bucketMs>0: history - time-weighted average of overlap with the native
 * one-minute, 15-minute or one-hour chart bucket. No interpolation across gaps.
 */
export function alignStealToTimeline(times: string[], samples: StealSample[], bucketMs: number): Array<number | null> {
  if (!samples.length)
    return times.map(() => null)
  const ordered = [...samples].sort((a, b) => a.from - b.from)
  return times.map((iso) => {
    const t = Date.parse(iso)
    if (!Number.isFinite(t))
      return null
    if (bucketMs <= 0) {
      const found = ordered.find(s => s.from <= t && t <= s.time)
      return found?.value ?? null
    }
    const start = t - bucketMs
    let weighted = 0
    let coverage = 0
    for (const s of ordered) {
      if (s.time < start)
        continue
      if (s.from > t)
        break
      const span = Math.max(0, Math.min(s.time, t) - Math.max(s.from, start))
      weighted += span * s.value
      coverage += span
    }
    // A historical bucket with sparse observations must remain a gap.
    return coverage >= bucketMs * 0.5 ? weighted / coverage : null
  })
}
