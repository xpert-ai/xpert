import { parseWidgetJson } from './templates'

export function supportsToolCalling(model: unknown): boolean {
    if (!model || typeof model !== 'object') return true
    const metadata = 'metadata' in model ? model.metadata : undefined
    const profile = metadata && typeof metadata === 'object' && 'profile' in metadata ? metadata.profile : undefined
    const ownProfile = 'profile' in model ? model.profile : undefined
    for (const value of [profile, ownProfile]) {
        if (value && typeof value === 'object' && 'toolCalling' in value && typeof value.toolCalling === 'boolean')
            return value.toolCalling
    }
    return true
}

// Older JSON-only models can wrap their output in prose or a fenced block.
export function extractWidgetJson(content: string): unknown {
    const trimmed = content.trim()
    const candidate = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? trimmed
    try {
        return parseWidgetJson(candidate)
    } catch {
        const starts = [candidate.indexOf('{'), candidate.indexOf('[')].filter((index) => index >= 0)
        if (!starts.length) return undefined
        const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
        try {
            return parseWidgetJson(candidate.slice(Math.min(...starts), end + 1))
        } catch {
            return undefined
        }
    }
}
