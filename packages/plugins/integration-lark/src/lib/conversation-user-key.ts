function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized.length ? normalized : null
}

export function normalizeConversationUserKey(value: unknown): string | null {
  return normalizeString(value)
}

export function toOpenIdConversationUserKey(openId: unknown): string | null {
  const normalizedOpenId = normalizeString(openId)
  if (!normalizedOpenId) {
    return null
  }
  return `open_id:${normalizedOpenId}`
}

export function toRecipientConversationUserKey(type: unknown, id: unknown): string | null {
  const normalizedType = normalizeString(type)
  const normalizedId = normalizeString(id)
  if (!normalizedType || !normalizedId) {
    return null
  }
  return `${normalizedType}:${normalizedId}`
}

export function resolveConversationUserKey(params: {
  senderOpenId?: unknown
  fallbackUserId?: unknown
}): string | null {
  return toOpenIdConversationUserKey(params.senderOpenId) ?? normalizeConversationUserKey(params.fallbackUserId)
}
