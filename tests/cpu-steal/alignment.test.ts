import assert from 'node:assert/strict'
import { alignStealToTimeline } from '../../src/features/cpu-steal/alignment'

const start = Date.parse('2026-11-09T00:00:00.000Z')
const iso = (offset: number) => new Date(start + offset).toISOString()

{ // Real-time observation only inside sampled interval
  const samples = [{ from: start, time: start + 120000, value: 4 }]
  assert.deepEqual(alignStealToTimeline([iso(0), iso(30000), iso(120000), iso(123000)], samples, 0), [4, 4, 4, null])
}

{ // Historical aggregation uses native 15-minute buckets
  const samples = [
    { from: start, time: start + 450000, value: 2 },
    { from: start + 450000, time: start + 900000, value: 6 },
  ]
  assert.deepEqual(alignStealToTimeline([iso(900000), iso(1800000)], samples, 900000), [4, null])
}

{ // Offline intervals do not fabricate readings
  const samples = [
    { from: start, time: start + 120000, value: 5 },
    { from: start + 600000, time: start + 720000, value: 10 },
  ]
  assert.deepEqual(alignStealToTimeline([iso(300000), iso(660000), iso(900000)], samples, 0), [null, 10, null])
}
