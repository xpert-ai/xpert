import type { JSONValue, PublicToolPresentation } from '@xpert-ai/contracts'

/** Run only in-process declarations owned by this tool; nested LangChain calls inherit metadata. */
export function toolPresentation(value: unknown, name: string): PublicToolPresentation | undefined {
    if (!value || typeof value !== 'object' || !('tool' in value) || value.tool !== name) return
    const input = 'input' in value ? value.input : undefined
    const output = 'output' in value ? value.output : undefined
    const error = 'error' in value ? value.error : undefined
    if (
        (input !== undefined && typeof input !== 'function') ||
        (output !== undefined && typeof output !== 'function') ||
        (error !== undefined && typeof error !== 'function')
    )
        return
    return value as PublicToolPresentation
}

// Public previews are small inert JSON values. Refuse a malformed or oversized
// preview as a whole, without substituting the underlying private tool result.
function isPublicToolValue(value: unknown): value is JSONValue {
    let nodes = 0
    let characters = 0
    function valid(entry: unknown, depth: number): boolean {
        if (++nodes > 512 || depth > 12) return false
        if (typeof entry === 'string') return (characters += entry.length) <= 32_768
        if (entry === null || typeof entry === 'boolean') return true
        if (typeof entry === 'number') return Number.isFinite(entry)
        if (Array.isArray(entry)) return entry.length <= 512 && entry.every((item) => valid(item, depth + 1))
        if (typeof entry !== 'object' || Object.getPrototypeOf(entry) !== Object.prototype) return false
        for (const [key, item] of Object.entries(entry)) {
            characters += key.length
            if (characters > 32_768 || !valid(item, depth + 1)) return false
        }
        return true
    }
    return valid(value, 0)
}

export function presentToolValue(
    policy: PublicToolPresentation | undefined,
    phase: 'input' | 'output' | 'error',
    raw: unknown
) {
    try {
        const value = policy?.[phase]?.(raw)
        if (value === undefined || (phase === 'error' && typeof value !== 'string')) return
        if (isPublicToolValue(value)) return value
    } catch {
        // A plugin's display callback must not interrupt the business operation.
    }
}
