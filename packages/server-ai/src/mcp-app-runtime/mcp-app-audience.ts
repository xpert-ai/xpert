// App snapshots identify the executing Assistant. A delegated user session is
// bound to the entry Assistant, which must be proven by the persisted parent chain.
import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { AssertXpertAgentExecutionAccessQuery } from '../xpert-agent-execution/queries/assert-access.query'
import type { McpAppExecutionContext } from './mcp-app-execution-context'

export async function assertMcpAppAssistantAudience(context: McpAppExecutionContext | undefined, queries: QueryBus) {
    const scope = RequestContext.currentApiPrincipal()?.resourceScope
    if (scope?.kind === 'conversation') throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    if (scope?.kind !== 'assistant') return
    if (context?.xpertId === scope.xpertId) return
    const denied = () => new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
    if (!context?.executionId || !context.threadId) throw denied()

    const visited = new Set<string>()
    let id = context.executionId
    while (id && visited.size < 32) {
        if (visited.has(id)) throw denied()
        visited.add(id)
        const execution = await queries.execute(new AssertXpertAgentExecutionAccessQuery(id, 'read', context.threadId))
        if (
            !execution ||
            execution.threadId !== context.threadId ||
            (id === context.executionId && execution.xpertId !== context.xpertId)
        )
            throw denied()
        if (!execution.parentId) {
            if (execution.xpertId !== scope.xpertId) throw denied()
            return
        }
        id = execution.parentId
    }
    throw denied()
}
