import type { HistoryEntry } from '../../src/features/ipqa/history'
import type { IpqaDailyPairedReport, IpqaNormalizedReport } from '../../src/features/ipqa/types'
import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { describe, it } from 'node:test'
import { buildTimeline, compareSnapshots, historyFieldLabel, historySections, projectSnapshot, sampleChangeAware } from '../../src/features/ipqa/history'
import { loadArchiveHistory } from '../../src/features/ipqa/services/archiveHistory'

function report(date: string, patch: Partial<IpqaNormalizedReport> = {}): IpqaDailyPairedReport {
  const normalized: IpqaNormalizedReport = {
    schemaVersion: 1,
    ipVersion: 'IPv4',
    archiveId: date,
    date,
    timestamp: `${date}T00:00:00Z`,
    info: { ip: '192.0.2.1', type: '原生' },
    scores: { IPQS: 10 },
    type: { usage: { IPQS: 'Residential' }, company: { IPQS: 'ISP' } },
    factors: { Proxy: { IPQS: false } },
    media: { Netflix: { status: 'Yes', region: 'US' } },
    mail: { DNSBlacklist: { Blacklisted: 0, Total: 10 }, Port25: true },
    extra: {},
    ...patch,
  }
  return {
    schemaVersion: 1,
    nodeUuid: 'node-a',
    date,
    updatedAt: normalized.timestamp,
    v4: normalized,
    v6: null,
    summary: { hasV4: true, hasV6: false, highestRiskCategory: 'Low', highestRiskSource: 'IPQS', mediaSummary: {}, aiSummary: {} },
  }
}
function entry(date: string, patch: Partial<IpqaNormalizedReport> = {}): HistoryEntry {
  return { date, report: report(date, patch) }
}

describe('IPQA project histories and snapshot comparison', () => {
  it('labels data sources clearly while preserving dynamic providers', () => {
    assert.equal(historyFieldLabel('type.usage.IPQS'), '使用类型 · IPQS')
    assert.equal(historyFieldLabel('factors.VPN.NewEngine'), 'VPN · NewEngine')
    assert.equal(historyFieldLabel('media.Netflix.region'), 'Netflix · 解锁地区')
    assert.equal(historyFieldLabel('mail.DNSBlacklist.Blacklisted'), 'DNSBL · 命中数')
    assert.equal(historyFieldLabel('scores.NewEngine'), 'NewEngine')
  })

  it('avoids numeric/string score noise but detects classified risk changes', () => {
    const a = entry('2026-10-01')
    const b = entry('2026-10-02', { scores: { IPQS: '10' } })
    assert.deepEqual(compareSnapshots(a, b, 'IPv4', 'score'), [])
    b.report!.v4!.classifiedScores = { IPQS: { provider: 'IPQS', rawValue: 10, numericValue: 10, unit: 'score', available: true, categoryKey: 'High', categoryLabel: '高风险', rank: 3, alertSeverity: 'WARNING' } }
    assert.equal(compareSnapshots(a, b, 'IPv4', 'score').length, 1)
  })

  it('preserves unknown future media statuses as actual attributes', () => {
    const a = entry('2026-10-01', { media: { NewService: { status: 'Pending Review' } } })
    const b = entry('2026-10-02', { media: { NewService: { status: 'Provider Timeout' } } })
    assert.equal(compareSnapshots(a, b, 'IPv4', 'media').length, 1)
  })
  it('keeps project change dates independent and detects same-category score movement', () => {
    const entries = [entry('2026-10-01'), entry('2026-10-02', { scores: { IPQS: 11 } }), entry('2026-10-03', { scores: { IPQS: 11 }, media: { Netflix: { status: 'No', region: 'US' } } })]
    assert.deepEqual(buildTimeline(entries, 'IPv4', 'score').map(point => point.changed), [false, true, false])
    assert.deepEqual(buildTimeline(entries, 'IPv4', 'media').map(point => point.changed), [false, false, true])
    assert.deepEqual(buildTimeline(entries, 'IPv4', 'dnsbl').map(point => point.changed), [false, false, false])
  })

  it('ignores timestamp and object insertion order noise', () => {
    const before = entry('2026-10-01')
    const after = entry('2026-10-02')
    after.report!.v4!.type = { company: { IPQS: 'ISP' }, usage: { IPQS: 'Residential' }, raw: { timestamp: 'changed' } }
    after.report!.v4!.media.Netflix!.timestamp = 'changed'
    after.report!.v4!.extra = { time: 'changed', something: 'raw-only' }
    for (const section of historySections)
      assert.deepEqual(compareSnapshots(before, after, 'IPv4', section.key), [])
  })

  it('includes all provider usage/company types and newly added/removed factors', () => {
    const before = entry('2026-10-01')
    const after = entry('2026-10-02', { type: { usage: { IPQS: 'Hosting' }, company: {} }, factors: { VPN: { IPQS: true } } })
    assert.equal(compareSnapshots(before, after, 'IPv4', 'type').length, 2)
    const factors = compareSnapshots(before, after, 'IPv4', 'factor')
    assert.deepEqual(factors.map(row => row.field), ['factors.Proxy.IPQS', 'factors.VPN.IPQS'])
    assert.equal(factors[1]!.after!.value, true)
    assert.equal(factors[0]!.before!.value, false)
  })

  it('preserves zero, false, null and missing-data distinctions without invented positives', () => {
    const before = entry('2026-10-01', { scores: { IPQS: null } })
    const after = entry('2026-10-02', { scores: { IPQS: 0 } })
    assert.equal(compareSnapshots(before, after, 'IPv4', 'score')[0]!.after!.value, 0)
    assert.equal(projectSnapshot(after, 'IPv4', 'factor')['factors.Proxy.IPQS']!.value, false)
    assert.equal(projectSnapshot(after, 'IPv4', 'dnsbl')['mail.DNSBlacklist.Blacklisted']!.value, 0)
    assert.deepEqual(compareSnapshots(entry('2026-10-01', { factors: { VPN: { IPQS: null } } }), entry('2026-10-02', { factors: {} }), 'IPv4', 'factor'), [])
  })

  it('normalizes boolean strings from older archives', () => {
    const before = entry('2026-10-01')
    const after = entry('2026-10-02', { factors: { Proxy: { IPQS: 'false' } } })
    assert.deepEqual(compareSnapshots(before, after, 'IPv4', 'factor'), [])
  })

  it('uses existing media status and region logic for DNS unlock, blocked status and ALISG', () => {
    const before = entry('2026-10-01', { media: { TikTok: { status: 'Yes', Type: 'DNS', region: 'AL' } } })
    const equivalent = entry('2026-10-02', { media: { TikTok: { status: '解锁', Type: 'DNS', region: '[ALISG]' } } })
    assert.deepEqual(compareSnapshots(before, equivalent, 'IPv4', 'media'), [])
    const after = entry('2026-10-03', { media: { TikTok: { status: '未解锁', unlocked: true, region: 'US' } } })
    const changes = compareSnapshots(before, after, 'IPv4', 'media')
    assert.equal(changes.length, 2)
    assert.equal(changes.find(change => change.field.endsWith('status'))!.after!.value, 'blocked')
  })

  it('isolates DNSBL from mail ports and sorts/compares arbitrary dates in either direction', () => {
    const a = entry('2026-10-01')
    const b = entry('2026-10-20', { mail: { DNSBlacklist: { Blacklisted: 2, Total: 10 }, Port25: true } })
    assert.deepEqual(compareSnapshots(a, b, 'IPv4', 'mail'), [])
    assert.equal(compareSnapshots(a, b, 'IPv4', 'dnsbl')[0]!.after!.value, 2)
    assert.equal(compareSnapshots(b, a, 'IPv4', 'dnsbl')[0]!.after!.value, 0)
    assert.deepEqual(buildTimeline([b, a], 'IPv4', 'dnsbl').map(point => point.date), [a.date, b.date])
  })

  it('never mixes IPv4 and IPv6; protocol disappearance is explicit', () => {
    const a = entry('2026-10-01')
    const b = entry('2026-10-02', { scores: { IPQS: 99 } })
    assert.deepEqual(compareSnapshots(a, b, 'IPv6', 'score'), [])
    a.report!.v6 = { ...a.report!.v4!, ipVersion: 'IPv6', scores: { IPQS: 5 } }
    assert.equal(projectSnapshot(a, 'IPv6', 'score')['scores.IPQS']!.value, 5)
    const disappearance = compareSnapshots(a, b, 'IPv6', 'score')
    assert.ok(disappearance.some(row => row.field === 'protocol' && row.after!.value === false))
  })

  it('does not turn fetch gaps into changes or compare across them', () => {
    const a = entry('2026-10-01')
    const gap: HistoryEntry = { date: '2026-10-02', report: null }
    const b = entry('2026-10-03', { scores: { IPQS: 99 } })
    assert.deepEqual(buildTimeline([a, gap, b], 'IPv4', 'score').map(point => point.changed), [false, false, false])
    assert.deepEqual(compareSnapshots(gap, b, 'IPv4', 'score'), [])
  })

  it('reuses stored semantic severity without losing raw attribute changes', () => {
    const a = entry('2026-10-01')
    const b = entry('2026-10-02', { scores: { IPQS: 99 } })
    b.report!.changesFromPrevious = [{ date: b.date, nodeUuid: 'node-a', ipVersion: 'IPv4', category: 'score', severity: 'CRITICAL', field: 'scores.IPQS', before: 10, after: 99, description: '风险上升' }]
    assert.equal(buildTimeline([a, b], 'IPv4', 'score')[1]!.semanticChanges[0]!.severity, 'CRITICAL')
    assert.equal(buildTimeline([a, b], 'IPv6', 'score')[1]!.semanticChanges.length, 0)
  })
})

describe('change-aware keyframes', () => {
  const points = Array.from({ length: 30 }, (_, index) => ({ index, changed: index === 3 || index === 4 || index === 17 }))
  it('preserves transient changes and both endpoints before any stable filler', () => {
    const sampled = sampleChangeAware(points, 6).map(point => point.index)
    for (const index of [0, 3, 4, 17, 29]) assert.ok(sampled.includes(index))
    assert.equal(sampled.length, 6)
    assert.deepEqual(sampled, [...sampled].sort((a, b) => a - b))
  })
  it('takes only change dates between endpoints on overflow and reports correct counts', () => {
    const sampled = sampleChangeAware(points, 3)
    assert.deepEqual(sampled.map(point => point.index), [0, 4, 29])
    assert.equal(sampled.filter(point => point.changed).length, 1)
  })
  it('fills largest gaps when history is stable', () => {
    const stable = points.map(point => ({ ...point, changed: false }))
    assert.deepEqual(sampleChangeAware(stable, 4).map(point => point.index), [0, 14, 21, 29])
  })
  it('handles empty, single, zero/one/two-point limits and never duplicates', () => {
    assert.deepEqual(sampleChangeAware([], 3), [])
    assert.deepEqual(sampleChangeAware(points, 0), [])
    assert.deepEqual(sampleChangeAware(points, 1).map(point => point.index), [29])
    assert.deepEqual(sampleChangeAware(points, 2).map(point => point.index), [0, 29])
    for (let size = 1; size <= 30; size++) {
      const sampled = sampleChangeAware(points, size)
      assert.equal(sampled.length, size)
      assert.equal(new Set(sampled).size, size)
    }
  })
})

describe('archive history loading', () => {
  it('bounds concurrency, deduplicates dates, reuses cache and isolates failures', async () => {
    const dates = Array.from({ length: 12 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`)
    let active = 0
    let peak = 0
    const fetched: string[] = []
    const entries = await loadArchiveHistory([...dates, dates[0]!], async (date) => {
      fetched.push(date)
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 3))
      active--
      if (date === dates[2])
        throw new Error('offline')
      return report(date)
    }, { cached: [entry(dates[0]!)], concurrency: 100 })
    assert.equal(peak, 4)
    assert.equal(fetched.length, 11)
    assert.equal(entries.length, 12)
    assert.equal(entries.find(item => item.date === dates[2])!.report, null)
    assert.equal(entries[0]!.date, dates.at(-1))
    const retries: string[] = []
    await loadArchiveHistory(dates, async (date) => {
      retries.push(date)
      return report(date)
    }, { cached: entries })
    assert.deepEqual(retries, [dates[2]])
  })
  it('stops queuing requests and publishing results after node change or unmount', async () => {
    let current = true
    let called = 0
    let updates = 0
    await loadArchiveHistory(['2026-10-01', '2026-10-02', '2026-10-03'], async (date) => {
      called++
      current = false
      return report(date)
    }, { concurrency: 1, isCurrent: () => current, onProgress: () => updates++ })
    assert.equal(called, 1)
    assert.equal(updates, 0)
  })
  it('rejects missing and mismatched-date snapshots instead of fabricating history', async () => {
    const entries = await loadArchiveHistory(['2026-10-01', '2026-10-02'], async date => date.endsWith('01') ? null : report('2026-10-03'))
    assert.ok(entries.every(entry => entry.report === null))
  })
})
