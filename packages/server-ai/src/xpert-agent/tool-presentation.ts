import type { ToolCall } from '@langchain/core/messages/tool'
import type { JSONValue, PublicToolPresentation } from '@xpert-ai/contracts'
import { redactCredentials } from '../shared/redact-credentials'

/** Run only in-process declarations owned by this tool; nested LangChain calls inherit metadata. */
export function toolPresentation(value: unknown, name: string): PublicToolPresentation | undefined {
    if (value === undefined && name) return
    // An invalid or inherited declaration must never enable the default display.
    if (!name || !value || typeof value !== 'object' || !('tool' in value) || value.tool !== name) return { tool: name }
    const input = 'input' in value ? value.input : undefined
    const output = 'output' in value ? value.output : undefined
    const error = 'error' in value ? value.error : undefined
    if (
        (input !== undefined && typeof input !== 'function') ||
        (output !== undefined && typeof output !== 'function') ||
        (error !== undefined && typeof error !== 'function') ||
        ('attachments' in value && value.attachments !== undefined && value.attachments !== 'images')
    )
        return { tool: name }
    return value as PublicToolPresentation
}

/** Validation can fail before on_tool_start. The catch event belongs to the parent graph node. */
export function toolErrorEvent(
    toolCall: ToolCall,
    error: string,
    tool?: {
        name: string
        metadata?: Record<string, unknown>
        defaultConfig?: { metadata?: Record<string, unknown> }
        config?: { metadata?: Record<string, unknown> }
    }
) {
    const metadata = { ...tool?.config?.metadata, ...tool?.defaultConfig?.metadata, ...tool?.metadata }
    const declaration = metadata.publicToolPresentation
    const policy = toolPresentation(declaration, toolCall.name)
    return {
        toolCall,
        error,
        ...(tool?.name === toolCall.name
            ? {
                  toolName: metadata.toolName,
                  toolIcon: metadata.toolIcon,
                  middlewareIcon: metadata.middlewareIcon,
                  ...(metadata.toolDisplay ? { toolDisplay: metadata.toolDisplay } : {})
              }
            : {}),
        ...(policy ? { publicToolPresentation: { tool: policy.tool, error: policy.error } } : {})
    }
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

const credentialField =
    /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)$/i

/** Copy only tool data into the transcript. Keep the original values for the model. */
function defaultToolValue(raw: unknown, phase: 'input' | 'output' | 'error'): JSONValue | undefined {
    if (phase === 'error' && typeof raw !== 'string') return
    function copy(value: unknown): JSONValue | undefined {
        if (value === null) return null
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
        if (typeof value === 'string') {
            // ToolMessage.content and text blocks can carry serialized JSON.
            if (/^\s*(?:\[|\{)/.test(value)) {
                let parsed: unknown
                try {
                    parsed = JSON.parse(value)
                } catch {
                    return redactCredentials(value)
                }
                const displayed = JSON.stringify(copy(parsed))
                return displayed === JSON.stringify(parsed) ? value : displayed
            }
            return redactCredentials(value)
        }
        if (Array.isArray(value)) return value.map((item) => copy(item) ?? null)
        if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return
        const entries: [string, JSONValue][] = []
        for (const [key, item] of Object.entries(value)) {
            if (phase === 'input' && key === 'changeSummary') continue
            const displayed = credentialField.test(key) ? '[REDACTED]' : copy(item)
            if (displayed !== undefined) entries.push([key, displayed])
        }
        return Object.fromEntries(entries)
    }
    return copy(raw)
}

export function presentToolValue(
    policy: PublicToolPresentation | undefined,
    phase: 'input' | 'output' | 'error',
    raw: unknown
) {
    try {
        if (!policy) return defaultToolValue(raw, phase)
        const value = policy[phase]?.(raw)
        if (value === undefined || (phase === 'error' && typeof value !== 'string')) return
        if (isPublicToolValue(value)) return value
    } catch {
        // A plugin's display callback must not interrupt the business operation.
    }
}
