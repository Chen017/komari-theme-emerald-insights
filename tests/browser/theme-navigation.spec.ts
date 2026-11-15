import type { Page } from '@playwright/test'
import type { IpqaDailyPairedReport, IpqaFleetOverview } from '../../src/features/ipqa/types'
import type { RpcRequest } from './komariFixture'
import { expect, test } from '@playwright/test'
import { mockKomari, node, uuid } from './komariFixture'

async function setup(
  page: Page,
  baseURL: string,
  options: { reduced?: boolean, settings?: Record<string, unknown> } = {},
) {
  await mockKomari(page, baseURL, 404, true, 3, 'hide', false, undefined, true, options.settings)
  await page.emulateMedia({ reducedMotion: options.reduced ? 'reduce' : 'no-preference' })
  await page.addInitScript(() => {
    document.addEventListener('transitionrun', (event) => {
      if (event.propertyName !== 'opacity' || !(event.target instanceof HTMLElement))
        return
      const name = [...event.target.classList].find(value => /^page-(?:forward|back|fade)-(?:enter|leave)-active$/.test(value))
      if (name)
        document.documentElement.dataset.pageMotion += ` ${name}`
      if (event.target.classList.contains('startup-content-enter-active'))
        document.documentElement.dataset.startupMotion += ' content-enter'
      if (event.target.classList.contains('startup-loading-leave-active')) {
        document.documentElement.dataset.startupMotion += ' loading-leave'
        document.documentElement.dataset.startupOverlap = String(
          document.querySelector('.home-view') !== null
          && event.target.getAttribute('aria-hidden') === 'true'
          && getComputedStyle(event.target).pointerEvents === 'none',
        )
      }
    })
    document.addEventListener('animationstart', (event) => {
      if (event.animationName.startsWith('dialog-'))
        document.documentElement.dataset.dialogMotion += ` ${event.animationName}`
    })
  })
}

function motion(page: Page, property: 'pageMotion' | 'dialogMotion' | 'startupMotion') {
  return page.evaluate(key => document.documentElement.dataset[key] || '', property)
}

function pingTrigger(page: Page, index = 0, panel = 'latency') {
  return page.locator('.node-card').nth(index).locator(`[data-ping-panel="${panel}"] [data-ping-task="1"]`)
}

test('the startup status fades over ready content without blocking it', async ({ page, baseURL }) => {
  await setup(page, baseURL!)
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' })
  const health = Promise.withResolvers<void>()
  await page.route('**/api/rpc2', async (route) => {
    const request = route.request().postDataJSON() as RpcRequest
    if (request.method === 'rpc.ping')
      await health.promise
    await route.fallback()
  })

  try {
    await page.goto('/')
    const status = page.getByText('正在加载监控面板…', { exact: true })
    await expect(status).toBeVisible()
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    health.resolve()

    await expect.poll(() => motion(page, 'startupMotion')).toContain('content-enter')
    await expect.poll(() => motion(page, 'startupMotion')).toContain('loading-leave')
    await expect(page.locator('html')).toHaveAttribute('data-startup-overlap', 'true')
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('link', { name: node.name })).toBeVisible()
    await expect(status).toHaveCount(0)

    const startupMotion = await motion(page, 'startupMotion')
    await page.getByRole('button', { name: '资源概览', exact: true }).click()
    await expect.poll(() => motion(page, 'pageMotion')).toContain('page-forward-enter-active')
    expect(await motion(page, 'startupMotion')).toBe(startupMotion)
  }
  finally {
    health.resolve()
  }
})

test('the footer links to the Emerald Insights repository', async ({ page, baseURL }) => {
  await setup(page, baseURL!)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Komari Emerald', exact: true }))
    .toHaveAttribute('href', 'https://github.com/Chen017/komari-theme-emerald-insights')
  await expect(page.getByRole('link', { name: 'Komari Monitor', exact: true }))
    .toHaveAttribute('href', 'https://github.com/komari-monitor/komari')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the scrolled navigation remains translucent and blurred in ${colorScheme}`, async ({ page, baseURL }) => {
    await setup(page, baseURL!)
    await page.emulateMedia({ colorScheme })
    await page.setViewportSize({ width: 390, height: 400 })
    await page.goto('/')
    await expect(page.getByRole('link', { name: node.name })).toBeVisible()
    const header = page.locator('.sticky').filter({ has: page.getByRole('link', { name: /Komari Browser Test/ }) })
    await expect(header).toHaveCSS('backdrop-filter', 'none')

    await page.evaluate(() => window.scrollTo(0, 160))
    await expect(header).toHaveCSS('backdrop-filter', 'blur(14px)')
    await expect.poll(() => header.evaluate((element) => {
      const context = document.createElement('canvas').getContext('2d')!
      context.fillStyle = getComputedStyle(element).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return context.getImageData(0, 0, 1, 1).data[3]
    })).toBe(Math.round(0.62 * 255))
    expect((await header.boundingBox())!.y).toBeCloseTo(0, 0)

    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(header).toHaveCSS('backdrop-filter', 'none')
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`legacy announcement, filing and media settings are ignored in ${colorScheme}`, async ({ page, baseURL }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('retired-theme'))
        requested.push(request.url())
    })
    await setup(page, baseURL!, {
      settings: {
        alertEnabled: true,
        alertTitle: 'Legacy announcement marker',
        alertContent: '![retired](https://example.test/retired-theme-alert.png)',
        disablePageAnimation: true,
        icpEnabled: true,
        icpNumber: 'Legacy ICP marker',
        icpUrl: 'https://example.test/retired-theme-icp',
        policeEnabled: true,
        policeNumber: 'Legacy police marker',
        policeUrl: 'https://example.test/retired-theme-police',
        backgroundEnabled: true,
        backgroundType: colorScheme === 'light' ? 'image' : 'video',
        lightBackgroundUrl: 'https://example.test/retired-theme-light.png',
        darkBackgroundUrl: 'https://example.test/retired-theme-dark.mp4',
        backgroundBlur: 40,
        backgroundOverlay: 80,
      },
    })
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await expect(page.getByRole('link', { name: node.name })).toBeVisible()
    await expect(page.getByText(/Legacy (?:announcement|ICP|police) marker/)).toHaveCount(0)
    await expect(page.locator('video, a[href*="retired-theme"]')).toHaveCount(0)
    const backdrop = page.locator('[aria-hidden="true"].pointer-events-none.fixed svg').first()
    await expect(backdrop).toBeAttached()
    expect(requested).toEqual([])
    if (colorScheme === 'dark')
      await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: '资源概览', exact: true }).click()
    await expect.poll(() => motion(page, 'pageMotion')).toContain('page-forward-enter-active')
    await expect(page.getByRole('link', { name: 'Komari Monitor', exact: true })).toBeVisible()
  })
}

test('node details animate in both directions and preserve home position and groups', async ({ page, baseURL }) => {
  await setup(page, baseURL!)
  await page.setViewportSize({ width: 390, height: 360 })
  await page.goto('/')
  const group = page.getByRole('button', { name: 'Japan' })
  await group.click()
  await expect(page.locator('.node-card')).toHaveCount(1)
  const card = page.getByRole('link', { name: node.name })
  await page.evaluate(() => window.scrollTo(0, 150))
  const position = await page.evaluate(() => window.scrollY)
  expect(position).toBeGreaterThan(0)
  await card.evaluate((element: HTMLAnchorElement) => element.click())
  await expect(page).toHaveURL(`/instance/${uuid}`)
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-forward-enter-active')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('main [inert]')).toHaveCount(0)
  await page.getByRole('button', { name: '返回首页', exact: true }).click()
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-back-enter-active')
  await expect(group).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position)
  await expect(page.locator('.node-card')).toHaveCount(1)
})

test('resource and renewal routes handle home, browser history and sibling transitions', async ({ page, baseURL }) => {
  await setup(page, baseURL!)
  await page.goto('/')
  const overview = page.getByRole('button', { name: '资源概览', exact: true })
  const cost = page.getByRole('button', { name: '成本与续费', exact: true })
  const home = page.getByRole('link', { name: /Komari Browser Test/ })
  await overview.click()
  await expect(page.getByRole('heading', { name: '资源概览', exact: true })).toBeFocused()
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-forward-enter-active')
  await cost.click()
  await expect(page.getByRole('heading', { name: '成本与续费', exact: true })).toBeFocused()
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-fade-enter-active')
  await page.goBack()
  await expect(page.getByRole('heading', { name: '资源概览', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: '成本与续费', exact: true })).toBeVisible()
  await home.click()
  await expect(page.locator('.node-card').getByRole('link', { name: node.name })).toBeVisible()
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-back-enter-active')
  await expect(page.locator('main [inert]')).toHaveCount(0)
})

for (const method of ['Escape', 'button', 'outside'] as const) {
  test(`ping dialog animates its exit and restores trigger focus via ${method}`, async ({ page, baseURL }) => {
    await setup(page, baseURL!)
    await page.goto('/')
    const trigger = pingTrigger(page)
    await trigger.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect.poll(() => motion(page, 'dialogMotion')).toContain('dialog-in')

    if (method === 'Escape')
      await page.keyboard.press('Escape')
    else if (method === 'button')
      await dialog.getByRole('button', { name: '关闭' }).click()
    else
      await page.mouse.click(4, 4)

    await expect.poll(() => motion(page, 'dialogMotion')).toContain('dialog-out')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.dialog-scrim')).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => document.body.style.pointerEvents)).not.toBe('none')
  })
}

test('rapid close and reopen across nodes keeps the latest selection and releases the overlay', async ({ page, baseURL }) => {
  await setup(page, baseURL!)
  await page.goto('/')
  const first = pingTrigger(page)
  const second = pingTrigger(page, 1, 'loss')
  await first.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await second.evaluate((element: HTMLButtonElement) => element.click())
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading')).toContainText('Edge fixture node')
  await expect(dialog.getByRole('heading')).not.toHaveText(/^Browser fixture node/)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(second).toBeFocused()
  await page.getByRole('button', { name: '资源概览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '资源概览', exact: true })).toBeVisible()
})

test('reduced motion keeps navigation and a narrow dark dialog usable', async ({ page, baseURL }) => {
  await setup(page, baseURL!, { reduced: true })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 360, height: 620 })
  await page.goto('/')
  const trigger = pingTrigger(page)
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThan(360)
  expect(bounds!.height).toBeLessThan(620)
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.getByRole('link', { name: node.name }).click()
  await expect(page).toHaveURL(`/instance/${uuid}`)
  expect(await motion(page, 'pageMotion')).toBe('')
  expect(await motion(page, 'dialogMotion')).toBe('')
  expect(await motion(page, 'startupMotion')).toBe('')
})

test.describe('touch viewport', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 780 } })

  test('the ping canvas fits the dialog and the close icon works without an icon CDN', async ({ page, baseURL }) => {
    await setup(page, baseURL!)
    await page.goto('/')
    await pingTrigger(page, 0, 'loss').tap()
    const dialog = page.getByRole('dialog')
    const close = dialog.getByRole('button', { name: '关闭' })
    const canvas = dialog.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await expect.poll(async () => {
      const chart = await canvas.boundingBox()
      const panel = await dialog.boundingBox()
      return Boolean(chart && panel && chart.x + chart.width <= panel.x + panel.width + 1)
    }).toBe(true)
    await expect(close.locator('svg')).toBeVisible()
    await close.tap()
    await expect(dialog).toHaveCount(0)
  })
})

const archiveDates = ['2026-11-10', '2026-11-09']

function ipqaReport(date: string): IpqaDailyPairedReport {
  const timestamp = `${date}T10:00:00Z`
  return {
    schemaVersion: 1,
    nodeUuid: uuid,
    date,
    updatedAt: timestamp,
    v4: {
      schemaVersion: 1,
      ipVersion: 'IPv4',
      archiveId: date,
      date,
      timestamp,
      info: { ip: '192.0.2.1', country: 'JP' },
      scores: {},
      type: { usage: {}, company: {} },
      factors: {},
      media: {},
      mail: {},
      extra: {},
    },
    v6: null,
    summary: { hasV4: true, hasV6: false, highestRiskCategory: 'Low', highestRiskSource: 'Fixture', mediaSummary: {}, aiSummary: {} },
  }
}

test('resource details animate on enter and return while archive dates keep the same route view', async ({ page, baseURL }) => {
  await setup(page, baseURL!)
  const overview: IpqaFleetOverview = {
    schema_version: 1,
    updated_at: '2026-11-10T10:00:00Z',
    total_nodes: 1,
    ipqa_nodes: 1,
    nodes_with_risk: 0,
    nodes_with_changes_today: 0,
    latest_archive_date: archiveDates[0]!,
    nodes: [{
      uuid,
      name: node.name,
      status: 'ok',
      latest_date: archiveDates[0]!,
      has_ipv4: true,
      has_ipv6: false,
      highest_risk: { category: 'Low', source: 'Fixture' },
      media_summary: {},
      ai_summary: {},
      changes_today: 0,
    }],
  }
  await page.route('**/api/plugin/ipqa-alert-report/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/overview'))
      return route.fulfill({ json: overview })
    if (path.endsWith('/archives'))
      return route.fulfill({ json: { dates: archiveDates, hasMore: false } })
    if (path.includes('/archives/'))
      return route.fulfill({ json: ipqaReport(path.split('/').at(-1)!) })
    if (path.endsWith('/changes') || path.endsWith('/changes/recent'))
      return route.fulfill({ json: { changes: [] } })
    return route.fallback()
  })
  await page.goto('/resource-insights')
  await expect(page.getByRole('heading', { name: '资源概览', exact: true })).toBeVisible()
  expect(await motion(page, 'pageMotion')).toBe('')
  await page.getByRole('link', { name: '查看详情' }).click()
  await expect(page).toHaveURL(`/ip-quality/${uuid}`)
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-forward-enter-active')
  const date = page.getByRole('combobox', { name: '选择检测存档日期' })
  await date.click()
  await page.getByRole('option', { name: archiveDates[1] }).click()
  await expect(page).toHaveURL(/\?date=2026-11-09$/)
  await expect(date).toContainText(archiveDates[1]!)
  const pageEvents = await motion(page, 'pageMotion')
  expect(pageEvents.match(/page-forward-enter-active/g)).toHaveLength(1)
  await page.getByRole('link', { name: '返回资源概览' }).click()
  await expect(page.getByRole('heading', { name: '资源概览', exact: true })).toBeVisible()
  await expect.poll(() => motion(page, 'pageMotion')).toContain('page-back-enter-active')
})
