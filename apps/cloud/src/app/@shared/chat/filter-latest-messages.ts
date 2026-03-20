function getCreatedAtMs(value: unknown): number {
  if (!value) {
    return 0
  }
  const date = value instanceof Date ? value : new Date(value as string)
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

/**
 * Keep only the newest child per parentId chain, while preserving the original list order.
 */
export function filterLatestMessages<T extends { id?: string; parentId?: string | null; createdAt?: Date }>(
  messages?: T[] | null
): T[] | null | undefined {
  if (!messages?.length) {
    return messages ?? null
  }

  const byId = new Map<string, T>()
  const indexById = new Map<string, number>()
  const childrenByParent = new Map<string | null, T[]>()

  messages.forEach((message, index) => {
    if (!message?.id) {
      return
    }
    byId.set(message.id, message)
    indexById.set(message.id, index)
    const parentId = message.parentId ?? null
    const siblings = childrenByParent.get(parentId)
    if (siblings) {
      siblings.push(message)
    } else {
      childrenByParent.set(parentId, [message])
    }
  })

  const roots = messages.filter((message) => {
    if (!message?.id) {
      return false
    }
    const parentId = message.parentId
    return !parentId || !byId.has(parentId)
  })

  const keep = new Set<string>()

  const pickLatest = (children: T[]) => {
    return children.reduce<T | null>((latest, child) => {
      if (!latest) {
        return child
      }
      const childTime = getCreatedAtMs(child.createdAt)
      const latestTime = getCreatedAtMs(latest.createdAt)
      if (childTime > latestTime) {
        return child
      }
      if (childTime < latestTime) {
        return latest
      }
      const childIndex = indexById.get(child.id) ?? -1
      const latestIndex = indexById.get(latest.id) ?? -1
      return childIndex > latestIndex ? child : latest
    }, null)
  }

  roots.forEach((root) => {
    let current: T | null = root
    while (current && !keep.has(current.id)) {
      keep.add(current.id)
      const children = childrenByParent.get(current.id)
      if (!children?.length) {
        break
      }
      current = pickLatest(children)
    }
  })

  if (!keep.size) {
    return messages
  }

  return messages.filter((message) => !message?.id || keep.has(message.id))
}
