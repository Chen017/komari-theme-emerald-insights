export function loadNodeCard() {
  return import('@/components/NodeCard.vue')
}

export async function loadHome() {
  // Keep the startup status visible while the first card module arrives.
  const [home] = await Promise.all([
    import('@/views/HomeView.vue'),
    loadNodeCard().catch(() => {}),
  ])
  return home
}

export function loadNodeDetail() {
  return import('@/views/InstanceDetail.vue')
}

export function loadCostRenewal() {
  return import('@/features/cost-renewal/pages/CostRenewalPage.vue')
}

export function loadIpqaDetail() {
  return import('@/features/ipqa/pages/IpqaNodeDetailPage.vue')
}
