import type { RpcCall } from '../../src/features/resource-insights/types/history'
import type { NodeData } from '../../src/stores/nodes'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { effectScope, nextTick } from 'vue'
import { useTrafficTrend } from '../../src/features/resource-insights/composables/useTrafficTrend'
import { fetchHistoryCapabilities } from '../../src/features/resource-insights/services/historyCapabilities'
import { buildRecentNaturalDayKeys, resolveAnalyticsTimeZone } from '../../src/features/resource-insights/services/trafficAggregator'
import { resolveTrafficHistory } from '../../src/features/resource-insights/services/trafficHistoryQuery'
import { getSharedRpc, resetSharedRpc } from '../../src/utils/rpc'

const now = Date.parse('2026-11-15T12:00:00Z')
const timeZone = 'Asia/Shanghai'
const hour = 3600000

it('reuses explicit timezone formatters for a 20-node week while preserving hourly evidence', async () => {
  const native = Intl.DateTimeFormat
  let constructions = 0
  let queries = 0
  Intl.DateTimeFormat = new Proxy(native, {
    apply(target, receiver, args) {
      constructions++
      return Reflect.apply(target, receiver, args)
    },
    construct(target, args) {
      constructions++
      return Reflect.construct(target, args)
    },
  })
  try {
    const entityIds = Array.from({ length: 20 }, (_, i) => `fixture-${i}`)
    const dates = buildRecentNaturalDayKeys(7, timeZone, now)
    const result = await resolveTrafficHistory({
      entityIds,
      dates,
      timeZone,
      nowMs: now,
      gateway: {
        async queryTraffic(query: { start: string, end: string }) {
          queries++
          const start = Date.parse(query.start)
          const end = Date.parse(query.end)
          const points = Array.from({ length: Math.ceil((end - start) / hour) }, (_, index) => ({
            time: new Date(start + index * hour).toISOString(),
            value: 1024,
          }))
          return {
            kind: 'metrics' as const,
            retentionDays: 30,
            series: entityIds.flatMap(entityId => ['traffic.up', 'traffic.down'].map(metricKey => ({
              metricKey,
              entityId,
              intervalSeconds: 3600,
              retentionDays: 30,
              aggregation: 'sum',
              points,
            }))),
          }
        },
      },
    })
    assert.equal(queries, 1)
    assert.equal(result.sourceKind, 'metrics')
    assert.equal(result.retentionDays, 30)
    assert.equal(result.evidence.length, 20)
    assert.equal(result.evidence[0]!.deltas.length, 164)
    assert.equal(result.evidence[0]!.deltas[0]?.uploadBytes, 1024)
    assert.equal(result.evidence[0]!.deltas[0]?.downloadBytes, 1024)
    assert.deepEqual(result.coarseDates, [])
    assert.deepEqual(result.failedDates, [])
    assert.ok(constructions <= 2, 'the explicit timezone should not construct a formatter per sample')
  }
  finally {
    Intl.DateTimeFormat = native
  }
})

it('validates explicit time zones and respects the supplied browser time zone', () => {
  assert.equal(resolveAnalyticsTimeZone('browser', 'America/New_York'), 'America/New_York')
  assert.equal(resolveAnalyticsTimeZone('Asia/Shanghai', 'invalid'), 'Asia/Shanghai')
  assert.throws(() => resolveAnalyticsTimeZone('browser', ''), RangeError)
  assert.throws(() => resolveAnalyticsTimeZone('Invalid/Zone'), RangeError)
})

it('coalesces capability probes, caches the result and supports a forced refresh', async () => {
  const first = Promise.withResolvers<unknown[]>()
  let requests = 0
  const call = (async () => {
    requests++
    return requests === 1 ? first.promise : [{ name: 'traffic.up', retention_days: 3 }]
  }) as RpcCall
  const ordinary = fetchHistoryCapabilities(call, { bypassCache: true })
  const forced = fetchHistoryCapabilities(call, { bypassCache: true })
  assert.equal(requests, 1)
  first.resolve([{ name: 'traffic.up', retention_days: 30 }, { name: 'traffic.down', retention_days: 45 }])
  assert.equal(await ordinary, await forced)
  const cached = await fetchHistoryCapabilities(call)
  assert.equal(cached.supports30dTraffic, true)
  assert.equal(cached.trafficRetentionDays, 30)
  assert.equal(requests, 1)

  const refreshed = await fetchHistoryCapabilities(call, { bypassCache: true })
  assert.equal(requests, 2)
  assert.equal(refreshed.supports30dTraffic, null)
  assert.equal(refreshed.trafficRetentionDays, null)
})

it('starts seven-day requests immediately and cancels stale leases on node change, manual refresh and disposal', async () => {
  const realNow = Date.now
  Date.now = () => now
  resetSharedRpc()
  const definitions = Promise.withResolvers<unknown[]>()
  const pending: { ids: string[], signal: AbortSignal, settle: () => void }[] = []
  getSharedRpc().call = (async (method, params, options) => {
    if (method === 'public:listMetricDefinitions')
      return definitions.promise
    if (method === 'public:queryMetrics') {
      const result = Promise.withResolvers<{ series: unknown[] }>()
      pending.push({ ids: (params as { entity_ids: string[] }).entity_ids, signal: options!.signal!, settle: () => result.resolve({ series: [] }) })
      return result.promise
    }
    return { records: {} }
  }) as RpcCall
  const scope = effectScope()
  try {
    const nodes = [{ uuid: 'first' }, { uuid: 'second' }] as NodeData[]
    const trend = scope.run(() => useTrafficTrend({ nodes: () => nodes }))!
    assert.deepEqual(pending[0]?.ids, ['first', 'second'])
    trend.selectedEntity.value = 'second'
    await nextTick()
    assert.equal(pending[0]!.signal.aborted, true)
    assert.deepEqual(pending[1]?.ids, ['second'])
    pending[0]!.settle()

    const refresh = trend.refresh()
    assert.equal(pending[1]!.signal.aborted, true)
    assert.deepEqual(pending[2]?.ids, ['second'])
    scope.stop()
    assert.equal(pending[2]!.signal.aborted, true)
    pending[1]!.settle()
    pending[2]!.settle()
    await refresh
  }
  finally {
    scope.stop()
    definitions.resolve([])
    for (const request of pending)
      request.settle()
    Date.now = realNow
    resetSharedRpc()
  }
})
