import type { RouteLocationNormalized } from 'vue-router'

type Page = Pick<RouteLocationNormalized, 'name' | 'path'>

const pageDepth: Record<string, number> = {
  'home': 0,
  'resource-insights': 1,
  'cost-renewal': 1,
  'instance-detail': 2,
  'ipqa-node-detail': 3,
}

export function pageTransition(from: Page, to: Page) {
  const difference = (pageDepth[String(to.name)] ?? 0) - (pageDepth[String(from.name)] ?? 0)
  if (difference === 0)
    return 'page-fade'
  return difference > 0 ? 'page-forward' : 'page-back'
}

export function createPageScroll() {
  const positions = new Map<string, { left: number, top: number }>()

  function remember(page: Page, left: number, top: number) {
    if (page.name === 'home' || page.name === 'resource-insights')
      positions.set(page.path, { left, top })
  }

  function restore(to: Page, from: Page, saved: { left: number, top: number } | null) {
    if (saved)
      return saved
    if (to.path === from.path)
      return false
    return positions.get(to.path) ?? { top: 0 }
  }

  return { remember, restore }
}
