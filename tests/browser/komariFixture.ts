import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const uuid = 'browser-test-node'
export const now = Date.parse('2026-11-10T12:00:00Z')
export const stealHistory = '/api/plugin/cpu-steal-monitor/v1/history'
export const pingTask = 'Browser fixture ping'
export const node = {
  uuid,
  name: 'Browser fixture node',
  cpu_name: 'Fixture CPU',
  cpu_cores: 2,
  os: 'Linux',
  arch: 'x86_64',
  region: 'JP',
  group: '',
  tags: '',
  currency: 'CNY',
  price: 0,
  billing_cycle: 30,
  expired_at: '2027-06-15T00:00:00Z',
  traffic_limit: 700 * (2 ** 30),
  traffic_limit_type: 'sum',
  mem_total: 2 ** 30,
  swap_total: 2 ** 29,
  disk_total: 2 ** 32,
}
const records = Array.from({ length: 5 }, (_, index) => ({
  client: uuid,
  time: new Date(now - (5 - index) * 10_000).toISOString(),
  online: true,
  cpu: 28.5,
  load: 0.75,
  ram: 2 ** 29,
  disk: 2 ** 31,
  net_in: 2048,
  net_out: 1024,
  process: 50,
  connections: 4,
}))
const rpcResults: Record<string, unknown> = {
  'rpc.ping': 'pong',
  'common:getNodes': { [uuid]: node },
  'common:getNodesLatestStatus': { [uuid]: records.at(-1) },
  'common:getNodeRecentStatus': { count: records.length, records },
}

export interface RpcRequest {
  id: number
  method: string
  params?: {
    hours?: number
    entity_id?: string
    entity_ids?: string[]
    metric_keys?: string[]
    type?: string
    start?: string
    end?: string
  }
}

function pingRpcResult({ method, params }: RpcRequest) {
  const hours = params?.hours
  const delay = hours === 24 ? 82 : 61
  const loss = hours === 24 ? 0.5 : 0.25
  if (method === 'public:getPingMetricStats') {
    return { stats: [{ task_id: '1', name: pingTask, interval: 60, loss: loss * 100, avg: delay, total: 5 }] }
  }
  const key = params?.metric_keys?.[0]
  if (method === 'public:queryMetrics' && (key === 'ping.latency_ms' || key === 'ping.loss')) {
    const points = Array.from({ length: 5 }, (_, index) => ({
      time: new Date(now - (5 - index) * 60_000).toISOString(),
      value: key === 'ping.latency_ms' ? delay : loss,
    }))
    return { series: [{ metric_key: key, tags: { task_id: '1' }, interval_seconds: 60, points }] }
  }
}

const edgeUuid = 'browser-test-edge'
const homeTasks = [
  { id: 1, name: pingTask, clients: [uuid, edgeUuid] },
  { id: 2, name: 'Global priority', clients: [uuid] },
  { id: 3, name: 'Fallback route', clients: [edgeUuid] },
]

export async function mockKomari(page: Page, baseURL: string, pluginStatus: 200 | 404, ping = false, homeLineCount?: number, earthViewMode = 'hide', edgeOffline = false, speeds?: { up: number, down: number }, hasGroup = true, settings: Record<string, unknown> = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(now)
  await page.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== baseURL)
      return route.abort()

    switch (url.pathname) {
      case '/api/me':
        return route.fulfill({ json: { logged_in: false } })
      case '/api/public':
        return route.fulfill({
          json: {
            status: 'success',
            data: {
              sitename: 'Komari Browser Test',
              record_enabled: true,
              record_preserve_time: 24,
              theme_settings: {
                rpcTransportMode: 'http',
                enable_node_detail_ipqa: false,
                ...(homeLineCount && {
                  earthViewMode,
                  visitorInfoCardEnabled: false,
                  homePingLineCount: homeLineCount,
                  homePingTaskOrder: [2, 1],
                }),
                ...settings,
              },
            },
          },
        })
      case '/api/rpc2': {
        const call = request.postDataJSON() as RpcRequest
        const homeResults: Record<string, unknown> = homeLineCount
          ? {
              'common:getNodes': {
                [uuid]: { ...node, group: hasGroup ? 'Japan' : '', tags: '<TRD:10>', price: 39, billing_cycle: 365 },
                [edgeUuid]: { ...node, uuid: edgeUuid, name: 'Edge fixture node' },
              },
              'common:getNodesLatestStatus': {
                [uuid]: { ...records.at(-1), net_out: speeds?.up ?? 1024, net_in: speeds?.down ?? 2048, load5: 0.3, load15: 0.2, uptime: 8 * 86400 },
                [edgeUuid]: { ...records.at(-1), client: edgeUuid, online: !edgeOffline, uptime: 8 * 86400 },
              },
              'public:getPublicPingTasks': homeTasks,
              'common:getRecords': call.params?.type === 'ping'
                ? {
                    tasks: homeTasks,
                    records: [{ client: uuid, task_id: 1, time: new Date(now - 60_000).toISOString(), value: 25 }],
                  }
                : { records: [] },
            }
          : {}
        const result = homeResults[call.method] ?? rpcResults[call.method] ?? (ping ? pingRpcResult(call) : undefined)
        const reply = result !== undefined
          ? { result }
          : { error: { code: -32601, message: 'Method not found' } }
        return route.fulfill({ json: { jsonrpc: '2.0', id: call.id, ...reply } })
      }
      case stealHistory:
        expect(url.searchParams.get('uuid')).toBe(uuid)
        expect(Number(url.searchParams.get('from'))).toBeLessThan(now - 120_000)
        expect(Number(url.searchParams.get('to'))).toBe(now)
        return route.fulfill({
          status: pluginStatus,
          json: { schemaVersion: 1, uuid, samples: [{ from: now - 120_000, time: now, value: 2.5 }] },
        })
      default:
        return url.pathname.startsWith('/api/')
          ? route.fulfill({ status: 404, json: { message: 'Not found' } })
          : route.continue()
    }
  })

  // Canvas legend labels are painted text, so capture their hit coordinates
  // and use a real pointer click on the rendered legend.
  await page.addInitScript((pingTask) => {
    const fillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const [text, x, y] = args
      if (text === 'Steal ×10') {
        const metrics = this.measureText(text)
        const center = new DOMPoint(
          x + (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2,
          y + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2,
        ).matrixTransform(this.getTransform())
        this.canvas.dataset.stealLegend = `${center.x},${center.y}`
      }
      if (text === pingTask)
        this.canvas.dataset.pingLegend = pingTask
      fillText.apply(this, args)
    }
  }, pingTask)
}
