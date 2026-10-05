import type { IpqaMediaPresentation } from './mediaStatus'
import type { IpqaNodeOverview } from './types'
import { resolveMediaStatus } from './mediaStatus'

export type IpqaProtocolVersion = 'v4' | 'v6'
export type IpqaOverviewServiceKind = 'media' | 'ai'

export interface IpqaOverviewServiceResult extends IpqaMediaPresentation {
  region?: string
  available: boolean
}

export function findProtocolOverviewService(
  node: IpqaNodeOverview,
  ipVersion: IpqaProtocolVersion,
  serviceKeys: readonly string[],
  kind: IpqaOverviewServiceKind,
): IpqaOverviewServiceResult {
  const hasVersion = ipVersion === 'v4' ? node.has_ipv4 : node.has_ipv6
  if (!hasVersion)
    return { ...resolveMediaStatus(), available: false }

  const protocol = ipVersion === 'v4' ? node.v4 : node.v6
  const pool = protocol?.[kind]
  if (!pool)
    return { ...resolveMediaStatus(), available: false }

  for (const serviceKey of serviceKeys) {
    const lower = serviceKey.toLowerCase()
    for (const [key, value] of Object.entries(pool)) {
      const normalizedKey = key.toLowerCase()
      if (normalizedKey === lower || normalizedKey.includes(lower)) {
        return {
          ...resolveMediaStatus(value),
          region: value?.region,
          available: true,
        }
      }
    }
  }

  return { ...resolveMediaStatus(), available: false }
}
