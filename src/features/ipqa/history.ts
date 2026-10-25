import type { IpqaDailyPairedReport, IpqaNormalizedReport } from './types'
import { evaluateProviderScore, getTypeColorClass } from './formatters'
import { resolveMediaRegion, resolveMediaStatus } from './mediaStatus'

export const historySections = [
  { key: 'type', label: 'IP 类型', icon: 'lucide:network' },
  { key: 'score', label: '风险评分', icon: 'lucide:shield-alert' },
  { key: 'factor', label: '风险因子', icon: 'lucide:sliders-horizontal' },
  { key: 'media', label: '流媒体与 AI', icon: 'lucide:tv-2' },
  { key: 'dnsbl', label: 'DNSBL', icon: 'lucide:list-filter' },
  { key: 'mail', label: '邮件连通性', icon: 'lucide:mail' },
  { key: 'identity', label: 'IP 归属', icon: 'lucide:map-pin' },
] as const

export type HistorySection = typeof historySections[number]['key']
export type IpVersion = 'IPv4' | 'IPv6'
export interface HistoryEntry { date: string, report: IpqaDailyPairedReport | null }
export interface HistoryCell { value: unknown, text: string, cls?: string, comparisonKey?: string }
export interface SnapshotDifference { field: string, before?: HistoryCell, after?: HistoryCell }

// Same volatile-field exclusions as IPQA's archive-diff. Only project data
// participates; collection timestamps, archive IDs and raw payloads never do.
const ignoredField = /^(?:head|time|timestamp|date|archiveid|mtime|command|version|runtime|duration|uuid|client|created_at|finished_at)$/i
const unknownMediaStatus = /^(?:n\/a|unknown|未检测|无数据|-+)$/i

export function historyFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    'archive': '归档状态',
    'protocol': '协议报告',
    'info.type': '原生 / 广播类型',
    'info.ip': 'IP 地址',
    'info.country': '国家',
    'info.region': '地区',
    'info.city': '城市',
    'info.asn': 'ASN',
    'info.isp': 'ISP',
    'info.organization': '组织机构',
    'mail.DNSBlacklist.Blacklisted': 'DNSBL · 命中数',
    'mail.DNSBlacklist.Total': 'DNSBL · 检测总数',
    'mail.DNSBlacklist.blacklisted': 'DNSBL · 命中数',
    'mail.DNSBlacklist.total': 'DNSBL · 检测总数',
    'mail.Port25': 'Port 25 连通性',
    'mail.port25': 'Port 25 连通性',
  }
  if (labels[field])
    return labels[field]
  const parts = field.split('.')
  if (parts[0] === 'scores')
    return parts.slice(1).join('.')
  if (parts[0] === 'type')
    return `${parts[1] === 'usage' ? '使用类型' : '公司类型'} · ${parts.slice(2).join(' · ')}`
  if (parts[0] === 'factors')
    return parts.slice(1).join(' · ')
  if (parts[0] === 'media')
    return `${parts.slice(1, -1).join(' · ')} · ${parts.at(-1) === 'region' ? '解锁地区' : '解锁状态'}`
  return parts.slice(1).join(' · ')
}

export function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === '')
    return '无数据'
  if (value === true || value === 'true')
    return '是'
  if (value === false || value === 'false')
    return '否'
  return String(value)
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '' || value === 'null' || value === '--')
    return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === 'true')
      return true
    if (trimmed === 'false')
      return false
    return trimmed || null
  }
  return value
}

function flatten(value: unknown, prefix: string, target: Record<string, HistoryCell>): void {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) {
      if (!ignoredField.test(key))
        flatten((value as Record<string, unknown>)[key], `${prefix}.${key}`, target)
    }
    return
  }
  const normalized = normalizeValue(value)
  target[prefix] = { value: normalized, text: formatHistoryValue(normalized) }
}

export function protocolReport(entry: HistoryEntry, ipVersion: IpVersion): IpqaNormalizedReport | null {
  return (ipVersion === 'IPv4' ? entry.report?.v4 : entry.report?.v6) ?? null
}

/** A shared projection powers fingerprinting, timeline cells AND snapshot diffs. */
export function projectSnapshot(entry: HistoryEntry, ipVersion: IpVersion, section: HistorySection): Record<string, HistoryCell> {
  const report = protocolReport(entry, ipVersion)
  if (!entry.report)
    return { archive: { value: null, text: '归档不可用' } }
  if (!report)
    return { protocol: { value: false, text: `该日无 ${ipVersion} 报告` } }

  const cells: Record<string, HistoryCell> = {}
  switch (section) {
    case 'type':
      flatten(report.info.type, 'info.type', cells)
      flatten(report.type.usage, 'type.usage', cells)
      flatten(report.type.company, 'type.company', cells)
      for (const cell of Object.values(cells)) cell.cls = getTypeColorClass(cell.value)
      break
    case 'identity':
      for (const key of ['ip', 'country', 'region', 'city', 'asn', 'isp', 'organization'])
        flatten(report.info[key], `info.${key}`, cells)
      break
    case 'score':
      for (const [provider, value] of Object.entries(report.scores)) {
        const evaluated = evaluateProviderScore(provider, value, report.classifiedScores?.[provider])
        const normalized = normalizeValue(value)
        const numeric = typeof normalized === 'string' ? Number(normalized.replace('%', '')) : Number.NaN
        cells[`scores.${provider}`] = {
          value: Number.isFinite(numeric) ? numeric : normalized,
          text: `${evaluated.text} · ${evaluated.tagLabel}`,
          cls: evaluated.cls,
          comparisonKey: `${evaluated.category}:${evaluated.tagLabel}`,
        }
      }
      break
    case 'factor':
      flatten(report.factors, 'factors', cells)
      for (const cell of Object.values(cells)) {
        if (cell.value === true) {
          cell.text = '检出'
          cell.cls = 'text-rose-700 dark:text-rose-300'
        }
        else if (cell.value === false) {
          cell.text = '未检出'
          cell.cls = 'text-emerald-700 dark:text-emerald-300'
        }
      }
      break
    case 'media':
      for (const [name, service] of Object.entries(report.media)) {
        const status = resolveMediaStatus(service)
        const rawStatus = normalizeValue(service.status ?? service.Status)
        const unrecognized = status.state === 'unknown' && typeof rawStatus === 'string' && !unknownMediaStatus.test(rawStatus)
        cells[`media.${name}.status`] = {
          value: unrecognized ? `unknown:${rawStatus}` : status.state,
          text: unrecognized ? `${status.label} · ${rawStatus}` : status.label,
          cls: status.badgeClass,
        }
        const region = resolveMediaRegion(service, name) ?? null
        cells[`media.${name}.region`] = { value: region, text: formatHistoryValue(region) }
      }
      break
    case 'dnsbl':
      flatten(report.mail.DNSBlacklist ?? report.mail.dnsblacklist, 'mail.DNSBlacklist', cells)
      break
    case 'mail':
      for (const [key, value] of Object.entries(report.mail)) {
        if (key.toLowerCase() !== 'dnsblacklist')
          flatten(value, `mail.${key}`, cells)
      }
      break
  }
  return cells
}

function sameCell(a?: HistoryCell, b?: HistoryCell): boolean {
  if ((a?.value ?? null) !== (b?.value ?? null))
    return false
  return a?.value == null || (a.comparisonKey ?? null) === (b?.comparisonKey ?? null)
}

export function compareSnapshots(before: HistoryEntry, after: HistoryEntry, ipVersion: IpVersion, section: HistorySection): SnapshotDifference[] {
  // Failed fetches are gaps, never evidence of an attribute being removed.
  if (!before.report || !after.report)
    return []
  const a = projectSnapshot(before, ipVersion, section)
  const b = projectSnapshot(after, ipVersion, section)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter(field => !sameCell(a[field], b[field])).map(field => ({ field, before: a[field], after: b[field] }))
}

export function buildTimeline(entries: HistoryEntry[], ipVersion: IpVersion, section: HistorySection) {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  return ordered.map((entry, index) => {
    const previous = ordered[index - 1]
    const differences = previous ? compareSnapshots(previous, entry, ipVersion, section) : []
    const semanticChanges = entry.report?.changesFromPrevious?.filter(change => change.ipVersion === ipVersion && change.category === section) ?? []
    return {
      ...entry,
      differences,
      semanticChanges,
      changed: differences.length > 0,
      comparisonAvailable: Boolean(previous?.report && entry.report),
      protocolAvailable: Boolean(protocolReport(entry, ipVersion)),
      previousDate: previous?.date,
    }
  })
}

/**
 * IPQA keyframes: endpoints + actual changes first, then largest-gap fill.
 * Overflow selects representative change points, never stable dates instead.
 */
export function sampleChangeAware<T extends { changed: boolean }>(points: T[], maxPoints = 8): T[] {
  const limit = Number.isFinite(maxPoints) ? Math.max(0, Math.floor(maxPoints)) : points.length
  if (points.length <= limit)
    return [...points]
  if (limit === 0)
    return []
  if (limit === 1)
    return [points.at(-1)!]
  const last = points.length - 1
  const changes = points.flatMap((point, index) => point.changed && index > 0 && index < last ? [index] : [])
  let selected = [0, ...changes, last]
  if (selected.length > limit) {
    const slots = limit - 2
    const chosen = Array.from({ length: slots }, (_, i) => changes[slots === 1 ? Math.floor(changes.length / 2) : Math.round(i * (changes.length - 1) / (slots - 1))]!)
    selected = [0, ...chosen, last]
  }
  while (selected.length < limit) {
    let bestGap = 1
    let insert = -1
    for (let i = 1; i < selected.length; i++) {
      const left = selected[i - 1]!
      const gap = selected[i]! - left
      if (gap > bestGap) {
        bestGap = gap
        insert = left + Math.floor(gap / 2)
      }
    }
    if (insert < 0)
      break
    selected.push(insert)
    selected.sort((a, b) => a - b)
  }
  return selected.map(index => points[index]!)
}

export function snapshotFields(entries: HistoryEntry[], ipVersion: IpVersion, section: HistorySection): string[] {
  return [...new Set(entries.flatMap(entry => Object.keys(projectSnapshot(entry, ipVersion, section))))].sort()
}
