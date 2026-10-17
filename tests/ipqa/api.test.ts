import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { fetchFleetOverview, fetchNodeArchivePage, IpqaApiError } from '../../src/features/ipqa/services/api'
import { getSharedRpc, resetSharedRpc } from '../../src/utils/rpc'

it('iPQA transport distinguishes missing plugin, failed updates, empty data and pagination', async () => {
  const originalFetch = globalThis.fetch
  resetSharedRpc()
  const rpc = getSharedRpc()
  try {
    globalThis.fetch = async () => new Response('', { status: 404 })
    rpc.call = async () => {
      throw Object.assign(new Error('Method not found'), { code: -32601 })
    }
    await assert.rejects(fetchFleetOverview(), (error: unknown) => error instanceof IpqaApiError && error.kind === 'not-installed')
    globalThis.fetch = async () => new Response('', { status: 500 })
    await assert.rejects(fetchFleetOverview(), (error: unknown) => error instanceof IpqaApiError && error.kind === 'unavailable')
    rpc.call = async () => null as any
    assert.equal(await fetchFleetOverview(), null)
    let url = ''
    globalThis.fetch = async (input) => {
      url = String(input)
      return Response.json({ dates: ['2026-09-01'], hasMore: false })
    }
    assert.deepEqual(await fetchNodeArchivePage('n', 30, '2026-09-02'), { dates: ['2026-09-01'], hasMore: false })
    assert.ok(url.includes('before=2026-09-02'))

    let overviewUrl = ''
    globalThis.fetch = async (input) => {
      overviewUrl = String(input)
      return Response.json({ schema_version: 1, total_nodes: 1, ipqa_nodes: 1, nodes_with_risk: 0, nodes_with_changes_today: 0, latest_archive_date: null, nodes: [] })
    }
    const filteredRes = await fetchFleetOverview(['node-tokyo', 'node-osaka'])
    assert.ok(overviewUrl.includes('uuids=node-tokyo%2Cnode-osaka'))
    assert.strictEqual(filteredRes?.schema_version, 1)
  }
  finally {
    globalThis.fetch = originalFetch
    resetSharedRpc()
  }
})
