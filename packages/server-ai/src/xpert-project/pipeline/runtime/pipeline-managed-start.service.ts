import { ProjectPipelineRuntimeBridgeService } from './pipeline-runtime-bridge.service'
import { assertPipelineDispatchEnabled } from './pipeline-dispatch-policy'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    projectPipelineConfigureSchema,
    projectPipelineStartSchema,
    projectPipelineSubjectVersionSchema,
    type ProjectPipelineConfigure,
    type ProjectPipelineStart,
    type ProjectPipelineStartReceipt
} from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineBindingEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity
} from '../persistence/pipeline.entity'
import { ProjectPipelineConfigurationService } from '../configuration/project-pipeline-configuration.service'
import { pipelineIdentity, pipelineDigest } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { initializeManagedPipelineNodes } from './pipeline-managed-nodes'
import { managedAudit, lockManagedProject } from './pipeline-transaction'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { PIPELINE_HUMAN_DECISION_SCHEMA, PIPELINE_POLICY_DECISION_SCHEMA } from './pipeline-decision-evidence'
import { ProjectPipelineAssistantBridgeService } from './pipeline-assistant-bridge.service'
import { assertPipelineHostCompatible } from '../configuration/pipeline-host-capabilities'

export const MANAGED_PIPELINE_OWNER = 'platform.pipeline@1'

/** Creates immutable binding/run inputs; scheduling is performed by the shared coordinator. */
@Injectable()
export class ProjectPipelineManagedStartService {
    constructor(
        @InjectRepository(XpertProject) private readonly projects: Repository<XpertProject>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly configuration: ProjectPipelineConfigurationService,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        private readonly coordinator: ProjectPipelineCoordinatorService,
        private readonly assistants: ProjectPipelineAssistantBridgeService,
        private readonly runtimes: ProjectPipelineRuntimeBridgeService
    ) {}

    async configure(context: ProjectPipelineContext, request: ProjectPipelineConfigure) {
        const input = projectPipelineConfigureSchema.parse(request)
        const check = await this.configuration.check(context, input.configuration)
        if (!check.valid) throw pipelineProjectionConflict('PIPELINE_CONFIGURATION_INVALID')
        const { template, binding } = input.configuration
        if (template.executionAuthority !== 'platform') throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const definitionId = pipelineIdentity(
            context,
            'definition',
            MANAGED_PIPELINE_OWNER,
            template.key,
            template.version
        )
        const bindingId = pipelineIdentity(context, 'binding', input.requestId)
        return this.projects.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const scope = projectionScope(context),
                audit = managedAudit(context)
            const previous = await manager.findOneBy(ProjectPipelineDefinitionEntity, { ...scope, id: definitionId })
            const digest = pipelineDigest(template)
            if (previous && previous.digest !== digest) throw pipelineProjectionConflict('DEFINITION_VERSION_IMMUTABLE')
            if (!previous)
                await manager.insert(ProjectPipelineDefinitionEntity, {
                    ...audit,
                    id: definitionId,
                    ownerRef: MANAGED_PIPELINE_OWNER,
                    templateKey: template.key,
                    version: template.version,
                    digest,
                    definition: template
                })
            const existing = await manager.findOneBy(ProjectPipelineBindingEntity, { ...scope, id: bindingId })
            if (
                existing &&
                (existing.definitionId !== definitionId ||
                    pipelineDigest(existing.configuration) !== pipelineDigest(binding))
            )
                throw pipelineProjectionConflict('BINDING_REQUEST_CONFLICT')
            if (!existing) {
                const row = Object.assign(new ProjectPipelineBindingEntity(), audit, {
                    id: bindingId,
                    definitionId,
                    revision: 1
                })
                row.configuration = binding
                await manager.save(row)
            }
            return { bindingId, revision: existing?.revision ?? 1, definitionDigest: digest }
        })
    }

    async start(context: ProjectPipelineContext, request: ProjectPipelineStart): Promise<ProjectPipelineStartReceipt> {
        const input = projectPipelineStartSchema.parse(request)
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        const scope = projectionScope(context)
        const binding = await this.projects.manager.findOneByOrFail(ProjectPipelineBindingEntity, {
            ...scope,
            id: input.bindingId
        })
        const definition = await this.projects.manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...scope,
            id: binding.definitionId
        })
        const template = definition.definition
        assertPipelineHostCompatible(template, binding.configuration)
        if (template.executionAuthority !== 'platform') throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        // Catalog presence cannot stand in for live runtime adapters.
        for (const node of template.nodes) {
            if (node.kind === 'work') {
                if (node.resourceResolverRef) {
                    if (binding.configuration.executorBindings?.[node.executorSlot]?.kind !== 'service')
                        throw pipelineProjectionConflict('RESOURCE_EXECUTOR_UNSUPPORTED')
                    this.adapters.resolve('resource', node.resourceResolverRef, context.actor)
                }
                this.adapters.resolve('completion', node.completionRef, context.actor)
                const executor = binding.configuration.executorBindings?.[node.executorSlot]
                if (executor?.kind === 'service') this.adapters.resolve('operation', node.operationRef, context.actor)
                else if (executor?.kind === 'assistant') {
                    this.adapters.resolve('assistant_operation', node.operationRef, context.actor)
                    await this.assistants.resolve(context, executor.selectionKey)
                } else if (executor?.kind === 'runtime_binding') {
                    this.adapters.resolve('runtime_operation', node.operationRef, context.actor)
                    await this.runtimes.resolve(context, executor.selectionKey, executor.workspaceId)
                } else throw pipelineProjectionConflict('EXECUTOR_BRIDGE_UNAVAILABLE')
            } else if (node.kind === 'router' || node.kind === 'human_gate') {
                const policy = this.adapters.resolve('policy', node.policyRef, context.actor)
                if (node.kind === 'human_gate' && !policy.authorizeDecision)
                    throw pipelineProjectionConflict('GATE_AUTHORIZATION_UNAVAILABLE')
                if (
                    Object.values(node.outputPorts ?? {}).some(
                        (schema) =>
                            schema !==
                            (node.kind === 'human_gate'
                                ? PIPELINE_HUMAN_DECISION_SCHEMA
                                : PIPELINE_POLICY_DECISION_SCHEMA)
                    )
                )
                    throw pipelineProjectionConflict('DECISION_OUTPUT_SCHEMA_MISMATCH')
            } else if (node.kind === 'external_wait')
                this.adapters.resolve('subscription', node.subscriptionRef, context.actor)
        }
        const resolver = this.adapters.resolve('subject', template.subjectResolverRef, context.actor)
        const subject = projectPipelineSubjectVersionSchema.parse(await resolver.resolve(context, input.objectKey))
        if (subject.resolverRef !== template.subjectResolverRef || !(await resolver.checkCurrent(context, subject)))
            throw pipelineProjectionConflict('SUBJECT_SUPERSEDED')
        // Resolvers canonicalize object identities; aliases cannot bypass one-active-run or round limits.
        const sourceKey = JSON.stringify([template.key, subject.resolverRef, subject.objectKey])
        const instanceId = pipelineIdentity(context, 'instance', MANAGED_PIPELINE_OWNER, sourceKey)
        const runId = pipelineIdentity(context, 'run', instanceId, input.triggerKey)
        const roundId = pipelineIdentity(context, 'round', runId, '1')
        return this.projects.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            const audit = managedAudit(context)
            const currentBinding = await manager.findOneByOrFail(ProjectPipelineBindingEntity, {
                ...scope,
                id: binding.id
            })
            if (
                currentBinding.revision !== binding.revision ||
                pipelineDigest(currentBinding.configuration) !== pipelineDigest(binding.configuration)
            )
                throw pipelineProjectionConflict('BINDING_REVISION_CONFLICT')
            const previous = await manager.findOneBy(ProjectPipelineInstanceEntity, { ...scope, id: instanceId })
            const run = await manager.findOneBy(ProjectPipelineRunEntity, { ...scope, id: runId })
            if (run) {
                if (
                    run.definitionId !== definition.id ||
                    pipelineDigest(run.bindingSnapshot) !== pipelineDigest(binding.configuration)
                )
                    throw pipelineProjectionConflict('TRIGGER_CONFIGURATION_CONFLICT')
                return { instanceId, runId, roundId, revision: previous!.revision }
            }
            assertPipelineDispatchEnabled()
            const nativeModelBudget = binding.configuration.limits?.nativeModelBudget ?? null
            if (previous && pipelineDigest(previous.nativeModelBudget ?? null) !== pipelineDigest(nativeModelBudget))
                throw pipelineProjectionConflict('INSTANCE_BUDGET_IMMUTABLE')
            if (previous?.currentRunId) {
                const active = await manager.findOneByOrFail(ProjectPipelineRunEntity, {
                    ...scope,
                    id: previous.currentRunId
                })
                if (['pending', 'active', 'waiting', 'cancelling'].includes(active.state))
                    throw pipelineProjectionConflict('ACTIVE_RUN_EXISTS')
            }
            const rounds = await manager
                .createQueryBuilder(ProjectPipelineRoundEntity, 'round')
                .innerJoin(ProjectPipelineRunEntity, 'run', 'run.id = round."runId"')
                .where('run."instanceId" = :instanceId AND run."projectId" = :projectId', {
                    instanceId,
                    projectId: context.projectId
                })
                .getCount()
            if (rounds >= template.roundPolicy.maxRounds) throw pipelineProjectionConflict('ROUND_LIMIT_EXCEEDED')
            const instance = await manager.save(
                ProjectPipelineInstanceEntity,
                manager.create(ProjectPipelineInstanceEntity, {
                    ...previous,
                    ...audit,
                    id: instanceId,
                    ownerRef: MANAGED_PIPELINE_OWNER,
                    sourceKey,
                    authority: 'platform',
                    title: input.title,
                    definitionId: definition.id,
                    subject: { resolverRef: subject.resolverRef, objectKey: subject.objectKey },
                    currentRunId: runId,
                    currentRoundId: roundId,
                    revision: (previous?.revision ?? 0) + 1,
                    nativeModelBudget
                })
            )
            const newRun = Object.assign(new ProjectPipelineRunEntity(), audit, {
                id: runId,
                instanceId,
                sourceKey: input.triggerKey,
                definitionId: definition.id,
                state: 'active' as const
            })
            newRun.bindingSnapshot = binding.configuration
            await manager.save(newRun)
            await manager.insert(ProjectPipelineRoundEntity, {
                ...audit,
                id: roundId,
                runId,
                sourceKey: '1',
                sequence: 1,
                generation: rounds + 1,
                inputDigest: pipelineDigest([subject]),
                subjectVersionSet: [subject],
                state: 'active',
                edges: []
            })
            await initializeManagedPipelineNodes(
                manager,
                context,
                instanceId,
                roundId,
                template,
                newRun.bindingSnapshot
            )
            const planned = await this.coordinator.advanceWithinTransaction(manager, context, instanceId)
            return { instanceId, runId, roundId, revision: planned.revision }
        })
    }
}
