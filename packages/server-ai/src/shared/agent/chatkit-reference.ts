import type { ChatKitReference } from '@xpert-ai/chatkit-types'

function readStringProperty<TProperty extends string>(value: unknown, property: TProperty): string | undefined {
    if (typeof value !== 'object' || value === null || !(property in value)) {
        return undefined
    }
    const propertyValue = (value as { [K in TProperty]?: unknown })[property]
    return typeof propertyValue === 'string' ? propertyValue : undefined
}

function readNumberProperty<TProperty extends string>(value: unknown, property: TProperty): number | undefined {
    if (typeof value !== 'object' || value === null || !(property in value)) {
        return undefined
    }
    const propertyValue = (value as { [K in TProperty]?: unknown })[property]
    return typeof propertyValue === 'number' ? propertyValue : undefined
}

export function isChatKitReference(value: unknown): value is ChatKitReference {
    const type = readStringProperty(value, 'type')
    const text = readStringProperty(value, 'text')
    if (!type || typeof text !== 'string') {
        return false
    }

    switch (type) {
        case 'code':
            return (
                typeof readStringProperty(value, 'path') === 'string' &&
                typeof readNumberProperty(value, 'startLine') === 'number' &&
                typeof readNumberProperty(value, 'endLine') === 'number'
            )
        case 'quote':
        case 'image':
            return true
        default:
            return false
    }
}

export function readChatKitReferences(value: unknown): ChatKitReference[] {
    return Array.isArray(value) ? value.filter(isChatKitReference) : []
}

export function filterChatKitReferences(value: unknown): ChatKitReference[] | undefined {
    const references = readChatKitReferences(value)
    return references.length ? references : undefined
}
