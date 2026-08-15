import type { AsyncAIGCModelClient } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { ModelInvocation } from './model-invocation.entity'
import { ModelInvocationQueueService } from './model-invocation-queue.service'
import { ModelInvocationService } from './model-invocation.service'
import { isTerminalModelInvocationState } from './model-invocation.utils'

const RECONCILABLE_PROVIDER_STATES: ModelInvocation['providerState'][] = ['submitted', 'processing', 'succeeded']
const MAX_RECONCILE_FAILURES = 20
const RUNNING_STALE_MS = 5 * 60 * 1000
const UNBOUND_STALE_MS = 5 * 60 * 1000
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000

@Injectable()
export class ModelInvocationReconciliationService {
    constructor(
        @InjectRepository(ModelInvocation)
        private readonly repository: Repository<ModelInvocation>,
        private readonly invocationService: ModelInvocationService,
        private readonly queue: ModelInvocationQueueService,
        private readonly modelRuntime: AgentMiddlewareRuntimeService
    ) {}

    async markStaleUnboundInvocations(limit: number): Promise<number> {
        const staleBefore = new Date(Date.now() - UNBOUND_STALE_MS)
        const invocations = await this.repository.find({
            where: {
                providerState: 'started',
                providerRequestId: IsNull(),
                updatedAt: LessThanOrEqual(staleBefore)
            },
            order: { updatedAt: 'ASC' },
            take: Math.max(1, Math.min(limit, 100))
        })
        if (!invocations.length) return 0

        const completedAt = new Date()
        for (const invocation of invocations) {
            invocation.providerState = 'acceptance_unknown'
            invocation.usageAvailability = 'unknown'
            invocation.reconciliationState = 'blocked'
            invocation.nextReconcileAt = null
            invocation.completedAt = completedAt
            invocation.errorCode = 'provider_acceptance_unknown'
            invocation.reconciliationErrorCode = 'provider_request_id_missing'
        }
        await this.repository.save(invocations)
        return invocations.length
    }

    async enqueueDueBatch(limit: number): Promise<number> {
        const now = new Date()
        const staleBefore = new Date(now.getTime() - RUNNING_STALE_MS)
        const invocations = await this.repository.find({
            where: [
                {
                    reconciliationState: In(['ready', 'retry_wait']),
                    nextReconcileAt: LessThanOrEqual(now),
                    providerState: In(RECONCILABLE_PROVIDER_STATES)
                },
                {
                    reconciliationState: 'running',
                    updatedAt: LessThanOrEqual(staleBefore),
                    providerState: In(RECONCILABLE_PROVIDER_STATES)
                }
            ],
            order: { nextReconcileAt: 'ASC', createdAt: 'ASC' },
            take: Math.max(1, Math.min(limit, 100))
        })
        for (const invocation of invocations) {
            await this.queue.enqueue(invocation)
        }
        return invocations.length
    }

    async reconcileOne(invocationId: string): Promise<void> {
        const invocation = await this.repository.findOne({ where: { id: invocationId } })
        if (!invocation) return
        if (
            isTerminalModelInvocationState(invocation.providerState) &&
            (invocation.providerState !== 'succeeded' || invocation.reconciliationState === 'finished')
        ) {
            return
        }

        invocation.reconciliationState = 'running'
        await this.repository.save(invocation)

        try {
            const providerRequestId = requireText(invocation.providerRequestId, 'Provider request ID')
            const model = requireText(invocation.model, 'model')
            const client = await this.modelRuntime.createModelClient<AsyncAIGCModelClient>(
                {
                    copilotId: requireText(invocation.copilotId, 'Copilot ID'),
                    model,
                    modelType: invocation.modelType
                },
                {
                    purpose: 'observe',
                    skipTokenRecord: true
                },
                {
                    tenantId: invocation.tenantId,
                    organizationId: invocation.organizationId,
                    providerScopeId: invocation.providerScopeId,
                    userId: invocation.userId,
                    agentKey: invocation.agentKey,
                    executionId: invocation.originExecutionId
                }
            )
            const result = await client.query(providerRequestId, {
                operation: invocation.operation,
                pricingDimensions: invocation.pricingDimensions ?? undefined
            })
            await this.invocationService.observePersisted(invocation, {
                phase: 'observe',
                invocationId: invocation.id,
                providerRequestId,
                ...result.observation
            })
        } catch (error) {
            const persisted = await this.repository.findOne({ where: { id: invocation.id } })
            if (!persisted) return
            if (
                isTerminalModelInvocationState(persisted.providerState) &&
                persisted.reconciliationState === 'finished'
            ) {
                return
            }
            const attempts = persisted.reconcileAttempts + 1
            persisted.reconcileAttempts = attempts
            persisted.reconciliationErrorCode = 'provider_query_failed'
            if (attempts >= MAX_RECONCILE_FAILURES) {
                persisted.reconciliationState = 'blocked'
                persisted.nextReconcileAt = null
                await this.repository.save(persisted)
                return
            }
            const delayMs = retryDelay(attempts)
            persisted.reconciliationState = 'retry_wait'
            persisted.nextReconcileAt = new Date(Date.now() + delayMs)
            await this.repository.save(persisted)
            throw error
        }
    }
}

function retryDelay(attempts: number): number {
    return Math.min(15_000 * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS)
}

function requireText(value: string | null | undefined, label: string): string {
    const normalized = value?.trim()
    if (!normalized) throw new Error(`Missing ${label}`)
    return normalized
}
