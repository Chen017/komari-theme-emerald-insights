<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { defineAsyncComponent, ref } from 'vue'
import LoadingStatus from './LoadingStatus.vue'

const props = defineProps<{
  mode: 'earth' | 'maps'
  nodes?: NodeData[]
}>()

const state = ref<'loading' | 'ready' | 'unavailable'>('loading')
const Visual = defineAsyncComponent({
  loader: props.mode === 'earth'
    ? () => import('./NodeEarthGlobe.vue')
    : () => import('./NodeEarthMaps.vue'),
  errorComponent: () => null,
  onError: (_error, _retry, fail) => {
    state.value = 'unavailable'
    fail()
  },
})
</script>

<template>
  <div
    class="relative"
    :class="mode === 'earth' ? 'aspect-square w-full max-w-md mx-auto -translate-y-[57px] md:-translate-y-[81px]' : 'h-88'"
    :aria-busy="state === 'loading'"
    :data-home-visual="mode"
  >
    <div
      class="absolute inset-0 motion-safe:transition-opacity motion-safe:duration-180 motion-safe:ease-[var(--motion-ease)]"
      :class="state === 'ready' ? 'opacity-100' : 'opacity-0'"
      :inert="state !== 'ready'"
    >
      <Visual :nodes="nodes" @ready="state = 'ready'" @unavailable="state = 'unavailable'" />
    </div>
    <Transition name="visual-status">
      <div v-if="state !== 'ready'" class="pointer-events-none absolute inset-0 grid place-items-center">
        <LoadingStatus
          :label="state === 'unavailable'
            ? (mode === 'earth' ? '地球暂时无法显示' : '地图资源加载失败')
            : (mode === 'earth' ? '正在加载地球…' : '正在加载地图…')"
          :pending="state === 'loading'"
        />
      </div>
    </Transition>
  </div>
</template>
