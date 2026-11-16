import type { MessageApi } from '@/utils/message'

declare global {
  interface Window {
    $message: MessageApi
  }
}

export {}
