import type { MaybeRefOrGetter } from 'vue'
import type { NodePingHistoryPoint } from '@/composables/useNodePingStats'
import { computed } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import { selectHomePingTasks } from '@/utils/homePingSettings'

const routeColors = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
]

function getHistoryTone(value: number, metric: 'latency' | 'loss') {
  const [good, moderate, bad] = metric === 'latency' ? [120, 180, 240] : [1, 3, 9]
  if (value <= good)
    return 'bg-emerald-500/80 dark:bg-emerald-400/70'
  if (value <= moderate)
    return 'bg-lime-500/75 dark:bg-lime-400/70'
  if (value <= bad)
    return 'bg-amber-500/80 dark:bg-amber-400/75'
  return 'bg-rose-500/85 dark:bg-rose-400/80'
}

function formatValue(value: number | null, metric: 'latency' | 'loss') {
  if (value === null || value < 0)
    return '—'
  return metric === 'latency' ? `${Math.round(value)} ms` : `${value.toFixed(1)}%`
}

function buildBars(points: NodePingHistoryPoint[], metric: 'latency' | 'loss', emptyLabel: string) {
  return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => {
    const point = points.at(index - NODE_PING_BAR_COUNT)
    const value = point?.[metric] ?? null
    const label = value === null
      ? (point?.loss === 100 ? '探测失败' : emptyLabel)
      : formatValue(value, metric)
    return {
      tone: value === null ? 'bg-muted-foreground/15' : getHistoryTone(value, metric),
      label: point ? `${formatDateTime(point.time, 'HH:mm:ss')} · ${label}` : label,
    }
  })
}

export function useNodePingDisplay(uuid: MaybeRefOrGetter<string>) {
  const appStore = useAppStore()
  const ping = useNodePingStats(uuid, { hours: 1 })

  return computed(() => selectHomePingTasks(
    ping.perTaskStats.value,
    appStore.homePingLineCount,
    appStore.homePingTaskOrder,
    appStore.pingNetworkOrder,
  ).map((task) => {
    const emptyLabel = ping.loading.value ? '加载中' : ping.error.value ? '加载失败' : task ? '暂无采样' : '无更多任务'
    return {
      id: task?.taskId,
      name: task?.name ?? '—',
      status: task?.loss == null ? emptyLabel : task.loss === 100 ? '探测失败' : '',
      dot: task ? routeColors[task.taskId % routeColors.length] : 'bg-muted-foreground/20',
      latency: {
        value: formatValue(task?.avgLatency ?? null, 'latency'),
        bars: buildBars(task?.history ?? [], 'latency', emptyLabel),
      },
      loss: {
        value: formatValue(task?.loss ?? null, 'loss'),
        bars: buildBars(task?.history ?? [], 'loss', emptyLabel),
      },
    }
  }))
}
