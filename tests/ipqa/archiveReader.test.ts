import type { IpqaDailyPairedReport } from '../../src/features/ipqa/types'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { createArchiveReader } from '../../src/features/ipqa/services/archiveReader'

const report = (date: string) => ({ date }) as IpqaDailyPairedReport

it('shares pending reads, bounds cached reports, expires data and isolates nodes', async () => {
  let calls = 0
  let now = 0
  const reader = createArchiveReader(async (_uuid, date) => {
    calls++
    return report(date)
  }, { maxEntries: 2, ttlMs: 30, now: () => now })
  const first = reader.read('a', '2026-10-01')
  assert.equal(reader.read('a', '2026-10-01'), first)
  await first
  await reader.read('a', '2026-10-01')
  assert.equal(calls, 1)
  await reader.read('b', '2026-10-01')
  await reader.read('a', '2026-10-02')
  await reader.read('a', '2026-10-01')
  assert.equal(calls, 4)
  now = 31
  await reader.read('a', '2026-10-01')
  assert.equal(calls, 5)
})

it('retries missing/failed/mismatched reports and clears reads on refresh or node change', async () => {
  let calls = 0
  const reader = createArchiveReader(async (_uuid, date) => {
    calls++
    if (calls === 1)
      throw new Error('offline')
    if (calls === 2)
      return null
    if (calls === 3)
      return report('2026-10-02')
    return report(date)
  })
  await assert.rejects(reader.read('a', '2026-10-01'))
  assert.equal(await reader.read('a', '2026-10-01'), null)
  await reader.read('a', '2026-10-01')
  await reader.read('a', '2026-10-01')
  assert.equal(calls, 4)
  reader.clear()
  await reader.read('a', '2026-10-01')
  assert.equal(calls, 5)
})

it('does not repopulate the cache with a stale in-flight response after clear', async () => {
  let finish: (value: IpqaDailyPairedReport) => void = () => {}
  let calls = 0
  const reader = createArchiveReader(async () => {
    calls++
    return new Promise<IpqaDailyPairedReport>((resolve) => {
      finish = resolve
    })
  })
  const stale = reader.read('a', '2026-10-01')
  reader.clear()
  finish(report('2026-10-01'))
  await stale
  const fresh = reader.read('a', '2026-10-01')
  assert.equal(calls, 2)
  finish(report('2026-10-01'))
  await fresh
})
