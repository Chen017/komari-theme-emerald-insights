import type { StealSample } from './api'

/**
 * Align observed Steal intervals to the existing LoadChart time axis.
 * Realtime: each observation is a completed two-minute average, not
 * an instantaneous estimate; never extend values beyond the sampled span.
 * History: time-weighted overlap with the chart's native time buckets.
 *
 * Both inputs are chronological in the live chart. Cursor advancement keeps
 * 90-day plots O(samples + chart points), not O(samples * chart points).
 */
export function alignStealToTimeline(times: string[], samples: StealSample[], bucketMs: number): Array<number | null> {
  if (!samples.length)
    return times.map(() => null)

  const ordered = [...samples].sort((a, b) => a.from - b.from)
  const out: Array<number | null> = []
  let cursor = 0

  for (const iso of times) {
    const t = Date.parse(iso)
    if (!Number.isFinite(t)) {
      out.push(null)
      continue
    }

    const start = bucketMs <= 0 ? t : t - bucketMs
    while (cursor < ordered.length && ordered[cursor]!.time < start)
      cursor++

    if (bucketMs <= 0) {
      const item = ordered[cursor]
      out.push(item && item.from <= t && t <= item.time ? item.value : null)
      continue
    }

    let weighted = 0
    let coverage = 0
    for (let i = cursor; i < ordered.length; i++) {
      const item = ordered[i]!
      if (item.from >= t)
        break
      const span = Math.max(0, Math.min(item.time, t) - Math.max(item.from, start))
      weighted += span * item.value
      coverage += span
    }

    // Do not turn a sparse or disconnected bucket into a complete reading.
    out.push(coverage >= bucketMs * 0.5 ? weighted / coverage : null)
  }
  return out
}
