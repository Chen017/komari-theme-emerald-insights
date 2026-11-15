<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Icon } from '@iconify/vue'
import { reactiveOmit } from '@vueuse/core'
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<DialogContentProps & {
  class?: HTMLAttributes['class']
  overlayClass?: HTMLAttributes['class']
  showClose?: boolean
}>(), {
  showClose: true,
})

const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class', 'overlayClass', 'showClose')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
const closeIcon = {
  body: '<path d="M18 6 6 18M6 6l12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  width: 24,
  height: 24,
}
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      :class="cn(
        'dialog-scrim fixed inset-0 z-50',
        props.overlayClass,
      )"
    />
    <DialogContent
      v-bind="forwarded"
      :class="cn(
        'dialog-surface fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-popover p-4 text-popover-foreground shadow-xl focus:outline-none',
        props.class,
      )"
    >
      <slot />
      <DialogClose
        v-if="showClose"
        class="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        aria-label="关闭"
      >
        <Icon :icon="closeIcon" class="size-4" />
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
