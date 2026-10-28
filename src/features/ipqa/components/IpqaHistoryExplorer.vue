<script setup lang="ts">
import type { HistoryEntry, HistorySection, IpVersion } from '../history'
import type { IpqaDailyPairedReport } from '../types'
import { Icon } from '@iconify/vue'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { compareSnapshots, historyFieldLabel, historySections, projectSnapshot, protocolReport, snapshotFields } from '../history'
import { loadArchiveHistory } from '../services/archiveHistory'
import IpqaHistorySection from './IpqaHistorySection.vue'

const props = defineProps<{
  uuid: string
  dates: string[]
  currentReport: IpqaDailyPairedReport
  fetchReport: (uuid: string, date: string) => Promise<IpqaDailyPairedReport | null>
  ipVersion: IpVersion
  section?: HistorySection
  open?: boolean
  hasMore: boolean
  loadingMore: boolean
}>()
const emit = defineEmits<{ selectDate: [date: string], loadMore: [] }>()
const expanded = ref(false)
const loading = ref(false)
const entries = shallowRef<HistoryEntry[]>([])
const range = ref('all')
const beforeDate = ref('')
const afterDate = ref('')
const showUnchanged = ref(false)
const comparisonElement = ref<HTMLElement>()
let generation = 0

const availableDates = computed(() => [...new Set([...props.dates, props.currentReport.date])].sort())
const failedDates = computed(() => entries.value.filter(entry => !entry.report).map(entry => entry.date))
const visibleSections = computed(() => historySections.filter(section => !props.section || section.key === props.section || (props.section === 'dnsbl' && section.key === 'mail')))
const rangeEntries = computed(() => {
  if (range.value === 'all')
    return entries.value
  const latest = availableDates.value.at(-1)
  if (!latest)
    return []
  const cutoff = new Date(`${latest}T00:00:00Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(range.value) + 1)
  return entries.value.filter(entry => entry.date >= cutoff.toISOString().slice(0, 10))
})

async function load() {
  const token = ++generation
  const targetUuid = props.uuid
  const dates = [...availableDates.value]
  loading.value = true
  const cached = [...entries.value.filter(entry => entry.date !== props.currentReport.date), { date: props.currentReport.date, report: props.currentReport }]
  const reports = await loadArchiveHistory(dates, date => props.fetchReport(targetUuid, date), {
    cached,
    isCurrent: () => token === generation,
    onProgress: result => entries.value = result,
  })
  if (token !== generation)
    return
  entries.value = reports
  const usableDates = reports.filter(entry => entry.report).map(entry => entry.date).sort()
  if (!beforeDate.value)
    beforeDate.value = usableDates.at(-2) ?? usableDates[0] ?? ''
  if (!afterDate.value)
    afterDate.value = usableDates.at(-1) ?? ''
  loading.value = false
}

watch(() => props.uuid, () => {
  generation++
  entries.value = []
  beforeDate.value = ''
  afterDate.value = ''
  loading.value = false
})
watch(() => props.open, (open) => {
  if (open)
    expanded.value = true
}, { immediate: true })
watch([() => props.uuid, () => availableDates.value.join(','), expanded, () => props.currentReport], () => {
  if (expanded.value) {
    void load()
  }
  else {
    generation++
    loading.value = false
  }
}, { immediate: true })
onBeforeUnmount(() => generation++)

const before = computed(() => entries.value.find(entry => entry.date === beforeDate.value))
const after = computed(() => entries.value.find(entry => entry.date === afterDate.value))
const comparisonReady = computed(() => !loading.value && before.value?.report && after.value?.report)
const missingProtocol = computed(() => comparisonReady.value && (!protocolReport(before.value!, props.ipVersion) || !protocolReport(after.value!, props.ipVersion)))
const comparisonRows = computed(() => {
  if (!comparisonReady.value)
    return []
  return visibleSections.value.flatMap((section) => {
    const a = projectSnapshot(before.value!, props.ipVersion, section.key)
    const b = projectSnapshot(after.value!, props.ipVersion, section.key)
    const differences = new Set(compareSnapshots(before.value!, after.value!, props.ipVersion, section.key).map(row => row.field))
    return snapshotFields([before.value!, after.value!], props.ipVersion, section.key)
      .filter(field => showUnchanged.value || differences.has(field))
      .map(field => ({ section: section.label, field, before: a[field], after: b[field], changed: differences.has(field) }))
  })
})
const changeCount = computed(() => comparisonRows.value.filter(row => row.changed).length)

function selectComparison(before: string, after: string) {
  beforeDate.value = before
  afterDate.value = after
  comparisonElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function swapDates() {
  [beforeDate.value, afterDate.value] = [afterDate.value, beforeDate.value]
}
</script>

<template>
  <div class="min-w-0 space-y-4 text-neutral-800 dark:text-neutral-200">
    <button type="button" class="flex w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white/80 p-4 text-left dark:border-neutral-800 dark:bg-neutral-900/80" :aria-expanded="expanded" @click="expanded = !expanded">
      <span class="flex items-center gap-2 text-sm font-semibold"><Icon icon="lucide:history" class="size-4 text-emerald-500" />历史时间轴与快照对比 · {{ ipVersion }}</span>
      <Icon :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="size-4 shrink-0" />
    </button>
    <template v-if="expanded">
      <div class="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
        <p class="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          各项目独立采用变化感知采样：优先保留首尾与实际属性变化日，再补充稳定日期。每天一个快照，日内变化请查看 IPQA 原始归档；相邻日期指相邻可用归档日。范围以最新归档为基准。
        </p>
        <div class="flex flex-wrap items-center gap-3 text-xs">
          <label class="flex items-center gap-2">时间范围
            <select v-model="range" class="rounded-md border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900" aria-label="历史时间范围">
              <option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="all">全部已加载日期</option>
            </select>
          </label>
          <span>{{ entries.length }} / {{ availableDates.length }} 个日期 · {{ hasMore ? '尚有更早归档' : '已到归档起点' }}</span>
          <button v-if="hasMore" type="button" class="text-emerald-700 underline disabled:opacity-50 dark:text-emerald-300" :disabled="loading || loadingMore" @click="emit('loadMore')">
            {{ loadingMore ? '正在加载更早日期…' : '加载更早归档' }}
          </button>
        </div>
      </div>
      <p v-if="loading" role="status" class="flex items-center gap-2 p-3 text-xs text-neutral-500">
        <Icon icon="lucide:loader-2" class="size-4 animate-spin" />正在读取每日归档（{{ entries.length }} / {{ availableDates.length }}）…
      </p>
      <div v-if="failedDates.length && !loading" role="alert" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        {{ failedDates.length }} 个日期读取失败或归档已不存在：{{ failedDates.join('、') }}。这些日期显示为空缺，不推测跨空缺的变化。
        <button type="button" class="ml-2 underline" @click="load">
          重试失败日期
        </button>
      </div>
      <template v-if="!loading">
        <section ref="comparisonElement" class="scroll-mt-6 space-y-3 rounded-xl border border-neutral-200 bg-white/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/80" aria-label="历史快照对比">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <Icon icon="lucide:git-compare-arrows" class="size-4 text-emerald-500" />快照对比
            </h3>
            <label class="flex items-center gap-1.5 text-xs"><input v-model="showUnchanged" type="checkbox">显示未变化项目</label>
          </div>
          <div class="flex flex-wrap items-end gap-3 text-xs">
            <label class="flex min-w-0 flex-col gap-1">对比前
              <select v-model="beforeDate" aria-label="对比前日期" class="max-w-full rounded-md border border-neutral-300 bg-white px-2 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                <option v-for="date in availableDates" :key="date" :value="date">{{ date }}</option>
              </select>
            </label>
            <button type="button" class="rounded-md border border-neutral-200 p-2 dark:border-neutral-700" aria-label="交换对比日期" @click="swapDates">
              <Icon icon="lucide:arrow-left-right" class="size-4" />
            </button>
            <label class="flex min-w-0 flex-col gap-1">对比后
              <select v-model="afterDate" aria-label="对比后日期" class="max-w-full rounded-md border border-neutral-300 bg-white px-2 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                <option v-for="date in availableDates" :key="date" :value="date">{{ date }}</option>
              </select>
            </label>
            <span v-if="comparisonReady" class="py-2 text-neutral-500">{{ changeCount }} 项属性变化</span>
          </div>
          <p v-if="!comparisonReady" role="status" class="text-xs text-amber-700 dark:text-amber-300">
            所选日期归档不可用，请重试失败日期或选择其他快照。
          </p>
          <p v-else-if="missingProtocol" class="text-xs text-amber-700 dark:text-amber-300">
            至少一个日期没有 {{ ipVersion }} 报告；无数据代表未检测，不能视为正常或已解锁。
          </p>
          <p v-if="comparisonReady && !comparisonRows.length" class="py-3 text-xs text-neutral-500">
            {{ beforeDate === afterDate ? '选择了同一天的快照。' : '所选快照在当前项目中没有属性变化。' }}
          </p>
          <div v-if="comparisonRows.length" class="space-y-2 sm:hidden">
            <article v-for="row in comparisonRows" :key="`${row.section}.${row.field}`" class="rounded-lg border border-neutral-100 p-3 dark:border-neutral-800" :class="row.changed ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''">
              <h4 class="mb-2 break-words text-xs font-medium" :title="row.field">
                <span class="mb-1 block text-neutral-500">{{ row.section }} · {{ row.changed ? '已变化' : '未变化' }}</span>{{ historyFieldLabel(row.field) }}
              </h4>
              <dl class="grid grid-cols-2 gap-2 text-xs">
                <div class="min-w-0">
                  <dt class="mb-1 text-neutral-500">
                    {{ beforeDate }} · 前
                  </dt><dd class="break-words">
                    <span class="inline-block rounded px-1.5 py-0.5" :class="row.before?.cls">{{ row.before?.text ?? '无数据' }}</span>
                  </dd>
                </div>
                <div class="min-w-0">
                  <dt class="mb-1 text-neutral-500">
                    {{ afterDate }} · 后
                  </dt><dd class="break-words">
                    <span class="inline-block rounded px-1.5 py-0.5" :class="row.after?.cls">{{ row.after?.text ?? '无数据' }}</span>
                  </dd>
                </div>
              </dl>
            </article>
          </div>
          <div v-if="comparisonRows.length" class="hidden max-h-[32rem] overflow-auto sm:block" tabindex="0" aria-label="快照差异表，可横向滚动">
            <table class="w-full text-left text-xs">
              <thead class="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <th scope="col" class="min-w-40 p-2">
                    项目 / 数据源
                  </th><th scope="col" class="min-w-36 p-2">
                    {{ beforeDate }} · 对比前
                  </th><th scope="col" class="min-w-36 p-2">
                    {{ afterDate }} · 对比后
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
                <tr v-for="row in comparisonRows" :key="`${row.section}.${row.field}`" :class="row.changed ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''">
                  <th scope="row" class="max-w-64 break-words p-2 font-medium" :title="row.field">
                    <span class="mb-1 block text-neutral-500">{{ row.section }} · {{ row.changed ? '已变化' : '未变化' }}</span>{{ historyFieldLabel(row.field) }}
                  </th>
                  <td class="p-2">
                    <span class="inline-block rounded px-1.5 py-0.5" :class="row.before?.cls">{{ row.before?.text ?? '无数据' }}</span>
                  </td>
                  <td class="p-2">
                    <span class="inline-block rounded px-1.5 py-0.5" :class="row.after?.cls">{{ row.after?.text ?? '无数据' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <IpqaHistorySection v-for="item in visibleSections" :key="item.key" :entries="rangeEntries" :ip-version="ipVersion" :section="item.key" @select-date="emit('selectDate', $event)" @compare="selectComparison" />
      </template>
    </template>
  </div>
</template>
