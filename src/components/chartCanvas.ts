import { defineAsyncComponent, h } from 'vue'

function loadChartCanvas() {
  return import('./ChartCanvas.vue')
}

export function preloadChartCanvas() {
  void loadChartCanvas().catch(() => {
    // The async component renders the error if the chart is needed.
  })
}

export const ChartCanvas = defineAsyncComponent({
  loader: loadChartCanvas,
  delay: 0,
  loadingComponent: () => h('div', {
    class: 'grid h-full place-items-center text-xs text-muted-foreground',
    role: 'status',
  }, '正在加载图表…'),
  errorComponent: () => h('div', {
    class: 'grid h-full place-items-center text-xs text-destructive',
    role: 'status',
  }, '图表加载失败'),
})
