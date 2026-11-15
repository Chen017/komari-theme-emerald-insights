<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  pending?: boolean
}>(), {
  pending: true,
})
</script>

<template>
  <div class="flex items-center gap-2.5 text-sm text-muted-foreground" role="status">
    <span
      v-if="pending"
      aria-hidden="true"
      class="size-4 shrink-0 rounded-full border-2 border-emerald-600/25 border-t-emerald-600 motion-safe:animate-spin dark:border-emerald-400/25 dark:border-t-emerald-400"
    />
    <span>{{ label }}</span>
  </div>
</template>
