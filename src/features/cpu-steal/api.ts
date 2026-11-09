export interface StealSample {
  from: number
  time: number
  value: number
}

export async function fetchCpuStealHistory(
  uuid: string,
  from: number,
  to: number,
): Promise<StealSample[]> {
  const params = new URLSearchParams({ uuid, from: String(Math.floor(from)), to: String(Math.ceil(to)) })
  try {
    const response = await fetch(`/api/plugin/cpu-steal-monitor/v1/history?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    // Plugin is optional. Never disrupt existing CPU and load graphs.
    if (!response.ok)
      return []
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object')
      return []
    const result = data as { schemaVersion?: number, uuid?: string, samples?: unknown }
    if (result.schemaVersion !== 1 || result.uuid !== uuid || !Array.isArray(result.samples))
      return []
    return result.samples.filter((row): row is StealSample => {
      if (!row || typeof row !== 'object')
        return false
      const s = row as StealSample
      return Number.isFinite(s.from) && Number.isFinite(s.time) && Number.isFinite(s.value)
        && s.from < s.time && s.value >= 0 && s.value <= 100
    }).sort((a, b) => a.time - b.time)
  }
  catch {
    return []
  }
}
