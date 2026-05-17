import { PromptTemplate } from '@langchain/core/prompts'

export const MCP_ASSISTANT_CODE_HEADER = 'x-assistant-code'

export async function buildMCPHeaders(
    headers: Record<string, string> = {},
    envState: Record<string, unknown>,
    xpertId?: string
) {
    const renderedHeaders = { ...headers }
    for await (const name of Object.keys(renderedHeaders)) {
        renderedHeaders[name] = await PromptTemplate.fromTemplate(renderedHeaders[name], {
            templateFormat: 'mustache'
        }).format(envState)
    }

    const assistantCode = xpertId?.trim()
    if (assistantCode) {
        renderedHeaders[MCP_ASSISTANT_CODE_HEADER] = assistantCode
    }

    return renderedHeaders
}
