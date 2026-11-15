<script setup lang="ts">
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{
  uuid: string
  compact?: boolean
}>()

const emit = defineEmits<{
  select: [taskId: number]
}>()

const rows = useNodePingDisplay(() => props.uuid)
const panels = [
  { key: 'latency', label: '延迟' },
  { key: 'loss', label: '丢包' },
] as const
</script>

<template>
  <div class="grid min-w-0 grid-cols-2" :class="compact ? 'gap-1' : 'gap-2'" data-node-ping-panels>
    <section
      v-for="panel in panels" :key="panel.key"
      class="min-w-0 rounded-lg bg-muted/65 dark:bg-muted/55"
      :class="compact ? 'px-1 py-0.5' : 'p-1.5 sm:p-2'"
      :data-ping-panel="panel.key"
      :aria-label="panel.label"
    >
      <div class="grid" :class="compact ? 'gap-0.5' : 'gap-1'">
        <component
          :is="row.id === undefined ? 'div' : 'button'"
          v-for="(row, index) in rows" :key="row.id ?? `empty-${index}`"
          :type="row.id === undefined ? undefined : 'button'"
          :data-ping-task="row.id ?? 'empty'"
          :title="[row.name, row.status].filter(Boolean).join(' · ')"
          :aria-label="row.id === undefined ? row.status : `${row.name} ${panel.label} ${row[panel.key].value} ${row.status}`.trim()"
          class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-1 rounded-md px-0.5 text-left focus-visible:outline-2 focus-visible:outline-ring"
          :class="[
            compact ? 'py-0.5 text-[10px]' : 'py-1 text-[11px]',
            row.id === undefined ? 'text-muted-foreground' : 'cursor-pointer hover:bg-background/70',
          ]"
          @click.stop="row.id !== undefined && emit('select', row.id)"
        >
          <span class="flex min-w-0 items-center justify-between gap-0.5 leading-4">
            <span class="flex min-w-0 items-center gap-1 text-muted-foreground">
              <span class="size-1.5 shrink-0 rounded-full" :class="row.dot" aria-hidden="true" />
              <span class="truncate">{{ row.name }}</span>
            </span>
            <span class="shrink-0 whitespace-nowrap font-medium tabular-nums">{{ row[panel.key].value }}</span>
          </span>
        </component>
      </div>
    </section>
  </div>
</template>
