import { collectMcpAppComponentData, HistoricalMcpAppComponent } from './mcp-app-history-component'
// History reads authorize the message first. Persisted provenance is never supplied by the browser.
import { ForbiddenException, GoneException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { normalizeMcpAppToolResult } from '../xpert-toolset/provider/mcp/app-support'
import { assertMcpAppAssistantAudience } from './mcp-app-audience'
import { McpAppHistoryStoreService } from './mcp-app-history-store.service'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

export function mcpAppSessionUnavailable(expired: boolean) {
    const code = expired ? 'MCP_APP_SESSION_EXPIRED' : 'MCP_APP_SESSION_UNAVAILABLE'
    return new GoneException({
        code,
        message: t(`server-ai:Error.${expired ? 'McpAppSessionExpired' : 'McpAppSessionUnavailable'}`, {
            defaultValue: expired
                ? 'This App session has expired. Its saved result is still available.'
                : 'This App cannot resume. Its saved result is still available.'
        })
    })
}

@Injectable()
export class McpAppHistoryService {
    constructor(
        private readonly messages: ChatMessageService,
        private readonly store: McpAppHistoryStoreService,
        private readonly queries: QueryBus
    ) {}

    async load(appInstanceId: string, messageId: string) {
        const message = await this.messages.findOneAuthorized(messageId, { relations: ['conversation'] })
        const component = [
            ...collectMcpAppComponentData(message.events),
            ...collectMcpAppComponentData(message.content)
        ].find((item) => item.appInstanceId === appInstanceId)
        if (!component)
            throw new ForbiddenException(
                t('server-ai:Error.McpAppMessageMismatch', {
                    defaultValue: 'This App does not belong to the requested message.'
                })
            )
        const snapshot = await this.store.find(appInstanceId)
        if (snapshot) {
            if (!this.matches(snapshot, component, message.conversationId, message.executionId)) {
                throw new ForbiddenException(t('server-ai:Error.McpAppMessageMismatch'))
            }
            await assertMcpAppAssistantAudience(snapshot.executionContext, this.queries)
        } else {
            await assertMcpAppAssistantAudience(
                message.conversation?.xpertId
                    ? {
                          xpertId: message.conversation.xpertId,
                          conversationId: message.conversationId,
                          executionId: message.executionId ?? '',
                          threadId: message.createdInThreadId
                      }
                    : undefined,
                this.queries
            )
        }
        const input = z.record(z.unknown()).safeParse(snapshot?.toolInput ?? component.toolInput ?? {})
        return {
            snapshot,
            history: {
                appInstanceId,
                toolInput: input.success ? input.data : {},
                toolResult: normalizeMcpAppToolResult(snapshot?.toolResult ?? component.toolResult),
                toolResultTruncated: snapshot?.toolResult === undefined && component.toolResultTruncated === true,
                createdAt: snapshot?.createdAt ?? new Date(message.createdAt).getTime(),
                canResume: Boolean(
                    snapshot?.executionContext &&
                    snapshot.userId &&
                    (snapshot.source || snapshot.toolsetId) &&
                    snapshot.userId === RequestContext.currentUserId()
                )
            }
        }
    }

    private matches(
        snapshot: McpAppInstanceSnapshot,
        component: HistoricalMcpAppComponent,
        conversationId: string | undefined,
        executionId: string | undefined
    ) {
        return (
            snapshot.executionContext?.conversationId === conversationId &&
            snapshot.executionContext?.executionId === (component.executionId ?? executionId) &&
            snapshot.toolCallId === component.toolCallId &&
            snapshot.resourceUri === component.resourceUri &&
            // MCP adapters may persist the prefixed display name in the message component.
            Boolean(component.toolName) &&
            (snapshot.toolName === component.toolName || snapshot.displayName === component.toolName) &&
            snapshot.toolsetId === component.toolsetId &&
            snapshot.serverName === component.serverName
        )
    }
}
