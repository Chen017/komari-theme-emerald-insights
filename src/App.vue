<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { routeTransition } from '@/router'
import { useAppStore } from '@/stores/app'
import { destroyInitManager, initApp } from '@/utils/init'
import Background from './components/Background.vue'
import Footer from './components/Footer.vue'
import Header from './components/Header.vue'
import LoadingStatus from './components/LoadingStatus.vue'
import Provider from './components/Provider.vue'

const appStore = useAppStore()
const router = useRouter()
const routeReady = ref(false)
const loading = computed(() => appStore.loading || !routeReady.value)

onMounted(() => {
  void router.isReady().catch(error => console.error('[App] Initial route failed:', error)).finally(() => {
    routeReady.value = true
  })
  void initApp().catch(() => {
    // InitManager exposes the failure to the view.
  })
})

function pinLeavingPage(element: Element) {
  const page = element as HTMLElement
  const { top, left, width } = page.getBoundingClientRect()
  page.inert = true
  page.style.setProperty('--leaving-top', `${top}px`)
  page.style.setProperty('--leaving-left', `${left}px`)
  page.style.setProperty('--leaving-width', `${width}px`)
}

function resetPage(element: Element) {
  const page = element as HTMLElement
  page.inert = false
  page.style.removeProperty('--leaving-top')
  page.style.removeProperty('--leaving-left')
  page.style.removeProperty('--leaving-width')
}

function focusPage(element: Element) {
  const page = element as HTMLElement
  queueMicrotask(() => {
    if (!page.isConnected || page.inert || page.contains(document.activeElement))
      return
    const heading = page.querySelector<HTMLElement>('h1') ?? page
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  })
}

onUnmounted(() => {
  destroyInitManager()
})
</script>

<template>
  <Provider>
    <Background />
    <Header />
    <main class="flex-1" :aria-busy="loading">
      <div class="relative max-w-[1280px] mx-auto">
        <Transition name="startup-loading" @before-leave="element => element.setAttribute('aria-hidden', 'true')">
          <LoadingStatus v-if="loading" label="正在加载监控面板…" class="px-4 py-6" />
        </Transition>
        <Transition name="startup-content">
          <div v-if="!loading">
            <RouterView v-slot="{ Component, route }">
              <Transition
                :name="routeTransition"
                @before-leave="pinLeavingPage"
                @after-leave="resetPage"
                @before-enter="resetPage"
                @enter="focusPage"
              >
                <KeepAlive :include="['HomeView']">
                  <component :is="Component" :key="route.path" />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>
        </Transition>
      </div>
    </main>
    <Footer v-if="!loading" />
    <Toaster rich-colors close-button position="top-center" />
  </Provider>
</template>
