import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { buildStats } from '../../src/composables/useNodePingStats'
import { evaluateProviderScore } from '../../src/features/ipqa/formatters'
import { parseHomePingLineCount, parseHomePingTaskOrder, selectHomePingTasks } from '../../src/utils/homePingSettings'
import { fillMissingTimePoints, insertObservationGaps } from '../../src/utils/recordHelper'

it('only actual probes enter loss aggregation; online full-loss tasks remain visible', () => {
  const sample = { client: 'n', time: '2026-10-22T00:00:00Z' }
  const records = [{ ...sample, task_id: 1, value: 20 }, { ...sample, task_id: 2, value: -1 }, { ...sample, task_id: 3, value: -999 }]
  const stats = buildStats(records, [])
  assert.equal(stats.avgLoss, 50)
  assert.equal(stats.perTaskStats.length, 2)
  assert.equal(buildStats([records[2]!], []).hasData, false)
  const failed = buildStats([records[1]!], [])
  assert.equal(failed.avgLoss, 100)
  assert.equal(failed.avgLatency, -1)
})

it('uses fixed three-minute ping buckets and leaves missing intervals empty', () => {
  const now = Date.parse('2026-10-22T12:01:00Z')
  const sample = { client: 'n', task_id: 1 }
  const records = [
    { ...sample, time: '2026-10-22T11:32:59Z', value: 999 },
    { ...sample, time: '2026-10-22T11:54:00Z', value: 30 },
    { ...sample, time: '2026-10-22T11:56:59Z', value: -1 },
    { ...sample, time: '2026-10-22T12:00:30Z', value: 20 },
    { ...sample, time: '2026-10-22T12:02:00Z', value: 500 },
  ]
  const tasks = [{ id: 1, name: 'Ping', clients: ['n'] }]
  const window = { bucketMs: 180_000, now }
  const history = buildStats(records, tasks, 'n', window).perTaskStats[0]!.history
  assert.equal(history.length, 10)
  assert.equal(history[0]!.time, '2026-10-22T11:33:00.000Z')
  assert.equal(history[7]!.time, '2026-10-22T11:54:00.000Z')
  assert.deepEqual([history[7]!.latency, history[7]!.loss], [30, 50])
  assert.deepEqual([history[8]!.latency, history[8]!.loss], [null, null])
  assert.deepEqual([history[9]!.latency, history[9]!.loss], [20, 0])
  const beforeBoundary = buildStats(records, tasks, 'n', { ...window, now: now + 119_000 }).perTaskStats[0]!.history
  const afterBoundary = buildStats(records, tasks, 'n', { ...window, now: now + 120_000 }).perTaskStats[0]!.history
  assert.equal(beforeBoundary[0]!.time, history[0]!.time)
  assert.equal(afterBoundary[0]!.time, '2026-10-22T11:36:00.000Z')
})

it('fills the shared card slots from the node assignments in Komari order', () => {
  const tasks = [
    { id: 4, name: 'Fallback', clients: ['n'] },
    { id: 1, name: 'Renamed', clients: ['n'] },
    { id: 3, name: 'Other node', clients: ['other'] },
    { id: 2, name: 'Previous name', clients: ['n'] },
  ]
  const sample = { client: 'n', time: '2026-10-22T00:00:00Z' }
  const { perTaskStats } = buildStats([
    { ...sample, task_id: 1, value: 15 },
    { ...sample, task_id: 3, value: 85 },
    { ...sample, task_id: 2, value: -1 },
  ], tasks, 'n')

  const ids = parseHomePingTaskOrder('[3,1,1]')
  const selected = selectHomePingTasks(perTaskStats, parseHomePingLineCount('6'), ids, [])
  assert.deepEqual(selected.map(task => task?.taskId ?? null), [1, 4, 2, null, null, null])
  assert.deepEqual(selected.map(task => task?.loss ?? null), [0, null, 100, null, null, null])
  assert.deepEqual(selected[0]?.history.map(point => point.latency), [15])
  assert.deepEqual(selected[1]?.history, [])
  assert.deepEqual(selected[2]?.history.map(point => [point.latency, point.loss]), [[null, 100]])
  assert.deepEqual(selectHomePingTasks(perTaskStats, 1, [], ['Previous name']).map(task => task?.taskId), [2])
  assert.deepEqual(parseHomePingTaskOrder('4,1'), [4, 1])
  assert.equal(parseHomePingLineCount('7'), 3)
})

it('load alignment preserves the nearest real peak rather than repeating an old sample', () => {
  const samples = [{ time: '2026-10-22T00:00:00Z', cpu: 10 }, { time: '2026-10-22T00:01:00Z', cpu: 90 }]
  assert.deepEqual(fillMissingTimePoints(samples, 60, null, 120).map(row => row.cpu), [10, 90])
  assert.equal(evaluateProviderScore('IPQS', 'request failed').category, 'Unknown')
})

it('a reboot gap stays unobserved while actual failed probes stay failures', () => {
  const rows = [{ time: '2026-10-22T00:00:00Z', 1: 20 }, { time: '2026-10-22T00:10:00Z', 1: -1 }]
  const result = insertObservationGaps(rows, ['1'], 60_000)
  assert.equal(result.length, 3)
  assert.equal(result[1]?.[1], null)
  assert.equal(result[2]?.[1], -1)
})
