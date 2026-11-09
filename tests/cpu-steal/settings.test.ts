import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../../komari-theme.json', import.meta.url), 'utf8'))
const entries = manifest.configuration.data as Array<{ name?: string, key?: string, type?: string, default?: boolean, help?: string }>

test('CPU Steal has its own managed settings section and static plugin-store instructions', () => {
  const heading = entries.findIndex(item => item.name === 'CPU Steal 设置' && item.type === 'title')
  assert.ok(heading > 0)
  const preference = entries[heading + 1]
  assert.equal(preference?.key, 'enable_cpu_steal')
  assert.equal(preference?.type, 'switch')
  assert.equal(preference?.default, true)
  assert.match(preference?.help ?? '', /插件商店/)
  assert.match(preference?.help ?? '', /CPU Steal Monitor/)
  assert.ok(!('url' in preference))
})
