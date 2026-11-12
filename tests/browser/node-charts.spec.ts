import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const uuid = 'browser-test-node'
const now = Date.parse('2026-11-10T12:00:00Z')
const stealHistory = '/api/plugin/cpu-steal-monitor/v1/history'
const pingTask = 'Browser fixture ping'
const node = {
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
  net_in: 1024,
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

interface RpcRequest {
  id: number
  method: string
  params?: { hours?: number, entity_id?: string, metric_keys?: string[] }
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

async function mockKomari(page: Page, baseURL: string, pluginStatus: 200 | 404, ping = false) {
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
              theme_settings: { rpcTransportMode: 'http', enable_node_detail_ipqa: false },
            },
          },
        })
      case '/api/rpc2': {
        const call = request.postDataJSON() as RpcRequest
        const result = rpcResults[call.method] ?? (ping ? pingRpcResult(call) : undefined)
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

async function openCpuChart(page: Page, baseURL: string, pluginStatus: 200 | 404) {
  await mockKomari(page, baseURL, pluginStatus)
  const pluginResponse = page.waitForResponse(response => new URL(response.url()).pathname === stealHistory)
  await page.goto(`/instance/${uuid}`)
  expect((await pluginResponse).status()).toBe(pluginStatus)
  const canvas = page.locator('canvas[data-steal-legend]')
  await expect(canvas).toBeVisible()
  return canvas
}

async function hoverPlot(canvas: Locator) {
  const bounds = await canvas.boundingBox()
  if (!bounds)
    throw new Error('CPU chart canvas is missing')
  await canvas.hover({ position: { x: bounds.width * 0.5, y: bounds.height * 0.45 } })
}

async function toggleSteal(canvas: Locator) {
  const legend = await canvas.getAttribute('data-steal-legend')
  if (!legend)
    throw new Error('Steal legend was not rendered')
  const [x, y] = legend.split(',').map(Number)
  await canvas.click({ position: { x: x!, y: y! } })
}

async function expectNativeTooltip(page: Page) {
  const load = page.getByText('系统负载', { exact: true })
  await expect(load).toBeVisible()
  const tooltip = load.locator('../..')
  await expect(tooltip.getByText('28.5%', { exact: true })).toBeVisible()
  await expect(tooltip.getByText('0.75', { exact: true })).toBeVisible()
  return tooltip
}

test('CPU and load render, and the Steal legend reveals raw percent', async ({ page, baseURL }) => {
  const canvas = await openCpuChart(page, baseURL!, 200)
  const steal = page.getByText('Steal（真实值，2 分钟均值）', { exact: true })
  await hoverPlot(canvas)
  await expectNativeTooltip(page)
  await expect(steal).toBeHidden()

  await toggleSteal(canvas)
  await hoverPlot(canvas)
  const tooltip = await expectNativeTooltip(page)
  await expect(steal).toBeVisible()
  await expect(tooltip.getByText('2.50%', { exact: true })).toBeVisible()

  await toggleSteal(canvas)
  await hoverPlot(canvas)
  await expectNativeTooltip(page)
  await expect(steal).toBeHidden()
})

test('CPU and load keep rendering when the Steal plugin is missing', async ({ page, baseURL }) => {
  const canvas = await openCpuChart(page, baseURL!, 404)
  await toggleSteal(canvas)
  await hoverPlot(canvas)
  const tooltip = await expectNativeTooltip(page)
  await expect(tooltip).not.toContainText('NaN')
  await expect(tooltip.getByText('2.50%', { exact: true })).toBeHidden()
})

test('Ping charts request and display the selected six-hour and one-day ranges', async ({ page, baseURL }) => {
  await mockKomari(page, baseURL!, 404, true)
  const calls: RpcRequest[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/rpc2')
      calls.push(request.postDataJSON() as RpcRequest)
  })
  await page.goto(`/instance/${uuid}`)
  const pingTabs = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: '12 小时', exact: true }) })
  const canvas = page.locator('canvas[data-ping-legend]')

  for (const { label, hours, delay, loss } of [
    { label: '6 小时', hours: 6, delay: 61, loss: 25 },
    { label: '1 天', hours: 24, delay: 82, loss: 50 },
  ]) {
    const tab = pingTabs.getByRole('tab', { name: label, exact: true })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTitle('平均延迟', { exact: true })).toHaveText(`${delay}ms`)
    await expect(page.getByTitle('丢包率', { exact: true })).toHaveText(`${loss.toFixed(2)}%`)
    await expect(canvas).toBeVisible()
    await hoverPlot(canvas)
    const point = page.getByText(`${delay} ms`, { exact: true })
    await expect(point).toBeVisible()
    await expect(point.locator('..').getByText(`(${loss}% 丢包)`, { exact: true })).toBeVisible()
    const selectedCalls = calls.filter(call => call.params?.entity_id === uuid && call.params.hours === hours)
    expect(selectedCalls.map(call => call.params?.metric_keys?.[0]).filter(Boolean).sort()).toEqual(['ping.latency_ms', 'ping.loss'])
    expect(selectedCalls.some(call => call.method === 'public:getPingMetricStats')).toBe(true)
  }
})
