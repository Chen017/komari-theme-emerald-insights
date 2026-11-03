import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import * as echarts from 'echarts'
import { buildPingLine, createPingSeries, smoothPingChartRows } from '../../src/utils/pingChartSeries'
import { cutPeakValues, insertObservationGaps } from '../../src/utils/recordHelper'

const start = Date.parse('2026-11-03T00:00:00Z')
function row(minute: number, value: number | null, task = '1') {
  return { time: new Date(start + minute * 60_000).toISOString(), [task]: value }
}

it('bridges one missing probe but breaks at two, in both short views', () => {
  for (const hours of [1, 6]) {
    const rows = [row(0, 10), row(1, null), row(2, 20), row(3, null), row(4, null), row(5, 30)]
    const result = buildPingLine(rows, '1', 60, hours)
    assert.deepEqual(result.line, [[0, 10], [2, 20], [3, null], [4, null], [5, 30]])
    assert.deepEqual(result.isolated, [[5, 30]])
    assert.equal(rows[1]?.['1'], null)
  }
})

it('keeps valid points isolated when required and ignores timestamps belonging to another task', () => {
  const rows = [row(0, 10), row(0.3, 100, '2'), row(1, 20), row(1.3, 110, '2'), row(2, null), row(3, null), row(4, 30)]
  const result = buildPingLine(rows, '1', 60, 1)
  assert.deepEqual(result.line, [[0, 10], [2, 20], [4, null], [5, null], [6, 30]])
  assert.deepEqual(result.isolated, [[6, 30]])
  assert.deepEqual(buildPingLine([row(0, 10)], '1', 60, 1).isolated, [[0, 10]])
})

it('does not bridge long gaps with or without synthetic gap rows', () => {
  const rows = [row(0, 10), row(10, 20)]
  assert.deepEqual(buildPingLine(rows, '1', 60, 1).line, [[0, 10], [1, null], [1, 20]])
  const withGap = insertObservationGaps(rows, ['1'], 60_000)
  assert.deepEqual(buildPingLine(withGap, '1', 60, 1).line, [[0, 10], [1, null], [2, 20]])
})

it('smoothing does not turn gaps or another task timestamp into measurements', () => {
  const rows = [row(0, 10), row(1, null), row(2, 20), row(2.5, 100, '2'), row(3, 30)]
  const result = cutPeakValues(rows, ['1'], 0.3, 15, 100, true)
  assert.equal(result[1]?.['1'], null)
  assert.equal(result[3]?.['1'], undefined)
  assert.equal(result[2]?.['1'], 20)
})

it('smoothing does not introduce breaks when consecutive real samples are spikes', () => {
  for (const hours of [1, 6, 12]) {
    const rows = [row(0, 35), row(1, 35), row(2, 150), row(3, 160), row(4, 35), row(5, 35), row(6, 35)]
    const smoothed = cutPeakValues(rows, ['1'], 0.3, 15, 0.3, true)
    assert.ok(smoothed.every(item => typeof item['1'] === 'number'))
    assert.ok(smoothed[2]!['1'] < rows[2]!['1']!)
    assert.deepEqual(buildPingLine(smoothed, '1', 60, hours).line.map(point => point[1] === null), buildPingLine(rows, '1', 60, hours).line.map(point => point[1] === null))
  }
})

it('smooths within connected segments and never fills or smooths across a real break', () => {
  const rows = [row(0, 10), row(1, 20), row(2, null), row(3, null), row(4, 100), row(5, 110)]
  const result = smoothPingChartRows(rows, [{ id: 1, interval: 60 }], 1)
  assert.equal(result[1]!['1'], 13)
  assert.equal(result[2]!['1'], null)
  assert.equal(result[3]!['1'], null)
  assert.equal(result[4]!['1'], 100)
  assert.equal(result[5]!['1'], 103)
  assert.equal(rows[1]!['1'], 20)
})

it('renders a 12-hour sparse series as a line while preserving empty tooltip values', () => {
  const rows = Array.from({ length: 720 }, (_, i) => row(i, i % 4 ? null : 40 + i % 13))
  const series = buildPingLine(rows, '1', 60, 12)
  assert.equal(series.line.filter(point => point[1] !== null).length, 180)
  assert.equal(series.isolated.length, 0)
  assert.equal(rows.filter(item => item['1'] === null).length, 540)
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1000, height: 250 })
  try {
    chart.setOption({
      xAxis: { type: 'category', data: rows.map(item => item.time) },
      yAxis: { type: 'value' },
      series: [{ type: 'line', data: series.line, showSymbol: false, connectNulls: false, lineStyle: { color: 'red' } }],
    })
    const path = chart.renderToSVGString().split('\n').find(item => item.includes('stroke="red"')) ?? ''
    assert.ok(path.includes('L'), 'valid points should produce visible line segments')
    assert.equal((path.match(/M/g) ?? []).length, 1, 'regular sparse samples should form one line')
  }
  finally {
    chart.dispose()
  }
})

it('the 12-hour line stays broken across a long interruption', () => {
  const rows = Array.from({ length: 720 }, (_, i) => row(i, i >= 300 && i < 360 ? null : i % 4 ? null : 40))
  const series = buildPingLine(rows, '1', 60, 12)
  assert.equal(series.line.filter(point => point[1] === null).length, 1)
  assert.equal(series.isolated.length, 0)
})

it('renders every available time range with multiple offset tasks and either smoothing setting', () => {
  const task1 = { id: 1, name: 'A', interval: 60 }
  const task2 = { id: 2, name: 'B', interval: 60 }
  for (const hours of [1, 6, 12, 24, 168, 720, 1440, 2160]) {
    const interval = Math.max(60_000, hours * 3600_000 / 700)
    const count = Math.min(700, Math.round(hours * 3600_000 / interval))
    const rows = Array.from({ length: count }, (_, i) => [
      { time: new Date(start + Math.round(i * interval)).toISOString(), 1: i % 5 === 2 ? null : 35 + i % 7 },
      { time: new Date(start + Math.round(i * interval + interval / 3)).toISOString(), 2: 70 + i % 11 },
    ]).flat()
    for (const smooth of [false, true]) {
      const chartRows = smooth ? smoothPingChartRows(rows, [task1, task2], hours) : rows
      const options = [
        ...createPingSeries(chartRows, task1, hours, 'red', true, smooth),
        ...createPingSeries(chartRows, task2, hours, 'blue', true, smooth),
      ]
      assert.ok(options[0]!.data.length > 2, `${hours}h must retain task A data`)
      assert.equal(options[1]!.data.length, 0, `${hours}h should not fragment task A into isolated dots`)
      assert.equal(options[3]!.data.length, 0, `${hours}h should not fragment task B into isolated dots`)
      const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1000, height: 250 })
      try {
        chart.setOption({
          xAxis: { type: 'time' },
          yAxis: { type: 'value' },
          series: options,
        })
        const svg = chart.renderToSVGString()
        for (const color of ['red', 'blue']) {
          const path = svg.split('\n').find(item => item.includes(`stroke="${color}"`)) ?? ''
          assert.match(path, /[LC]/, `${hours}h, smooth=${smooth}, ${color}: expected a visible line`)
          assert.equal((path.match(/M/g) ?? []).length, 1, `${hours}h, smooth=${smooth}, ${color}: expected continuous line`)
        }
      }
      finally {
        chart.dispose()
      }
    }
  }
  assert.ok(createPingSeries([row(0, 30)], task1, 720, 'red', false, false).every(series => series.data.length === 0))
})

it('places unevenly spaced observations according to elapsed time', () => {
  const rows = [row(0, 35), row(60, 36), row(1440, 37)]
  const options = createPingSeries(rows, { id: 1, name: 'A', interval: 60 }, 720, 'red', true, false)
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1000, height: 250 })
  try {
    chart.setOption({ xAxis: { type: 'time', min: start, max: start + 86400_000 }, yAxis: { type: 'value' }, series: options })
    const x0 = chart.convertToPixel({ xAxisIndex: 0 }, start)
    const x1 = chart.convertToPixel({ xAxisIndex: 0 }, start + 3600_000)
    const x24 = chart.convertToPixel({ xAxisIndex: 0 }, start + 86400_000)
    assert.ok(Math.abs((x1 - x0) / (x24 - x0) - 1 / 24) < 0.001)
    assert.equal(options[0]!.data[0]![0], start)
    assert.equal(options[0]!.data.at(-1)![0], start + 86400_000)
  }
  finally {
    chart.dispose()
  }
})

it('keeps a long outage visible at seven and thirty days', () => {
  for (const hours of [168, 720]) {
    const interval = hours * 3600_000 / 700
    const rows = Array.from({ length: 700 }, (_, i) => ({
      time: new Date(start + Math.round(i * interval)).toISOString(),
      1: i >= 250 && i < 275 ? null : 40,
    }))
    const line = buildPingLine(rows, '1', 60, hours).line
    assert.equal(line.filter(point => point[1] === null).length, 1, `${hours}h outage must remain a gap`)
  }
})

it('connects daily aggregated observations in long views, including synthetic gap rows', () => {
  for (const hours of [168, 720, 1440, 2160]) {
    const days = hours / 24
    const original = Array.from({ length: days }, (_, i) => row(i * 24 * 60, 35 + i % 5))
    const rows = insertObservationGaps(original, ['1'], hours * 3600_000 / 700)
    for (const smooth of [false, true]) {
      const data = smooth ? smoothPingChartRows(rows, [{ id: 1, interval: 60 }], hours) : rows
      const [line, dots] = createPingSeries(data, { id: 1, name: 'Daily', interval: 60 }, hours, 'red', true, smooth)
      assert.equal(line!.data.filter(point => point[1] !== null).length, days)
      assert.equal(line!.data.filter(point => point[1] === null).length, 0, `${hours}h daily values should connect`)
      assert.equal(dots!.data.length, 0, `${hours}h daily values must not become isolated points`)
      if (smooth)
        assert.notEqual(data[2]!['1'], rows[2]!['1'], 'daily values must actually be smoothed')
    }
  }
})

it('keeps a long outage between daily aggregated observations as a gap', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i * 24 * 60, i >= 12 && i < 18 ? null : 40))
  const line = buildPingLine(rows, '1', 60, 720).line
  assert.equal(line.filter(point => point[1] === null).length, 1)
})

it('connects a series that changes from daily to hourly aggregation', () => {
  const daily = Array.from({ length: 25 }, (_, i) => row(i * 24 * 60, 40 + i % 3))
  const hourly = Array.from({ length: 120 }, (_, i) => row((25 * 24 + i) * 60, 40 + i % 3))
  const result = buildPingLine([...daily, ...hourly], '1', 60, 720)
  assert.equal(result.line.filter(point => point[1] === null).length, 0)
  assert.equal(result.isolated.length, 0)
})

it('connects two recent daily values using the metric bucket cadence', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i * 24 * 60, i < 28 ? null : 108 + i % 2))
  const withSyntheticGaps = insertObservationGaps(rows, ['1'], 720 * 3600_000 / 700)
  const result = buildPingLine(withSyntheticGaps, '1', 60, 720)
  assert.equal(result.line.filter(point => point[1] !== null).length, 2)
  assert.equal(result.line.filter(point => point[1] === null).length, 0)
  assert.equal(result.isolated.length, 0)
})
