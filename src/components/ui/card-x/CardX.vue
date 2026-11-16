<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  title?: string
  size?: 'small' | 'medium'
  hoverable?: boolean
  contentClass?: HTMLAttributes['class']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  hoverable: false,
})

const slots = defineSlots<{
  'header'?: () => any
  'header-extra'?: () => any
  'default'?: () => any
}>()

function hasHeader() {
  return Boolean(slots.header || slots['header-extra'] || props.title)
}

const paddingClass = computed(() => {
  const pt = hasHeader() ? 'pt-0' : ''
  if (props.size === 'small')
    return `p-3 ${pt}`
  return `p-4 ${pt}`
})

const headerPaddingClass = computed(() => {
  if (props.size === 'small')
    return 'px-3 py-2'
  return 'px-4 py-3'
})
</script>

<template>
  <div
    :class="cn(
      'bg-card text-card-foreground flex flex-col rounded-lg border',
      hoverable && 'transition-colors hover:border-foreground/30',
      props.class,
    )"
  >
    <div
      v-if="hasHeader()"
      :class="cn('flex items-center gap-2', headerPaddingClass)"
    >
      <div class="flex-1 min-w-0">
        <slot name="header">
          <span class="font-medium">{{ title }}</span>
        </slot>
      </div>
      <div v-if="slots['header-extra']" class="shrink-0">
        <slot name="header-extra" />
      </div>
    </div>
    <div :class="cn(paddingClass, props.contentClass)">
      <slot />
    </div>
  </div>
</template>
