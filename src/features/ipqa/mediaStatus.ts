export type IpqaMediaState = 'unlocked' | 'dns' | 'limited' | 'blocked' | 'unknown'

export interface IpqaMediaService {
  status?: string
  region?: string
  unlocked?: boolean
  [key: string]: unknown
}

export interface IpqaMediaPresentation {
  state: IpqaMediaState
  unlocked: boolean
  label: string
  icon: string
  textClass: string
  badgeClass: string
}

const appearances = {
  unlocked: {
    label: '已解锁',
    icon: 'lucide:check',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  dns: {
    label: 'DNS 解锁',
    icon: 'lucide:zap',
    textClass: 'text-yellow-700 dark:text-yellow-300',
    badgeClass: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300',
  },
  limited: {
    label: '受限解锁',
    icon: 'lucide:circle-minus',
    textClass: 'text-amber-700 dark:text-amber-300',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  blocked: {
    label: '未解锁',
    icon: 'lucide:x',
    textClass: 'text-rose-600 dark:text-rose-400',
    badgeClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
  },
  unknown: {
    label: '未检测',
    icon: 'lucide:minus',
    textClass: 'text-neutral-400 dark:text-neutral-500',
    badgeClass: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  },
} satisfies Record<IpqaMediaState, Omit<IpqaMediaPresentation, 'state' | 'unlocked'>>

const blockedStatus = /未解锁|不解锁|失败|屏蔽|不支持|无法|^(?:no|blocked?|failed|unsupported)\b|not\s+(?:unlocked|supported|available)/i
const restrictedStatus = /中国|禁会员|^(?:china|cn|noprem)\b/i
const limitedStatus = /仅自制|仅网页|仅APP|originals|nf\.only|webonly|apponly/i
const unlockedStatus = /解锁|\b(?:yes|native|unlocked)\b/i
const dnsUnlockType = /dns|代理解锁|\bproxy\b/i

export function resolveMediaStatus(service?: IpqaMediaService | null): IpqaMediaPresentation {
  const rawStatus = service?.status ?? service?.Status
  const status = typeof rawStatus === 'string' ? rawStatus.trim() : ''
  const rawType = service?.type ?? service?.Type
  const unlockType = typeof rawType === 'string' ? rawType : ''
  let state: IpqaMediaState = 'unknown'

  // Negative and limited results must precede the positive substring "解锁".
  if (blockedStatus.test(status) || restrictedStatus.test(status)) {
    state = 'blocked'
  }
  else if (limitedStatus.test(status)) {
    state = 'limited'
  }
  else if (unlockedStatus.test(status) || (!status && service?.unlocked === true)) {
    state = dnsUnlockType.test(`${unlockType} ${status}`) ? 'dns' : 'unlocked'
  }
  else if (!status && service?.unlocked === false) {
    state = 'blocked'
  }

  const appearance = appearances[state]
  return {
    ...appearance,
    state,
    unlocked: state === 'unlocked' || state === 'dns' || state === 'limited',
    label: state === 'dns' || state === 'unknown' || restrictedStatus.test(status) ? appearance.label : (status || appearance.label),
  }
}
