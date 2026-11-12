import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { access, copyFile, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import vueDevTools from 'vite-plugin-vue-devtools'

const require = createRequire(import.meta.url)
const archiver = require('archiver')
const packageJson = require('./package.json')

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  }
  catch {
    return 'unknown'
  }
}

function shouldIgnoreRollupWarning(warning: { code?: string, id?: string }): boolean {
  return warning.code === 'INVALID_ANNOTATION'
    && warning.id?.includes('/node_modules/@vueuse/core/dist/index.js') === true
}

/**
 * Vite 插件：构建后打包 Komari 主题 Zip
 * theme.zip
 * ├── komari-theme.json
 * ├── preview.png
 * └── dist/
 */
function komariThemeZip(beta: boolean, version: string, hash: string): Plugin {
  return {
    name: 'komari-theme-zip',
    apply: 'build',
    async writeBundle() {
      const zipFileName = beta ? `komari-theme-emerald-insights-beta-${hash}.zip` : 'komari-theme-emerald-insights.zip'
      const distDir = resolve(__dirname, 'dist')
      const outputPath = resolve(__dirname, zipFileName)
      const [manifestData, preview] = await Promise.all([
        readFile(resolve(__dirname, 'komari-theme.json')),
        readFile(resolve(__dirname, 'docs/preview.png')),
        access(resolve(distDir, 'index.html')),
      ])
      const manifest = JSON.parse(manifestData.toString('utf8'))
      if (manifest.version !== packageJson.version || manifest.preview !== 'preview.png')
        throw new Error('Theme manifest version or preview does not match the Komari archive contract')

      const stage = await mkdtemp(resolve(__dirname, '.theme-package-'))
      try {
        const candidate = resolve(stage, zipFileName)
        const archive = archiver('zip', { zlib: { level: 9 } })
        archive.on('warning', (error: Error) => archive.destroy(error))
        archive.append(
          beta ? JSON.stringify({ ...manifest, name: `${manifest.name} (Beta)`, version }, null, 2) : manifestData,
          { name: 'komari-theme.json' },
        )
        archive.append(preview, { name: 'preview.png' })
        archive.directory(distDir, 'dist')
        await Promise.all([pipeline(archive, createWriteStream(candidate)), archive.finalize()])
        await rename(candidate, outputPath)
        const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
        console.log(`[komari-theme-zip] Created ${zipFileName} (${sizeMB} MB)`)
      }
      finally {
        await rm(stage, { recursive: true, force: true })
      }

      if (process.platform === 'win32' && process.env.USERPROFILE && !process.env.CI) {
        const desktopDir = resolve(process.env.USERPROFILE, 'Desktop')
        if (existsSync(desktopDir)) {
          const desktopZip = resolve(desktopDir, beta ? zipFileName : 'komari-theme-emerald.zip')
          await copyFile(outputPath, desktopZip).catch(error => console.error('[komari-theme-zip] Desktop copy failed:', error))
        }
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const beta = mode === 'beta'
  const hash = getCommitHash()
  const version = beta ? `${packageJson.version}-beta.performance.g${hash}` : packageJson.version
  return {
    define: {
      __BUILD_VERSION__: JSON.stringify(version),
      __BUILD_GIT_HASH__: JSON.stringify(hash),
    },
    plugins: [
      vue(),
      vueDevTools(),
      tailwindcss(),
      komariThemeZip(beta, version, hash),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          if (shouldIgnoreRollupWarning(warning))
            return
          defaultHandler(warning)
        },
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'echarts': ['echarts', 'vue-echarts'],
            'reka-ui': ['reka-ui'],
            'vueuse': ['@vueuse/core'],
          },
        },
      },
    },
  }
})
