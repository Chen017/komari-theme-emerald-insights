import type { MaybeRefOrGetter } from 'vue'
import { computed } from 'vue'
import { useNodePingStats } from '@/composables/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { selectHomePingTasks } from '@/utils/homePingSettings'

const routeColors = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
]

function formatValue(value: number | null, metric: 'latency' | 'loss') {
  if (value === null || value < 0)
    return '—'
  return metric === 'latency' ? `${Math.round(value)} ms` : `${value.toFixed(1)}%`
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
      },
      loss: {
        value: formatValue(task?.loss ?? null, 'loss'),
      },
    }
  }))
}
