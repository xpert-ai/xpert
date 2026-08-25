import type { XpertToolResult } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

export function assertMcpAppToolResult(result: XpertToolResult, appLinked: boolean) {
    if (!appLinked) return

    const hasTextFallback = result.content?.some((content) => content.type === 'text' && content.text.trim().length > 0)
    if (!hasTextFallback) {
        const defaultValue = 'An MCP App tool result must include non-empty text content for non-App clients.'
        throw new Error(
            t('server-ai:Error.McpAppToolResultTextRequired', {
                defaultValue
            }) || defaultValue
        )
    }
    if (
        typeof result.structuredContent !== 'object' ||
        result.structuredContent === null ||
        Array.isArray(result.structuredContent)
    ) {
        const defaultValue = 'An MCP App tool result must include structuredContent for the App.'
        throw new Error(
            t('server-ai:Error.McpAppToolResultStructuredRequired', {
                defaultValue
            }) || defaultValue
        )
    }
}
