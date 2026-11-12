import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import process from 'node:process'

const zip = resolve(process.argv[2] ?? 'komari-theme-emerald-insights.zip')
const windows = process.platform === 'win32'
const files = execFileSync(windows ? 'tar' : 'unzip', windows ? ['-tf', zip] : ['-Z', '-1', zip], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
function readEntry(entry, maxBuffer = 1024 * 1024) {
  return execFileSync(windows ? 'tar' : 'unzip', windows ? ['-xOf', zip, entry] : ['-p', zip, entry], { maxBuffer })
}

assert.equal(new Set(files).size, files.length, 'ZIP has duplicate entries')
assert.ok(files.every(file => file === 'komari-theme.json' || file === 'preview.png' || file.startsWith('dist/')))
for (const entry of ['komari-theme.json', 'preview.png', 'dist/index.html'])
  assert.ok(files.includes(entry), `${entry} is missing from ZIP`)

const manifest = JSON.parse(readFileSync('komari-theme.json', 'utf8'))
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(manifest.version, version)
const beta = /^komari-theme-emerald-insights-beta-([\da-f]+)\.zip$/.exec(basename(zip))
const expected = beta
  ? { ...manifest, name: `${manifest.name} (Beta)`, version: `${version}-beta.performance.g${beta[1]}` }
  : manifest
assert.deepEqual(JSON.parse(readEntry('komari-theme.json')), expected)
const preview = readFileSync('docs/preview.png')
assert.deepEqual(readEntry('preview.png', preview.length + 1), preview)

const html = readEntry('dist/index.html').toString('utf8')
const assets = Array.from(html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g), match => match[1])
assert.ok(assets.some(asset => asset.endsWith('.js')), 'Built HTML has no script entry')
for (const asset of assets)
  assert.ok(files.includes(`dist/${asset}`), `${asset} referenced by HTML is missing from ZIP`)
console.log(`Verified ${basename(zip)} (${expected.version})`)
