import assert from 'node:assert/strict'
import { fetchCpuStealHistory } from '../../src/features/cpu-steal/api'

// Emerald Insights is an optional consumer of the standalone history v1 API.
const previousFetch = globalThis.fetch
async function withFetch(stub: typeof globalThis.fetch, work: () => Promise<void>) {
  globalThis.fetch = stub
  try {
    await work()
  }
  finally {
    globalThis.fetch = previousFetch
  }
}

await withFetch(async (url, options) => {
  assert.ok(String(url).startsWith('/api/plugin/cpu-steal-monitor/v1/history?'))
  assert.ok(String(url).includes('uuid=node-A'))
  assert.equal((options as RequestInit).cache, 'no-store')
  return {
    ok: true,
    json: async () => ({
      schemaVersion: 1,
      uuid: 'node-A',
      intervalSeconds: 120,
      samples: [
        { from: 120000, time: 240000, value: 2.5 },
        { from: 0, time: 120000, value: 0 },
        { from: 240000, time: 360000, value: 150 },
        { from: 0, time: 10, value: Number.NaN },
      ],
    }),
  } as Response
}, async () => {
  const samples = await fetchCpuStealHistory('node-A', 0, 240000)
  assert.deepEqual(samples, [
    { from: 0, time: 120000, value: 0 },
    { from: 120000, time: 240000, value: 2.5 },
  ])
})

await withFetch(async () => ({ ok: false, status: 404 }) as Response, async () => {
  assert.deepEqual(await fetchCpuStealHistory('node-A', 0, 240000), [])
})

await withFetch(async () => {
  throw new Error('connection refused')
}, async () => {
  assert.deepEqual(await fetchCpuStealHistory('node-A', 0, 240000), [])
})

await withFetch(async () => ({
  ok: true,
  json: async () => ({ schemaVersion: 2, uuid: 'node-A', samples: [] }),
}) as Response, async () => {
  assert.deepEqual(await fetchCpuStealHistory('node-A', 0, 240000), [])
})
