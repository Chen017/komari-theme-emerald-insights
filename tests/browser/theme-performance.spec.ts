import type { Page } from '@playwright/test'
import type { RpcRequest } from './komariFixture'
import { expect, test } from '@playwright/test'
import { mockKomari, node, now, uuid } from './komariFixture'

async function fixture(page: Page, baseURL: string, settings: Record<string, unknown> = {}) {
  await mockKomari(page, baseURL, 404, true, 3, 'hide', false, undefined, true, settings)
}

function collectRpc(page: Page) {
  const calls: RpcRequest[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/rpc2')
      calls.push(request.postDataJSON() as RpcRequest)
  })
  return calls
}

test('first cards and hidden admin policy are independent of a delayed login request', async ({ page, baseURL }) => {
  await fixture(page, baseURL!, { hideAdminEntryWhenLoggedOut: true })
  const login = Promise.withResolvers<void>()
  const health = Promise.withResolvers<void>()
  const calls = collectRpc(page)
  const settingsRequested = page.waitForRequest('**/api/public')
  await page.route('**/api/me', async (route) => {
    await login.promise
    await route.fulfill({ json: { logged_in: true } })
  })
  await page.route('**/api/rpc2', async (route) => {
    const rpc = route.request().postDataJSON() as RpcRequest
    if (rpc.method === 'rpc.ping')
      await health.promise
    await route.fallback()
  })
  try {
    await page.goto('/')
    await settingsRequested
    await expect(page.getByText('正在加载监控面板…')).toBeVisible()
    expect(calls.some(call => call.method === 'common:getNodes')).toBe(false)

    health.resolve()
    const first = page.getByRole('link', { name: node.name })
    await expect(first).toBeVisible()
    await expect(first).toBeEnabled()
    await expect(page.getByRole('button', { name: '后台管理' })).toHaveCount(0)
    login.resolve()
    await expect(page.getByRole('button', { name: '后台管理' })).toBeVisible()
  }
  finally {
    health.resolve()
    login.resolve()
  }
})

test('private health check redirects before reading nodes or login state', async ({ page, baseURL }) => {
  await fixture(page, baseURL!)
  const calls = collectRpc(page)
  const login: string[] = []
  page.on('request', request => request.url().endsWith('/api/me') && login.push(request.url()))
  await page.route('**/api/rpc2', route => route.fulfill({ status: 401 }))
  await page.route('**/admin', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>登录管理</h1>' }))
  await page.goto('/')
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: '登录管理' })).toBeVisible()
  expect(calls.map(call => call.method)).toEqual(['rpc.ping'])
  expect(login).toHaveLength(0)
})

test('startup failure exposes the RPC error and releases the page placeholder', async ({ page, baseURL }) => {
  await fixture(page, baseURL!)
  await page.route('**/api/rpc2', route => route.fulfill({ status: 503 }))
  await page.goto('/')
  await expect(page.getByText('RPC 服务错误')).toBeVisible()
  await expect(page.getByText('正在加载监控面板…')).toHaveCount(0)
  await expect(page.getByRole('link', { name: node.name })).toHaveCount(0)
})

test('WebSocket reconnects after a dropped connection and retains the dashboard', async ({ page, baseURL }) => {
  await fixture(page, baseURL!, { rpcTransportMode: 'websocket' })
  let connections = 0
  let dropFirst: (() => void) | undefined
  await page.routeWebSocket('**/api/rpc2', (socket) => {
    connections += 1
    if (connections === 1)
      dropFirst = () => socket.close({ code: 1011 })
    socket.onMessage((message) => {
      const call = JSON.parse(String(message)) as RpcRequest
      const result = call.method === 'rpc.ping'
        ? 'pong'
        : call.method === 'common:getNodes' ? { [uuid]: node } : {}
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }))
    })
  })
  await page.goto('/')
  const card = page.getByRole('link', { name: node.name })
  await expect(card).toBeVisible()
  await expect.poll(() => dropFirst).toBeDefined()
  dropFirst!()
  await expect.poll(() => connections, { timeout: 9000 }).toBeGreaterThanOrEqual(2)
  await expect(card).toBeVisible()
})

for (const { setting, interval } of [{ setting: 17, interval: 17_000 }, { setting: '17', interval: 3000 }]) {
  test(`dashboard and live load chart share the polling interval for ${JSON.stringify(setting)}`, async ({ page, baseURL }) => {
    await fixture(page, baseURL!, { dataUpdateInterval: setting })
    await page.addInitScript((expectedDelay) => {
      const setInterval = window.setInterval.bind(window)
      window.setInterval = (handler, delay, ...args) => {
        if (delay === expectedDelay) {
          const { dataset } = document.documentElement
          dataset.pollTimers = String(Number(dataset.pollTimers ?? 0) + 1)
        }
        return setInterval(handler, delay, ...args)
      }
    }, interval)

    await page.goto('/')
    const card = page.getByRole('link', { name: node.name })
    await expect(card).toBeVisible()
    const root = page.locator('html')
    await expect(root).toHaveAttribute('data-poll-timers', '1')

    await card.click()
    await expect(page.getByRole('tab', { name: '实时' })).toBeVisible()
    await expect(root).toHaveAttribute('data-poll-timers', '2')
  })
}

test('homepage starts the first node module during the initial data fetch', async ({ page, baseURL }) => {
  await fixture(page, baseURL!)
  const nodes = Promise.withResolvers<void>()
  const cardModule = page.waitForRequest(/\/assets\/NodeCard-[^/]+\.js$/)
  await page.route('**/api/rpc2', async (route) => {
    const rpc = route.request().postDataJSON() as RpcRequest
    if (rpc.method === 'common:getNodes')
      await nodes.promise
    await route.fallback()
  })
  try {
    await page.goto('/')
    await cardModule
    await expect(page.getByText('正在加载监控面板…')).toBeVisible()
    nodes.resolve()
    await expect(page.getByRole('link', { name: node.name })).toBeVisible()
  }
  finally {
    nodes.resolve()
  }
})

test('ping history starts while ECharts is blocked and the dialog stays usable', async ({ page, baseURL }) => {
  await fixture(page, baseURL!)
  const chart = Promise.withResolvers<void>()
  const history = Promise.withResolvers<void>()
  const chartRequest = page.waitForRequest(/\/assets\/echarts-[^/]+\.js$/)
  const calls = collectRpc(page)
  await page.route(/\/assets\/echarts-[^/]+\.js$/, async (route) => {
    await chart.promise
    await route.fallback()
  })
  await page.route('**/api/rpc2', async (route) => {
    const rpc = route.request().postDataJSON() as RpcRequest
    if (rpc.method === 'public:getPingMetricStats' && rpc.params?.hours === 1)
      await history.promise
    await route.fallback()
  })
  try {
    await page.goto('/')
    const trigger = page.locator('.node-card').first().locator('[data-ping-panel="latency"] [data-ping-task="1"]')
    await trigger.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading')).toContainText(node.name)
    const height = await dialog.evaluate(element => element.offsetHeight)
    await chartRequest
    await expect.poll(() => calls.filter(call => call.method === 'public:getPingMetricStats' && call.params?.hours === 1)).toHaveLength(1)

    await dialog.getByRole('tab', { name: '6 小时' }).click()
    await expect.poll(() => calls.filter(call => call.method === 'public:getPingMetricStats' && call.params?.hours === 6)).toHaveLength(1)
    history.resolve()
    await expect(dialog.getByRole('tab', { name: '6 小时' })).toHaveAttribute('data-state', 'active')
    await expect(dialog.getByText('正在加载图表…')).toBeVisible()
    expect(await dialog.evaluate(element => element.offsetHeight)).toBe(height)
    chart.resolve()
    await expect(dialog.locator('canvas').first()).toBeVisible()
    expect(await dialog.evaluate(element => element.offsetHeight)).toBe(height)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
  finally {
    chart.resolve()
    history.resolve()
  }
})

function trafficSeries({ params }: RpcRequest) {
  const hour = 3600000
  const start = Date.parse(params!.start!)
  const end = Math.min(Date.parse(params!.end!), now)
  const points = Array.from({ length: Math.max(0, Math.ceil((end - start) / hour)) }, (_, index) => ({
    time: new Date(start + index * hour).toISOString(),
    value: 1024,
  }))
  return {
    series: params!.entity_ids!.flatMap(id => ['traffic.up', 'traffic.down'].map(key => ({
      metric_key: key,
      entity_id: id,
      retention_days: 30,
      interval_seconds: 3600,
      points,
    }))),
  }
}

for (const retention of [7, 30]) {
  test(`traffic controls and data render independently of the engine and a ${retention}-day capability probe`, async ({ page, baseURL }) => {
    await fixture(page, baseURL!)
    const chart = Promise.withResolvers<void>()
    const definitions = Promise.withResolvers<void>()
    const calls = collectRpc(page)
    const trafficCalls = () => calls.filter(call => call.params?.metric_keys?.[0] === 'traffic.up')
    await page.route(/\/assets\/echarts-[^/]+\.js$/, async (route) => {
      await chart.promise
      await route.fallback()
    })
    await page.route('**/api/rpc2', async (route) => {
      const rpc = route.request().postDataJSON() as RpcRequest
      if (rpc.method === 'public:listMetricDefinitions') {
        await definitions.promise
        await route.fulfill({
          json: { jsonrpc: '2.0', id: rpc.id, result: ['traffic.up', 'traffic.down'].map(name => ({ name, retention_days: retention })) },
        })
      }
      else if (rpc.params?.metric_keys?.[0] === 'traffic.up') {
        await route.fulfill({ json: { jsonrpc: '2.0', id: rpc.id, result: trafficSeries(rpc) } })
      }
      else {
        await route.fallback()
      }
    })
    try {
      await page.goto('/')
      await expect(page.getByRole('link', { name: node.name })).toBeVisible()
      expect(trafficCalls()).toHaveLength(0)
      await page.getByRole('button', { name: '资源概览', exact: true }).click()
      await expect(page.getByText('每日流量趋势', { exact: true })).toBeVisible()
      await expect(page.getByRole('combobox', { name: '选择节点' })).toBeVisible()
      await expect.poll(() => trafficCalls().length).toBeGreaterThan(0)
      await expect(page.getByText('正在加载图表…')).toBeVisible()
      const month = page.getByRole('button', { name: '30 天', exact: true })
      await month.click()
      const initialQueries = trafficCalls().length
      definitions.resolve()
      chart.resolve()

      if (retention === 7) {
        await expect(month).toBeDisabled()
        expect(trafficCalls()).toHaveLength(initialQueries)
      }
      else {
        await expect.poll(() => trafficCalls().length).toBeGreaterThan(initialQueries)
        await expect(page.getByText('历史覆盖 30 / 30 天', { exact: true })).toBeVisible()
      }
      await expect(page.locator('canvas').first()).toBeVisible()
      await page.getByRole('combobox', { name: '选择节点' }).click()
      await page.getByRole('option', { name: node.name, exact: true }).click()
      await page.getByRole('button', { name: '本周期', exact: true }).click()
      await expect(page.getByText(/每月 10 日重置/)).toBeVisible()
      await expect(page.getByText('本周期累计:', { exact: true })).toBeVisible()
      expect(trafficCalls().some(call => call.params?.entity_ids?.join(',') === uuid)).toBe(true)
    }
    finally {
      chart.resolve()
      definitions.resolve()
    }
  })
}
