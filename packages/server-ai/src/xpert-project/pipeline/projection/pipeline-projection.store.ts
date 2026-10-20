// Invariants: serialize commits on the scoped Project row, after provider I/O has finished.
// Immutable input/definition identities and monotonic source versions fence late workers.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ProjectPipelineProjection } from '@xpert-ai/contracts'
import type {
    IProjectPipelineProjectionProvider,
    ProjectPipelineContext,
    ProjectPipelineProjectionCheckpoint
} from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineEventEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from './pipeline-projection.errors'
import { pipelineTaskSourceKey, writePipelineTasksAndNodes } from './pipeline-projection.writer'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'
import { assertPipelineHostCompatible } from '../configuration/pipeline-host-capabilities'

// Cancellation is still in flight until the provider reports a terminal outcome.
const unfinishedRunStates = new Set<ProjectPipelineProjection['run']['state']>([
    'pending',
    'active',
    'waiting',
    'cancelling'
])

@Injectable()
export class ProjectPipelineProjectionStore {
    constructor(@InjectRepository(XpertProject) private readonly projects: Repository<XpertProject>) {}

    async checkpoint(
        context: ProjectPipelineContext,
        providerRef: string,
        sourceKey: string
    ): Promise<ProjectPipelineProjectionCheckpoint | null> {
        const scope = projectionScope(context)
        const id = pipelineIdentity(context, 'instance', providerRef, sourceKey)
        return this.projects.manager.transaction('REPEATABLE READ', async (manager) => {
            const instance = await manager.findOneBy(ProjectPipelineInstanceEntity, {
                ...scope,
                id,
                ownerRef: providerRef,
                authority: 'provider'
            })
            if (!instance?.currentRunId || !instance.currentRoundId) return null
            const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, {
                ...scope,
                id: instance.currentRunId,
                instanceId: instance.id
            })
            const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, {
                ...scope,
                id: instance.currentRoundId,
                runId: run.id
            })
            return {
                sourceEpoch: instance.sourceEpoch,
                sourceSequence: Number(instance.sourceSequence),
                run: { key: run.sourceKey, state: run.state },
                round: {
                    key: round.sourceKey,
                    sequence: round.sequence,
                    generation: round.generation,
                    state: round.state,
                    inputDigest: round.inputDigest
                }
            }
        })
    }

    async apply(
        context: ProjectPipelineContext,
        provider: IProjectPipelineProjectionProvider,
        snapshot: ProjectPipelineProjection
    ) {
        assertPipelineHostCompatible(snapshot.definition)
        if (snapshot.definition.executionAuthority !== 'provider' || snapshot.definition.providerRef !== provider.key)
            throw pipelineProjectionConflict('PROVIDER_AUTHORITY_MISMATCH')
        const scope = projectionScope(context)
        const audit = {
            projectId: context.projectId,
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId ?? null,
            createdById: context.actor.userId
        }
        const instanceId = pipelineIdentity(context, 'instance', provider.key, snapshot.sourceKey)
        const definitionId = pipelineIdentity(
            context,
            'definition',
            provider.key,
            snapshot.definition.key,
            snapshot.definition.version
        )
        const runId = pipelineIdentity(context, 'run', instanceId, snapshot.run.key)
        const roundId = pipelineIdentity(context, 'round', runId, snapshot.round.key)
        const digest = pipelineDigest(snapshot)
        return this.projects.manager.transaction(async (manager) => {
            await manager.query("SET LOCAL lock_timeout = '2s'")
            await manager.query("SET LOCAL statement_timeout = '10s'")
            await manager.findOneOrFail(XpertProject, {
                where: {
                    id: context.projectId,
                    tenantId: context.actor.tenantId,
                    organizationId: scope.organizationId
                },
                lock: { mode: 'pessimistic_write' }
            })
            const current = await manager.findOneBy(ProjectPipelineInstanceEntity, { ...scope, id: instanceId })
            if (current) {
                if (current.authority !== 'provider' || current.ownerRef !== provider.key)
                    throw pipelineProjectionConflict('INSTANCE_AUTHORITY_CHANGED')
                if (current.sourceEpoch !== snapshot.sourceEpoch)
                    throw pipelineProjectionConflict('SOURCE_EPOCH_CHANGED')
                if (pipelineDigest(current.subject) !== pipelineDigest(snapshot.subject))
                    throw pipelineProjectionConflict('SUBJECT_IDENTITY_CHANGED')
                if (Number(current.sourceSequence) >= snapshot.sourceSequence) {
                    if (Number(current.sourceSequence) === snapshot.sourceSequence && current.snapshotDigest !== digest)
                        throw pipelineProjectionConflict('SOURCE_VERSION_CONFLICT')
                    const tasks = await manager.find(XpertProjectTask, {
                        where: { ...scope, pipelineInstanceId: instanceId }
                    })
                    const links = snapshot.tasks.flatMap((task) => {
                        const row = tasks.find((item) => item.sourceKey === pipelineTaskSourceKey(instanceId, task.key))
                        return row ? [{ sourceKey: task.key, taskId: row.id }] : []
                    })
                    return {
                        status:
                            Number(current.sourceSequence) === snapshot.sourceSequence
                                ? ('unchanged' as const)
                                : ('stale' as const),
                        instanceId,
                        revision: current.revision,
                        tasks: links
                    }
                }
            }
            const previousDefinition = await manager.findOneBy(ProjectPipelineDefinitionEntity, {
                ...scope,
                id: definitionId
            })
            const definitionDigest = pipelineDigest(snapshot.definition)
            if (previousDefinition && previousDefinition.digest !== definitionDigest)
                throw pipelineProjectionConflict('DEFINITION_VERSION_IMMUTABLE')
            if (!previousDefinition)
                await manager.insert(ProjectPipelineDefinitionEntity, {
                    ...audit,
                    id: definitionId,
                    ownerRef: provider.key,
                    templateKey: snapshot.definition.key,
                    version: snapshot.definition.version,
                    digest: definitionDigest,
                    definition: snapshot.definition
                })
            if (current?.currentRunId && current.currentRunId !== runId) {
                const oldRun = await manager.findOneByOrFail(ProjectPipelineRunEntity, {
                    ...scope,
                    id: current.currentRunId
                })
                if (unfinishedRunStates.has(oldRun.state)) throw pipelineProjectionConflict('ACTIVE_RUN_EXISTS')
            }
            const instance = manager.create(ProjectPipelineInstanceEntity, {
                ...current,
                ...audit,
                id: instanceId,
                ownerRef: provider.key,
                sourceKey: snapshot.sourceKey,
                authority: 'provider',
                title: snapshot.title,
                definitionId,
                subject: snapshot.subject,
                sourceEpoch: snapshot.sourceEpoch,
                sourceSequence: String(snapshot.sourceSequence),
                snapshotDigest: digest,
                revision: (current?.revision ?? 0) + 1,
                currentRunId: runId,
                currentRoundId: roundId
            })
            await manager.save(instance)
            const run = await manager.findOneBy(ProjectPipelineRunEntity, { ...scope, id: runId })
            // A higher producer cursor may advance current work, never reopen archived history.
            if (run && current?.currentRunId !== runId) throw pipelineProjectionConflict('RUN_HISTORY_IMMUTABLE')
            if (run && run.definitionId !== definitionId) throw pipelineProjectionConflict('RUN_DEFINITION_IMMUTABLE')
            if (
                run &&
                !unfinishedRunStates.has(run.state) &&
                (run.state !== snapshot.run.state || current?.currentRoundId !== roundId)
            )
                throw pipelineProjectionConflict('RUN_TERMINAL_IMMUTABLE')
            await manager.save(
                ProjectPipelineRunEntity,
                manager.create(ProjectPipelineRunEntity, {
                    ...run,
                    ...audit,
                    id: runId,
                    instanceId,
                    sourceKey: snapshot.run.key,
                    definitionId,
                    bindingSnapshot: null,
                    state: snapshot.run.state
                })
            )
            const round = await manager.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: roundId })
            if (
                round &&
                (round.sequence !== snapshot.round.sequence ||
                    round.generation !== snapshot.round.generation ||
                    round.inputDigest !== snapshot.round.inputDigest ||
                    pipelineDigest(round.subjectVersionSet) !== pipelineDigest(snapshot.round.subjectVersionSet))
            ) {
                throw pipelineProjectionConflict('ROUND_INPUT_IMMUTABLE')
            }
            if (current?.currentRunId === runId && current.currentRoundId !== roundId) {
                const oldRound = await manager.findOneByOrFail(ProjectPipelineRoundEntity, {
                    ...scope,
                    id: current.currentRoundId
                })
                if (snapshot.round.sequence <= oldRound.sequence || snapshot.round.generation <= oldRound.generation)
                    throw pipelineProjectionConflict('ROUND_GENERATION_REGRESSION')
                if (oldRound.state === 'active') {
                    if (snapshot.round.supersedesKey !== oldRound.sourceKey)
                        throw pipelineProjectionConflict('ROUND_SUPERSESSION_REQUIRED')
                    oldRound.state = 'superseded'
                    await manager.save(oldRound)
                }
            }
            if (round && round.state !== 'active' && round.state !== snapshot.round.state)
                throw pipelineProjectionConflict('ROUND_TERMINAL_IMMUTABLE')
            await manager.save(
                ProjectPipelineRoundEntity,
                manager.create(ProjectPipelineRoundEntity, {
                    ...round,
                    ...audit,
                    id: roundId,
                    runId,
                    sourceKey: snapshot.round.key,
                    sequence: snapshot.round.sequence,
                    generation: snapshot.round.generation,
                    inputDigest: snapshot.round.inputDigest,
                    subjectVersionSet: snapshot.round.subjectVersionSet,
                    state: snapshot.round.state,
                    edges: snapshot.edges,
                    projectionTasks: snapshot.tasks
                })
            )
            const tasks = await writePipelineTasksAndNodes(manager, context, provider, instanceId, roundId, snapshot)
            await manager.insert(ProjectPipelineEventEntity, {
                ...audit,
                id: pipelineIdentity(context, 'event', instanceId, String(instance.revision)),
                instanceId,
                revision: instance.revision,
                type: 'projection.applied',
                payload: {
                    sourceEpoch: snapshot.sourceEpoch,
                    sourceSequence: snapshot.sourceSequence,
                    snapshotDigest: digest,
                    roundId,
                    humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instanceId)
                }
            })
            return { status: 'applied' as const, instanceId, revision: instance.revision, tasks }
        })
    }
}
