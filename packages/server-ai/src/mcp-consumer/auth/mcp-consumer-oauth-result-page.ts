export function renderMcpConsumerOAuthResultPage(input: {
    status: 'success' | 'error'
    returnUrl: string
    errorMessage?: string
}) {
    const success = input.status === 'success'
    const title = success ? 'MCP authorization completed' : 'MCP authorization failed'
    const detail = success
        ? 'You can close this window and return to Xpert.'
        : input.errorMessage || 'The authorization response could not be completed.'
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:12vh auto;padding:2rem;color:#18181b}main{border:1px solid #e4e4e7;border-radius:16px;padding:2rem}a{color:#2563eb}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(input.returnUrl)}">Return to Xpert</a></p></main></body></html>`
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&':
                return '&amp;'
            case '<':
                return '&lt;'
            case '>':
                return '&gt;'
            case '"':
                return '&quot;'
            default:
                return '&#39;'
        }
    })
}
