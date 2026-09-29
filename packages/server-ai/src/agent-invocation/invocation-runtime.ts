// Invariants: reserve before dispatch; ambiguous launch is never automatically retried.
// Provider provenance and target revision stay pinned through checkpoint recovery.
import { createHash } from 'crypto'
import {
    AgentInvocation,
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
import { AgentInvocationStore, StoredAgentInvocation } from './invocation-store'
import { AgentInvocationError, AgentInvocationErrorCode, authorizeAgentInvocation } from './invocation-errors'

export interface AgentInvocationAccess {
    scope: AgentInvocationScope
    capabilities: RuntimeCapabilityRegistry
    signal?: AbortSignal
    authorize(target: Readonly<AgentTarget>): Promise<void>
    /** Only the host-native adapter can recognize/rethrow graph checkpoint interrupts. */
    isSuspension?(error: unknown): boolean
}

export class AgentInvocationRuntime {
    constructor(
        private readonly store: AgentInvocationStore,
        private readonly registry: AgentRuntimeRegistry
    ) {}

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
        const context = { ...access, scope }
        return {
            start: (request) => this.start(request, context),
            inspect: (id) => this.control(id, context, 'inspect'),
            cancel: (id) => this.control(id, context, 'cancel'),
            respond: (id, interactionId, response) => this.control(id, context, 'respond', { interactionId, response })
        }
    }

    private async start(request: AgentInvocationRequest, access: AgentInvocationAccess): Promise<AgentInvocation> {
        validateRequest(request)
        request = structuredClone(request)
        await authorizeAgentInvocation(() => access.authorize(request.target))
        access.signal?.throwIfAborted()
        const id = invocationId(access.scope, request.callId)
        let record = await this.store.read(id, access.scope)
        let strategy: IAgentRuntimeStrategy
        if (record) {
            this.assertScope(record, access.scope)
            if (canonical(record.invocation.request) !== canonical(request)) throw invocationError('CallConflict')
            strategy = this.pinned(record)
            if (isAgentInvocationTerminal(record.invocation.status)) return record.invocation
            if (record.invocation.status !== 'waiting' || strategy.capabilities.recovery !== 'checkpoint') {
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
                    request,
                    status: 'queued',
                    createdAt: now,
                    updatedAt: now
                },
                providerSource: this.registry.getSource(strategy)
            }
            if (!(await this.store.insert(record))) return this.start(request, access)
        }
        record = await this.save(record, { status: 'running', interaction: undefined, error: undefined })
        try {
            const observation = await strategy.start(
                {
                    target: record.invocation.request.target,
                    input: request.input,
                    operationId: id,
                    previous: record.invocation.handle
                },
                this.context(record, access)
            )
            // A strategy may persist newer events before start returns its receipt.
            const latest = await this.store.read(id, access.scope)
            return !isAgentInvocationTerminal(observation.status) &&
                latest &&
                latest.invocation.revision > record.invocation.revision &&
                (isAgentInvocationTerminal(latest.invocation.status) || latest.invocation.status !== observation.status)
                ? latest.invocation
                : (await this.updateLatest(id, access, observation)).invocation
        } catch (error) {
            const suspended = access.isSuspension?.(error) ?? false
            await this.updateLatest(id, access, {
                status: suspended ? 'waiting' : 'unknown',
                ...(suspended ? {} : { error: invocationError('DispatchUnknown').message })
            })
            throw error
        }
    }

    private async control(
        id: string,
        access: AgentInvocationAccess,
        operation: 'inspect' | 'cancel' | 'respond',
        input?: { interactionId: string; response: AgentJson }
    ): Promise<AgentInvocation> {
        const record = await this.store.read(id, access.scope)
        if (!record) throw invocationError('NotFound')
        this.assertScope(record, access.scope)
        await authorizeAgentInvocation(() => access.authorize(record.invocation.request.target))
        const strategy = this.pinned(record)
        if (isAgentInvocationTerminal(record.invocation.status)) return record.invocation
        const { handle } = record.invocation
        if (!handle) return record.invocation
        const context = this.context(record, access)
        let observation: AgentRuntimeObservation
        if (operation === 'cancel') {
            if (!strategy.capabilities.cancellation || !strategy.cancel) throw invocationError('Unsupported')
            await this.save(record, { status: 'cancelling' })
            observation = await strategy.cancel(handle, context)
        } else if (operation === 'respond') {
            if (!strategy.capabilities.interactions || !strategy.respond || !input) throw invocationError('Unsupported')
            if (record.invocation.status !== 'waiting' || record.invocation.interaction?.id !== input.interactionId) {
                throw invocationError('InteractionConflict')
            }
            // Claim the interaction before delivering a possibly side-effecting response.
            await this.save(record, { status: 'running', interaction: undefined })
            observation = await strategy.respond(handle, input.interactionId, input.response, context)
        } else observation = await strategy.inspect(handle, context)
        return (await this.updateLatest(id, access, observation)).invocation
    }

    private context(record: StoredAgentInvocation, access: AgentInvocationAccess): AgentRuntimeContext {
        return {
            invocationId: record.invocation.id,
            scope: access.scope,
            signal: access.signal,
            capabilities: access.capabilities,
            checkpoint: async (observation) => {
                await this.updateLatest(record.invocation.id, access, observation)
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

    private async updateLatest(id: string, access: AgentInvocationAccess, observation: AgentRuntimeObservation) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const latest = await this.store.read(id, access.scope)
            if (!latest) throw invocationError('NotFound')
            if (isAgentInvocationTerminal(latest.invocation.status)) return latest
            // A late progress event cannot undo an accepted cancellation request.
            const next =
                latest.invocation.status === 'cancelling' && observation.status === 'running'
                    ? { ...observation, status: 'cancelling' as const }
                    : observation
            const saved = await this.save(latest, next, false)
            if (saved) return saved
        }
        throw invocationError('ConcurrentUpdate')
    }

    private async save(record: StoredAgentInvocation, observation: AgentRuntimeObservation, requireClaim = true) {
        if (observation.status === 'succeeded' && !observation.result) throw invocationError('MissingResult')
        const next: StoredAgentInvocation = {
            ...record,
            invocation: {
                ...record.invocation,
                ...structuredClone(observation),
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

function invocationId(scope: AgentInvocationScope, callId: string) {
    const hash = createHash('sha256').update(canonical({ scope, callId })).digest('hex')
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
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
