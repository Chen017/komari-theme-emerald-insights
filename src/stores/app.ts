import type { PublicSettings } from '@/utils/api'
import type { ByteDecimalsConfig } from '@/utils/helper'
import { usePreferredDark, useStorageAsync } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { DEFAULT_STEAL_MULTIPLIER, STEAL_MULTIPLIERS } from '@/features/cpu-steal/display'
import { parseHomePingLineCount, parseHomePingTaskOrder } from '@/utils/homePingSettings'

export type ThemeMode = 'auto' | 'light' | 'dark'
type Lang = 'zh-CN' | 'en-US'
type RpcTransportMode = 'websocket' | 'http'
type EarthViewMode = 'earth' | 'earth-stop' | 'maps' | 'cards' | 'hide'
const PING_TASK_NAME_SEPARATOR = /[,，]/

const NODE_DETAIL_SECTIONS = [
  { id: 'monitoring', label: '资源监控' },
  { id: 'ping', label: '延迟与丢包' },
  { id: 'ipqa', label: 'IP 质量概况' },
  { id: 'info', label: '基础信息' },
] as const

/** 固定的字节精度配置 */
const BYTE_DECIMALS: ByteDecimalsConfig = {
  B: 0,
  KB: 0,
  MB: 1,
  GB: 1,
  TB: 2,
}

function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

function isValidEarthViewMode(value: unknown): value is EarthViewMode {
  return value === 'earth' || value === 'earth-stop' || value === 'maps' || value === 'cards' || value === 'hide'
}

const useAppStore = defineStore('app', () => {
  const loading = ref<boolean>(true)

  // 使用 VueUse 的 useStorageAsync 实现自动持久化
  const themeMode = useStorageAsync<ThemeMode>('themeMode', 'auto', localStorage)
  const lang = ref<Lang>('zh-CN')
  const publicSettings = ref<PublicSettings>()
  const nodeSelectedGroup = useStorageAsync<string>('nodeSelectedGroup', 'all', localStorage)
  const isLoggedIn = ref<boolean>(false)
  const connectionError = ref<boolean>(false)

  // 计算属性：从主题配置获取 RPC 连接模式
  const rpcTransportMode = computed<RpcTransportMode>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.rpcTransportMode === 'string') {
      const mode = settings.rpcTransportMode
      if (mode === 'websocket' || mode === 'http') {
        return mode
      }
    }
    return 'websocket'
  })

  // 字节格式化精度（固定配置）
  const byteDecimals: ByteDecimalsConfig = { ...BYTE_DECIMALS }

  const earthViewMode = computed<EarthViewMode>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.earthViewMode === 'string' && isValidEarthViewMode(settings.earthViewMode)) {
      return settings.earthViewMode
    }
    return 'earth'
  })

  const visitorInfoCardEnabled = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.visitorInfoCardEnabled === 'boolean') {
      return settings.visitorInfoCardEnabled
    }
    return true
  })

  const visitorCountryCode = ref<string | null>(null)

  const hideAdminEntryWhenLoggedOut = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.hideAdminEntryWhenLoggedOut === 'boolean') {
      return settings.hideAdminEntryWhenLoggedOut
    }
    return false
  })

  const dataUpdateIntervalMs = computed(() => {
    const interval = publicSettings.value?.theme_settings?.dataUpdateInterval
    return typeof interval === 'number' && interval >= 1 && interval <= 60 ? interval * 1000 : 3000
  })

  const homePingLineCount = computed(() => parseHomePingLineCount(publicSettings.value?.theme_settings?.homePingLineCount))
  const homePingTaskOrder = computed(() => parseHomePingTaskOrder(publicSettings.value?.theme_settings?.homePingTaskOrder))

  // 兼容旧版主题按 Ping 任务名称排序的配置。
  const pingNetworkOrder = computed<string[]>(() => {
    const settings = publicSettings.value?.theme_settings
    const raw = settings && typeof settings.pingNetworkOrder === 'string' ? settings.pingNetworkOrder : ''
    const seen = new Set<string>()
    const names: string[] = []

    for (const item of raw.split(PING_TASK_NAME_SEPARATOR)) {
      const normalized = item.trim()
      if (!normalized || seen.has(normalized))
        continue
      seen.add(normalized)
      names.push(normalized)
    }

    return names
  })

  // 计算属性：离线节点后置（默认顺序下离线节点排到所有节点最后）
  const offlineNodesLast = computed<boolean>(() => {
    const settings = publicSettings.value?.theme_settings
    if (settings && typeof settings.offlineNodesLast === 'boolean') {
      return settings.offlineNodesLast
    }
    return false
  })

  // 使用 VueUse 的 usePreferredDark 检测系统主题偏好
  const prefersDark = usePreferredDark()

  watch(themeMode, (mode) => {
    if (!isValidThemeMode(mode)) {
      themeMode.value = 'auto'
    }
  }, { immediate: true })

  // 计算当前是否为暗色模式
  const isDark = computed(() => {
    if (themeMode.value === 'auto') {
      return prefersDark.value
    }
    return themeMode.value === 'dark'
  })

  function updateThemeMode(mode?: ThemeMode) {
    if (mode) {
      themeMode.value = isValidThemeMode(mode) ? mode : 'auto'
      return
    }

    const nextMode: Record<ThemeMode, ThemeMode> = {
      auto: 'light',
      light: 'dark',
      dark: 'auto',
    }

    const currentMode = isValidThemeMode(themeMode.value) ? themeMode.value : 'auto'
    themeMode.value = nextMode[currentMode]
  }

  function updateLoginState(loggedIn: boolean) {
    isLoggedIn.value = loggedIn
  }

  const enableResourceInsights = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.enable_resource_insights
    return val !== undefined ? Boolean(val) : true
  })

  const enableCostRenewal = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.enable_cost_renewal
    return val !== undefined ? Boolean(val) : true
  })

  const enableIpqaOverview = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.enable_ipqa_overview
    return val !== undefined ? Boolean(val) : true
  })

  const enableCpuSteal = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.enable_cpu_steal
    return typeof val === 'boolean' ? val : true
  })

  const cpuStealMultiplier = computed<number>(() => {
    const value = Number(publicSettings.value?.theme_settings?.cpu_steal_multiplier ?? DEFAULT_STEAL_MULTIPLIER)
    return (STEAL_MULTIPLIERS as readonly number[]).includes(value) ? value : DEFAULT_STEAL_MULTIPLIER
  })

  const cpuStealDefaultVisible = computed<boolean>(() => {
    const value = publicSettings.value?.theme_settings?.cpu_steal_default_visible
    return typeof value === 'boolean' ? value : false
  })

  const nodeDetailLayout = computed(() => {
    const settings = publicSettings.value?.theme_settings
    const showPrimaryCharts = settings?.node_detail_show_primary_charts !== false
    const showExtraCharts = settings?.node_detail_show_extra_charts === true
    const showStorageNetwork = settings?.node_detail_show_storage_network !== false
    const showHardwareSystem = settings?.node_detail_show_hardware_system !== false
    const showCost = settings?.node_detail_show_cost !== false
    const ipqaSetting = settings?.enable_node_detail_ipqa
    const visible = {
      monitoring: showPrimaryCharts || showExtraCharts,
      ping: true,
      ipqa: ipqaSetting === undefined || Boolean(ipqaSetting),
      info: showCost || showHardwareSystem || showStorageNetwork,
    }
    const remaining = new Set(NODE_DETAIL_SECTIONS.map(section => section.id))
    const chosen = NODE_DETAIL_SECTIONS.map((_, index) => {
      const label = settings?.[`node_detail_section_${index + 1}`]
      const section = NODE_DETAIL_SECTIONS.find(section => section.label === label)
      if (section && remaining.delete(section.id))
        return section.id
      return undefined
    })
    const fallback = remaining.values()
    const sections = chosen
      .map(id => id ?? fallback.next().value)
      .filter(id => id !== undefined && visible[id])

    return { sections, showPrimaryCharts, showExtraCharts, showStorageNetwork, showHardwareSystem, showCost }
  })

  const ipqaShowRiskMatrix = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.ipqa_show_risk_matrix
    return val !== undefined ? Boolean(val) : true
  })

  const ipqaShowMediaMatrix = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.ipqa_show_media_matrix
    return val !== undefined ? Boolean(val) : true
  })

  const ipqaShowChanges = computed<boolean>(() => {
    const val = publicSettings.value?.theme_settings?.ipqa_show_changes
    return val !== undefined ? Boolean(val) : true
  })

  return {
    loading,
    themeMode,
    isDark,
    lang,
    nodeSelectedGroup,
    rpcTransportMode,
    dataUpdateIntervalMs,
    byteDecimals,
    earthViewMode,
    visitorInfoCardEnabled,
    visitorCountryCode,
    hideAdminEntryWhenLoggedOut,
    pingNetworkOrder,
    homePingLineCount,
    homePingTaskOrder,
    offlineNodesLast,
    enableResourceInsights,
    enableCpuSteal,
    cpuStealMultiplier,
    cpuStealDefaultVisible,
    enableCostRenewal,
    enableIpqaOverview,
    nodeDetailLayout,
    ipqaShowRiskMatrix,
    ipqaShowMediaMatrix,
    ipqaShowChanges,
    isLoggedIn,
    publicSettings,
    connectionError,
    updateThemeMode,
    updateLoginState,
  }
})

export { useAppStore }
