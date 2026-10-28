import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { effectScope, nextTick, ref } from 'vue'
import { useNodePingStats } from '../../src/composables/useNodePingStats'
import { getSharedRpc, resetSharedRpc } from '../../src/utils/rpc'

it('retains ping stats through live node updates while still switching nodes and enable state', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  resetSharedRpc()
  const rpc = getSharedRpc()
  let calls = 0
  rpc.getClient().call = async () => {
    calls++
    return { records: [{ client: 'a', task_id: 1, time: '2026-10-28T00:00:00Z', value: 35 }], tasks: [{ id: 1, name: 'Ping' }] } as any
  }
  const node = ref({ uuid: 'a', cpu: 10 })
  const enabled = ref(true)
  const scope = effectScope()
  try {
    const state = scope.run(() => useNodePingStats(() => node.value.uuid, { hours: 1, enabled }))!
    await nextTick()
    await nextTick()
    const first = state.stats.value
    assert.equal(first.avgLatency, 35)
    for (let i = 0; i < 10; i++) {
      node.value = { uuid: 'a', cpu: i }
      await nextTick()
      assert.equal(state.stats.value, first)
    }
    assert.equal(calls, 1)
    node.value = { uuid: 'b', cpu: 0 }
    await nextTick()
    assert.equal(state.stats.value.hasData, false)
    enabled.value = false
    await nextTick()
    assert.equal(state.stats.value.hasData, false)
    node.value = { uuid: 'a', cpu: 0 }
    enabled.value = true
    await nextTick()
    assert.equal(state.stats.value.avgLatency, 35)
  }
  finally {
    scope.stop()
    resetSharedRpc()
  }
})
