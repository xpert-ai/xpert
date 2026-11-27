import type { JSONValue, ToolDisplayDeclaration } from '@xpert-ai/contracts'

/** The tool declares the input key; shared UI never guesses path fields. */
export function toolInputTarget(key: string, path = false): (input: JSONValue) => string | undefined {
    return (input) => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return
        const value = input[key]
        if (typeof value !== 'string') return
        let text = value.trim()
        if (!path) return text.replace(/\s+/g, ' ').slice(0, 160)
        text = text.replace(/\\/g, '/')
        return /^(?:\/|[A-Za-z]:\/)/.test(text) || text.length > 80
            ? text.split('/').filter(Boolean).slice(-2).join('/')
            : text
    }
}

export function fileToolDisplay(
    tool: string,
    action: 'read' | 'write' | 'list' | 'search',
    key = 'file_path',
    path = true
): ToolDisplayDeclaration {
    return {
        tool,
        activity: { kind: 'file', action },
        target: toolInputTarget(key, path),
        ...(action === 'read'
            ? {
                  outputMode: 'summary' as const,
                  outputSummary: { en_US: 'File read', zh_Hans: '已读取文件' }
              }
            : {})
    }
}
