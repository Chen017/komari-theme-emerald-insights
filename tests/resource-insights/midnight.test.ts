import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { effectScope } from 'vue'
import { useTrafficTrend } from '../../src/features/resource-insights/composables/useTrafficTrend'
import { getSharedRpc, resetSharedRpc } from '../../src/utils/rpc'

it('manual refresh advances the traffic window after Beijing midnight', async () => {
  const originalNow = Date.now
  let now = Date.parse('2026-10-05T15:59:00Z')
  Date.now = () => now
  resetSharedRpc()
  const scope = effectScope()
  const rpc = getSharedRpc()
  rpc.call = async (method: string) => {
    if (method === 'public:listMetricDefinitions')
      return [{ name: 'traffic.up', retention_days: 30 }, { name: 'traffic.down', retention_days: 30 }] as any
    if (method === 'public:queryMetrics')
      return { series: [] } as any
    return { records: {} } as any
  }
  try {
    const trend = scope.run(() => useTrafficTrend({ nodes: () => [{ uuid: 'midnight', name: 'Midnight' }] as any }))!
    await new Promise(r => setTimeout(r, 40))
    assert.equal(trend.snapshot.value.days.at(-1)?.date, '2026-10-05')
    now = Date.parse('2026-10-05T16:01:00Z')
    await trend.refresh()
    assert.equal(trend.snapshot.value.days.at(-1)?.date, '2026-10-06')
  }
  finally {
    scope.stop()
    Date.now = originalNow
    resetSharedRpc()
  }
})
