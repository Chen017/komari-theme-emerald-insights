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
  }
  finally {
    globalThis.fetch = originalFetch
    resetSharedRpc()
  }
})
