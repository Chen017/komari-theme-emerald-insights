import type { IpqaDailyPairedReport } from '../types'

/** Page-scoped cache: no storage persistence or sharing across login sessions. */
export function createArchiveReader(
  fetchReport: (uuid: string, date: string) => Promise<IpqaDailyPairedReport | null>,
  options: { maxEntries?: number, ttlMs?: number, now?: () => number } = {},
) {
  const cache = new Map<string, { report: IpqaDailyPairedReport, expires: number }>()
  const pending = new Map<string, Promise<IpqaDailyPairedReport | null>>()
  const maxEntries = Math.max(1, options.maxEntries ?? 64)
  const ttlMs = options.ttlMs ?? 30_000
  const now = options.now ?? Date.now
  let generation = 0

  function clear() {
    generation++
    cache.clear()
    pending.clear()
  }

  function read(uuid: string, date: string): Promise<IpqaDailyPairedReport | null> {
    const key = `${uuid}/${date}`
    const cached = cache.get(key)
    if (cached && cached.expires > now()) {
      cache.delete(key)
      cache.set(key, cached)
      return Promise.resolve(cached.report)
    }
    cache.delete(key)
    const running = pending.get(key)
    if (running)
      return running
    const token = generation
    const request = fetchReport(uuid, date).then((report) => {
      if (token === generation && report?.date === date) {
        cache.set(key, { report, expires: now() + ttlMs })
        while (cache.size > maxEntries) cache.delete(cache.keys().next().value!)
      }
      return report
    }).finally(() => {
      if (pending.get(key) === request)
        pending.delete(key)
    })
    pending.set(key, request)
    return request
  }

  return { read, clear }
}
