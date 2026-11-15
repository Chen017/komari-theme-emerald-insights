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

interface RpcRequest {
  id: number
  method: string
  params?: { hours?: number, entity_id?: string, metric_keys?: string[], type?: string }
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

async function mockKomari(page: Page, baseURL: string, pluginStatus: 200 | 404, ping = false, homeLineCount?: number, earthViewMode = 'hide', edgeOffline = false, speeds?: { up: number, down: number }, hasGroup = true) {
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
                  disablePageAnimation: true,
                  homePingLineCount: homeLineCount,
                  homePingTaskOrder: [2, 1],
                }),
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

test('homepage ping slots share the configured count and use native task fallback', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockKomari(page, baseURL!, 404, true, 6)
  await page.goto('/')
  const card = page.locator('.node-card').filter({ hasText: node.name })
  const edge = page.locator('.node-card').filter({ hasText: 'Edge fixture node' })
  const latency = card.getByRole('region', { name: '延迟' })
  const edgeLatency = edge.getByRole('region', { name: '延迟' })
  await expect(latency.locator('button')).toHaveCount(2)
  await expect(latency.locator('[data-ping-task]')).toHaveCount(6)
  await expect(edgeLatency.locator('[data-ping-task]')).toHaveCount(6)
  await expect(edgeLatency.locator('[data-ping-task="empty"]')).toHaveCount(4)
  await expect(latency.locator('button').first()).toHaveAccessibleName('Global priority 延迟 — 暂无采样')
  await expect(edgeLatency.locator('button').last()).toHaveAccessibleName('Fallback route 延迟 — 暂无采样')
  await expect(card.getByRole('button', { name: `${pingTask} 丢包 0.0%` })).toBeVisible()
  await expect(latency.getByText('延迟', { exact: true })).toHaveCount(0)
  await expect(card.getByRole('region', { name: '丢包' }).getByText('丢包', { exact: true })).toHaveCount(0)
  for (const panel of [latency, card.getByRole('region', { name: '丢包' })]) {
    const history = panel.locator('[data-ping-task="1"] .grid-cols-10')
    await expect(history.locator('span')).toHaveCount(10)
    await expect(history.locator('span').last()).toHaveAttribute('title', /\d\d:\d\d:\d\d · /)
    const titles = await history.locator('span').evaluateAll(segments => segments.map(segment => segment.getAttribute('title') || ''))
    const seconds = (title: string) => {
      const [hours, minutes, seconds] = title.slice(0, 8).split(':').map(Number)
      return hours! * 3600 + minutes! * 60 + seconds!
    }
    expect((seconds(titles[9]!) - seconds(titles[8]!) + 86400) % 86400).toBe(180)
    expect(titles[8]).toContain(panel === latency ? '25 ms' : '0.0%')
    expect(titles[9]).toContain('暂无采样')
    expect(await history.locator('span').last().evaluate(segment => Number.parseFloat(getComputedStyle(segment).borderTopLeftRadius))).toBeGreaterThan(1)
  }
  await expect(card.getByText(/¥\s*39|在线\s*8\s*天/)).toHaveCount(0)
  expect(await card.evaluate(element => element.offsetHeight)).toBe(await edge.evaluate(element => element.offsetHeight))

  await latency.getByRole('button', { name: `${pingTask} 延迟 25 ms` }).press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(pingTask, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.setViewportSize({ width: 360, height: 800 })
  await expect(latency.locator('[data-ping-task]')).toHaveCount(6)
  expect(await card.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await card.evaluate(element => element.clientWidth))
  await page.setViewportSize({ width: 1280, height: 900 })

  await expect(page.getByRole('button', { name: '列表视图' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '卡片视图' })).toHaveCount(0)
  await expect(page.getByPlaceholder('搜索节点名称、地区、系统')).toHaveCount(0)
  await expect(page.getByText('全部节点', { exact: true })).toHaveCount(0)
  const group = page.getByRole('button', { name: 'Japan' })
  await group.click()
  await expect(edge).toHaveCount(0)
  await group.click()
  await expect(edge).toBeVisible()
})

test('homepage shows remaining summary cards and centers the traffic reset label', async ({ page, baseURL }) => {
  await mockKomari(page, baseURL!, 404, true, 3, 'cards')
  await page.addInitScript(() => localStorage.setItem('nodeViewMode', 'list'))
  await page.goto('/')
  const card = page.locator('.node-card').filter({ hasText: node.name })
  await expect(card).toBeVisible()
  for (const label of ['实时上行', '实时下行', '累计流量', '月均成本', '年均成本', '剩余价值'])
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  const monthly = page.getByText('月均成本', { exact: true }).locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]')
  const annual = page.getByText('年均成本', { exact: true }).locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]')
  await expect(monthly).toContainText('¥3.21')
  await expect(annual).toContainText('¥38.47')
  const reset = card.getByText(/流量重置日：10/).locator('..')
  await expect(reset).toBeVisible()
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 })
    const labels = ['实时上行', '实时下行', '累计流量', '月均成本', '年均成本', '剩余价值']
    const boundsByLabel = await Promise.all(labels.map(label => page.getByText(label, { exact: true }).first().boundingBox()))
    expect(boundsByLabel.every(Boolean)).toBe(true)
    expect(boundsByLabel[0]!.y).toBe(boundsByLabel[1]!.y)
    expect(boundsByLabel[1]!.y).toBe(boundsByLabel[2]!.y)
    expect(boundsByLabel[3]!.y).toBe(boundsByLabel[4]!.y)
    expect(boundsByLabel[4]!.y).toBe(boundsByLabel[5]!.y)
    expect(boundsByLabel[3]!.y).toBeGreaterThan(boundsByLabel[0]!.y)
    for (const offset of [0, 3]) {
      expect(boundsByLabel[offset + 1]!.x).toBeGreaterThan(boundsByLabel[offset]!.x)
      expect(boundsByLabel[offset + 2]!.x).toBeGreaterThan(boundsByLabel[offset + 1]!.x)
    }
    const bounds = await reset.boundingBox()
    const parent = await reset.locator('..').boundingBox()
    expect(bounds).not.toBeNull()
    expect(parent).not.toBeNull()
    expect(Math.abs((bounds!.x + bounds!.width / 2) - (parent!.x + parent!.width / 2))).toBeLessThan(1)
    expect(await card.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await card.evaluate(element => element.clientWidth))
  }
})

test('globe and map show six compact summary cards in two rows', async ({ page, baseURL }) => {
  for (const mode of ['earth', 'maps']) {
    await mockKomari(page, baseURL!, 404, true, 3, mode)
    await page.goto('/')
    const labels = ['实时上行', '实时下行', '累计流量', '月均成本', '年均成本', '剩余价值']
    const cards = labels.map(label => page.getByText(label, { exact: true }).first().locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]'))
    for (const card of cards)
      await expect(card).toBeVisible()
    const grid = cards[0]!.locator('..')
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 900 })
      const gridBounds = await grid.boundingBox()
      const gap = await grid.evaluate(element => Number.parseFloat(getComputedStyle(element).rowGap))
      expect(gridBounds).not.toBeNull()
      for (const [index, card] of cards.entries()) {
        const bounds = await card.boundingBox()
        expect(bounds).not.toBeNull()
        const expectedHeight = (gridBounds!.height - gap) / 2
        expect(Math.abs(bounds!.height - expectedHeight)).toBeLessThan(1)
        expect(Math.abs(bounds!.y - gridBounds!.y - (index < 3 ? 0 : expectedHeight + gap))).toBeLessThan(1)
        const expectedLeft = gridBounds!.x + (index % 3) * (gridBounds!.width + gap) / 3
        expect(Math.abs(bounds!.x - expectedLeft)).toBeLessThan(1)
      }
    }
    await page.unrouteAll({ behavior: 'wait' })
  }
})

test('summary and node cards have 24px vertical separation', async ({ page, baseURL }) => {
  for (const mode of ['earth', 'maps', 'cards']) {
    await mockKomari(page, baseURL!, 404, true, 3, mode, false, undefined, false)
    await page.goto('/')
    const summary = page.getByText('月均成本', { exact: true }).locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]')
    const card = page.locator('.node-card').filter({ hasText: node.name })
    await expect(summary).toBeVisible()
    await expect(card).toBeVisible()
    const summaryBounds = await summary.boundingBox()
    const nodeBounds = await card.boundingBox()
    expect(nodeBounds!.y - (summaryBounds!.y + summaryBounds!.height)).toBeCloseTo(24, 0)
    await page.unrouteAll({ behavior: 'wait' })
  }
})

test('node cards show upload and download speed in place of disk and keep offline status', async ({ page, baseURL }) => {
  const speeds = { up: 1024, down: 2048 }
  await mockKomari(page, baseURL!, 404, true, 3, 'hide', true, speeds)
  await page.goto('/')
  const card = page.locator('.node-card').filter({ hasText: node.name })
  const offline = page.locator('.node-card').filter({ hasText: 'Edge fixture node' })
  await expect(card.getByLabel('实时网速', { exact: true })).toBeVisible()
  await expect(card.getByLabel('上行网速')).toHaveText('1 KB/s')
  await expect(card.getByLabel('下行网速')).toHaveText('2 KB/s')
  await expect(card.getByText('硬盘', { exact: true })).toHaveCount(0)
  await expect(card.getByLabel('实时速率')).toHaveCount(0)
  await expect(card.getByLabel('累计流量')).toHaveCount(0)
  await expect(offline.getByText('离线', { exact: true })).toBeVisible()
  await expect(offline.getByLabel('上行网速')).toHaveText('—')
  await expect(offline.getByLabel('下行网速')).toHaveText('—')
  const share = card.getByRole('img', { name: /实时网速比例/ })
  await expect(share).toHaveAttribute('aria-label', '实时网速比例：上行 33.3%，下行 66.7%')
  expect(await share.locator('[data-speed-up-share]').evaluate(element => Number.parseFloat(element.style.width))).toBeCloseTo(100 / 3, 3)
  expect(await share.locator('[data-speed-down-share]').evaluate(element => Number.parseFloat(element.style.width))).toBeCloseTo(200 / 3, 3)
  await expect(offline.getByRole('img', { name: /实时网速比例/ })).toHaveAttribute('aria-label', '实时网速比例：上行 0.0%，下行 0.0%')
  speeds.up = 3072
  speeds.down = 1024
  await expect(share).toHaveAttribute('aria-label', '实时网速比例：上行 75.0%，下行 25.0%', { timeout: 8000 })
  speeds.up = 0
  speeds.down = 0
  await expect(share).toHaveAttribute('aria-label', '实时网速比例：上行 0.0%，下行 0.0%', { timeout: 8000 })
  await expect(share.locator('[data-speed-up-share]')).toHaveCSS('width', '0px')
  await expect(share.locator('[data-speed-down-share]')).toHaveCSS('width', '0px')
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await card.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(await card.evaluate(element => element.clientWidth))
    const up = await card.getByLabel('上行网速').boundingBox()
    const down = await card.getByLabel('下行网速').boundingBox()
    expect(up).not.toBeNull()
    expect(down).not.toBeNull()
    expect(Math.abs(up!.y - down!.y)).toBeLessThan(1)
    expect(down!.x).toBeGreaterThan(up!.x)
    const track = await share.boundingBox()
    expect(track).not.toBeNull()
    expect(track!.y).toBeLessThan(up!.y)
    await expect(card.getByRole('region', { name: '延迟' })).toBeVisible()
  }
})

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
