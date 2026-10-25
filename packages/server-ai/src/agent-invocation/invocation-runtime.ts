// Invariants: reserve before dispatch; ambiguous launch is never automatically retried.
// Provider provenance and target revision stay pinned through checkpoint recovery.
// A bounded persisted startup fence keeps inspection from invalidating intermediate launch receipts.
import { checkedControlObservation, invocationCanRelease, notStartedEvidence } from './invocation-control-evidence'
import type { TaskControlPolicy } from '@xpert-ai/plugin-sdk'
import { TaskControlRejected } from '@xpert-ai/server-core'
import { createHash, randomUUID } from 'crypto'
import { executionRuntimeTargetsEqual } from '@xpert-ai/contracts'
import { agentRuntimeProgressSchema } from '@xpert-ai/contracts'
import {
    AgentInvocation,
    projectPipelineInvocationScopeSchema,
    agentOutputDeliverySchema,
    agentInvocationDispatchContextSchema,
    AgentInvocationApi,
    AgentInvocationRequest,
    AgentInvocationScope,
    AgentJson,
    AgentRuntimeContext,
    AgentRuntimeObservation,
    AgentRuntimeRegistry,
    AgentTarget,
    IAgentRuntimeStrategy,
    isAgentInvocationTerminal,
    RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { AgentActivityRecorder } from '@xpert-ai/plugin-sdk'
import { AgentInvocationStore, StoredAgentInvocation } from './invocation-store'
import { TaskControlStore, withTaskControl } from '@xpert-ai/server-core'
import {
    AgentInvocationError,
    AgentInvocationErrorCode,
    AgentInvocationNotStartedError,
    authorizeAgentInvocation
} from './invocation-errors'

export interface AgentInvocationAccess {
    /** Trusted host adapter identity; not accepted from invocation request input. */
    controlAdapter?: 'native-assistant-task' | 'native-graph'
    controlPolicy?: TaskControlPolicy | ((target: AgentTarget) => TaskControlPolicy)
    scope: AgentInvocationScope
    capabilities: RuntimeCapabilityRegistry
    signal?: AbortSignal
    authorize(target: Readonly<AgentTarget>): Promise<void>
    /** Only the host-native adapter can recognize/rethrow graph checkpoint interrupts. */
    isSuspension?(error: unknown): boolean
}

export class AgentInvocationRuntime {
    private readonly hostId = randomUUID()
    private readonly owned = new Map<
        string,
        { access: AgentInvocationAccess; target: NonNullable<AgentInvocation['executionTarget']> }
    >()
    private scanningOwned = false

    /** Durable intent is the delivery mechanism. Polling does not depend on a transient notification. */
    async reconcileOwned(
        withActor: (scope: AgentInvocationScope, work: () => Promise<AgentInvocation>) => Promise<AgentInvocation> = (
            _scope,
            work
        ) => work()
    ) {
        if (this.scanningOwned) return
        this.scanningOwned = true
        try {
            for (const [id, owner] of this.owned) {
                try {
                    const row = await this.store.read(id, owner.access.scope)
                    if (
                        !row ||
                        !executionRuntimeTargetsEqual(row.invocation.executionTarget, owner.target) ||
                        invocationCanRelease(row.invocation)
                    ) {
                        this.owned.delete(id)
                        continue
                    }
                    const inspect = () =>
                        this.control(id, owner.access, 'inspect', undefined, Boolean(row.invocation.control))
                    if (row.invocation.control) await inspect()
                    else await withActor(owner.access.scope, inspect)
                } catch {
                    /* Retain the original target. An outage never permits a replacement launch. */
                }
            }
        } finally {
            this.scanningOwned = false
        }
    }

    constructor(
        private readonly store: AgentInvocationStore,
        private readonly registry: AgentRuntimeRegistry,
        private readonly activity?: (invocation: AgentInvocation) => AgentActivityRecorder,
        private readonly tasks?: TaskControlStore
    ) {}

    assertBackgroundTarget(target: AgentTarget, organizationId: string): void {
        const strategy = this.registry
            .listRegistrations(organizationId)
            .find((item) => item.type === target.provider)?.strategy
        if (!strategy) throw invocationError('ProviderUnavailable')
        if (!strategy.capabilities.background || strategy.capabilities.recovery === 'checkpoint')
            throw invocationError('Unsupported')
    }

    scoped(access: AgentInvocationAccess): AgentInvocationApi {
        const scope = structuredClone(access.scope)
        if (
            !scope.tenantId ||
            !scope.organizationId ||
            !scope.userId ||
            !scope.parentExecutionId ||
            !scope.callerAgentKey
        ) {
            throw invocationError('InvalidScope')
        }
        if (
            (scope.callerType === 'project_pipeline' || scope.pipelineOrigin) &&
            !projectPipelineInvocationScopeSchema.safeParse(scope).success
        )
            throw invocationError('InvalidScope')
        const context = { ...access, scope }
        return {
            start: (request) => this.start(request, context),
            inspect: (id) => this.control(id, context, 'inspect'),
            cancel: (id) => this.control(id, context, 'cancel'),
            respond: (id, interactionId, response) => this.control(id, context, 'respond', { interactionId, response })
        }
    }

    private async start(request: AgentInvocationRequest, access: AgentInvocationAccess): Promise<AgentInvocation> {
        const originalAccess = access
        const requestedExecutionId = access.scope.parentExecutionId
        access = await this.stableAccess(access)
        request = structuredClone(request)
        validateRequest(request)
        await authorizeAgentInvocation(() => access.authorize(request.target))
        access.signal?.throwIfAborted()
        const id = agentInvocationId(access.scope, request.callId)
        let record = await this.store.read(id, access.scope)
        let strategy: IAgentRuntimeStrategy
        if (record) {
            this.assertScope(record, access.scope)
            if (canonical(record.invocation.request) !== canonical(request)) throw invocationError('CallConflict')
            strategy = this.pinned(record)
            if (isAgentInvocationTerminal(record.invocation.status)) return record.invocation
            if (
                record.invocation.status !== 'queued' &&
                (record.invocation.status !== 'waiting' || strategy.capabilities.recovery !== 'checkpoint')
            ) {
                return record.invocation
            }
        } else {
            strategy = this.registry.get(request.target.provider, access.scope.organizationId)
            if (!strategy) throw invocationError('ProviderUnavailable')
            const now = new Date().toISOString()
            record = {
                invocation: {
                    id,
                    revision: 0,
                    scope: access.scope,
                    controlAdapter: access.controlAdapter,
                    completionEvidence: strategy.capabilities.completionEvidence,
                    request,
                    ...(strategy.capabilities.activity
                        ? { activity: structuredClone(strategy.capabilities.activity) }
                        : {}),
                    status: 'queued',
                    createdAt: now,
                    updatedAt: now
                },
                providerSource: this.registry.getSource(strategy)
            }
            if (!(await this.store.insert(record))) return this.start(request, originalAccess)
        }
        const parent = await this.tasks?.execution(access.scope.parentExecutionId)
        if (parent && parent.currentExecutionId !== requestedExecutionId) throw invocationError('CallConflict')
        const task = parent
            ? await this.tasks.register({
                  ...access.scope,
                  kind: 'invocation',
                  resourceId: id,
                  parent: { version: 2, targetId: parent.id },
                  drainOnPause: true,
                  policy:
                      typeof access.controlPolicy === 'function'
                          ? access.controlPolicy(request.target)
                          : access.controlPolicy
              })
            : null
        let taskClaim: string | undefined
        if (task) {
            try {
                taskClaim = await this.tasks.claim(task.id)
            } catch (error) {
                if (!(error instanceof TaskControlRejected) || error.reason !== 'claimed') throw error
                return (await this.store.read(id, access.scope)).invocation
            }
        }
        if (strategy.capabilities.hostAffinity || strategy.capabilities.completionEvidence === 2) {
            record = {
                ...record,
                invocation: {
                    ...record.invocation,
                    executionTarget: strategy.capabilities.hostAffinity
                        ? { version: 1, kind: 'host', hostId: this.hostId, generation: randomUUID() }
                        : { version: 1, kind: 'provider', generation: randomUUID() }
                }
            }
        }
        // Only the CAS winner can launch. A claimed task is never relaunched after an ambiguous crash.
        const claimed = await this.save(
            record,
            { status: 'running', interaction: undefined, error: undefined },
            false,
            'begin'
        )
        if (!claimed) {
            const latest = await this.store.read(id, access.scope)
            if (!latest) throw invocationError('NotFound')
            if (task) await this.tasks.receipt(task.id, 'completed', taskClaim)
            return latest.invocation
        }
        record = claimed
        if (record.invocation.executionTarget?.kind === 'host')
            this.owned.set(id, { access: { ...access, signal: undefined }, target: record.invocation.executionTarget })
        try {
            const launch = () =>
                strategy.start(
                    {
                        target: record.invocation.request.target,
                        input: request.input,
                        operationId: id,
                        previous: record.invocation.handle
                    },
                    this.context(record, access)
                )
            const observation = task ? await withTaskControl({ version: 2, targetId: task.id }, launch) : await launch()
            // A strategy may persist newer events before start returns its receipt.
            const latest = await this.store.read(id, access.scope)
            const saved =
                !isAgentInvocationTerminal(observation.status) &&
                latest &&
                latest.invocation.revision > record.invocation.revision &&
                (isAgentInvocationTerminal(latest.invocation.status) || latest.invocation.status !== observation.status)
                    ? (await this.updateLatest(id, access, { ...observation, status: latest.invocation.status }, true))
                          .invocation
                    : (await this.updateLatest(id, access, observation, true)).invocation
            if (task && invocationCanRelease(saved)) await this.tasks.receipt(task.id, 'completed')
            return saved.control ? this.control(id, access, 'inspect') : saved
        } catch (error) {
            const latest = await this.store.read(id, access.scope)
            if (error instanceof AgentInvocationNotStartedError && !latest?.invocation.handle) {
                if (task) await this.tasks.receipt(task.id, 'completed', taskClaim)
                return (
                    await this.updateLatest(
                        id,
                        access,
                        { status: 'failed', error: error.message, controlEvidence: notStartedEvidence(id, 'failed') },
                        true,
                        true
                    )
                ).invocation
            }
            const suspended = access.isSuspension?.(error) ?? false
            await this.updateLatest(
                id,
                access,
                {
                    status: suspended ? 'waiting' : 'unknown',
                    ...(suspended ? {} : { error: invocationError('DispatchUnknown').message })
                },
                true
            )
            if (task && suspended) await this.tasks.receipt(task.id, 'paused')
            else if (task && access.controlAdapter === 'native-graph') await this.tasks.receipt(task.id, 'completed')
            throw error
        }
    }

    private async control(
        id: string,
        access: AgentInvocationAccess,
        operation: 'inspect' | 'cancel' | 'respond',
        input?: { interactionId: string; response: AgentJson },
        ownedTermination = false
    ): Promise<AgentInvocation> {
        access = await this.stableAccess(access)
        let record = await this.store.read(id, access.scope)
        if (!record) throw invocationError('NotFound')
        this.assertScope(record, access.scope)
        const registered = this.owned.get(id)
        const stopOnly =
            ownedTermination &&
            operation === 'inspect' &&
            record.invocation.control &&
            registered &&
            executionRuntimeTargetsEqual(registered.target, record.invocation.executionTarget)
        // A trusted original host may finish an already-authorized termination after membership revocation.
        // This path cannot start, approve, resume, or read another invocation.
        if (!stopOnly) await authorizeAgentInvocation(() => access.authorize(record.invocation.request.target))
        if (invocationCanRelease(record.invocation)) {
            this.pinned(record)
            return record.invocation
        }
        if (operation === 'cancel' && !record.invocation.control) {
            const task = await this.tasks?.find(access.scope, 'invocation', id)
            if (task) await this.tasks.change(task.id, 'terminated')
            // CAS against the queued revision: a concurrent launch invalidates "not started" proof.
            const queued = record.invocation.status === 'queued'
            const claimed = await this.save(
                record,
                {
                    status: queued ? 'cancelled' : 'cancelling',
                    ...(queued ? { controlEvidence: notStartedEvidence(id, 'cancelled') } : {}),
                    control: { intent: 'terminated', requestedAt: new Date().toISOString() }
                },
                false
            )
            if (!claimed) return this.control(id, access, operation, input)
            record = claimed
            if (invocationCanRelease(record.invocation)) return record.invocation
        }
        const strategy = this.pinned(record)
        const target = record.invocation.executionTarget
        if (target?.kind === 'host' && target.hostId !== this.hostId) {
            if (operation === 'respond' && !record.invocation.control && input) {
                if (
                    record.invocation.hostResponse ||
                    record.invocation.status !== 'waiting' ||
                    record.invocation.interaction?.id !== input.interactionId
                )
                    throw invocationError('InteractionConflict')
                const task = await this.tasks?.find(access.scope, 'invocation', id)
                const reserve = () => this.saveHostResponse(record, { ...input, claimed: false })
                await (task ? this.tasks.admitContinuation(task.id, reserve) : reserve())
                return (await this.store.read(id, access.scope)).invocation
            }
            // The original host scans the same persisted intent. Never call a different host's adapter.
            return record.invocation.control || Date.now() - Date.parse(record.invocation.updatedAt) < 15_000
                ? record.invocation
                : { ...record.invocation, status: 'unknown' }
        }
        if (target?.kind === 'host' && !this.owned.has(id)) return { ...record.invocation, status: 'unknown' }
        if (
            operation === 'inspect' &&
            record.invocation.status === 'running' &&
            Date.parse(record.invocation.startPendingUntil ?? '') > Date.now()
        )
            return record.invocation
        const { handle } = record.invocation
        if (!handle) {
            if (
                operation === 'inspect' &&
                record.invocation.status === 'running' &&
                Date.parse(record.invocation.startPendingUntil ?? '') <= Date.now()
            )
                return (
                    await this.updateLatest(
                        id,
                        access,
                        {
                            status: 'unknown',
                            error: invocationError('DispatchUnknown').message
                        },
                        true
                    )
                ).invocation
            return record.invocation
        }
        const context = this.context(record, { ...access, signal: AbortSignal.timeout(10_000) })
        let observation: AgentRuntimeObservation
        if (record.invocation.control) {
            if (!strategy.capabilities.cancellation || !strategy.cancel) throw invocationError('Unsupported')
            const control = record.invocation.control
            if (Date.parse(control.deliveryUntil ?? '') > Date.now()) return record.invocation
            if (control.attempted && !strategy.capabilities.idempotentCancellation) {
                observation = await strategy.inspect(handle, context)
            } else {
                const token = randomUUID()
                const claimed = await this.save(
                    record,
                    {
                        status: 'cancelling',
                        control: {
                            ...control,
                            attempted: true,
                            deliveryToken: token,
                            deliveryUntil: new Date(Date.now() + 30_000).toISOString()
                        }
                    },
                    false
                )
                if (!claimed) return (await this.store.read(id, access.scope)).invocation
                try {
                    observation = await strategy.cancel(handle, context)
                } finally {
                    const latest = await this.store.read(id, access.scope)
                    if (latest?.invocation.control?.deliveryToken === token) {
                        await this.save(
                            latest,
                            {
                                status: latest.invocation.status,
                                control: {
                                    ...latest.invocation.control,
                                    deliveryUntil: undefined,
                                    deliveryToken: undefined
                                }
                            },
                            false
                        )
                    }
                }
            }
        } else if (record.invocation.hostResponse && !record.invocation.hostResponse.claimed) {
            const response = record.invocation.hostResponse
            if (!strategy.respond) throw invocationError('Unsupported')
            const task = await this.tasks?.find(access.scope, 'invocation', id)
            const reserve = () => this.saveHostResponse(record, { ...response, claimed: true })
            const claimed = task ? await this.tasks.admitContinuation(task.id, reserve) : await reserve()
            if (!claimed) return (await this.store.read(id, access.scope)).invocation
            observation = await strategy.respond(handle, response.interactionId, response.response, context)
        } else if (operation === 'respond') {
            if (!strategy.capabilities.interactions || !strategy.respond || !input) throw invocationError('Unsupported')
            if (record.invocation.status !== 'waiting' || record.invocation.interaction?.id !== input.interactionId) {
                throw invocationError('InteractionConflict')
            }
            // Claim the interaction before delivering a possibly side-effecting response.
            const target = await this.tasks?.find(access.scope, 'invocation', id)
            const reserve = () => this.save(record, { status: 'running', interaction: undefined })
            const claimed = target ? await this.tasks.admitContinuation(target.id, reserve) : await reserve()
            if (!claimed) return (await this.store.read(id, access.scope)).invocation
            observation = await strategy.respond(handle, input.interactionId, input.response, context)
        } else observation = await strategy.inspect(handle, context)
        return (
            await this.updateLatest(id, access, observation, false, false, { value: record.invocation.executionTarget })
        ).invocation
    }

    private async saveHostResponse(
        record: StoredAgentInvocation,
        hostResponse: NonNullable<AgentInvocation['hostResponse']>
    ) {
        const next = {
            ...record,
            invocation: {
                ...record.invocation,
                hostResponse,
                revision: record.invocation.revision + 1,
                updatedAt: new Date().toISOString()
            }
        }
        return (await this.store.replace(next, record.invocation.revision)) ? next : undefined
    }

    /** Pause changes an execution attempt, never the idempotency identity of its calls. */
    private async stableAccess(access: AgentInvocationAccess): Promise<AgentInvocationAccess> {
        const task = await this.tasks?.execution(access.scope.parentExecutionId)
        if (!task) return access
        if (task.tenantId !== access.scope.tenantId || task.organizationId !== (access.scope.organizationId ?? null))
            throw invocationError('NotFound')
        return { ...access, scope: { ...access.scope, parentExecutionId: task.attempts[0] } }
    }

    private context(record: StoredAgentInvocation, access: AgentInvocationAccess): AgentRuntimeContext {
        return {
            invocationId: record.invocation.id,
            executionTarget: record.invocation.executionTarget,
            settlement: record.invocation.reportedOutcome
                ? {
                      status: record.invocation.reportedOutcome,
                      result: record.invocation.result,
                      error: record.invocation.error
                  }
                : undefined,
            scope: access.scope,
            signal: access.signal,
            capabilities: access.capabilities,
            ...(record.invocation.activity && this.activity ? { activity: this.activity(record.invocation) } : {}),
            checkpoint: async (observation) => {
                const current = await this.store.read(record.invocation.id, access.scope)
                if (
                    !executionRuntimeTargetsEqual(
                        current?.invocation.executionTarget,
                        record.invocation.executionTarget
                    )
                )
                    throw invocationError('CallConflict')
                await this.updateLatest(record.invocation.id, access, observation, false, false, {
                    value: record.invocation.executionTarget
                })
            }
        }
    }

    private pinned(record: StoredAgentInvocation): IAgentRuntimeStrategy {
        const strategy = this.registry.getPinned(record.invocation.request.target.provider, record.providerSource)
        if (!strategy) throw invocationError('ProviderChanged')
        return strategy
    }

    private assertScope(record: StoredAgentInvocation, scope: AgentInvocationScope) {
        if (canonical(record.invocation.scope) !== canonical(scope)) throw invocationError('NotFound')
    }

    private async updateLatest(
        id: string,
        access: AgentInvocationAccess,
        observation: AgentRuntimeObservation & Pick<Partial<AgentInvocation>, 'control'>,
        finishStart = false,
        hostAdmission = false,
        expectedTarget?: { value: AgentInvocation['executionTarget'] }
    ) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const latest = await this.store.read(id, access.scope)
            if (!latest) throw invocationError('NotFound')
            if (
                expectedTarget &&
                !executionRuntimeTargetsEqual(latest.invocation.executionTarget, expectedTarget.value)
            )
                throw invocationError('CallConflict')
            if (invocationCanRelease(latest.invocation)) return latest
            const checked = hostAdmission
                ? observation
                : checkedControlObservation(
                      latest.invocation,
                      observation,
                      this.pinned(latest),
                      latest.providerSource.kind === 'builtin'
                  )
            // A late progress event cannot undo an accepted cancellation request.
            const next =
                latest.invocation.control && !isAgentInvocationTerminal(checked.status)
                    ? { ...observation, ...checked, status: 'cancelling' as const }
                    : { ...observation, ...checked }
            if (latest.invocation.control && next.control) next.control = latest.invocation.control
            if (
                ['succeeded', 'failed', 'cancelled'].includes(observation.status) &&
                latest.invocation.completionEvidence === 2
            ) {
                if (
                    observation.status === 'succeeded' ||
                    observation.status === 'failed' ||
                    observation.status === 'cancelled'
                )
                    latest.invocation.reportedOutcome ??= observation.status
            }
            const saved = await this.save(latest, next, false, finishStart ? 'finish' : undefined)
            if (saved) return saved
        }
        throw invocationError('ConcurrentUpdate')
    }

    private async save(
        record: StoredAgentInvocation,
        observation: AgentRuntimeObservation & Pick<Partial<AgentInvocation>, 'control'>,
        requireClaim = true,
        startup?: 'begin' | 'finish'
    ) {
        if (observation.progress !== undefined) {
            const progress = agentRuntimeProgressSchema.safeParse(observation.progress)
            if (!progress.success) throw invocationError('InvalidRequest')
            observation = { ...observation, progress: progress.data }
        }
        if (observation.status === 'succeeded' && !observation.result) throw invocationError('MissingResult')
        const next: StoredAgentInvocation = {
            ...record,
            invocation: {
                ...record.invocation,
                ...structuredClone(observation),
                executionTarget: record.invocation.executionTarget,
                completionEvidence: record.invocation.completionEvidence,
                reportedOutcome: record.invocation.reportedOutcome,
                hostResponse:
                    record.invocation.hostResponse?.claimed &&
                    observation.interaction &&
                    observation.interaction.id !== record.invocation.hostResponse.interactionId
                        ? undefined
                        : record.invocation.hostResponse,
                startPendingUntil:
                    startup === 'begin'
                        ? new Date(Date.now() + 120_000).toISOString()
                        : startup === 'finish' || isAgentInvocationTerminal(observation.status)
                          ? undefined
                          : record.invocation.startPendingUntil,
                revision: record.invocation.revision + 1,
                updatedAt: new Date().toISOString()
            }
        }
        if (!(await this.store.replace(next, record.invocation.revision))) {
            if (requireClaim) throw invocationError('ConcurrentUpdate')
            return undefined
        }
        return next
    }
}

export function invocationError(code: AgentInvocationErrorCode) {
    return new AgentInvocationError(code)
}

function validateRequest(request: AgentInvocationRequest) {
    if (request.dispatch !== undefined) {
        const dispatch = agentInvocationDispatchContextSchema.safeParse(request.dispatch)
        if (!dispatch.success) throw invocationError('InvalidRequest')
        request.dispatch = dispatch.data
    }
    if (request.input?.delivery !== undefined && !agentOutputDeliverySchema.safeParse(request.input.delivery).success)
        throw invocationError('InvalidRequest')
    if (
        !request.callId?.trim() ||
        request.callId.length > 1024 ||
        !request.target?.bindingId ||
        !request.target.provider ||
        !request.target.reference ||
        !request.target.revision ||
        typeof request.input?.prompt !== 'string'
    )
        throw invocationError('InvalidRequest')
}

export function agentInvocationId(scope: AgentInvocationScope, callId: string) {
    const hash = createHash('sha256').update(canonical({ scope, callId })).digest('hex')
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

/** Compare serialized request data, independent of JSONB key order or driver object prototypes. */
export function sameInvocationData(a: unknown, b: unknown): boolean {
    return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
        return `{${Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(',')}}`
    return JSON.stringify(value)
}
