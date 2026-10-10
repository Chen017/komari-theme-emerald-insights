<script setup lang="ts">
import type { IpqaDailyPairedReport, IpqaNormalizedReport } from '../types'
import { Icon } from '@iconify/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { CardX } from '@/components/ui/card-x'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { getRiskColor, getRiskLabel } from '../formatters'
import { resolveMediaRegion, resolveMediaStatus } from '../mediaStatus'
import { fetchNodeLatest } from '../services/api'

const props = defineProps<{
  uuid: string
}>()

const { pickSurfaceClass } = useBackgroundSurface()

const loading = ref(false)
const latestReport = ref<IpqaDailyPairedReport | null>(null)
const errorMessage = ref('')
let loadGeneration = 0

async function loadSnapshot() {
  const targetUuid = props.uuid
  if (!targetUuid)
    return
  const generation = ++loadGeneration
  loading.value = true
  errorMessage.value = ''
  try {
    const report = await fetchNodeLatest(targetUuid)
    if (generation === loadGeneration) {
      latestReport.value = report
    }
  }
  catch (error) {
    if (generation === loadGeneration) {
      errorMessage.value = error instanceof Error ? error.message : 'IPQA 数据更新失败'
    }
  }
  finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

onMounted(() => {
  void loadSnapshot()
})

watch(() => props.uuid, () => {
  latestReport.value = null
  void loadSnapshot()
})
const mediaServices = [
  { name: 'YouTube', keys: ['YouTube', 'Youtube', 'youtube'] },
  { name: 'Netflix', keys: ['Netflix', 'netflix'] },
  { name: 'Disney+', keys: ['DisneyPlus', 'disney+', 'Disney+'] },
  { name: 'TikTok', keys: ['TikTok', 'tiktok'] },
  { name: 'Reddit', keys: ['Reddit', 'reddit'] },
]

function getMediaItem(media: IpqaNormalizedReport['media'] | undefined, ...names: string[]) {
  if (!media)
    return null
  for (const n of names) {
    const lower = n.toLowerCase()
    for (const [k, v] of Object.entries(media)) {
      if (k.toLowerCase() === lower || k.toLowerCase().includes(lower)) {
        return {
          ...resolveMediaStatus(v),
          region: resolveMediaRegion(v, k),
        }
      }
    }
  }
  return null
}

const chatGpt = computed(() => {
  const report = latestReport.value
  if (!report)
    return null
  const keys = ['ChatGPT', 'chatgpt', 'OpenAI']
  const v4 = getMediaItem(report.v4?.media, ...keys)
  const v6 = getMediaItem(report.v6?.media, ...keys)
  return [v4, v6].find(item => item?.unlocked)
    ?? v4 ?? v6
    ?? (report.summary.aiSummary.ChatGPT ? resolveMediaStatus(report.summary.aiSummary.ChatGPT) : null)
})
</script>

<template>
  <CardX
    size="small"
    class="group border-none transition-all rounded-md"
    :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xs')"
  >
    <template #header>
      <div class="flex items-center gap-1.5">
        <RouterLink
          :to="{ path: `/ip-quality/${uuid}`, query: { from: 'instance' } }"
          class="font-medium hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 group/title cursor-pointer"
          title="点击查看该节点的 IP 质量详情与历史档案"
        >
          <span>IP 质量概况 (IPQA)</span>
          <Icon icon="lucide:arrow-up-right" class="w-3.5 h-3.5 opacity-60 group-hover/title:opacity-100 transition-opacity" />
        </RouterLink>
      </div>
    </template>

    <div v-if="errorMessage" class="mb-2 text-xs text-amber-700 dark:text-amber-300" role="status">
      {{ errorMessage }}{{ latestReport ? '，当前显示上次可用数据。' : '。' }}
      <button class="ml-2 underline" :disabled="loading" @click="loadSnapshot">
        重试
      </button>
    </div>

    <div v-if="loading && !latestReport" class="py-4 text-center text-xs text-muted-foreground">
      <Icon icon="lucide:loader-2" class="w-4 h-4 animate-spin mx-auto mb-1 text-emerald-500" />
      <span>加载 IPQA 快照...</span>
    </div>

    <div v-else-if="!latestReport && !errorMessage" class="py-3 px-2 flex items-center justify-between text-xs text-muted-foreground">
      <div class="flex items-center gap-2">
        <Icon icon="lucide:shield" class="w-4 h-4 opacity-50" />
        <span>该节点暂无 IPQA 归档记录</span>
      </div>
      <RouterLink
        :to="{ path: `/ip-quality/${uuid}`, query: { from: 'instance' } }"
        class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
      >
        前往档案页 →
      </RouterLink>
    </div>

    <div
      v-else-if="latestReport"
      class="rounded-sm bg-slate-500/5 p-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs"
    >
      <!-- Risk Category -->
      <div class="inline-flex items-center gap-2">
        <span class="text-muted-foreground shrink-0">综合风控评级：</span>
        <div
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border"
          :class="[
            getRiskColor(latestReport.summary.highestRiskCategory).bg,
            getRiskColor(latestReport.summary.highestRiskCategory).text,
            getRiskColor(latestReport.summary.highestRiskCategory).border,
          ]"
        >
          <span class="w-1.5 h-1.5 rounded-full" :class="getRiskColor(latestReport.summary.highestRiskCategory).dot" />
          <span>{{ getRiskLabel(latestReport.summary.highestRiskCategory) }}</span>
        </div>
      </div>

      <!-- Media Unlocking with v4 & v6 in ONE row -->
      <div class="inline-flex items-center gap-2 flex-wrap min-w-0">
        <span class="text-muted-foreground shrink-0">流媒体解锁：</span>
        <div class="inline-flex items-center gap-4 flex-wrap text-xs">
          <!-- v4 -->
          <div v-if="latestReport.v4" class="inline-flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-xs px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold">v4</span>
            <template v-for="s in mediaServices" :key="s.name">
              <span
                v-if="getMediaItem(latestReport.v4?.media, ...s.keys)"
                class="font-medium"
                :class="getMediaItem(latestReport.v4?.media, ...s.keys)?.textClass"
                :title="getMediaItem(latestReport.v4?.media, ...s.keys)?.label"
              >
                {{ s.name }}{{ getMediaItem(latestReport.v4?.media, ...s.keys)?.region ? `[${getMediaItem(latestReport.v4?.media, ...s.keys)?.region}]` : '' }}
              </span>
            </template>
          </div>

          <!-- v6 -->
          <div v-if="latestReport.v6" class="inline-flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-xs px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-semibold">v6</span>
            <template v-for="s in mediaServices" :key="s.name">
              <span
                v-if="getMediaItem(latestReport.v6?.media, ...s.keys)"
                class="font-medium"
                :class="getMediaItem(latestReport.v6?.media, ...s.keys)?.textClass"
                :title="getMediaItem(latestReport.v6?.media, ...s.keys)?.label"
              >
                {{ s.name }}{{ getMediaItem(latestReport.v6?.media, ...s.keys)?.region ? `[${getMediaItem(latestReport.v6?.media, ...s.keys)?.region}]` : '' }}
              </span>
            </template>
          </div>

          <div v-if="!latestReport.v4 && !latestReport.v6" class="text-muted-foreground">
            --
          </div>
        </div>
      </div>

      <!-- AI Unlocking -->
      <div class="inline-flex items-center gap-2 shrink-0">
        <span class="text-muted-foreground shrink-0">AI 解锁：</span>
        <div class="font-medium text-xs">
          <span
            v-if="chatGpt"
            :class="chatGpt.textClass"
            :title="chatGpt.label"
          >
            ChatGPT {{ chatGpt.state === 'dns' ? '' : chatGpt.label }}
          </span>
          <span v-else class="text-muted-foreground">--</span>
        </div>
      </div>
    </div>
  </CardX>
</template>
