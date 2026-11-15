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
import { getMemPercentage, getNodeTagDisplay, getTrafficUsed, getTrafficUsedPercentage, hasRegion, showTrafficProgress } from '@/utils/nodeHelpers'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getFlagSrc, getRegionDisplayName } from '@/utils/regionHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{
  click: []
  pingClick: [node: NodeData, taskId: number]
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const { formatBytes, formatBytesPerSecond } = useNodeFormatters()

const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => getMemPercentage(props.node))
const memStatus = computed(() => getStatus(memPercentage.value))

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
        <span v-if="!props.node.online" class="shrink-0 text-xs text-destructive" :title="offlineTime">离线</span>
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

          <!-- 实时网速 -->
          <div class="flex min-w-0 flex-col gap-1" aria-label="实时网速">
            <div class="flex items-center gap-1 text-xs text-muted-foreground">
              <svg class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M8 15V9m-2 2 2-2 2 2M16 9v6m-2-2 2 2 2-2" />
              </svg>
              网速
            </div>
            <div class="space-y-0 text-[11px] leading-4 tabular-nums">
              <div class="flex min-w-0 items-center gap-1 text-emerald-700 dark:text-emerald-400" aria-label="上行网速">
                <svg class="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg>
                <span class="truncate" :title="props.node.online ? formatBytesPerSecond(props.node.net_out ?? 0) : '离线'">{{ props.node.online ? formatBytesPerSecond(props.node.net_out ?? 0) : '—' }}</span>
              </div>
              <div class="flex min-w-0 items-center gap-1 text-blue-700 dark:text-blue-400" aria-label="下行网速">
                <svg class="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg>
                <span class="truncate" :title="props.node.online ? formatBytesPerSecond(props.node.net_in ?? 0) : '离线'">{{ props.node.online ? formatBytesPerSecond(props.node.net_in ?? 0) : '—' }}</span>
              </div>
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

        <NodePingPanels :uuid="props.node.uuid" @select="emit('pingClick', props.node, $event)" />

        <div v-if="tagDisplay.customTags.length > 0" class="flex shrink-0 flex-wrap gap-1 items-center">
          <Badge
            v-for="(tag, index) in tagDisplay.customTags" :key="index" variant="outline"
            class="!text-[11px] rounded text-muted-foreground border-muted-foreground/10 px-1.5"
          >
            {{ tag }}
          </Badge>
        </div>
        <div v-if="tagDisplay.trafficResetTag" class="flex min-w-0 justify-center">
          <Badge
            variant="outline"
            class="!text-[10px] max-w-full min-w-0 shrink rounded bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 px-1 inline-flex items-center justify-start gap-0.5"
            :title="tagDisplay.trafficResetTooltip || undefined"
          >
            <Icon icon="lucide:calendar-clock" class="size-3 shrink-0" />
            <span class="min-w-0 truncate">{{ tagDisplay.trafficResetTag }}</span>
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
