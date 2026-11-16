import { shallowRef } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { loadCostRenewal, loadHome, loadIpqaDetail, loadNodeDetail, loadResourceInsightsPage } from './pageLoaders'
import { createPageScroll, pageTransition } from './pageNavigation'

const pageScroll = createPageScroll()
export const routeTransition = shallowRef('page-fade')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: pageScroll.restore,
  routes: [
    {
      path: '/',
      name: 'home',
      component: loadHome,
    },
    {
      path: '/instance/:id',
      name: 'instance-detail',
      component: loadNodeDetail,
      props: true,
    },
    {
      path: '/resource-insights',
      name: 'resource-insights',
      component: loadResourceInsightsPage,
    },
    {
      path: '/cost-renewal',
      name: 'cost-renewal',
      component: loadCostRenewal,
    },
    {
      path: '/ip-quality/:uuid',
      name: 'ipqa-node-detail',
      component: loadIpqaDetail,
      props: route => ({
        uuid: route.params.uuid,
        archiveDate: typeof route.query.date === 'string' ? route.query.date : undefined,
        fromInstance: route.query.from === 'instance',
      }),
    },
  ],
})

router.afterEach((to, from, failure) => {
  if (failure || to.path === from.path)
    return
  pageScroll.remember(from, window.scrollX, window.scrollY)
  routeTransition.value = pageTransition(from, to)
})

export default router
