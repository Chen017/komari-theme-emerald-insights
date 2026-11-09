import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatRealSteal, scaleStealForChart, STEAL_DISPLAY_MULTIPLIER } from '../../src/features/cpu-steal/display'

test('Steal plotted values are 10x with a hard 100% saturation', () => {
  assert.equal(STEAL_DISPLAY_MULTIPLIER, 10)
  assert.deepEqual([0, 0.01, 0.1, 1, 5, 10, 20, 100].map(scaleStealForChart),
    [0, 0.1, 1, 10, 50, 100, 100, 100])
})

test('invalid and absent samples stay missing, not zero', () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(scaleStealForChart(value), null)
  assert.equal(formatRealSteal(null), '-%')
})

test('tooltip retains the real measurements even where the line is capped', () => {
  const actual: Array<number | null> = [0, 0.1, 1, 10, 20, null]
  const plotted = actual.map(scaleStealForChart)
  assert.deepEqual(plotted, [0, 1, 10, 100, 100, null])
  assert.deepEqual(actual.map(formatRealSteal),
    ['0.00%', '0.10%', '1.00%', '10.00%', '20.00%', '-%'])
})
