<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed, defineAsyncComponent, onDeactivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PingChartPlaceholder from '@/components/PingChartPlaceholder.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty } from '@/components/ui/empty'
import { loadNodeCard, loadNodeDetail } from '@/router/pageLoaders'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { isNodeInGroup } from '@/utils/groupHelper'

defineOptions({ name: 'HomeView' })

const NodeCard = defineAsyncComponent(loadNodeCard)
const NodeGeneralCards = defineAsyncComponent(() => import('@/components/NodeGeneralCards.vue'))
const PingChart = defineAsyncComponent({
  loader: () => import('@/components/PingChart.vue'),
  loadingComponent: PingChartPlaceholder,
  delay: 0,
})

const appStore = useAppStore()
const nodesStore = useNodesStore()
const router = useRouter()
const route = useRoute()
const pingDialogOpen = ref(false)
const selectedPing = ref<{ uuid: string, name: string, taskId: number }>()
let pingTrigger: HTMLElement | undefined

onDeactivated(() => {
  pingDialogOpen.value = false
  selectedPing.value = undefined
  pingTrigger = undefined
})

watch(() => nodesStore.nodes, (nodes) => {
  if (pingDialogOpen.value && !nodes.some(node => node.uuid === selectedPing.value?.uuid))
    pingDialogOpen.value = false
})

watch(() => nodesStore.groups, (groups) => {
  if (appStore.nodeSelectedGroup !== 'all' && !groups.includes(appStore.nodeSelectedGroup))
    appStore.nodeSelectedGroup = 'all'
}, { immediate: true })

const groupNodeList = computed(() => nodesStore.nodes.filter(node => isNodeInGroup(node.group, appStore.nodeSelectedGroup)))
const sampledGroupNodeList = computed(() => nodesStore.earthNodes.filter(node => isNodeInGroup(node.group, appStore.nodeSelectedGroup)))

const nodeList = computed(() => {
  const nodes = groupNodeList.value
  if (!appStore.offlineNodesLast)
    return nodes
  return [...nodes].sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1))
})

function handleNodeClick(node: NodeData) {
  void router.push({ name: 'instance-detail', params: { id: node.uuid } })
}

function prefetchNodeDetail() {
  void loadNodeDetail().catch(() => {})
}

function handlePingClick(node: NodeData, taskId: number, trigger: HTMLElement) {
  pingTrigger = trigger
  selectedPing.value = { uuid: node.uuid, name: node.name, taskId }
  pingDialogOpen.value = true
}

function restorePingFocus(event: Event) {
  event.preventDefault()
  if (route.name === 'home' && !pingDialogOpen.value && pingTrigger?.isConnected)
    pingTrigger.focus({ preventScroll: true })
}
</script>

<template>
  <div class="home-view">
    <div v-if="appStore.connectionError" class="alert px-4">
      <Alert
        variant="destructive"
        class="border-none bg-red-400/10 rounded-md"
      >
        <AlertTitle>RPC 服务错误</AlertTitle>
        <AlertDescription>连接服务器失败，请检查网络设置或刷新页面后再试。</AlertDescription>
      </Alert>
    </div>

    <NodeGeneralCards
      v-if="appStore.earthViewMode !== 'hide'"
      :nodes="groupNodeList"
      :globe-nodes="sampledGroupNodeList"
      :transition-key="appStore.nodeSelectedGroup"
    />

    <div class="node-info p-4 flex flex-col gap-4 relative z-1 md:pointer-events-none" :class="appStore.earthViewMode === 'hide' ? 'pt-4' : 'pt-2'">
      <div v-if="nodesStore.groups.length" class="flex flex-wrap gap-2 pointer-events-auto">
        <Button
          v-for="group in nodesStore.groups" :key="group"
          variant="outline" size="sm" :aria-pressed="appStore.nodeSelectedGroup === group"
          :class="appStore.nodeSelectedGroup === group && 'text-emerald-600'"
          @click="appStore.nodeSelectedGroup = appStore.nodeSelectedGroup === group ? 'all' : group"
        >
          {{ group }}
        </Button>
      </div>
      <TransitionGroup
        v-if="nodeList.length !== 0"
        name="node-card-switch"
        tag="div"
        class="pointer-events-auto gap-3 grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
      >
        <div
          v-for="node in nodeList"
          :key="node.uuid"
          class="min-w-0"
        >
          <NodeCard
            :node="node"
            @click="handleNodeClick(node)"
            @pointerenter="prefetchNodeDetail"
            @focusin="prefetchNodeDetail"
            @pointerdown="prefetchNodeDetail"
            @ping-click="handlePingClick"
          />
        </div>
      </TransitionGroup>
      <div v-else class="pointer-events-auto text-muted-foreground text-center py-8">
        <Empty description="暂无节点" />
      </div>
    </div>

    <Dialog v-model:open="pingDialogOpen">
      <DialogContent
        v-if="selectedPing"
        class="max-w-6xl gap-0 overflow-hidden border-emerald-600/10 p-0 shadow-[0_0_2rem] shadow-emerald-800/10 bg-background"
        @close-auto-focus="restorePingFocus"
      >
        <DialogHeader class="flex h-13 flex-row items-center px-4">
          <DialogTitle class="min-w-0 truncate pr-10">
            {{ selectedPing.name }} 延迟 / 丢包
          </DialogTitle>
          <DialogDescription class="sr-only">
            选择时间范围查看该节点的延迟和丢包历史。
          </DialogDescription>
          <div class="absolute inset-0 mx-0 max-w-none overflow-hidden bg-slate-50 dark:bg-slate-900/50 -z-9 zoom-90">
            <div class="absolute top-0 left-1/2 -ml-152 h-100 w-325 dark:mask-[linear-gradient(white,transparent)]">
              <div
                class="absolute inset-0 bg-linear-to-r from-emerald-500 to-lime-300 mask-[radial-gradient(farthest-side_at_top,white,transparent)] opacity-40 dark:from-emerald-500/30 dark:to-lime-300/30 dark:opacity-100"
              >
                <svg
                  aria-hidden="true"
                  class="absolute inset-x-0 inset-y-[-50%] h-[200%] w-full skew-y-[-18deg] fill-black/40 stroke-black/50 mix-blend-overlay dark:fill-white/2.5 dark:stroke-white/5"
                >
                  <defs>
                    <pattern id="ping-dialog-grid" width="72" height="56" patternUnits="userSpaceOnUse" x="-12" y="4">
                      <path d="M.5 56V.5H72" fill="none" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" stroke-width="0" fill="url(#ping-dialog-grid)" /><svg
                    x="-12" y="4"
                    class="overflow-visible"
                  >
                    <rect stroke-width="0" width="73" height="57" x="288" y="168" />
                    <rect stroke-width="0" width="73" height="57" x="144" y="56" />
                    <rect stroke-width="0" width="73" height="57" x="504" y="168" />
                    <rect stroke-width="0" width="73" height="57" x="720" y="336" />
                  </svg>
                </svg>
              </div>
            </div>
          </div>
        </DialogHeader>
        <div class="h-[min(34rem,calc(90dvh-3.25rem))] overflow-y-auto overscroll-contain p-4 pt-0">
          <PingChart
            :key="`${selectedPing.uuid}:${selectedPing.taskId}`"
            :uuid="selectedPing.uuid"
            :initial-task-id="selectedPing.taskId"
            :active="pingDialogOpen"
          />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.node-card-switch-enter-active,
.node-card-switch-leave-active {
  transition:
    opacity 150ms ease,
    transform 180ms var(--motion-ease);
}

.node-card-switch-move {
  transition: transform 180ms var(--motion-ease);
}

.node-card-switch-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.node-card-switch-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@media (prefers-reduced-motion: reduce) {
  .node-card-switch-enter-active,
  .node-card-switch-leave-active,
  .node-card-switch-move {
    transition: none;
  }

  .node-card-switch-enter-from,
  .node-card-switch-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
