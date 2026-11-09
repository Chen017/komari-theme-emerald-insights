import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- Tests use Node's built-in runner, not Vitest.
import { test } from 'node:test'
import { DEFAULT_STEAL_MULTIPLIER, formatRealSteal, scaleStealForChart, STEAL_MULTIPLIERS } from '../../src/features/cpu-steal/display'

test('user-selectable magnification factors and default ×10', () => {
  assert.deepEqual([...STEAL_MULTIPLIERS], [1, 5, 10, 20, 50])
  assert.equal(DEFAULT_STEAL_MULTIPLIER, 10)
  for (const multiplier of STEAL_MULTIPLIERS) {
    assert.equal(scaleStealForChart(0, multiplier), 0)
    assert.equal(scaleStealForChart(1, multiplier), Math.min(100, multiplier))
    assert.equal(scaleStealForChart(10, multiplier), Math.min(100, 10 * multiplier))
    assert.equal(scaleStealForChart(100, multiplier), 100)
  }
  assert.equal(scaleStealForChart(1), 10)
})

test('display-only saturation preserves absent readings and true zero', () => {
  for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(scaleStealForChart(v, 50), null)
  assert.equal(scaleStealForChart(0, 50), 0)
  assert.equal(scaleStealForChart(20, 50), 100)
})

test('tooltip retains unscaled original numbers after chart saturation', () => {
  const actual: Array<number | null> = [0, 0.1, 1, 10, 20, null]
  assert.deepEqual(actual.map(value => scaleStealForChart(value, 10)), [0, 1, 10, 100, 100, null])
  assert.deepEqual(actual.map(formatRealSteal), ['0.00%', '0.10%', '1.00%', '10.00%', '20.00%', '-%'])
})
