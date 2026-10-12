/** Defense in depth after adapter allowlists; never persist common credential representations. */
export function redactCredentials(value: string) {
    return value
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:sk-|xai-)[A-Za-z0-9_-]{16,}/g, '[REDACTED]')
        .replace(/((?:api[_-]?key|access[_-]?token|password|authorization)[\\"'\s:=]+)[^\\"'\s,}]+/gi, '$1[REDACTED]')
}
