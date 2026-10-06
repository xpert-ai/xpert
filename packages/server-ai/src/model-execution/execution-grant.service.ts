// Invariants: scope is resolved from an owned conversation, never from bearer headers.
// Credentials are stored only as hashes. Revalidation uses the original user and runtime organization.
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ModelExecutionEnvironment, ModelExecutionSource } from '@xpert-ai/contracts'
import {
    CliModelProfilesCapability,
    ModelExecutionEnvironmentCapability,
    RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { createHash, randomBytes } from 'node:crypto'
import { Raw, Repository } from 'typeorm'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { AssistantExecutionPolicyService, ExecutionActor } from './assistant-execution-policy.service'
import { executionError } from './execution-errors'
import { ModelExecutionSourceService } from './execution-source.service'
import { ModelExecutionPolicyService } from './execution-policy'
import { ModelExecutionGrant } from './execution.entity'
import { executionToolModels, supportsExecutionTool } from './execution-tool-model'

@Injectable()
export class ModelExecutionGrantService {
    constructor(
        @InjectRepository(ModelExecutionGrant) private readonly grants: Repository<ModelExecutionGrant>,
        private readonly policy: ModelExecutionPolicyService,
        private readonly assistants: AssistantExecutionPolicyService,
        private readonly sources: ModelExecutionSourceService,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
    ) {}

    async issue(
        actor: ExecutionActor,
        input: {
            conversationId: string
            source: ModelExecutionSource
            environment: ModelExecutionEnvironment
            tool: { id: string; version: string }
            /** Only the trusted launcher may prepare credentials before a one-shot dispatch. */
            prepare?: boolean
            deadline?: Date
            /** May only tighten the tenant policy; resolved from the owning process snapshot. */
            tokenBudget?: number
        }
    ) {
        const policy = await this.policy.require(actor.tenantId)
        if (!policy.tools.some((tool) => tool.id === input.tool.id && tool.version === input.tool.version))
            throw executionError('Invalid')
        const user = await this.assistants.user(actor)
        return runWithCapturedRequestContext(captureRequestContext({ ...actor, user }), async () => {
            if (input.source.type === 'shell_execution' && !input.prepare) throw executionError('Denied')
            const runtimeAssistant =
                input.source.type === 'agent_invocation'
                    ? await this.sources.invocationModelSource(actor, input.conversationId, input.source)
                    : undefined
            const selection =
                input.source.type === 'shell_execution'
                    ? await this.assistants.resolveForExecution(
                          actor,
                          input.conversationId,
                          input.source.parentExecutionId
                      )
                    : runtimeAssistant
                      ? await this.assistants.resolve(actor, input.conversationId, true, false, runtimeAssistant)
                      : await this.assistants.resolve(actor, input.conversationId)
            const models = executionToolModels(
                selection.models,
                input.tool,
                policy,
                this.capabilities.get(CliModelProfilesCapability)
            )
            if (!models.some((model) => model.id === selection.defaultModelId)) throw executionError('Model')
            const context = {
                tenantId: actor.tenantId,
                runtimeOrganizationId: actor.organizationId,
                actorUserId: actor.userId,
                billableUserId: actor.userId,
                xpertId: selection.assistant.id,
                assistantName: selection.assistant.name,
                assistantVersion: selection.assistant.version ?? String(selection.assistant.updatedAt),
                conversationId: input.conversationId,
                threadId: selection.conversation.threadId ?? undefined,
                source: input.source,
                environment: input.environment,
                tool: input.tool
            }
            if (input.source.type === 'shell_execution') await this.sources.assertCurrent(context, true)
            else {
                if (input.prepare) throw executionError('Denied')
                await this.sources.assertCurrent(context)
            }
            await this.capabilities.require(ModelExecutionEnvironmentCapability).assertCurrent(context)
            const secret = `xpert-exec-${randomBytes(32).toString('base64url')}`
            const deadline = Math.min(
                Date.now() + policy.limits.maxDurationSeconds * 1000,
                input.deadline?.getTime() ?? Infinity
            )
            if (!Number.isFinite(deadline) || deadline <= Date.now()) throw executionError('Denied')
            const grant = await this.grants.save(
                this.grants.create({
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    ownerId: actor.userId,
                    context,
                    credentialHash: hashExecutionCredential(secret),
                    status: input.prepare ? 'pending' : 'active',
                    models,
                    defaultModelId: selection.defaultModelId,
                    limits: {
                        ...policy.limits,
                        tokenBudget: Math.min(policy.limits.tokenBudget, input.tokenBudget ?? Infinity)
                    },
                    expiresAt: new Date(Math.min(deadline, Date.now() + policy.limits.leaseSeconds * 1000)),
                    absoluteExpiresAt: new Date(deadline)
                })
            )
            return { grant, secret, gatewayBaseUrl: policy.gatewayBaseUrl }
        })
    }

    async authenticate(authorization?: string) {
        const match = /^Bearer (xpert-exec-[A-Za-z0-9_-]{43})$/.exec(authorization ?? '')
        if (!match) throw executionError('Denied')
        const grant = await this.grants.findOneBy({ credentialHash: hashExecutionCredential(match[1]) })
        if (!grant) throw executionError('Denied')
        return this.validate(grant)
    }

    /** Activation never renews the original preparation lease or resurrects an expired credential. */
    async activate(id: string, actor: ExecutionActor) {
        const grant = await this.grants.findOneBy({
            id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            ownerId: actor.userId,
            status: 'pending'
        })
        if (!grant || grant.context.source.type !== 'shell_execution') throw executionError('Denied')
        await this.validate(grant, true)
        const result = await this.grants.update(
            {
                id,
                status: 'pending',
                expiresAt: Raw((column) => `${column} > clock_timestamp()`),
                absoluteExpiresAt: Raw((column) => `${column} > clock_timestamp()`)
            },
            { status: 'active' }
        )
        if (result.affected !== 1) throw executionError('Denied')
    }

    async revalidate(grant: ModelExecutionGrant) {
        if (!grant.id || !grant.tenantId || !grant.organizationId || !grant.ownerId) throw executionError('Denied')
        const current = await this.grants.findOneBy({
            id: grant.id,
            tenantId: grant.tenantId,
            organizationId: grant.organizationId,
            ownerId: grant.ownerId
        })
        if (!current) throw executionError('Denied')
        // Callers retain this object for request limits; refresh both revocation and renewed leases.
        Object.assign(grant, current)
        return this.validate(grant)
    }

    private async validate(grant: ModelExecutionGrant, activating = false) {
        if (
            grant.context.tenantId !== grant.tenantId ||
            grant.context.runtimeOrganizationId !== grant.organizationId ||
            grant.context.actorUserId !== grant.ownerId ||
            grant.context.billableUserId !== grant.ownerId
        )
            throw executionError('Denied')
        this.assertActive(grant, activating)
        const policy = await this.policy.require(grant.tenantId)
        if (
            !policy.tools.some(
                (tool) => tool.id === grant.context.tool.id && tool.version === grant.context.tool.version
            )
        )
            throw executionError('Denied')
        // Tightening policy takes effect on existing credentials; increasing it does not expand a snapshot.
        for (const key of Object.keys(policy.limits) as Array<keyof typeof policy.limits>) {
            grant.limits[key] = Math.min(grant.limits[key], policy.limits[key])
        }
        this.assertActive(grant, activating)
        await this.sources.assertCurrent(grant.context)
        const actor = { tenantId: grant.tenantId, organizationId: grant.organizationId, userId: grant.ownerId }
        const user = await this.assistants.user(actor)
        const snapshot = captureRequestContext({ ...actor, user })
        const models = await runWithCapturedRequestContext(snapshot, async () => {
            const runtimeAssistant =
                grant.context.source.type === 'agent_invocation'
                    ? await this.sources.invocationModelSource(
                          actor,
                          grant.context.conversationId,
                          grant.context.source
                      )
                    : undefined
            const selection =
                grant.context.source.type === 'shell_execution'
                    ? await this.assistants.resolveForExecution(
                          actor,
                          grant.context.conversationId,
                          grant.context.source.parentExecutionId
                      )
                    : runtimeAssistant
                      ? await this.assistants.resolve(
                            actor,
                            grant.context.conversationId,
                            false,
                            false,
                            runtimeAssistant
                        )
                      : await this.assistants.resolve(actor, grant.context.conversationId, false)
            if (
                selection.assistant.id !== grant.context.xpertId ||
                (selection.assistant.version ?? String(selection.assistant.updatedAt)) !==
                    grant.context.assistantVersion
            )
                throw executionError('Denied')
            await this.capabilities.require(ModelExecutionEnvironmentCapability).assertCurrent(grant.context)
            const profiles = this.capabilities.get(CliModelProfilesCapability)
            const available = executionToolModels(selection.models, grant.context.tool, policy, profiles)
            return grant.models
                .flatMap((saved) => {
                    const current = available.find(
                        (current) =>
                            current.id === saved.id &&
                            current.copilotId === saved.copilotId &&
                            current.model === saved.model &&
                            current.modelType === saved.modelType &&
                            current.providerScopeId === saved.providerScopeId &&
                            current.providerOrganizationId === saved.providerOrganizationId &&
                            current.provider === saved.provider
                    )
                    return current
                        ? [
                              {
                                  ...saved,
                                  capabilities: saved.capabilities.filter((item) =>
                                      current.capabilities.includes(item)
                                  ),
                                  protocols: saved.protocols.filter((item) => current.protocols.includes(item))
                              }
                          ]
                        : []
                })
                .filter((model) => supportsExecutionTool(model, grant.context.tool.id, profiles))
        })
        // Policy, model and environment checks can outlast the lease they started with.
        this.assertActive(grant, activating)
        if (!models.some((model) => model.id === grant.defaultModelId)) throw executionError('Model')
        return { grant, actor, snapshot, models }
    }

    async renew(id: string, actor: ExecutionActor) {
        if (!id || !actor.tenantId || !actor.organizationId || !actor.userId) throw executionError('Denied')
        const grant = await this.grants.findOneBy({
            id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            ownerId: actor.userId
        })
        if (!grant) throw executionError('Denied')
        await this.validate(grant)
        await this.grants.manager.transaction(async (manager) => {
            const where = {
                id,
                tenantId: actor.tenantId,
                organizationId: actor.organizationId,
                ownerId: actor.userId
            }
            // UPDATE predicates may run before a row-lock wait; lock first, then check the clock.
            const current = await manager.findOne(ModelExecutionGrant, {
                where,
                lock: { mode: 'pessimistic_write' }
            })
            if (!current) throw executionError('Denied')
            current.limits = grant.limits
            this.assertActive(current)
            const expiresAt = new Date(Math.min(Date.now() + grant.limits.leaseSeconds * 1000, this.deadline(current)))
            const result = await manager.update(
                ModelExecutionGrant,
                {
                    ...where,
                    status: 'active',
                    expiresAt: Raw((column) => `${column} > clock_timestamp() AND :renewalExpiry > clock_timestamp()`, {
                        renewalExpiry: expiresAt
                    }),
                    absoluteExpiresAt: Raw((column) => `${column} > clock_timestamp()`),
                    createdAt: Raw(
                        (column) => `${column} + :maxDurationSeconds * interval '1 second' > clock_timestamp()`,
                        { maxDurationSeconds: grant.limits.maxDurationSeconds }
                    )
                },
                { expiresAt }
            )
            if (result.affected !== 1) throw executionError('Denied')
        })
    }

    async revoke(id: string, actor: ExecutionActor) {
        if (!id || !actor.tenantId || !actor.organizationId || !actor.userId) throw executionError('Denied')
        await this.grants.update(
            { id, tenantId: actor.tenantId, organizationId: actor.organizationId, ownerId: actor.userId },
            { status: 'revoked' }
        )
    }

    /** Re-read persisted authorization across nodes; cancellation cannot undo upstream work already consumed. */
    watch(grant: ModelExecutionGrant, abort: AbortController) {
        let closed = false
        let pending = false
        const timer = setInterval(() => {
            if (closed || pending || abort.signal.aborted) return
            pending = true
            void this.revalidate(grant)
                .catch(() => {
                    if (!closed) abort.abort()
                })
                .finally(() => {
                    pending = false
                })
        }, 5000)
        timer.unref()
        return () => {
            closed = true
            clearInterval(timer)
        }
    }

    private deadline(grant: ModelExecutionGrant) {
        return Math.min(
            grant.absoluteExpiresAt.getTime(),
            grant.createdAt.getTime() + grant.limits.maxDurationSeconds * 1000
        )
    }

    private assertActive(grant: ModelExecutionGrant, activating = false) {
        if (
            (grant.status !== 'active' && !(activating && grant.status === 'pending')) ||
            grant.expiresAt.getTime() <= Date.now() ||
            this.deadline(grant) <= Date.now()
        )
            throw executionError('Denied')
    }
}

export function hashExecutionCredential(secret: string) {
    return createHash('sha256').update(secret).digest('hex')
}
