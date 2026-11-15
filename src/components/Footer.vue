<script setup lang="ts">
import type { VersionInfo } from '@/utils/api'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useAppStore } from '@/stores/app'
import { getSharedApi } from '@/utils/api'

const appStore = useAppStore()
const api = getSharedApi()
const VisitorInfoCard = defineAsyncComponent(() => import('@/components/VisitorInfoCard.vue'))

const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__

const serverVersion = ref<VersionInfo | null>(null)

onMounted(async () => {
  try {
    serverVersion.value = await api.getVersion()
  }
  catch {
    // 静默失败
  }
})

const formattedServerVersion = computed(() => serverVersion.value?.version ?? null)
</script>

<template>
  <VisitorInfoCard v-if="appStore.visitorInfoCardEnabled" />
  <footer class="w-full sm:flex-row sm:gap-4 max-w-[1280px] mx-auto p-4">
    <div class="flex flex-row items-center justify-between  text-xs text-muted-foreground">
      <div class="flex gap-1 items-center">
        Powered by
        <DataTooltip
          as="span"
          placement="top"
          :content="formattedServerVersion ?? ''"
        >
          <a
            href="https://github.com/komari-monitor/komari" target="_blank" rel="noopener noreferrer"
            class="transition-opacity hover:opacity-80"
          >
            <span class="font-medium text-foreground">Komari Monitor</span>
          </a>
        </DataTooltip>
      </div>
      <div class="flex flex-wrap gap-1 items-center">
        Theme by
        <DataTooltip
          as="span"
          placement="top"
          :content="`v${buildVersion}\n${buildGitHash}`"
        >
          <a
            href="https://github.com/Tokinx/komari-theme-emerald" target="_blank" rel="noopener noreferrer"
            class="transition-opacity hover:opacity-80"
          >
            <span class="font-medium text-foreground">Komari Emerald</span>
          </a>
        </DataTooltip>
      </div>
    </div>
  </footer>
</template>
