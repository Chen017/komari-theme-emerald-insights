<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import NodePingPanels from '@/components/NodePingPanels.vue'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useNodeFormatters } from '@/composables/useNodeFormatters'
import { useAppStore } from '@/stores/app'
import { formatDateTime, getStatus } from '@/utils/helper'
import { getDiskPercentage, getMemPercentage, getNodeTagDisplay, getTrafficUsed, getTrafficUsedPercentage, hasRegion, showTrafficProgress } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'
import { getExpireStatus, getExpireText, getExpireTextClass } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{
  click: []
  pingClick: [node: NodeData, taskId: number]
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { formatBytes, formatBytesPerSecond } = useNodeFormatters()

const offlineTime = computed(() => formatDateTime(props.node.time))
const renewal = computed(() => {
  const expiry = props.node.expired_at
  if (!(new Date(expiry).getUTCFullYear() > 1))
    return null

  const status = getExpireStatus(expiry)
  const text = getExpireText(expiry, appStore.lang)
  const remaining = status === 'expired' || status === 'long_term'
    ? text
    : appStore.lang === 'zh-CN' ? `剩余 ${text}` : `${text} left`
  return { remaining, date: formatDateTime(expiry, 'YYYY-MM-DD'), tone: getExpireTextClass(expiry) }
})

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => getMemPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => getDiskPercentage(props.node))
const diskStatus = computed(() => getStatus(diskPercentage.value))

const trafficUsedPercentage = computed(() => getTrafficUsedPercentage(props.node))
const trafficUsed = computed(() => getTrafficUsed(props.node))
const tagDisplay = computed(() => getNodeTagDisplay(props.node, appStore.lang))
</script>

<template>
  <CardX
    hoverable
    class="node-card h-full w-full cursor-pointer border-none shadow-[0_0_0_1px] shadow-transparent transition-all duration-200 rounded-md bg-background/60 hover:bg-background hover:shadow-emerald-600/10 hover:shadow-[0_0_20px,0_0_0_1px] hover:-translate-y-0.5 hover:z-1"
    :class="[pickSurfaceClass('', 'backdrop-blur-sm'), !props.node.online && 'shadow-[0_0_0_1px] !shadow-red-600/20']"
    @click="emit('click')"
  >
    <template #header>
      <div class="flex gap-2 min-w-0 items-center">
        <div class="size-2 rounded-full relative" :class="[props.node.online ? 'bg-emerald-600' : 'bg-red-600']">
          <div
            class="animate-ping absolute inset-0 rounded-full opacity-50"
            :class="[props.node.online ? 'bg-emerald-600' : 'bg-red-600']"
          />
        </div>
        <div class="text-md font-bold flex-1 min-w-0 truncate">
          {{ props.node.name }}
        </div>
      </div>
    </template>

    <template #header-extra>
      <div class="flex gap-2 items-center">
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasRegion(props.node.region)" :src="getFlagSrc(props.node.region)"
          :alt="getRegionDisplayName(props.node.region)" class="size-5 shrink-0"
        >
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-3">
        <div class="gap-x-3 gap-y-1 grid grid-cols-2">
          <!-- CPU -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="flex items-center gap-1 text-muted-foreground">
                <Icon icon="lucide:cpu" class="size-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                CPU
              </span>
              <span>{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ props.node.load?.toFixed(2) ?? '—' }}, {{ props.node.load5?.toFixed(2) ?? '—' }}, {{
                props.node.load15?.toFixed(2) ?? '—' }}
            </div>
          </div>

          <!-- 内存 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="flex items-center gap-1 text-muted-foreground">
                <Icon icon="lucide:memory-stick" class="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                内存
              </span>
              <span>{{ memPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
            <DataTooltip placement="top" class="block" :content-class="[!props.node.swap && '!hidden']">
              <div class="text-[11px] text-muted-foreground truncate">
                {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
              </div>
              <template #content>
                <div class="flex items-center justify-between gap-3 whitespace-nowrap">
                  <span class="text-background/70">Swap</span>
                  <span>{{ formatBytes(props.node.swap ?? 0) }}</span>
                </div>
              </template>
            </DataTooltip>
          </div>

          <!-- 硬盘 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="flex items-center gap-1 text-muted-foreground">
                <Icon icon="lucide:hard-drive" class="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                硬盘
              </span>
              <span>{{ diskPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
            </div>
          </div>

          <!-- 流量进度条 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="flex items-center gap-1 text-muted-foreground">
                <Icon icon="lucide:arrow-down-up" class="size-3.5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
                流量
              </span>
              <span>{{ trafficUsedPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" status="success" :height="4" />
            <div class="truncate text-[11px] text-muted-foreground">
              {{ formatBytes(trafficUsed) }} /
              {{ showTrafficProgress(props.node) ? formatBytes(props.node.traffic_limit) : '∞' }}
            </div>
          </div>
        </div>

        <div class="relative">
          <div
            v-if="!props.node.online"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center text-[11px] text-muted-foreground"
          >
            <span class="text-sm text-destructive">离线</span>
            <span>{{ offlineTime }}</span>
          </div>
          <div
            class="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums"
            :class="!props.node.online && 'pointer-events-none blur-xs opacity-60'"
            :aria-hidden="!props.node.online || undefined"
          >
            <div class="min-w-0 space-y-0.5 rounded-lg bg-muted/65 px-1.5 py-1.5 dark:bg-muted/55 sm:px-2" aria-label="实时速率">
              <div class="flex items-center gap-0.5 whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                <Icon icon="lucide:chevron-up" class="size-3 shrink-0" aria-hidden="true" />
                <span class="truncate" :title="formatBytesPerSecond(props.node.net_out ?? 0)">{{ formatBytesPerSecond(props.node.net_out ?? 0) }}</span>
              </div>
              <div class="flex items-center gap-0.5 whitespace-nowrap text-blue-700 dark:text-blue-400">
                <Icon icon="lucide:chevron-down" class="size-3 shrink-0" aria-hidden="true" />
                <span class="truncate" :title="formatBytesPerSecond(props.node.net_in ?? 0)">{{ formatBytesPerSecond(props.node.net_in ?? 0) }}</span>
              </div>
            </div>
            <div class="min-w-0 space-y-0.5 rounded-lg bg-muted/65 px-1.5 py-1.5 dark:bg-muted/55 sm:px-2" aria-label="累计流量">
              <div class="flex items-center gap-0.5 whitespace-nowrap">
                <Icon icon="lucide:upload" class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span class="truncate" :title="formatBytes(props.node.net_total_up ?? 0)">{{ formatBytes(props.node.net_total_up ?? 0) }}</span>
              </div>
              <div class="flex items-center gap-0.5 whitespace-nowrap">
                <Icon icon="lucide:download" class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span class="truncate" :title="formatBytes(props.node.net_total_down ?? 0)">{{ formatBytes(props.node.net_total_down ?? 0) }}</span>
              </div>
            </div>
            <div class="min-w-0 space-y-0.5 rounded-lg bg-muted/65 px-1.5 py-1.5 dark:bg-muted/55 sm:px-2" aria-label="续费信息">
              <div class="flex items-center gap-0.5 whitespace-nowrap" :class="renewal?.tone">
                <Icon icon="lucide:calendar-clock" class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span class="truncate" :title="renewal?.remaining">{{ renewal?.remaining ?? '未设到期' }}</span>
              </div>
              <div class="truncate whitespace-nowrap pl-3.5 text-muted-foreground" :title="renewal?.date">
                {{ renewal?.date ?? '—' }}
              </div>
            </div>
          </div>
        </div>

        <NodePingPanels :uuid="props.node.uuid" @select="emit('pingClick', props.node, $event)" />

        <div v-if="tagDisplay.customTags.length > 0 || tagDisplay.trafficResetTag" class="flex shrink-0 flex-wrap gap-1 items-center">
          <Badge
            v-for="(tag, index) in tagDisplay.customTags" :key="index" variant="outline"
            class="!text-[11px] rounded text-muted-foreground border-muted-foreground/10 px-1.5"
          >
            {{ tag }}
          </Badge>
          <Badge
            v-if="tagDisplay.trafficResetTag"
            variant="outline"
            class="!text-[11px] rounded bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 px-1.5 inline-flex items-center gap-1"
            :title="tagDisplay.trafficResetTooltip || undefined"
          >
            <Icon icon="lucide:calendar-clock" class="size-3 shrink-0" />
            <span>{{ tagDisplay.trafficResetTag }}</span>
          </Badge>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
}
</style>
