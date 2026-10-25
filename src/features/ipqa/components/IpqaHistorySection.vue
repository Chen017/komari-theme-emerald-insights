<script setup lang="ts">
import type { HistoryEntry, HistorySection, IpVersion } from '../history'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import { buildTimeline, historyFieldLabel, historySections, projectSnapshot, sampleChangeAware, snapshotFields } from '../history'

const props = defineProps<{ entries: HistoryEntry[], ipVersion: IpVersion, section: HistorySection }>()
const emit = defineEmits<{ selectDate: [date: string], compare: [before: string, after: string] }>()
const expanded = ref(false)
const definition = computed(() => historySections.find(section => section.key === props.section)!)
const timeline = computed(() => buildTimeline(props.entries, props.ipVersion, props.section))
const points = computed(() => sampleChangeAware(timeline.value, expanded.value ? timeline.value.length : 8))
const changedCount = computed(() => timeline.value.filter(point => point.changed).length)
const hiddenChanges = computed(() => changedCount.value - points.value.filter(point => point.changed).length)
const fields = computed(() => snapshotFields(props.entries, props.ipVersion, props.section))
const columns = computed(() => points.value.map(point => ({ ...point, cells: projectSnapshot(point, props.ipVersion, props.section) })))

function pointStatus(point: typeof timeline.value[number]): string {
  if (!point.report)
    return '归档不可用'
  if (!point.protocolAvailable)
    return `该日无 ${props.ipVersion} 报告`
  if (!point.previousDate)
    return '起始快照'
  if (!point.comparisonAvailable)
    return '前次归档不可用'
  return point.changed ? `${point.differences.length} 项变化` : '无属性变化'
}
</script>

<template>
  <section class="min-w-0 rounded-xl border border-neutral-200 bg-white/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/80" :aria-label="`${definition.label}历史时间轴`">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-semibold">
        <Icon :icon="definition.icon" class="size-4 text-emerald-500" />
        {{ definition.label }}
      </h3>
      <span class="text-xs text-neutral-500 dark:text-neutral-400">{{ changedCount }} 个变化日 · {{ points.length }} / {{ timeline.length }} 个日期</span>
    </div>
    <div v-if="timeline.length" class="mb-3 flex items-stretch gap-2 overflow-x-auto pb-2" aria-label="关键日期">
      <div v-for="point in points" :key="point.date" class="shrink-0 rounded-lg border px-3 py-2 text-xs" :class="!point.report ? 'border-amber-300 dark:border-amber-800' : point.changed ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-neutral-200 dark:border-neutral-700'">
        <button type="button" class="block font-mono font-medium underline-offset-4 hover:underline" :aria-label="`查看 ${point.date} 快照`" @click="emit('selectDate', point.date)">
          {{ point.date }}
        </button>
        <p class="mt-1 text-neutral-500 dark:text-neutral-400">
          {{ pointStatus(point) }}
        </p>
        <p v-if="point.changed && point.semanticChanges.some(change => change.severity === 'CRITICAL')" class="mt-1 text-rose-700 dark:text-rose-300">
          关键变更
        </p>
        <button v-if="point.changed && point.previousDate" type="button" class="mt-1 text-emerald-700 underline dark:text-emerald-300" @click="emit('compare', point.previousDate, point.date)">
          对比变化前后
        </button>
      </div>
    </div>
    <p v-if="hiddenChanges > 0" class="mb-2 text-xs text-amber-700 dark:text-amber-300">
      另有 {{ hiddenChanges }} 个变化日已折叠，展开可查看全部。
    </p>
    <button v-if="timeline.length > 8" type="button" class="mb-3 text-xs text-emerald-700 underline dark:text-emerald-300" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? '恢复变化感知采样' : '展开完整时间轴' }}
    </button>
    <div v-if="fields.length && columns.length" class="max-h-96 overflow-auto rounded-lg border border-neutral-100 dark:border-neutral-800" tabindex="0" :aria-label="`${definition.label}历史数据表，可横向滚动`">
      <table class="w-full text-left text-xs">
        <thead class="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th scope="col" class="min-w-40 p-2 font-medium">
              项目 / 数据源
            </th>
            <th v-for="point in columns" :key="point.date" scope="col" class="min-w-36 whitespace-nowrap p-2 font-mono font-medium">
              {{ point.date }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
          <tr v-for="field in fields" :key="field">
            <th scope="row" class="max-w-64 break-words p-2 font-medium text-neutral-600 dark:text-neutral-400" :title="field">
              {{ historyFieldLabel(field) }}
            </th>
            <td v-for="point in columns" :key="point.date" class="p-2 align-top">
              <span class="inline-block rounded px-1.5 py-0.5" :class="point.cells[field]?.cls" :title="point.cells[field]?.text">{{ !point.report ? '归档不可用' : point.cells[field]?.text ?? '无数据' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="py-3 text-xs text-neutral-500 dark:text-neutral-400">
      该时间范围暂无此项目的检测数据。
    </p>
  </section>
</template>
