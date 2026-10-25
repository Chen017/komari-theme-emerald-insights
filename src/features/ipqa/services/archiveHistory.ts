import type { HistoryEntry } from '../history'
import type { IpqaDailyPairedReport } from '../types'

/**
 * Bounded workers reuse already loaded daily pairs. A stale view starts no
 * further requests; failures remain explicit and can be retried individually.
 */
export async function loadArchiveHistory(
  dates: string[],
  fetchReport: (date: string) => Promise<IpqaDailyPairedReport | null>,
  options: {
    cached?: HistoryEntry[]
    isCurrent?: () => boolean
    onProgress?: (entries: HistoryEntry[]) => void
    concurrency?: number
  } = {},
): Promise<HistoryEntry[]> {
  const uniqueDates = [...new Set(dates)].sort().reverse()
  const cache = new Map(options.cached?.filter(entry => entry.report).map(entry => [entry.date, entry.report]))
  const results = new Map<string, HistoryEntry>()
  const pending = uniqueDates.filter((date) => {
    const report = cache.get(date)
    if (report)
      results.set(date, { date, report })
    return !report
  })
  let cursor = 0
  const snapshot = () => uniqueDates.flatMap(date => results.has(date) ? [results.get(date)!] : [])
  const current = () => options.isCurrent?.() ?? true
  const requestedConcurrency = options.concurrency ?? 4
  const concurrency = Number.isFinite(requestedConcurrency) ? Math.max(1, Math.min(4, Math.floor(requestedConcurrency))) : 4
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (current() && cursor < pending.length) {
      const date = pending[cursor++]!
      let report: IpqaDailyPairedReport | null = null
      try {
        report = await fetchReport(date)
        if (report?.date !== date)
          report = null
      }
      catch { /* An unavailable day stays a gap; continue the other days. */ }
      if (!current())
        return
      results.set(date, { date, report })
      options.onProgress?.(snapshot())
    }
  }))
  return snapshot()
}
