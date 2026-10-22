import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { buildStats } from '../../src/composables/useNodePingStats'
import { evaluateProviderScore } from '../../src/features/ipqa/formatters'
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
