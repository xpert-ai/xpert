import type {
    IModelInvocation,
    ModelInvocationEvent,
    ModelInvocationOriginType,
    ModelInvocationRecordResult,
    ModelInvocationUsageSummary
} from '@xpert-ai/contracts'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { randomUUID } from 'node:crypto'
import { In, Repository } from 'typeorm'
import { ModelInvocation } from './model-invocation.entity'
import { ModelUsageLedgerService } from './model-usage-ledger.service'
import { ModelChargeLedgerService } from './model-charge-ledger.service'
import { ModelInvocationQueueService } from './model-invocation-queue.service'
import {
    canAdvanceModelInvocationState,
    emptyModelInvocationUsageSummary,
    isTerminalModelInvocationState,
    normalizeModelInvocationMetrics,
    summarizeModelInvocations
} from './model-invocation.utils'

const RECONCILE_DELAY_MS = 15_000

export type ModelInvocationRecorderScope = {
    tenantId: string
    organizationId?: string | null
    userId?: string | null
    agentKey?: string | null
    toolsetId: string
    providerScopeId: string
    copilotId: string
    resolveOrigin: () => {
        type: ModelInvocationOriginType
        id: string
        executionId?: string | null
    }
}

@Injectable()
export class ModelInvocationService {
    constructor(
        @InjectRepository(ModelInvocation)
        private readonly repository: Repository<ModelInvocation>,
        private readonly ledger: ModelUsageLedgerService,
        private readonly chargeLedger: ModelChargeLedgerService,
        private readonly queue: ModelInvocationQueueService
    ) {}

    createRecorder(scope: ModelInvocationRecorderScope) {
        return (event: ModelInvocationEvent): Promise<ModelInvocationRecordResult> => this.record(scope, event)
    }

    async record(
        scope: ModelInvocationRecorderScope,
        event: ModelInvocationEvent
    ): Promise<ModelInvocationRecordResult> {
        if (event.phase === 'start') {
            return this.start(scope, event)
        }
        if (event.phase === 'bind') {
            return this.bind(scope, event.invocationId, event.providerRequestId)
        }
        if (event.phase === 'artifact') {
            return this.recordArtifact(scope, event)
        }
        return this.observe(scope, event)
    }

    async getUsageSummaries(
        executionIds: string[],
        tenantId: string
    ): Promise<Map<string, ModelInvocationUsageSummary>> {
        const uniqueIds = [...new Set(executionIds.filter(Boolean))]
        const summaries = new Map<string, ModelInvocationUsageSummary>()
        for (const executionId of uniqueIds) {
            summaries.set(executionId, emptyModelInvocationUsageSummary())
        }
        if (!uniqueIds.length) {
            return summaries
        }

        const invocations = await this.repository.find({
            where: {
                tenantId: requiredText(tenantId, 'tenant ID'),
                originExecutionId: In(uniqueIds),
                modality: 'video'
            }
        })
        const grouped = new Map<string, IModelInvocation[]>()
        for (const invocation of invocations) {
            const group = grouped.get(invocation.originExecutionId) ?? []
            group.push(invocation)
            grouped.set(invocation.originExecutionId, group)
        }
        for (const [executionId, rows] of grouped) {
            summaries.set(executionId, summarizeModelInvocations(rows))
        }
        return summaries
    }

    async observePersisted(invocation: ModelInvocation, event: Extract<ModelInvocationEvent, { phase: 'observe' }>) {
        return this.applyObservation(requiredText(invocation.id, 'invocation ID'), event, true)
    }

    async getInvocations(executionIds: string[], tenantId: string): Promise<IModelInvocation[]> {
        const uniqueIds = [...new Set(executionIds.filter(Boolean))]
        if (!uniqueIds.length) return []
        return this.repository.find({
            where: {
                tenantId: requiredText(tenantId, 'tenant ID'),
                originType: 'execution',
                originExecutionId: In(uniqueIds)
            },
            order: { startedAt: 'ASC' }
        })
    }

    private async start(
        scope: ModelInvocationRecorderScope,
        event: Extract<ModelInvocationEvent, { phase: 'start' }>
    ): Promise<ModelInvocationRecordResult> {
        const origin = scope.resolveOrigin()
        const originId = requiredText(origin.id, 'origin ID')
        const originExecutionId =
            origin.type === 'execution' ? requiredText(origin.executionId ?? originId, 'origin execution ID') : null
        const invocationKey = requiredText(event.invocationKey, 'invocation key')
        const now = new Date()
        const entity = this.repository.create({
            id: randomUUID(),
            tenantId: requiredText(scope.tenantId, 'tenant ID'),
            organizationId: optionalText(scope.organizationId),
            createdById: optionalText(scope.userId),
            invocationKey,
            originType: origin.type,
            originId,
            originExecutionId,
            userId: optionalText(scope.userId),
            agentKey: optionalText(scope.agentKey),
            toolsetId: requiredText(scope.toolsetId, 'toolset ID'),
            providerScopeId: requiredText(scope.providerScopeId, 'Provider scope ID'),
            copilotId: requiredText(scope.copilotId, 'Copilot ID'),
            provider: requiredText(event.provider, 'Provider'),
            modelType: event.modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO,
            model: optionalText(event.model),
            toolName: requiredText(event.toolName, 'tool name'),
            operation: event.operation,
            modality: event.modality,
            providerState: 'started',
            usageAvailability: 'pending',
            metrics: null,
            pricingDimensions: event.pricingDimensions ?? null,
            pricingSnapshot: event.pricingSnapshot ?? null,
            rawUsage: null,
            artifactState: 'pending',
            artifactErrorCode: null,
            reconciliationState: 'ready',
            nextReconcileAt: null,
            reconcileAttempts: 0,
            startedAt: now,
            completedAt: null,
            lastObservedAt: null,
            errorCode: null
        })

        await this.repository.createQueryBuilder().insert().values(entity).orIgnore().execute()
        const persisted = await this.repository.findOne({
            where: { tenantId: entity.tenantId, originType: origin.type, originId, invocationKey }
        })
        if (!persisted) {
            throw new Error(
                t('server-ai:Error.ModelInvocationNotFound', {
                    defaultValue: 'Model invocation was not found'
                }) || 'Model invocation was not found'
            )
        }
        return toRecordResult(persisted, persisted.id === entity.id)
    }

    private async bind(
        scope: ModelInvocationRecorderScope,
        invocationId: string,
        providerRequestId: string
    ): Promise<ModelInvocationRecordResult> {
        const invocation = await this.findScopedById(scope, invocationId)
        const requestId = requiredText(providerRequestId, 'Provider request ID')
        if (invocation.providerRequestId && invocation.providerRequestId !== requestId) {
            throw new Error(
                t('server-ai:Error.ModelInvocationRebindForbidden', {
                    defaultValue: 'A model invocation cannot be rebound to another Provider request'
                }) || 'A model invocation cannot be rebound to another Provider request'
            )
        }
        const conflicting = await this.repository.findOne({
            where: {
                tenantId: scope.tenantId,
                providerScopeId: scope.providerScopeId,
                providerRequestId: requestId
            }
        })
        if (conflicting?.id && conflicting.id !== invocation.id) {
            throw new Error(
                t('server-ai:Error.ModelInvocationProviderTaskAlreadyBound', {
                    defaultValue: 'The Provider request is already bound to another model invocation'
                }) || 'The Provider request is already bound to another model invocation'
            )
        }

        const recoveringAcceptanceUnknown = invocation.providerState === 'acceptance_unknown'
        invocation.providerRequestId = requestId
        if (invocation.providerState === 'started' || recoveringAcceptanceUnknown) {
            invocation.providerState = 'submitted'
        }
        if (recoveringAcceptanceUnknown) {
            invocation.usageAvailability = 'pending'
            invocation.metrics = null
            invocation.rawUsage = null
            invocation.artifactState = 'pending'
            invocation.artifactErrorCode = null
            invocation.completedAt = null
            invocation.errorCode = null
            invocation.reconciliationErrorCode = null
        }
        if (!isTerminalModelInvocationState(invocation.providerState)) {
            invocation.reconciliationState = 'ready'
            invocation.nextReconcileAt = new Date()
        }
        const saved = await this.repository.save(invocation)
        await this.queue.enqueue(saved)
        return toRecordResult(saved)
    }

    private async observe(
        scope: ModelInvocationRecorderScope,
        event: Extract<ModelInvocationEvent, { phase: 'observe' }>
    ): Promise<ModelInvocationRecordResult> {
        if (!event.invocationId && !event.providerRequestId) {
            throw new Error(
                t('server-ai:Error.ModelInvocationObservationIdentityRequired', {
                    defaultValue: 'An observation requires an invocation ID or Provider request ID'
                }) || 'An observation requires an invocation ID or Provider request ID'
            )
        }
        const invocation = event.invocationId
            ? await this.findScopedById(scope, event.invocationId)
            : await this.findScopedByProviderRequest(
                  scope,
                  requiredText(event.providerRequestId, 'Provider request ID')
              )
        if (
            event.providerRequestId &&
            invocation.providerRequestId &&
            invocation.providerRequestId !== event.providerRequestId
        ) {
            throw new Error(
                t('server-ai:Error.ModelInvocationObservationTaskMismatch', {
                    defaultValue: 'The observation Provider request does not match the model invocation'
                }) || 'The observation Provider request does not match the model invocation'
            )
        }
        const saved = await this.applyObservation(requiredText(invocation.id, 'invocation ID'), event)
        return toRecordResult(saved)
    }

    private async recordArtifact(
        scope: ModelInvocationRecorderScope,
        event: Extract<ModelInvocationEvent, { phase: 'artifact' }>
    ): Promise<ModelInvocationRecordResult> {
        if (!event.invocationId && !event.providerRequestId) {
            throw new Error(
                t('server-ai:Error.ModelInvocationObservationIdentityRequired', {
                    defaultValue: 'An artifact update requires an invocation ID or Provider request ID'
                }) || 'An artifact update requires an invocation ID or Provider request ID'
            )
        }
        const invocation = event.invocationId
            ? await this.findScopedById(scope, event.invocationId)
            : await this.findScopedByProviderRequest(
                  scope,
                  requiredText(event.providerRequestId, 'Provider request ID')
              )
        invocation.artifactState = event.artifactState
        invocation.artifactErrorCode = optionalText(event.artifactErrorCode)
        return toRecordResult(await this.repository.save(invocation))
    }

    private async applyObservation(
        invocationId: string,
        event: Extract<ModelInvocationEvent, { phase: 'observe' }>,
        resetReconciliation = false
    ): Promise<ModelInvocation> {
        const saved = await this.repository.manager.transaction(async (manager) => {
            const invocation = await manager.findOne(ModelInvocation, {
                where: { id: invocationId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!invocation) {
                throw new Error(
                    t('server-ai:Error.ModelInvocationNotFound', {
                        defaultValue: 'Model invocation was not found'
                    }) || 'Model invocation was not found'
                )
            }

            const canAdvance = canAdvanceModelInvocationState(invocation.providerState, event.state)
            if (canAdvance) {
                const recoveringAcceptanceUnknown =
                    invocation.providerState === 'acceptance_unknown' && event.state !== 'acceptance_unknown'
                const metrics = normalizeModelInvocationMetrics(event.metrics, event.usageAvailability, event.state)
                const preserveAvailableTerminalUsage =
                    isTerminalModelInvocationState(invocation.providerState) &&
                    invocation.usageAvailability === 'available' &&
                    Boolean(invocation.metrics?.length)

                if (recoveringAcceptanceUnknown) {
                    invocation.completedAt = null
                    invocation.errorCode = null
                    invocation.reconciliationErrorCode = null
                }
                invocation.providerState = event.state
                if (!preserveAvailableTerminalUsage) {
                    invocation.usageAvailability = event.usageAvailability
                    invocation.metrics = metrics
                    if (event.rawUsage !== undefined) {
                        invocation.rawUsage = event.rawUsage
                    }
                }
                if (event.errorCode !== undefined) {
                    invocation.errorCode = optionalText(event.errorCode)
                }
                invocation.lastObservedAt = new Date()

                if (isTerminalModelInvocationState(event.state) && event.reconciliation !== 'continue') {
                    invocation.completedAt ??= new Date()
                    invocation.reconciliationState = 'finished'
                    invocation.nextReconcileAt = null
                    invocation.reconciliationErrorCode = null
                } else {
                    if (isTerminalModelInvocationState(event.state)) {
                        invocation.completedAt ??= new Date()
                    }
                    invocation.reconciliationState = 'ready'
                    invocation.nextReconcileAt = new Date(Date.now() + RECONCILE_DELAY_MS)
                }
            }

            if (event.artifactState !== undefined) {
                invocation.artifactState = event.artifactState
                invocation.artifactErrorCode = optionalText(event.artifactErrorCode)
            }
            if (resetReconciliation) {
                invocation.reconcileAttempts = 0
                invocation.reconciliationErrorCode = null
            }

            const saved = await manager.save(invocation)
            const usageEntries = await this.ledger.recordInvocation(manager, saved)
            await this.chargeLedger.recordInvocation(manager, saved, usageEntries)
            return saved
        })
        if (!isTerminalModelInvocationState(saved.providerState) || saved.reconciliationState !== 'finished') {
            const delayMs = Math.max(0, (saved.nextReconcileAt?.getTime() ?? Date.now()) - Date.now())
            await this.queue.enqueue(saved, delayMs)
        }
        return saved
    }

    private async findScopedById(scope: ModelInvocationRecorderScope, invocationId: string) {
        const invocation = await this.repository.findOne({
            where: {
                id: requiredText(invocationId, 'invocation ID'),
                tenantId: scope.tenantId,
                toolsetId: scope.toolsetId
            }
        })
        if (!invocation) {
            throw new Error(
                t('server-ai:Error.ModelInvocationScopeNotFound', {
                    defaultValue: 'Model invocation was not found in the current Toolset scope'
                }) || 'Model invocation was not found in the current Toolset scope'
            )
        }
        return invocation
    }

    private async findScopedByProviderRequest(scope: ModelInvocationRecorderScope, providerRequestId: string) {
        const invocation = await this.repository.findOne({
            where: {
                tenantId: scope.tenantId,
                providerScopeId: scope.providerScopeId,
                providerRequestId
            }
        })
        if (!invocation) {
            throw new Error(
                t('server-ai:Error.ModelInvocationProviderTaskScopeNotFound', {
                    defaultValue: 'Provider request was not found in the current Toolset scope'
                }) || 'Provider request was not found in the current Toolset scope'
            )
        }
        return invocation
    }
}

function requiredText(value: string | null | undefined, label: string): string {
    const normalized = value?.trim()
    if (!normalized) {
        throw new Error(
            t('server-ai:Error.ModelInvocationFieldRequired', {
                label,
                defaultValue: 'Missing {{label}}'
            }) || `Missing ${label}`
        )
    }
    return normalized
}

function optionalText(value: string | null | undefined): string | null {
    const normalized = value?.trim()
    return normalized || null
}

function toRecordResult(invocation: ModelInvocation, created?: boolean): ModelInvocationRecordResult {
    return {
        invocationId: requiredText(invocation.id, 'persisted invocation ID'),
        ...(created !== undefined ? { created } : {}),
        ...(invocation.providerRequestId ? { providerRequestId: invocation.providerRequestId } : {}),
        providerState: invocation.providerState
    }
}
