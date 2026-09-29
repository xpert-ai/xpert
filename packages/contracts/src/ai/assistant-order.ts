export interface AssistantOrderItem {
  id?: string | null
  createdAt?: Date | string | null
}

// Shared by Cloud and Desktop: activity changes must not move assistant entries.
export function orderAssistantXperts<T extends AssistantOrderItem>(items: T[], orderedIds: string[] = []): T[] {
  const itemById = new Map(
    items
      .filter((item): item is T & { id: string } => typeof item.id === 'string' && !!item.id.trim())
      .map((item) => [item.id, item] as const)
  )
  const orderedIdSet = new Set(orderedIds)
  const unorderedItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.id || !orderedIdSet.has(item.id))
    .sort((left, right) => {
      const leftCreatedAt = createdAtTimestamp(left.item)
      const rightCreatedAt = createdAtTimestamp(right.item)
      return leftCreatedAt === rightCreatedAt ? left.index - right.index : rightCreatedAt > leftCreatedAt ? 1 : -1
    })
    .map(({ item }) => item)

  return [
    ...unorderedItems,
    ...orderedIds.map((id) => itemById.get(id)).filter((item): item is T & { id: string } => !!item)
  ]
}

function createdAtTimestamp(item: AssistantOrderItem) {
  const value = item.createdAt
  const timestamp = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}
