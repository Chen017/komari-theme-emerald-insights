import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../../komari-theme.json', import.meta.url), 'utf8'))
const entries = manifest.configuration.data as Array<{ name?: string, key?: string, type?: string, default?: boolean | string, help?: string, options?: string }>

test('Steal functionality stays enabled but the chart line starts hidden', () => {
  const heading = entries.findIndex(item => item.name === 'CPU Steal 设置' && item.type === 'title')
  assert.ok(heading > 0)
  const enable = entries[heading + 1]
  assert.equal(enable?.key, 'enable_cpu_steal')
  assert.equal(enable?.default, true)
  assert.match(enable?.help ?? '', /插件商店/)
  assert.ok(!('url' in enable))
  const multiplier = entries[heading + 2]
  assert.equal(multiplier?.key, 'cpu_steal_multiplier')
  assert.equal(multiplier?.type, 'select')
  assert.equal(multiplier?.default, '10')
  assert.equal(multiplier?.options, '1,5,10,20,50')
  const visible = entries[heading + 3]
  assert.equal(visible?.key, 'cpu_steal_default_visible')
  assert.equal(visible?.type, 'switch')
  assert.equal(visible?.default, false)
})

test('ECharts retains manual legend selection independently of data updates', () => {
  const component = readFileSync(new URL('../../src/components/LoadChart.vue', import.meta.url), 'utf8')
  assert.match(component, /@legendselectchanged="onCpuLegendSelectChanged"/)
  assert.match(component, /selected: cpuLegendSelected.value/)
  assert.match(component, /Steal ×/)
  assert.match(component, /formatRealSteal\(realValue\)/)
  assert.match(component, /stealDisplayValues.value/)
})
