import { Injectable } from '@nestjs/common'
import { DataSource, In } from 'typeorm'
import { t } from 'i18next'
import { codingExecutionViewKey, type ConversationResourceCard } from '@xpert-ai/contracts'
import {
    ResourceCardProvider,
    type AgentInvocation,
    type IResourceCardProvider,
    type ResourceCardContext,
    type ResourceCardReadRequest,
    type ResourceCardResolution
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../invocation.entity'

@Injectable()
@ResourceCardProvider({ namespace: 'platform.agent-invocation', type: 'execution' })
export class InvocationCardProvider implements IResourceCardProvider {
    constructor(private readonly database: DataSource) {}
    createCard(invocation: AgentInvocation): ConversationResourceCard {
        return {
            resource: { namespace: 'platform.agent-invocation', type: 'execution', id: invocation.id },
            title: invocation.handle?.runner?.tool.id ?? invocation.request.target.provider,
            description: t(`server-ai:ProjectTaskCard.Status.${invocation.status}`),
            icon: { type: 'emoji', value: '⌘' },
            open: {
                target: 'workbench.view',
                viewKey:
                    invocation.activity?.presentation === 'coding'
                        ? codingExecutionViewKey
                        : 'platform.agent-results__results',
                selectionId: invocation.id
            }
        }
    }
    async resolveMany(
        context: ResourceCardContext,
        requests: readonly ResourceCardReadRequest[]
    ): Promise<ResourceCardResolution[]> {
        if (!context.organizationId)
            return requests.map(({ key }) => ({ key, status: 'unavailable', reason: 'forbidden' }))
        const rows = await this.database.getRepository(AgentInvocationEntity).findBy({
            id: In(requests.map((item) => item.card.resource.id)),
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            ownerId: context.userId
        })
        return requests.map(({ key, card, executionId }) => {
            const invocation = rows.find((row) => row.id === card.resource.id)?.invocation
            if (
                !invocation ||
                invocation.scope.parentExecutionId !== executionId ||
                invocation.scope.conversationId !== context.conversationId ||
                invocation.scope.projectId !== (context.projectId ?? undefined)
            )
                return { key, status: 'unavailable', reason: 'not_found' }
            return { key, status: 'resolved', card: { ...this.createCard(invocation), title: card.title } }
        })
    }
}
