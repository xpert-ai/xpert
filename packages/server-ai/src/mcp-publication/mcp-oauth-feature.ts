import { ForbiddenException } from '@nestjs/common'
import { environment } from '@xpert-ai/server-config'
import { t } from 'i18next'

export function isMcpOAuthEnabled() {
    return environment.mcpOAuthEnabled
}

export function assertMcpOAuthEnabled() {
    if (isMcpOAuthEnabled()) return

    throw new ForbiddenException(
        t('server-ai:Error.McpOAuthProOnly', {
            defaultValue: 'MCP OAuth is available only in Xpert Pro.'
        })
    )
}
