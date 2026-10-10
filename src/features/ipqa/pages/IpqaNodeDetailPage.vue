<script setup lang="ts">
import type { IpqaDailyPairedReport, IpqaNormalizedReport, IpqaSemanticChange } from '../types'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNodesStore } from '@/stores/nodes'
import IpqaArchiveNavigator from '../components/IpqaArchiveNavigator.vue'
import IpqaBasicInfo from '../components/IpqaBasicInfo.vue'
import IpqaChangeTimeline from '../components/IpqaChangeTimeline.vue'
import IpqaFactorMatrix from '../components/IpqaFactorMatrix.vue'
import IpqaMailPanel from '../components/IpqaMailPanel.vue'
import IpqaMediaPanel from '../components/IpqaMediaPanel.vue'
import IpqaRawDetails from '../components/IpqaRawDetails.vue'
import IpqaRiskScores from '../components/IpqaRiskScores.vue'
import {
  fetchNodeArchive,
  fetchNodeArchivePage,
  fetchNodeChanges,
  fetchNodeLatest,
} from '../services/api'

defineOptions({ name: 'IpqaNodeDetailPage' })

const route = useRoute()
const router = useRouter()
const nodesStore = useNodesStore()

const uuid = computed(() => String(route.params.uuid || ''))
const node = computed(() => nodesStore.nodes.find(n => n.uuid === uuid.value) || null)

const backTarget = computed(() => {
  const fromInstance = route.query.from === 'instance'
    || (typeof window !== 'undefined' && Boolean(window.history.state?.back?.includes(`/instance/${uuid.value}`)))
  if (fromInstance) {
    return {
      to: `/instance/${uuid.value}`,
      label: '返回节点详情',
    }
  }
  return {
    to: '/resource-insights',
    label: '返回资源概览',
  }
})

const loading = ref(true)
const dates = ref<string[]>([])
const currentDate = ref<string>('')
const currentReport = ref<IpqaDailyPairedReport | null>(null)
const activeIpVersion = ref<'IPv4' | 'IPv6'>('IPv4')
const nodeChanges = ref<IpqaSemanticChange[]>([])
const hasMoreArchives = ref(false)
const loadingMore = ref(false)
const archiveCursor = ref<string | undefined>()
const errorMessage = ref('')
const nameExpanded = ref(false)
const copiedUuid = ref(false)

type TabKey = 'info' | 'score' | 'factor' | 'media' | 'mail' | 'changes' | 'raw'
const activeTab = ref<TabKey>('info')

const tabs: Array<{ key: TabKey, label: string, icon: string }> = [
  { key: 'info', label: '基本信息', icon: 'lucide:network' },
  { key: 'score', label: '风控评分', icon: 'lucide:shield-alert' },
  { key: 'factor', label: '风险因子', icon: 'lucide:sliders-horizontal' },
  { key: 'media', label: '流媒体与 AI', icon: 'lucide:tv-2' },
  { key: 'mail', label: '邮件与黑名单', icon: 'lucide:mail' },
  { key: 'changes', label: '历史变动', icon: 'lucide:history' },
  { key: 'raw', label: '原始归档', icon: 'lucide:code-2' },
]

let loadGeneration = 0
let pageGeneration = 0
const archiveDatePattern = /^\d{4}-\d{2}-\d{2}$/

async function loadArchive(targetDate?: string, refreshMetadata = true) {
  const generation = ++loadGeneration
  const targetUuid = uuid.value
  loading.value = true
  errorMessage.value = ''

  try {
    let availableDates = dates.value

    if (refreshMetadata) {
      pageGeneration += 1
      loadingMore.value = false
      const [page, changes] = await Promise.allSettled([
        fetchNodeArchivePage(targetUuid),
        fetchNodeChanges(targetUuid),
      ])
      if (generation !== loadGeneration)
        return
      if (page.status === 'rejected')
        throw page.reason
      availableDates = page.value.dates
      dates.value = availableDates
      hasMoreArchives.value = page.value.hasMore
      archiveCursor.value = availableDates.at(-1)
      if (changes.status === 'fulfilled')
        nodeChanges.value = changes.value
      else errorMessage.value = '历史变动更新失败，归档报告仍可查看'
    }

    if (availableDates.length > 0) {
      const selected = targetDate && archiveDatePattern.test(targetDate)
        ? targetDate
        : availableDates[0]!

      const report = await fetchNodeArchive(targetUuid, selected)
      if (generation !== loadGeneration)
        return

      currentDate.value = selected
      currentReport.value = report
      if (report && !dates.value.includes(selected))
        dates.value = [...dates.value, selected].sort().reverse()

      if (activeIpVersion.value === 'IPv6' && report?.v6) {
        activeIpVersion.value = 'IPv6'
      }
      else if (report?.v4) {
        activeIpVersion.value = 'IPv4'
      }
      else if (report?.v6) {
        activeIpVersion.value = 'IPv6'
      }
    }
    else {
      const latest = await fetchNodeLatest(targetUuid)
      if (generation !== loadGeneration)
        return

      currentReport.value = latest
      if (latest) {
        dates.value = [latest.date]
        currentDate.value = latest.date
        activeIpVersion.value = activeIpVersion.value === 'IPv6' && latest.v6 ? 'IPv6' : (latest.v4 ? 'IPv4' : 'IPv6')
      }
      else {
        currentDate.value = ''
      }
    }
  }
  catch (err) {
    if (generation !== loadGeneration)
      return
    console.warn('[IPQA Detail] Error loading node archive:', err)
    errorMessage.value = err instanceof Error ? err.message : '归档加载失败，请重试'
    if (targetDate && targetDate !== currentReport.value?.date)
      currentReport.value = null
  }
  finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

async function loadMoreArchives() {
  if (loadingMore.value || !hasMoreArchives.value || !archiveCursor.value)
    return
  const generation = ++pageGeneration
  loadingMore.value = true
  try {
    const page = await fetchNodeArchivePage(uuid.value, 30, archiveCursor.value)
    if (generation !== pageGeneration)
      return
    dates.value = [...new Set([...dates.value, ...page.dates])].sort().reverse()
    archiveCursor.value = page.dates.at(-1)
    hasMoreArchives.value = page.hasMore && page.dates.length > 0
  }
  catch (err) {
    if (generation === pageGeneration)
      errorMessage.value = err instanceof Error ? err.message : '更早日期加载失败'
  }
  finally {
    if (generation === pageGeneration)
      loadingMore.value = false
  }
}

async function copyUuid() {
  try {
    await navigator.clipboard.writeText(uuid.value)
    copiedUuid.value = true
  }
  catch { errorMessage.value = '复制失败，请手动选择 UUID 复制' }
}

function onDateChange(newDate: string) {
  if (newDate === currentDate.value && currentReport.value?.date === newDate)
    return
  void router.push({ query: { ...route.query, date: newDate } })
}

watch(
  [uuid, () => route.query.date],
  ([newUuid, newDate], [oldUuid, oldDate]) => {
    const targetDate = typeof newDate === 'string' ? newDate : undefined
    if (newUuid !== oldUuid) {
      dates.value = []
      currentDate.value = ''
      currentReport.value = null
      nodeChanges.value = []
      hasMoreArchives.value = false
      loadingMore.value = false
      nameExpanded.value = false
      copiedUuid.value = false
      void loadArchive(targetDate, true)
      return
    }

    if (newDate !== oldDate && (!targetDate || targetDate !== currentReport.value?.date)) {
      void loadArchive(targetDate, false)
    }
  },
  { immediate: true },
)

const activeNormalizedReport = computed<IpqaNormalizedReport | null>(() => {
  if (!currentReport.value)
    return null
  if (activeIpVersion.value === 'IPv4') {
    return currentReport.value.v4
  }
  return currentReport.value.v6
})
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-4 py-6 overflow-x-hidden space-y-6">
    <!-- Header -->
    <div>
      <div class="mb-2 flex items-center gap-2">
        <RouterLink
          :to="backTarget.to"
          class="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          <Icon icon="lucide:arrow-left" class="size-3.5" />
          {{ backTarget.label }}
        </RouterLink>
        <template v-if="backTarget.label !== '返回资源概览'">
          <span class="text-xs text-neutral-300 dark:text-neutral-700">·</span>
          <RouterLink
            to="/resource-insights"
            class="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            资源概览
          </RouterLink>
        </template>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0 w-full">
          <div class="flex items-start gap-2.5">
            <h1 class="min-w-0 text-xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100 sm:text-3xl break-words" :class="nameExpanded ? '' : 'line-clamp-2 sm:line-clamp-none'" :title="node?.name">
              {{ node?.name || '节点 IPQA 档案' }}
            </h1>
            <span class="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
              IPQA 归档
            </span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <button type="button" class="sm:hidden underline" :aria-expanded="nameExpanded" @click="nameExpanded = !nameExpanded">
              {{ nameExpanded ? '收起名称' : '展开名称' }}
            </button>
            <span class="font-mono" :title="uuid">UUID: {{ uuid.length > 16 ? `${uuid.slice(0, 8)}…${uuid.slice(-6)}` : uuid }}</span>
            <button type="button" class="inline-flex items-center gap-1 hover:text-emerald-700 dark:hover:text-emerald-300" aria-label="复制完整 UUID" @click="copyUuid">
              <Icon icon="lucide:copy" class="size-3.5" />{{ copiedUuid ? '已复制' : '复制' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="errorMessage" role="alert" class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <span>{{ errorMessage }}</span>
      <button type="button" class="font-medium underline" :disabled="loading" @click="loadArchive(typeof route.query.date === 'string' ? route.query.date : undefined)">
        重试
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="py-16 text-center text-neutral-400">
      <Icon icon="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-500" />
      <span class="text-xs">正在加载节点 IPQA 归档数据...</span>
    </div>

    <!-- No Archive State -->
    <div
      v-else-if="!currentReport && !errorMessage"
      class="py-16 px-4 text-center rounded-2xl bg-white/80 dark:bg-neutral-900/80 border border-neutral-200/80 dark:border-neutral-800/80"
    >
      <Icon icon="lucide:file-x-2" class="w-10 h-10 mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
      <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
        暂无该节点的 IPQA 历史归档
      </h3>
      <p class="text-xs text-neutral-400 max-w-sm mx-auto">
        该节点可能尚未安装 IP-Quality-Archive 或尚未由插件同步归档文件。
      </p>
    </div>

    <!-- Content -->
    <div v-else-if="currentReport" class="space-y-5">
      <!-- Navigator: Date selector + IPv4/IPv6 Switch -->
      <IpqaArchiveNavigator
        :dates="dates"
        :current-date="currentDate"
        :has-v4="currentReport.summary.hasV4"
        :has-v6="currentReport.summary.hasV6"
        :active-ip-version="activeIpVersion"
        :can-load-more="hasMoreArchives"
        :loading-more="loadingMore"
        @load-more="loadMoreArchives"
        @update:date="onDateChange"
        @update:ip-version="v => activeIpVersion = v"
      />

      <p class="text-xs text-neutral-600 dark:text-neutral-400">
        归档日期：{{ currentReport.date }} · 归档更新：{{ new Date(currentReport.updatedAt).toLocaleString('zh-CN') }}
      </p>

      <!-- Tabs -->
      <div class="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto pb-px">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer"
          :class="activeTab === tab.key ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'"
          @click="activeTab = tab.key"
        >
          <Icon :icon="tab.icon" class="w-4 h-4" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab Content: Changes tab (doesn't require normalized report) -->
      <div v-if="activeTab === 'changes'">
        <IpqaChangeTimeline :changes="nodeChanges" />
      </div>

      <!-- Other tabs require active normalized report -->
      <div v-else-if="!activeNormalizedReport" class="py-12 text-center text-xs text-neutral-400">
        该归档日期未包含 {{ activeIpVersion }} 报告数据。
      </div>

      <div v-else>
        <!-- Tab 1: Basic Info -->
        <IpqaBasicInfo v-if="activeTab === 'info'" :report="activeNormalizedReport" />

        <!-- Tab 2: Risk Scores -->
        <IpqaRiskScores v-else-if="activeTab === 'score'" :report="activeNormalizedReport" />

        <!-- Tab 3: Risk Factors -->
        <IpqaFactorMatrix v-else-if="activeTab === 'factor'" :report="activeNormalizedReport" />

        <!-- Tab 4: Media & AI -->
        <IpqaMediaPanel v-else-if="activeTab === 'media'" :report="activeNormalizedReport" />

        <!-- Tab 5: Mail & DNSBL -->
        <IpqaMailPanel v-else-if="activeTab === 'mail'" :report="activeNormalizedReport" />

        <!-- Tab 7: Raw Details -->
        <IpqaRawDetails v-else-if="activeTab === 'raw'" :report="activeNormalizedReport" />
      </div>
    </div>
  </div>
</template>
