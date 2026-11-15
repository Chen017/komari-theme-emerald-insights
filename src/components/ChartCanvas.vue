<script setup lang="ts">
import type { EChartsCoreOption } from 'echarts/core'
import VChart from 'vue-echarts'
import '@/utils/echarts'

defineProps<{ option: EChartsCoreOption }>()
</script>

<template>
  <VChart :option="option" autoresize />
</template>
