/** Shared by the lazy route and navigation intent; importing starts no API reads. */
export function loadResourceInsightsPage() {
  return import('@/features/resource-insights/pages/ResourceInsightsPage.vue')
}
