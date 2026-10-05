import type {
  IpqaCapabilities,
  IpqaDailyPairedReport,
  IpqaFleetOverview,
  IpqaMediaHistoryPoint,
  IpqaScoreHistoryPoint,
  IpqaSemanticChange,
} from '../types'
import { getSharedRpc } from '../../../utils/rpc'

const API_BASE = '/api/plugin/ipqa-alert-report/v1'
const REQUEST_TIMEOUT = 10_000

export class IpqaApiError extends Error {
  constructor(public kind: 'not-installed' | 'unavailable') {
    super(kind === 'not-installed' ? '未检测到 IPQA 插件，请确认插件已安装并运行' : 'IPQA 数据更新失败，请检查连接后重试')
    this.name = 'IpqaApiError'
  }
}

async function getJson<T>(
  endpoint: string,
  rpcMethod?: string,
  rpcParams?: Record<string, unknown>,
): Promise<T | null> {
  let httpMissing = false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const sep = endpoint.includes('?') ? '&' : '?'
    const url = `${API_BASE}${endpoint}${sep}_t=${Date.now()}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
      signal: controller.signal,
    })
    if (res.ok) {
      return (await res.json()) as T
    }
    httpMissing = res.status === 404
  }
  catch (err) {
    console.warn(`[IPQA API] ${endpoint} fetch failed:`, err)
  }
  finally {
    clearTimeout(timer)
  }

  // Seamless fallback to Komari RPC if HTTP route is 404 or fails
  if (rpcMethod) {
    const rpcController = new AbortController()
    const rpcTimer = setTimeout(() => rpcController.abort(), REQUEST_TIMEOUT)
    try {
      const rpc = getSharedRpc()
      return await rpc.call<T>(rpcMethod, rpcParams, { signal: rpcController.signal }) ?? null
    }
    catch (rpcErr) {
      console.warn(`[IPQA RPC] ${rpcMethod} fallback failed:`, rpcErr)
      if (httpMissing && rpcErr && typeof rpcErr === 'object' && 'code' in rpcErr && rpcErr.code === -32601)
        throw new IpqaApiError('not-installed')
    }
    finally {
      clearTimeout(rpcTimer)
    }
  }

  throw new IpqaApiError('unavailable')
}

export async function fetchCapabilities(): Promise<IpqaCapabilities | null> {
  return getJson<IpqaCapabilities>('/capabilities', 'plugin:ipqaGetCapabilities')
}

export async function fetchFleetOverview(): Promise<IpqaFleetOverview | null> {
  return getJson<IpqaFleetOverview>('/overview', 'plugin:ipqaGetOverview')
}

export async function fetchNodeLatest(uuid: string): Promise<IpqaDailyPairedReport | null> {
  return getJson<IpqaDailyPairedReport>(`/nodes/${uuid}/latest`, 'plugin:ipqaGetNodeLatest', { uuid })
}

export async function fetchNodeArchivePage(uuid: string, limit = 30, before?: string): Promise<{ dates: string[], hasMore: boolean }> {
  const query = `limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`
  const data = await getJson<{ dates: string[], hasMore?: boolean }>(`/nodes/${encodeURIComponent(uuid)}/archives?${query}`, 'plugin:ipqaGetNodeArchives', { uuid, limit, before })
  return { dates: data?.dates ?? [], hasMore: data?.hasMore ?? (data?.dates.length === limit) }
}

export async function fetchNodeArchiveDates(uuid: string, limit = 30): Promise<string[]> {
  return (await fetchNodeArchivePage(uuid, limit)).dates
}

export async function fetchNodeArchive(uuid: string, date: string): Promise<IpqaDailyPairedReport | null> {
  return getJson<IpqaDailyPairedReport>(`/nodes/${uuid}/archives/${date}`, 'plugin:ipqaGetNodeArchive', { uuid, date })
}

export async function fetchNodeChanges(uuid: string): Promise<IpqaSemanticChange[]> {
  const data = await getJson<{ changes: IpqaSemanticChange[] }>(`/nodes/${uuid}/changes`, 'plugin:ipqaGetNodeChanges', { uuid })
  return data?.changes ?? []
}

export async function fetchNodeScoreHistory(uuid: string): Promise<IpqaScoreHistoryPoint[]> {
  const data = await getJson<{ history: IpqaScoreHistoryPoint[] }>(`/nodes/${uuid}/history/scores`, 'plugin:ipqaGetNodeScoreHistory', { uuid })
  return data?.history ?? []
}

export async function fetchNodeMediaHistory(uuid: string): Promise<IpqaMediaHistoryPoint[]> {
  const data = await getJson<{ history: IpqaMediaHistoryPoint[] }>(`/nodes/${uuid}/history/media`, 'plugin:ipqaGetNodeMediaHistory', { uuid })
  return data?.history ?? []
}
