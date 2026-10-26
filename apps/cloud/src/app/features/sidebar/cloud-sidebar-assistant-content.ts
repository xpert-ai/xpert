import type { IconDefinition, XpertExtensionViewManifest, IChatConversation } from '@xpert-ai/contracts'
export type AssistantMenuItem = {
  viewKey: string
  title: string
  icon: IconDefinition | null
  order: number
}

export type AssistantMenuState = {
  loading: boolean
  items: AssistantMenuItem[]
  error: boolean
}

export const EMPTY_ASSISTANT_MENU_STATE: AssistantMenuState = {
  loading: false,
  items: [],
  error: false
}

export type AssistantConversationState = {
  loading: boolean
  loaded: boolean
  items: IChatConversation[]
  total: number
  error: boolean
}

export const EMPTY_ASSISTANT_CONVERSATION_STATE: AssistantConversationState = {
  loading: false,
  loaded: false,
  items: [],
  total: 0,
  error: false
}

export function shouldShowAssistantMenuItem(manifest: XpertExtensionViewManifest) {
  return manifest.visible !== false && manifest.workbench?.menu?.enabled !== false
}

export function toAssistantMenuItem(manifest: XpertExtensionViewManifest): AssistantMenuItem {
  const menu = manifest.workbench?.menu

  return {
    viewKey: manifest.key,
    title: resolveAssistantMenuText(menu?.label ?? manifest.title, manifest.key),
    icon: menu?.icon ?? manifest.icon ?? null,
    order: menu?.order ?? manifest.order ?? Number.MAX_SAFE_INTEGER
  }
}

function resolveAssistantMenuText(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    return value.trim() || fallback
  }

  if (!value || typeof value !== 'object') {
    return fallback
  }

  const languageKeys = ['zh_Hans', 'zh-Hans', 'en_US', 'en-US', 'en']
  for (const key of languageKeys) {
    const candidate = Reflect.get(value, key)
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return fallback
}
