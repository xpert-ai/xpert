import { codingToolBrand } from '../../shared/coding-tools/branding'
// Runtime success never implies task acceptance. Read only persisted facts;
// invocation details require the original message, task, conversation and owner bindings.
import { t } from 'i18next'
import {
    codingExecutionViewKey,
    type ConversationResourceCard,
    type ProjectTaskReviewReport
} from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { DataSource, In, IsNull } from 'typeorm'
import {
    ResourceCardProvider,
    type IResourceCardProvider,
    type ResourceCardContext,
    type ResourceCardReadRequest,
    type ResourceCardResolution
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { reviewReport } from './project-task-evidence'
import { projectTaskDispatchIntentSchema, projectTaskInvocationScope } from './project-task-dispatch.schema'
import { agentInvocationId, sameInvocationData } from '../../agent-invocation/invocation-runtime'

type ProjectTaskCardInput = {
    id: string
    title: string
    status: string
} & (
    | { type: 'task' }
    | {
          type: 'execution'
          attempt: number
          purpose?: 'implementation' | 'review'
          toolId?: string
          provider?: string
          reviewVerdict?: ProjectTaskReviewReport['verdict']
          codingInvocationId?: string
      }
)

@Injectable()
@ResourceCardProvider(
    { namespace: 'platform.project-tasks', type: 'task' },
    { namespace: 'platform.project-tasks', type: 'execution' }
)
export class ProjectTaskCardProvider implements IResourceCardProvider {
    constructor(
        private readonly dataSource: DataSource,
        private readonly projects: XpertProjectAccessService
    ) {}

    createCard(input: ProjectTaskCardInput): ConversationResourceCard {
        const brand =
            input.type === 'execution' ? codingToolBrand({ toolId: input.toolId, provider: input.provider }) : undefined
        const parts =
            input.type === 'execution'
                ? [
                      t(`server-ai:ProjectTaskCard.${input.purpose === 'review' ? 'Review' : 'Implementation'}`),
                      brand?.name ?? input.provider,
                      input.attempt > 1 ? t('server-ai:ProjectTaskCard.Attempt', { count: input.attempt }) : undefined
                  ]
                : []
        const status =
            input.type === 'execution' && input.purpose === 'review' && input.status === 'succeeded'
                ? t(`server-ai:ProjectTaskCard.ReviewVerdict.${input.reviewVerdict ?? 'unavailable'}`)
                : t(`server-ai:ProjectTaskCard.Status.${input.status}`, {
                      defaultValue: t('server-ai:ProjectTaskCard.Status.unknown')
                  })
        return {
            resource: { namespace: 'platform.project-tasks', type: input.type, id: input.id },
            title: input.title,
            description: [...parts, status].filter(Boolean).join(' · '),
            icon: brand
                ? { type: 'svg', value: brand.svg, alt: brand.name }
                : { type: 'emoji', value: input.type === 'execution' && input.purpose === 'review' ? '🔎' : '📋' },
            // Keep task-level cards on the timeline; execution cards open their own viewer.
            open:
                input.type === 'execution' && input.codingInvocationId
                    ? {
                          target: 'workbench.view',
                          viewKey: codingExecutionViewKey,
                          selectionId: input.codingInvocationId
                      }
                    : { target: 'workbench.view', viewKey: 'platform.project-tasks__timeline' }
        }
    }

    async resolveMany(
        context: ResourceCardContext,
        requests: readonly ResourceCardReadRequest[]
    ): Promise<ResourceCardResolution[]> {
        const unavailable = (reason: 'forbidden' | 'not_found'): ResourceCardResolution[] =>
            requests.map(({ key }) => ({ key, status: 'unavailable', reason }))
        if (!context.projectId) return unavailable('not_found')
        try {
            await this.projects.assertCanRead(context.projectId)
        } catch (error) {
            if (error instanceof ForbiddenException) return unavailable('forbidden')
            throw error
        }
        context.signal.throwIfAborted()
        const scope = { tenantId: context.tenantId, organizationId: context.organizationId ?? IsNull() }
        const projectScope = { ...scope, projectId: context.projectId }
        const resourceIds = (type: string) => [
            ...new Set(
                requests
                    .filter(
                        ({ card }) =>
                            card.resource.namespace === 'platform.project-tasks' && card.resource.type === type
                    )
                    .map(({ card }) => card.resource.id)
            )
        ]
        const taskIds = resourceIds('task'),
            attemptIds = resourceIds('execution')
        const tasks = taskIds.length
            ? await this.dataSource.getRepository(XpertProjectTask).findBy({
                  ...projectScope,
                  id: In(taskIds)
              })
            : []
        const attempts = attemptIds.length
            ? await this.dataSource.getRepository(XpertProjectTaskExecution).find({
                  select: { id: true, taskId: true, invocationId: true, attempt: true, purpose: true, dispatchIntent: true },
                  where: {
                      ...projectScope,
                      id: In(attemptIds),
                      conversationId: context.conversationId,
                      threadId: context.threadId
                  }
              })
            : []
        const invocationIds = [...new Set(attempts.map((attempt) => attempt.invocationId).filter(Boolean))]
        context.signal.throwIfAborted()
        const records = invocationIds.length
            ? await this.dataSource.getRepository(AgentInvocationEntity).findBy({
                  ...scope,
                  id: In(invocationIds),
                  ownerId: context.userId
              })
            : []
        const tasksById = new Map(tasks.map((task) => [task.id, task]))
        const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]))
        const recordsById = new Map(records.map((record) => [record.id, record]))
        return requests.map(({ key, card, executionId }) => {
            const missing: ResourceCardResolution = { key, status: 'unavailable', reason: 'not_found' }
            if (card.resource.namespace !== 'platform.project-tasks') return missing
            if (card.resource.type === 'task') {
                const task = tasksById.get(card.resource.id)
                return task
                    ? {
                          key,
                          status: 'resolved',
                          card: this.createCard({ type: 'task', id: task.id, title: card.title, status: task.status })
                      }
                    : missing
            }
            if (card.resource.type !== 'execution') return missing
            const attempt = attemptsById.get(card.resource.id)
            if (!attempt?.invocationId) return missing
            const record = recordsById.get(attempt.invocationId)
            const reference = record?.invocation.request.dispatch?.projectTask
            const intent = attempt.dispatchIntent ? projectTaskDispatchIntentSchema.safeParse(attempt.dispatchIntent) : null
            // The card belongs to the admitting execution, while its invocation may retain an earlier attempt's identity.
            // A malformed stored intent must not fall back to the legacy comparison.
            const messageBound = intent
                ? intent.success && record && intent.data.scope.parentExecutionId === executionId &&
                    intent.data.scope.tenantId === context.tenantId &&
                    intent.data.scope.organizationId === context.organizationId &&
                    intent.data.scope.userId === context.userId &&
                    intent.data.scope.projectId === context.projectId &&
                    intent.data.scope.conversationId === context.conversationId &&
                    intent.data.request.dispatch.replyTo.threadId === context.threadId &&
                    agentInvocationId(projectTaskInvocationScope(intent.data), intent.data.request.callId) === attempt.invocationId &&
                    sameInvocationData(record.invocation.scope, projectTaskInvocationScope(intent.data)) &&
                    sameInvocationData(record.invocation.request, intent.data.request)
                : record?.invocation.scope.parentExecutionId === executionId
            if (
                !executionId ||
                !messageBound ||
                reference?.taskExecutionId !== attempt.id ||
                reference.projectId !== context.projectId ||
                reference.projectTaskId !== attempt.taskId
            ) {
                return { key, status: 'unavailable', reason: 'forbidden' }
            }
            const invocation = record.invocation
            return {
                key,
                status: 'resolved',
                card: this.createCard({
                    type: 'execution',
                    id: attempt.id,
                    title: card.title,
                    attempt: attempt.attempt,
                    purpose: attempt.purpose?.type,
                    provider: invocation.request.target.provider,
                    toolId: invocation.handle?.runner?.tool.id,
                    codingInvocationId: invocation.activity?.presentation === 'coding' ? invocation.id : undefined,
                    status: invocation.status,
                    reviewVerdict:
                        invocation.status === 'succeeded'
                            ? reviewReport(attempt.purpose, invocation.result?.text)?.verdict
                            : undefined
                })
            }
        })
    }
}
