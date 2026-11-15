import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- This repository uses Node's test runner.
import { it } from 'node:test'
import { createPageScroll, pageTransition } from '../../src/router/pageNavigation'

const home = { name: 'home', path: '/' }
const instance = { name: 'instance-detail', path: '/instance/a' }
const resource = { name: 'resource-insights', path: '/resource-insights' }
const cost = { name: 'cost-renewal', path: '/cost-renewal' }
const archive = { name: 'ipqa-node-detail', path: '/ip-quality/a' }

it('uses mirrored motion for main-to-detail, resource-to-detail and cost-to-detail paths', () => {
  for (const [from, to] of [[home, instance], [home, resource], [home, cost], [resource, archive], [cost, instance], [instance, archive]] as const) {
    assert.equal(pageTransition(from, to), 'page-forward')
    assert.equal(pageTransition(to, from), 'page-back')
  }
})

it('uses neutral motion between sibling pages and different instances', () => {
  assert.equal(pageTransition(resource, cost), 'page-fade')
  assert.equal(pageTransition(cost, resource), 'page-fade')
  assert.equal(pageTransition(instance, { ...instance, path: '/instance/b' }), 'page-fade')
})

it('restores source scroll for home and resource overview; saved browser history takes priority', () => {
  const scroll = createPageScroll()
  scroll.remember(home, 0, 330)
  scroll.remember(resource, 0, 1024)
  scroll.remember(instance, 0, 80)
  assert.deepEqual(scroll.restore(home, instance, null), { left: 0, top: 330 })
  assert.deepEqual(scroll.restore(resource, archive, null), { left: 0, top: 1024 })
  assert.deepEqual(scroll.restore(resource, archive, { left: 0, top: 240 }), { left: 0, top: 240 })
  assert.deepEqual(scroll.restore(instance, home, null), { top: 0 })
})

it('keeps scroll in place for archive date changes and honors saved history positions', () => {
  const scroll = createPageScroll()
  assert.equal(scroll.restore(archive, archive, null), false)
  assert.deepEqual(scroll.restore(archive, archive, { left: 0, top: 500 }), { left: 0, top: 500 })
})

it('omits all retired setting keys and sections from the packaged schema input', async () => {
  const { configuration: { data } } = JSON.parse(await readFile(new URL('../../komari-theme.json', import.meta.url), 'utf8')) as {
    configuration: { data: { key?: string, name: string }[] }
  }
  const keys = data.flatMap(setting => setting.key ? [setting.key] : [])
  for (const key of [
    'alertEnabled',
    'alertTitle',
    'alertContent',
    'disablePageAnimation',
    'icpEnabled',
    'icpNumber',
    'icpUrl',
    'policeEnabled',
    'policeNumber',
    'policeUrl',
    'backgroundEnabled',
    'backgroundType',
    'lightBackgroundUrl',
    'darkBackgroundUrl',
    'backgroundBlur',
    'backgroundOverlay',
  ]) {
    assert.equal(keys.includes(key), false, key)
  }
  assert.deepEqual(data.filter(setting => !setting.key).map(setting => setting.name), [
    '基础设置',
    '页面设置',
    '首页探测',
    '资源概览与 IPQA 设置',
    'CPU Steal 设置',
  ])
  for (const key of ['earthViewMode', 'offlineNodesLast', 'rpcTransportMode', 'homePingLineCount', 'enable_resource_insights', 'enable_cost_renewal', 'enable_cpu_steal']) {
    assert.ok(keys.includes(key), key)
  }
})
