const CHAT_COMMON_PENDING_INPUT_STORAGE_KEY = 'chat.common.pendingInput'

export function storeChatCommonPendingInput(input: string) {
  const value = input.trim()
  if (!value || !canUseSessionStorage()) {
    return
  }

  try {
    window.sessionStorage.setItem(CHAT_COMMON_PENDING_INPUT_STORAGE_KEY, value)
  } catch {}
}

export function consumeChatCommonPendingInput() {
  if (!canUseSessionStorage()) {
    return null
  }

  try {
    const value = window.sessionStorage.getItem(CHAT_COMMON_PENDING_INPUT_STORAGE_KEY)?.trim()
    window.sessionStorage.removeItem(CHAT_COMMON_PENDING_INPUT_STORAGE_KEY)
    return value || null
  } catch {
    return null
  }
}

export function clearChatCommonPendingInput() {
  if (!canUseSessionStorage()) {
    return
  }

  try {
    window.sessionStorage.removeItem(CHAT_COMMON_PENDING_INPUT_STORAGE_KEY)
  } catch {}
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && !!window.sessionStorage
}
