import { AgentInvocationError } from '../invocation-errors'
// Invariants: installed strategies supply launch settings; declarations never grant actor access.
// Disabled presets fence admission across revisions; secrets never enter bindings.
import { HttpException, Injectable } from '@nestjs/common'
import { CommandBus, CommandHandlerNotFoundException, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import {
    AgentInvocationScope,
    AgentRuntimeRegistry,
    AgentTarget,
    ManagedAgentRuntimeProfile,
    ManagedAgentRuntimeSelection,
    managedAgentRuntimeSchema
} from '@xpert-ai/plugin-sdk'
import { AgentRuntimeBindingEntity } from '../invocation.entity'
import { invocationError, sameInvocationData } from '../invocation-runtime'
import { ResolveManagedRuntimeToolsCommand, ManagedRuntimeTools } from './resolve-managed-runtime-tools.command'
import { ResolveManagedRuntimeActorCommand } from './resolve-managed-runtime-actor.command'
import { RuntimeDeploymentsService } from './runtime-deployments.service'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../../xpert/queries/get-xpert-workflow.query'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'

const selectionSchema = z
    .object({ provider: z.string().min(1).max(100), reference: z.string().min(1).max(200) })
    .strict()
type Candidate = { provider: string; profile: ManagedAgentRuntimeProfile; deploymentRevision?: string }

export function managedBindingId(parts: string[]): string {
    const hex = createHash('sha256')
        .update(JSON.stringify(['managed-runtime-v1', ...parts]))
        .digest('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

@Injectable()
export class ManagedRuntimeService {
    constructor(
        @InjectRepository(AgentRuntimeBindingEntity) private readonly bindings: Repository<AgentRuntimeBindingEntity>,
        private readonly registry: AgentRuntimeRegistry,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus,
        private readonly deployments: RuntimeDeploymentsService
    ) {}

    private async scope(scope: AgentInvocationScope) {
        if (
            ![scope.tenantId, scope.organizationId, scope.userId, scope.workspaceId, scope.conversationId].every(
                (value) => z.string().uuid().safeParse(value).success
            ) ||
            scope.callerType === 'project_pipeline'
        )
            throw invocationError('InvalidScope')
        const workspace = await this.bindings.manager.getRepository(XpertWorkspace).findOneBy({
            id: scope.workspaceId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId
        })
        if (!workspace || workspace.status === 'archived') throw invocationError('InvalidScope')
        if (scope.callerType !== 'project_agent') {
            if (!scope.callerXpertId) throw invocationError('InvalidScope')
            const { agent } = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                new GetXpertWorkflowQuery(scope.callerXpertId)
            )
            if (
                agent?.team?.tenantId !== scope.tenantId ||
                agent.team.organizationId !== scope.organizationId ||
                agent.team.workspaceId !== scope.workspaceId
            )
                throw invocationError('InvalidScope')
        }
    }

    private async computer(scope: AgentInvocationScope): Promise<ManagedRuntimeTools | null> {
        // Only a missing edition handler is optional. Registered handler failures must propagate.
        try {
            return this.commands.execute(new ResolveManagedRuntimeToolsCommand(scope))
        } catch (error) {
            if (error instanceof CommandHandlerNotFoundException) return null
            throw error
        }
    }

    private computerCandidates(scope: AgentInvocationScope, tools: ManagedRuntimeTools['tools']): Candidate[] {
        return this.registry.listRegistrations(scope.organizationId).flatMap(({ type: provider, strategy }) => {
            if (!strategy.capabilities.background) return []
            const compatible = strategy.capabilities.executionTools?.some(
                (supported) =>
                    supported.environments.includes('computer') &&
                    tools.some((tool) => tool.id === supported.id && supported.versions.includes(tool.version))
            )
            return compatible
                ? (strategy.managedProfiles ?? [])
                      .filter((profile) => profile.environment === 'computer')
                      .map((profile) => ({ provider, profile }))
                : []
        })
    }

    private async directCandidates(scope: AgentInvocationScope): Promise<Candidate[]> {
        const declared = this.registry.listRegistrations(scope.organizationId).flatMap((registration) => {
            if (!registration.strategy.capabilities.background || !registration.strategy.resolveManagedDeployment)
                return []
            return (registration.strategy.managedProfiles ?? [])
                .filter((profile) => profile.environment !== 'computer')
                .map((profile) => ({ ...registration, profile }))
        })
        if (!declared.length) return []
        await this.commands.execute(new ResolveManagedRuntimeActorCommand(scope))
        const resolved = await Promise.all(
            declared.map(async ({ type: provider, profile, strategy, source }) => {
                const deployment = await this.deployments.resolve(provider, profile, strategy, source, scope)
                return deployment ? { provider, profile, deploymentRevision: deployment.revision } : undefined
            })
        )
        return resolved.filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
    }

    private permitted(
        rows: AgentRuntimeBindingEntity[],
        scope: AgentInvocationScope,
        candidate: Pick<Candidate, 'provider' | 'profile'>
    ) {
        return !rows.some(
            (row) =>
                row.target.provider === candidate.provider &&
                row.target.reference === candidate.profile.reference &&
                row.workspaceIds.includes(scope.workspaceId) &&
                !row.enabled
        )
    }
    private async rows(scope: AgentInvocationScope, repository = this.bindings) {
        return (
            await repository.find({ where: { tenantId: scope.tenantId, organizationId: scope.organizationId } })
        ).filter((row) => managedAgentRuntimeSchema.safeParse(row.target.configuration.managedRuntime).success)
    }
    private registration(scope: AgentInvocationScope, target: AgentTarget) {
        const registration = this.registry
            .listRegistrations(scope.organizationId)
            .find((item) => item.type === target.provider)
        const profile = registration?.strategy.managedProfiles?.find((item) => item.reference === target.reference)
        if (!registration || !profile || !registration.strategy.capabilities.background)
            throw invocationError('ProviderUnavailable')
        return { ...registration, profile }
    }
    async assertEnabled(scope: AgentInvocationScope, binding: AgentRuntimeBindingEntity) {
        if (!managedAgentRuntimeSchema.safeParse(binding.target.configuration.managedRuntime).success) return
        const { profile, strategy, source } = this.registration(scope, binding.target)
        if (!this.permitted(await this.rows(scope), scope, { provider: binding.target.provider, profile }))
            throw invocationError('InvalidScope')
        if (profile.environment !== 'computer') {
            await this.commands.execute(new ResolveManagedRuntimeActorCommand(scope))
            const deployment = await this.deployments.resolve(binding.target.provider, profile, strategy, source, scope)
            if (!deployment || deployment.revision !== binding.target.configuration.deploymentRevision)
                throw invocationError('ProviderUnavailable')
        }
    }

    /** Called through a capability bound to the already authorized target; never accept plugin-selected identity. */
    async deployment(scope: AgentInvocationScope, target: AgentTarget) {
        await this.scope(scope)
        const binding = await this.bindings.findOneBy({
            id: target.bindingId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            enabled: true
        })
        if (!binding || !binding.workspaceIds.includes(scope.workspaceId)) throw invocationError('InvalidScope')
        if (!sameInvocationData(binding.target, target)) throw invocationError('CallConflict')
        await this.assertEnabled(scope, binding)
        const { profile, strategy, source } = this.registration(scope, target)
        const deployment = await this.deployments.resolve(target.provider, profile, strategy, source, scope)
        if (!deployment || deployment.revision !== target.configuration.deploymentRevision)
            throw invocationError('ProviderUnavailable')
        return this.deployments.prepare(deployment, scope)
    }

    async list(scope: AgentInvocationScope) {
        await this.scope(scope)
        const direct = await this.directCandidates(scope)
        let context: ManagedRuntimeTools | null
        try {
            context = await this.computer(scope)
        } catch (error) {
            // Lack of Computer access must not hide an independently authorized SDK/process/service backend.
            const denied =
                (error instanceof HttpException && [403, 404].includes(error.getStatus())) ||
                (error instanceof AgentInvocationError &&
                    ['InvalidScope', 'NotFound', 'ProviderUnavailable'].includes(error.code))
            if (!direct.length || !denied) throw error
            context = null
        }
        const rows = await this.rows(scope)
        return [...direct, ...this.computerCandidates(scope, context?.tools ?? [])]
            .filter((candidate) => this.permitted(rows, scope, candidate))
            .map(({ provider, profile }) => ({
                provider,
                reference: profile.reference,
                title: profile.title,
                toolName: profile.toolName,
                description: profile.description
            }))
    }

    async resolve(scope: AgentInvocationScope, input: ManagedAgentRuntimeSelection): Promise<AgentTarget> {
        const parsed = selectionSchema.safeParse(input)
        if (!parsed.success) throw invocationError('InvalidRequest')
        await this.scope(scope)
        const direct = (await this.directCandidates(scope)).find(
            ({ provider, profile }) => provider === parsed.data.provider && profile.reference === parsed.data.reference
        )
        const context: ManagedRuntimeTools | null = direct
            ? { ...(await this.commands.execute(new ResolveManagedRuntimeActorCommand(scope))), tools: [] }
            : await this.computer(scope)
        if (!context) throw invocationError('ProviderUnavailable')
        const candidate =
            direct ??
            this.computerCandidates(scope, context.tools).find(
                ({ provider, profile }) =>
                    provider === parsed.data.provider && profile.reference === parsed.data.reference
            )
        if (!candidate) throw invocationError('ProviderUnavailable')
        const { provider, profile, deploymentRevision } = candidate
        const { modelSourceId } = context
        const scopeKey = [scope.tenantId, scope.organizationId, scope.workspaceId, provider, profile.reference]
        return this.bindings.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(scopeKey)])
            const repository = manager.getRepository(AgentRuntimeBindingEntity)
            const rows = await this.rows(scope, repository)
            if (!this.permitted(rows, scope, candidate)) throw invocationError('InvalidScope')
            const previous = rows.find(
                (row) =>
                    row.enabled &&
                    row.workspaceIds.includes(scope.workspaceId) &&
                    row.target.provider === provider &&
                    row.target.reference === profile.reference &&
                    row.target.configuration.profileVersion === profile.version &&
                    row.target.configuration.deploymentRevision === deploymentRevision &&
                    (scope.callerType !== 'project_agent'
                        ? !row.target.configuration.modelSource
                        : row.target.configuration.modelSource &&
                          typeof row.target.configuration.modelSource === 'object' &&
                          !Array.isArray(row.target.configuration.modelSource) &&
                          row.target.configuration.modelSource.xpertId === modelSourceId)
            )
            if (previous) return structuredClone(previous.target)
            const id = managedBindingId([
                ...scopeKey,
                profile.version,
                deploymentRevision ?? 'computer',
                scope.callerType === 'project_agent' ? modelSourceId : 'assistant-context'
            ])
            const target: AgentTarget = {
                bindingId: id,
                provider,
                reference: profile.reference,
                revision: id,
                configuration: {
                    profileVersion: profile.version,
                    executionEnvironment: { type: profile.environment },
                    managedRuntime: { type: 'builtin', version: profile.version },
                    ...(deploymentRevision ? { deploymentRevision } : {}),
                    ...(scope.callerType === 'project_agent'
                        ? { modelSource: { type: 'assistant', xpertId: modelSourceId } }
                        : {})
                }
            }
            await repository
                .createQueryBuilder()
                .insert()
                .values({
                    id,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    title: profile.title,
                    enabled: true,
                    workspaceIds: () => ':workspaces::jsonb',
                    target: () => ':target::jsonb'
                })
                .setParameters({ workspaces: JSON.stringify([scope.workspaceId]), target: JSON.stringify(target) })
                .orIgnore()
                .execute()
            const saved = await repository.findOneByOrFail({
                id,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId
            })
            if (!saved.enabled) throw invocationError('InvalidScope')
            return structuredClone(saved.target)
        })
    }
}
