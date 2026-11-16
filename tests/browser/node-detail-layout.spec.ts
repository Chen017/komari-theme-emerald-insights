import type { Locator } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockKomari, stealHistory, uuid } from './komariFixture'

const sectionSelector = '[data-node-detail-section]'
const groupSelector = '[data-node-detail-info]'
const chartLabels = ['CPU', '内存', '磁盘', '网络', '连接', '进程']
const infoGroups = [
  { id: 'cost', key: 'node_detail_show_cost', labels: ['节点价格', '月均支出', '剩余时间', '剩余价值'] },
  { id: 'hardware-system', key: 'node_detail_show_hardware_system', labels: ['硬件信息', '系统信息'] },
  { id: 'storage-network', key: 'node_detail_show_storage_network', labels: ['存储信息', '网络信息'] },
] as const

async function expectStack(items: Locator, attribute: string, ids: readonly string[]) {
  await expect(items).toHaveCount(ids.length)
  expect(await items.evaluateAll((elements, attr) => elements.map(element => element.getAttribute(attr)), attribute)).toEqual(ids)
  const gaps = await items.evaluateAll((elements) => {
    const boxes = elements.map(element => element.getBoundingClientRect())
    return boxes.slice(1).map((box, index) => Math.round(box.top - boxes[index]!.bottom))
  })
  expect(gaps).toEqual(ids.slice(1).map(() => 16))
}

for (const scenario of [
  { title: 'default charts', charts: ['CPU', '内存', '网络'], settings: {}, order: ['monitoring', 'ping', 'ipqa', 'info'] },
  {
    title: 'all charts and custom order',
    charts: chartLabels,
    settings: {
      node_detail_show_extra_charts: true,
      node_detail_section_1: '基础信息',
      node_detail_section_2: 'IP 质量概况',
      node_detail_section_3: '资源监控',
      node_detail_section_4: '延迟与丢包',
    },
    order: ['info', 'ipqa', 'monitoring', 'ping'],
  },
  {
    title: 'disk, connections and process only',
    charts: ['磁盘', '连接', '进程'],
    settings: { node_detail_show_primary_charts: false, node_detail_show_extra_charts: true },
    order: ['monitoring', 'ping', 'ipqa', 'info'],
  },
  {
    title: 'all charts hidden with repeated and invalid positions',
    charts: [],
    settings: {
      node_detail_show_primary_charts: false,
      node_detail_show_extra_charts: false,
      node_detail_section_1: '基础信息',
      node_detail_section_2: '基础信息',
      node_detail_section_3: 'invalid',
      node_detail_section_4: '延迟与丢包',
    },
    order: ['info', 'ipqa', 'ping'],
  },
]) {
  test(`node detail uses ${scenario.title} and reflows on desktop, tablet and phone`, async ({ page, baseURL }) => {
    const stealRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === stealHistory)
        stealRequests.push(request.url())
    })
    await mockKomari(page, baseURL!, 404, true, undefined, undefined, undefined, undefined, undefined, {
      enable_node_detail_ipqa: true,
      ...scenario.settings,
    })
    await page.goto(`/instance/${uuid}`)

    const sections = page.locator(sectionSelector)
    const grid = page.locator('[data-load-chart-grid]')
    const cards = grid.locator(':scope > div')
    await expect(page.getByRole('tab', { name: '实时', exact: true })).toHaveCount(scenario.charts.length ? 1 : 0)
    if (scenario.charts.length) {
      await expect(cards).toHaveCount(scenario.charts.length)
      for (const [index, label] of scenario.charts.entries())
        await expect(cards.nth(index).getByText(label, { exact: true })).toBeVisible()
    }
    else {
      await expect(grid).toHaveCount(0)
    }

    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expectStack(sections, 'data-node-detail-section', scenario.order)
      await expect.poll(() => page.locator('.instance-detail').evaluate(root => root.scrollWidth - root.clientWidth)).toBe(0)
      if (scenario.charts.length === 3) {
        const fillsRow = await grid.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const last = element.lastElementChild!.getBoundingClientRect()
          return Math.abs(last.left - bounds.left) < 1 && Math.abs(last.right - bounds.right) < 1
        })
        expect(fillsRow).toBe(width < 1280)
      }
    }
    if (!scenario.charts.includes('CPU'))
      expect(stealRequests).toHaveLength(0)
  })
}

for (const visible of [
  ['cost', 'hardware-system', 'storage-network'],
  ['cost', 'hardware-system'],
  ['cost', 'storage-network'],
  ['hardware-system', 'storage-network'],
  ['cost'],
  ['hardware-system'],
  ['storage-network'],
  [],
]) {
  test(`node detail closes gaps with ${visible.join(' and ') || 'all basic information hidden'}`, async ({ page, baseURL }) => {
    await mockKomari(page, baseURL!, 404, true, undefined, undefined, undefined, undefined, undefined, {
      node_detail_section_2: '基础信息',
      node_detail_section_4: '延迟与丢包',
      ...Object.fromEntries(infoGroups.map(group => [group.key, visible.includes(group.id)])),
    })
    await page.goto(`/instance/${uuid}`)
    await expect(page.getByText('CPU', { exact: true }).first()).toBeVisible()
    await expectStack(page.locator(sectionSelector), 'data-node-detail-section', visible.length ? ['monitoring', 'info', 'ping'] : ['monitoring', 'ping'])
    await expectStack(page.locator(groupSelector), 'data-node-detail-info', visible)
    for (const { id, labels } of infoGroups) {
      const group = page.locator(`[data-node-detail-info="${id}"]`)
      if (!visible.includes(id)) {
        await expect(group).toHaveCount(0)
        continue
      }
      for (const label of labels)
        await expect(group.getByText(label, { exact: true })).toBeVisible()
      const heights = await group.locator(':scope > div').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height))
      expect(new Set(heights).size).toBe(1)
    }
  })
}

test('resource overview removes the budget card and keeps the dedicated cost page accessible', async ({ page, baseURL }) => {
  await mockKomari(page, baseURL!, 404, true)
  await page.goto('/resource-insights')
  await expect(page.getByRole('heading', { name: '资源概览', exact: true })).toBeVisible()
  await expect(page.getByText('成本与预算摘要', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '成本与续费', exact: true }).click()
  await expect(page.getByRole('heading', { name: '成本与续费', exact: true })).toBeVisible()
})
