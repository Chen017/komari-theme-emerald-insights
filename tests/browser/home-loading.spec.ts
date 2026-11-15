import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockKomari, node } from './komariFixture'

const worldMap = 'https://cdn.jsdelivr.net/**/world.json'
const worldFixture = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Japan' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[130, 30], [142, 30], [142, 44], [130, 44], [130, 30]]],
    },
  }],
}

async function trackFirstNodePosition(page: Page) {
  await page.addInitScript(() => {
    let minimum = Infinity
    let maximum = -Infinity
    function record() {
      const node = document.querySelector('.node-card')
      if (node && document.documentElement) {
        const y = node.getBoundingClientRect().top
        minimum = Math.min(minimum, y)
        maximum = Math.max(maximum, y)
        document.documentElement.dataset.nodePositionChange = String(maximum - minimum)
        if (!document.querySelector('[data-home-visual]'))
          document.documentElement.dataset.nodeWithoutVisualLayout = 'true'
      }
      requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  })
}

test.describe('home startup on touch screens', () => {
  test.use({ isMobile: true, hasTouch: true })

  for (const width of [390, 1024]) {
    for (const mode of ['earth', 'maps'] as const) {
      test(`node cards stay in place while ${mode} loads at ${width}px`, async ({ page, baseURL }) => {
        await page.setViewportSize({ width, height: 900 })
        await mockKomari(page, baseURL!, 404, true, 3, mode)
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await trackFirstNodePosition(page)

        const moduleGate = Promise.withResolvers<void>()
        const mapGate = Promise.withResolvers<void>()
        const moduleFile = mode === 'earth' ? /\/NodeEarthGlobe-[^/]+\.js$/ : /\/NodeEarthMaps-[^/]+\.js$/
        await page.route(moduleFile, async (route) => {
          await moduleGate.promise
          await route.fallback()
        })
        if (mode === 'maps') {
          await page.route(worldMap, async (route) => {
            await mapGate.promise
            await route.fulfill({ json: worldFixture })
          })
        }
        const mapRequest = mode === 'maps' ? page.waitForRequest(worldMap) : undefined

        try {
          await page.goto('/', { waitUntil: 'domcontentloaded' })
          const visual = page.locator('[data-home-visual]')
          const firstNode = page.locator('.node-card').first()
          const status = visual.getByText(mode === 'earth' ? '正在加载地球…' : '正在加载地图…')
          await expect(page.getByText('月均成本', { exact: true })).toBeVisible()
          await expect(firstNode).toBeVisible()
          await expect(status).toBeVisible()
          await expect(visual.locator('canvas')).toHaveCount(0)
          const yBefore = (await firstNode.boundingBox())!.y

          moduleGate.resolve()
          if (mapRequest) {
            await mapRequest
            await expect(status).toBeVisible()
            expect(Math.abs((await firstNode.boundingBox())!.y - yBefore)).toBeLessThanOrEqual(1)
          }
          mapGate.resolve()

          await expect(visual.locator('canvas')).toBeVisible()
          await expect(visual).toHaveAttribute('aria-busy', 'false')
          await expect(status).toHaveCount(0)
          expect(Math.abs((await firstNode.boundingBox())!.y - yBefore)).toBeLessThanOrEqual(1)
          const position = await page.locator('html').getAttribute('data-node-position-change')
          expect(position).not.toBeNull()
          expect(Number(position)).toBeLessThanOrEqual(1)
          await expect(page.locator('html')).not.toHaveAttribute('data-node-without-visual-layout', 'true')
        }
        finally {
          moduleGate.resolve()
          mapGate.resolve()
        }
      })
    }
  }
})

test('a delayed node card module keeps the compact startup status visible', async ({ page, baseURL }) => {
  await mockKomari(page, baseURL!, 404, true, 3, 'cards')
  const cardModule = Promise.withResolvers<void>()
  const dataResponse = page.waitForResponse(response => response.url().endsWith('/api/rpc2')
    && response.request().postDataJSON()?.method === 'common:getNodesLatestStatus')
  await page.route(/\/NodeCard-[^/]+\.js$/, async (route) => {
    await cardModule.promise
    await route.fallback()
  })

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dataResponse
    const status = page.getByRole('status').filter({ hasText: '正在加载监控面板…' })
    await expect(status).toBeVisible()
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true')
    await expect(status.locator('div')).toHaveCount(0)
    await expect(page.locator('.node-card')).toHaveCount(0)
    cardModule.resolve()

    await expect(page.getByText('月均成本', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: node.name })).toBeVisible()
    await expect(status).toHaveCount(0)
  }
  finally {
    cardModule.resolve()
  }
})

test('a failed map bundle displays an error in the reserved visual area', async ({ page, baseURL }) => {
  await mockKomari(page, baseURL!, 404, true, 3, 'maps')
  const moduleGate = Promise.withResolvers<void>()
  await page.route(/\/NodeEarthMaps-[^/]+\.js$/, async (route) => {
    await moduleGate.promise
    await route.abort()
  })

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('正在加载地图…')).toBeVisible()
    const firstNode = page.locator('.node-card').first()
    await expect(firstNode).toBeVisible()
    const yBefore = (await firstNode.boundingBox())!.y
    moduleGate.resolve()

    const visual = page.locator('[data-home-visual="maps"]')
    await expect(visual.getByText('地图资源加载失败')).toBeVisible()
    await expect(visual).toHaveAttribute('aria-busy', 'false')
    expect(Math.abs((await firstNode.boundingBox())!.y - yBefore)).toBeLessThanOrEqual(1)
  }
  finally {
    moduleGate.resolve()
  }
})

test('an unavailable WebGL context replaces the globe loading status', async ({ page, baseURL }) => {
  await mockKomari(page, baseURL!, 404, true, 3, 'earth-stop')
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
      if (args[0] === 'webgl2' || args[0] === 'webgl')
        return null
      return Reflect.apply(getContext, this, args)
    }
  })

  await page.goto('/')
  const visual = page.locator('[data-home-visual="earth"]')
  await expect(visual.getByText('地球暂时无法显示')).toBeVisible()
  await expect(visual).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('link', { name: node.name })).toBeEnabled()
})
