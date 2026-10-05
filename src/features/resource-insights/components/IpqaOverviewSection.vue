<script setup lang="ts">
import type { IpqaFleetOverview, IpqaSemanticChange } from '@/features/ipqa'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref } from 'vue'
import {
  fetchFleetOverview,
  fetchNodeChanges,
  IpqaFleetSummary,
  IpqaMediaMatrix,
  IpqaNodeGrid,
  IpqaRiskMatrix,
  RecentIpqaChanges,
} from '@/features/ipqa'
import { IpqaApiError } from '@/features/ipqa/services/api'
import { useAppStore } from '@/stores/app'

const props = defineProps<{
  nodes: readonly NodeData[]
  loading?: boolean
}>()

const loading = ref(false)
const overview = ref<IpqaFleetOverview | null>(null)
const recentChanges = ref<Array<IpqaSemanticChange & { nodeName: string }>>([])
const isPluginAvailable = ref<boolean | null>(null)
const errorMessage = ref('')
const lastSuccessAt = ref<string | null>(null)

let loadGeneration = 0

defineExpose({
  refresh: loadData,
})

async function loadData() {
  const generation = ++loadGeneration
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchFleetOverview()
    if (generation !== loadGeneration)
      return
    if (data) {
      overview.value = data
      isPluginAvailable.value = true
      lastSuccessAt.value = new Date().toISOString()
      const archivedNodes = data.nodes.filter(node =>
        node.has_ipv4 || node.has_ipv6 || node.changes_today > 0,
      )
      const changesByNode = await Promise.allSettled(
        archivedNodes.map(async node => ({
          node,
          changes: await fetchNodeChanges(node.uuid),
        })),
      )

      if (generation !== loadGeneration)
        return

      const allChanges: Array<IpqaSemanticChange & { nodeName: string }> = []
      for (const result of changesByNode) {
        if (result.status === 'rejected') {
          errorMessage.value = '概览已更新，部分节点的近期变动更新失败，可重试获取'
          continue
        }
        const { node, changes } = result.value
        for (const c of changes) {
          if (c.field && (c.field.includes('Head') || c.field.includes('Time') || c.field.includes('timestamp'))) {
            continue
          }
          allChanges.push({ ...c, nodeName: node.name })
        }
      }

      allChanges.sort((a, b) => b.date.localeCompare(a.date))
      if (!errorMessage.value)
        recentChanges.value = allChanges.slice(0, 15)
    }
    else {
      isPluginAvailable.value = true
      lastSuccessAt.value = new Date().toISOString()
      // Neutral fallback when IPQA data cannot be reached on the initial load.
      overview.value = {
        schema_version: 1,
        updated_at: new Date().toISOString(),
        total_nodes: props.nodes.length,
        ipqa_nodes: 0,
        nodes_with_risk: 0,
        nodes_with_changes_today: 0,
        latest_archive_date: null,
        nodes: props.nodes.map(n => ({
          uuid: n.uuid,
          name: n.name,
          status: 'no_archive',
          latest_date: null,
          has_ipv4: false,
          has_ipv6: false,
          highest_risk: { category: 'Unknown', source: 'None' },
          media_summary: {},
          ai_summary: {},
          changes_today: 0,
        })),
      }
    }
  }
  catch (err) {
    if (generation !== loadGeneration)
      return
    console.warn('[IPQA] Failed to load IPQA overview:', err)
    errorMessage.value = err instanceof Error ? err.message : 'IPQA 数据更新失败，请重试'
    if (err instanceof IpqaApiError && err.kind === 'not-installed' && !overview.value)
      isPluginAvailable.value = false
  }
  finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

const appStore = useAppStore()

onMounted(() => {
  void loadData()
})

const hasIpqaData = computed(() => {
  return overview.value && overview.value.ipqa_nodes > 0
})
</script>

<template>
  <div
    v-if="appStore.enableIpqaOverview"
    class="bg-white/80 dark:bg-neutral-900/80 backdrop-blur border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl p-5 shadow-xs space-y-5"
  >
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Icon icon="lucide:shield-check" class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-neutral-800 dark:text-neutral-100">
              IP 质量与归档概览
            </h3>
            <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300">
              IPQA
            </span>
          </div>
          <p class="text-xs text-neutral-600 dark:text-neutral-400">
            涵盖多维度风险评分、流媒体/AI 解锁矩阵、邮件信誉及每日归档差异追踪
          </p>
        </div>
      </div>
    </div>

    <!-- 1. Fleet Summary Strip / Skeleton -->
    <div v-if="(props.loading || loading) && !overview" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-for="i in 4" :key="i" class="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800/60" />
    </div>
    <IpqaFleetSummary v-else-if="overview && isPluginAvailable !== false" :overview="overview" />

    <div v-if="lastSuccessAt" class="text-xs text-neutral-600 dark:text-neutral-400">
      最后成功获取：{{ new Date(lastSuccessAt).toLocaleString('zh-CN') }}
      <span v-if="overview?.updated_at"> · 索引更新：{{ new Date(overview.updated_at).toLocaleString('zh-CN') }}</span>
      <span v-if="loading"> · 正在更新</span>
    </div>
    <div v-if="errorMessage" role="alert" class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <span>{{ errorMessage }}{{ overview ? '；当前保留上次可用数据。' : '' }}</span>
      <button type="button" class="font-medium underline disabled:opacity-50" :disabled="loading" @click="loadData">
        重试
      </button>
    </div>

    <!-- Notice if plugin is not detected -->
    <div
      v-if="isPluginAvailable === false"
      class="py-8 px-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/20 border border-dashed border-neutral-200 dark:border-neutral-800 text-center"
    >
      <div class="p-3 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 w-fit mx-auto mb-3">
        <Icon icon="lucide:plug-zap" class="w-8 h-8" />
      </div>
      <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        IPQA 数据暂不可用
      </div>
      <p class="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto mb-3">
        请确认 IPQA Alert Report 插件已安装并运行；临时网络或接口故障也可能导致此状态。
      </p>
      <a
        href="https://github.com/Chen017/komari-plugin-ipqa-alert-report"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium transition-colors"
      >
        <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
        <span>查看插件说明</span>
      </a>
    </div>

    <!-- Notice if plugin is installed but has no data yet -->
    <div
      v-else-if="!hasIpqaData && !loading && !errorMessage"
      class="py-6 px-4 rounded-xl bg-neutral-50/50 dark:bg-neutral-800/20 border border-dashed border-neutral-200 dark:border-neutral-800 text-center"
    >
      <Icon icon="lucide:database" class="w-8 h-8 mx-auto mb-2 text-indigo-400/60" />
      <div class="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
        暂无节点 IPQA 归档数据
      </div>
      <p class="text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
        请确保在已安装 IP-Quality-Archive 的节点上运行检测，并由 komari-plugin-ipqa-alert-report 每日定时同步。
      </p>
    </div>

    <!-- 2. Node Grid -->
    <IpqaNodeGrid v-if="isPluginAvailable !== false && overview && overview.nodes.length > 0" :nodes="overview.nodes" />

    <!-- 3. Risk & Media Matrices -->
    <div
      v-if="hasIpqaData && overview && (appStore.ipqaShowRiskMatrix || appStore.ipqaShowMediaMatrix)"
      class="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      <IpqaRiskMatrix v-if="appStore.ipqaShowRiskMatrix" :nodes="overview.nodes" />
      <IpqaMediaMatrix v-if="appStore.ipqaShowMediaMatrix" :nodes="overview.nodes" />
    </div>

    <!-- 4. Recent Changes Timeline -->
    <RecentIpqaChanges v-if="hasIpqaData && appStore.ipqaShowChanges" :changes="recentChanges" />
  </div>
</template>
