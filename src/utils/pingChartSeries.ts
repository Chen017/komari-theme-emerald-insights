import { cutPeakValues } from './recordHelper'

type ChartRow = Record<string, unknown>
type LinePoint = [number, number | null]

/** Build one task's line without treating other tasks' timestamps as missing probes. */
export function buildPingLine(rows: ChartRow[], taskId: string, intervalSeconds: number, hours: number) {
  const points = rows.flatMap((row, index) => {
    if (!Object.hasOwn(row, taskId))
      return []
    const time = Date.parse(String(row.time))
    const value = row[taskId]
    if (!Number.isFinite(time) || (value !== null && (typeof value !== 'number' || !Number.isFinite(value))))
      return []
    return [{ index, time, value: value as number | null, observationGap: row.observationGap === true }]
  })

  // Metrics can be aggregated into buckets much larger than the probe interval.
  const baseInterval = Math.max((intervalSeconds > 0 ? intervalSeconds : 60) * 1000, hours * 3600_000 / 700)
  if (hours > 6) {
    // A long-range metric response may contain several empty buckets between
    // real samples. Join nearby observations without fabricating bucket values.
    const observed = points.filter(point => point.value !== null)
    const intervals = observed.slice(1).map((point, i) => point.time - observed[i]!.time)
    const observedIntervals = intervals.filter(ms => ms > 0).sort((a, b) => a - b)
    const buckets = points.filter(point => !point.observationGap)
    const bucketIntervals = buckets.slice(1).map((point, i) => point.time - buckets[i]!.time).filter(ms => ms > 0).sort((a, b) => a - b)
    // max_points is only an upper bound; the server may return daily rollups.
    // Require several observations before inferring cadence and use the lower
    // median so one long outage cannot enlarge the connection threshold.
    const typicalInterval = observedIntervals.length >= 2
      ? observedIntervals[Math.floor((observedIntervals.length - 1) / 2)]!
      : bucketIntervals.length >= 2 ? bucketIntervals[Math.floor((bucketIntervals.length - 1) / 2)]! : baseInterval
    const line: LinePoint[] = []
    for (let i = 0; i < observed.length; i++) {
      const point = observed[i]!
      const previous = observed[i - 1]
      if (previous) {
        // Aggregation resolution can change within the selected range. Infer
        // each side independently, excluding the gap being tested itself.
        const previousIntervals = intervals.slice(Math.max(0, i - 4), i - 1).filter(ms => ms > 0).sort((a, b) => a - b)
        const followingIntervals = intervals.slice(i, i + 3).filter(ms => ms > 0).sort((a, b) => a - b)
        const previousCadence = previousIntervals.length >= 2 ? previousIntervals[Math.floor((previousIntervals.length - 1) / 2)]! : 0
        const followingCadence = followingIntervals.length >= 2 ? followingIntervals[Math.floor((followingIntervals.length - 1) / 2)]! : 0
        const maxGap = Math.max(baseInterval, typicalInterval, previousCadence, followingCadence) * 2.5
        if (point.time - previous.time > maxGap)
          line.push([point.index, null])
      }
      line.push([point.index, point.value])
    }
    const isolated = line.filter((point, i) => point[1] !== null && line[i - 1]?.[1] == null && line[i + 1]?.[1] == null)
      .map(([index, value]) => [index, value as number] as [number, number])
    return { line, isolated }
  }
  const intervals = points.slice(1).map((point, i) => point.time - points[i]!.time).filter(ms => ms > 0).sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)] ?? baseInterval
  const cadence = Math.max(baseInterval, Math.min(median, baseInterval * 2))
  const maxBridge = cadence * 2.5
  const line: LinePoint[] = []

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!
    const previous = points[i - 1]
    const next = points[i + 1]

    // Skip a single missing sample only when its two real neighbours are close.
    if (point.value === null && !point.observationGap && previous?.value != null && next?.value != null && next.time - previous.time <= maxBridge)
      continue

    // A missing run may have no explicit empty records at all.
    if (point.value !== null && previous?.value != null && point.time - previous.time > maxBridge)
      line.push([point.index, null])

    line.push([point.index, point.value])
  }

  const isolated = line.filter((point, i) => point[1] !== null && line[i - 1]?.[1] == null && line[i + 1]?.[1] == null)
    .map(([index, value]) => [index, value as number] as [number, number])
  return { line, isolated }
}

/** Smooth only real points within each connected segment. */
export function smoothPingChartRows(rows: ChartRow[], tasks: { id: number, interval: number }[], hours: number): ChartRow[] {
  const output = [...rows]
  for (const task of tasks) {
    const key = String(task.id)
    const { line } = buildPingLine(rows, key, task.interval, hours)
    let indices: number[] = []
    const flush = () => {
      if (!indices.length)
        return
      const smoothed = cutPeakValues(indices.map(index => rows[index]!), [key], 0.3, 15, 0.3, true)
      for (const [i, index] of indices.entries())
        output[index] = { ...output[index], [key]: smoothed[i]![key] }
      indices = []
    }
    for (const [index, value] of line) {
      if (value === null)
        flush()
      else
        indices.push(index)
    }
    flush()
  }
  return output
}

/** Construct the actual ECharts series for every time range. */
export function createPingSeries(rows: ChartRow[], task: { id: number, name: string, interval: number }, hours: number, color: string, showDelay: boolean, smooth: boolean) {
  const taskLine = buildPingLine(rows, String(task.id), task.interval, hours)
  const toTime = ([index, value]: [number, number | null]): [number, number | null] => [Date.parse(String(rows[index]!.time)), value]
  return [{
    name: task.name,
    type: 'line' as const,
    xAxisIndex: 0,
    yAxisIndex: 0,
    data: showDelay ? taskLine.line.map(toTime) : [],
    smooth: showDelay ? (smooth ? 0.6 : 0.1) : 0,
    showSymbol: false,
    connectNulls: false,
    lineStyle: { width: showDelay ? 1.5 : 0, color, cap: 'round' as const },
    itemStyle: { color, opacity: showDelay ? 1 : 0 },
  }, {
    name: task.name,
    type: 'scatter' as const,
    xAxisIndex: 0,
    yAxisIndex: 0,
    data: showDelay ? taskLine.isolated.map(toTime) : [],
    symbolSize: 5,
    silent: true,
    tooltip: { show: false },
    itemStyle: { color },
  }]
}
