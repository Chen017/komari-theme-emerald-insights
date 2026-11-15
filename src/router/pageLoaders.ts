export function loadNodeCard() {
  return import('@/components/NodeCard.vue')
}

export function loadHome() {
  // Start the first card module alongside the route module and the node snapshot.
  void loadNodeCard().catch(() => {})
  return import('@/views/HomeView.vue')
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
