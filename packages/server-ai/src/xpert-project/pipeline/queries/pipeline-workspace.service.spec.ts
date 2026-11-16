import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectPipelineWorkspaceService } from './pipeline-workspace.service'
import { XpertProjectTypeService } from '../../services/project-type.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
const definition = {
    key: 'neutral',
    version: '1.0.0',
    title: 'Neutral',
    executionAuthority: 'platform',
    projectTypes: [{ applicationKey: 'platform', projectTypeKey: 'general' }],
    subjectResolverRef: 'neutral.subject@1',
    topology: { source: 'definition' },
    roles: [{ key: 'owner', allowedKinds: ['human'] }],
    lanes: [{ key: 'owner', roleKey: 'owner', label: 'Owner', order: 0 }],
    stages: [{ key: 'review', label: 'Review', order: 0 }],
    nodes: [{ key: 'done', kind: 'terminal', stageKey: 'review', outcome: 'completed' }],
    edges: [],
    roundPolicy: {
        entryNodeKey: 'done',
        maxRounds: 1,
        onRework: 'await_new_subject_then_next_round',
        onLimit: 'attention',
        newVersionWhileActive: 'supersede_round',
        terminalOutcomes: ['completed']
    },
    failurePolicy: { requiredNodeFailure: 'block_and_attention', unknownExecution: 'inspect_without_replay' }
}
async function fixture() {
    const entry = jest
        .fn()
        .mockResolvedValue({ xpertId: 'assistant', viewKey: 'registered__business', selectionId: 'exact-object' })
    const resolve = jest.fn().mockReturnValue({ resolveEntry: entry })
    const access = { assertCanRead: jest.fn(), assertCanUseXpert: jest.fn() }
    const instance = jest.fn().mockResolvedValue({
        id: 'instance',
        authority: 'platform',
        definitionId: 'definition',
        currentRoundId: 'round',
        currentRunId: 'run'
    })
    const round = {
        runId: 'run',
        subjectVersionSet: [
            { resolverRef: 'neutral.subject@1', objectKey: 'exact-object', version: '1', digest: 'a'.repeat(64) }
        ]
    }
    const read = jest.fn(
        async (entity): Promise<unknown> =>
            entity === ProjectPipelineDefinitionEntity
                ? { definition }
                : entity === ProjectPipelineRunEntity
                  ? { definitionId: 'definition' }
                  : round
    )
    const module = await Test.createTestingModule({
        providers: [
            ProjectPipelineWorkspaceService,
            {
                provide: getRepositoryToken(ProjectPipelineInstanceEntity),
                useValue: { findOneBy: instance, manager: { findOneBy: read } }
            },
            { provide: ProjectPipelineRuntimeAdapterRegistry, useValue: { resolve } },
            { provide: XpertProjectTypeService, useValue: { entryForProject: jest.fn() } },
            { provide: XpertProjectAccessService, useValue: access },
            {
                provide: PublishedXpertAccessService,
                useValue: {
                    getAccessiblePublishedXpert: jest.fn(async () => ({
                        id: 'assistant',
                        slug: 'assistant',
                        organizationId: 'org'
                    }))
                }
            }
        ]
    }).compile()
    return { service: module.get(ProjectPipelineWorkspaceService), entry, resolve, access, instance, round, read }
}

it('opens the exact persisted subject through its actor-scoped adapter and checks Assistant assignment', async () => {
    const f = await fixture()
    await expect(f.service.entry(context, { instanceId: 'instance', xpertId: 'assistant' })).resolves.toMatchObject({
        kind: 'assistant',
        projectId: 'project',
        xpertId: 'assistant',
        viewKey: 'registered__business',
        selectionId: 'exact-object'
    })
    expect(f.instance).toHaveBeenCalledWith({
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        id: 'instance'
    })
    expect(f.resolve).toHaveBeenCalledWith('subject', 'neutral.subject@1', context.actor)
    expect(f.entry).toHaveBeenCalledWith(context, 'exact-object', 'assistant')
    expect(f.access.assertCanUseXpert).toHaveBeenCalledWith('project', 'assistant')
})

it.each(['project', 'instance', 'subject', 'assistant', 'binding', 'url'])(
    'rejects invalid %s access or routing',
    async (failure) => {
        const f = await fixture()
        if (failure === 'project') f.access.assertCanRead.mockRejectedValue(Error('revoked'))
        if (failure === 'instance') f.instance.mockResolvedValue(null)
        if (failure === 'subject') f.round.subjectVersionSet[0].resolverRef = 'other.subject@1'
        if (failure === 'assistant') f.entry.mockResolvedValue({ xpertId: 'other', viewKey: 'registered__business' })
        if (failure === 'binding') f.access.assertCanUseXpert.mockRejectedValue(Error('revoked'))
        if (failure === 'url')
            f.entry.mockResolvedValue({
                xpertId: 'assistant',
                viewKey: 'registered__business',
                url: 'https://example.com'
            })
        await expect(f.service.entry(context, { instanceId: 'instance', xpertId: 'assistant' })).rejects.toThrow()
        if (['project', 'instance', 'subject'].includes(failure)) expect(f.entry).not.toHaveBeenCalled()
    }
)

it('keeps instance/round navigation precise and rejects nodes from another round', async () => {
    const f = await fixture()
    const entry = await f.service.entry(context, { instanceId: 'instance' })
    if (entry.kind !== 'assistant') throw Error('Expected Assistant entry')
    expect(entry.parameters).toMatchObject({ pipelineInstanceId: 'instance', pipelineRoundId: 'round' })
    f.read.mockImplementation(async (entity) =>
        entity === ProjectPipelineNodeEntity
            ? null
            : entity === ProjectPipelineDefinitionEntity
              ? { definition }
              : entity === ProjectPipelineRunEntity
                ? { definitionId: 'definition' }
                : f.round
    )
    await expect(f.service.entry(context, { instanceId: 'instance', pipelineNodeId: 'foreign-node' })).rejects.toThrow()
    expect(f.read).toHaveBeenLastCalledWith(ProjectPipelineNodeEntity, {
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        id: 'foreign-node',
        roundId: 'round'
    })
})

it('keeps the selected historical round and checks its run belongs to this instance', async () => {
    const f = await fixture()
    const entry = await f.service.entry(context, { instanceId: 'instance', roundId: 'historical-round' })
    expect(entry).toMatchObject({ parameters: { pipelineRoundId: 'historical-round' } })
    expect(f.read).toHaveBeenCalledWith(ProjectPipelineRunEntity, {
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        id: 'run',
        instanceId: 'instance'
    })
    f.read.mockImplementation(async (entity) => (entity === ProjectPipelineRunEntity ? null : f.round))
    await expect(f.service.entry(context, { instanceId: 'instance', roundId: 'foreign-round' })).rejects.toThrow()
})

it('rejects a subject entry that bypasses the authorized Assistant host', async () => {
    const f = await fixture()
    f.entry.mockResolvedValueOnce({
        hostType: 'project',
        viewKey: 'registered__business',
        selectionId: 'exact-object',
        parameters: { draftRevision: 3 }
    })
    await expect(f.service.entry(context, { instanceId: 'instance' })).rejects.toThrow()
    expect(f.access.assertCanRead).toHaveBeenCalledWith('project')
    expect(f.access.assertCanUseXpert).not.toHaveBeenCalled()
})

it('selects the executor pinned to the selected run before resolving the order and ignores the source role as a destination', async () => {
    const f = await fixture()
    const spec = {
        key: 'supply',
        kind: 'work',
        stageKey: 'review',
        laneKey: 'owner',
        executorSlot: 'buyer',
        operationRef: 'neutral.supply@1',
        completionRef: 'neutral.done@1'
    }
    const executorBindings: Record<string, { kind: string; selectionKey: string }> = {
        buyer: { kind: 'assistant', selectionKey: 'assistant' }
    }
    f.resolve.mockReturnValue({
        resolveEntry: f.entry,
        nodeWorkbenches: [{ definitionKey: definition.key, version: definition.version, routeToExecutor: true }]
    })
    f.read.mockImplementation(async (entity) =>
        entity === ProjectPipelineNodeEntity
            ? { id: 'node', nodeKey: 'supply' }
            : entity === ProjectPipelineDefinitionEntity
              ? {
                    definition: {
                        ...definition,
                        nodes: [spec, ...definition.nodes],
                        edges: [{ from: 'supply', to: 'done' }],
                        roundPolicy: { ...definition.roundPolicy, entryNodeKey: 'supply' }
                    }
                }
              : entity === ProjectPipelineRunEntity
                ? { definitionId: 'definition', bindingSnapshot: { executorBindings } }
                : { ...f.round, id: 'old-round' }
    )
    const focus = { instanceId: 'instance', roundId: 'old-round', pipelineNodeId: 'node', xpertId: 'quality' }
    await expect(f.service.entry(context, focus)).resolves.toMatchObject({
        xpertId: 'assistant',
        selectionId: 'exact-object',
        parameters: { pipelineInstanceId: 'instance', pipelineRoundId: 'old-round', pipelineNodeId: 'node' }
    })
    expect(f.entry).toHaveBeenCalledWith(context, 'exact-object', 'quality', { executorXpertId: 'assistant' })
    const sourceNavigation = await f.service.entry(context, focus, 'navigation')
    expect(sourceNavigation).toEqual({
        kind: 'node-navigation',
        target: {
            target: 'project.application',
            projectId: 'project',
            pipelineInstanceId: 'instance',
            pipelineRoundId: 'old-round',
            pipelineNodeId: 'node'
        }
    })
    expect(f.access.assertCanUseXpert).toHaveBeenLastCalledWith('project', 'quality')
    f.entry.mockResolvedValue({ xpertId: 'quality', viewKey: 'registered__business' })
    await expect(f.service.entry(context, focus)).rejects.toThrow()
    delete executorBindings.buyer
    f.entry.mockClear()
    await expect(f.service.entry(context, focus)).rejects.toThrow()
    expect(f.entry).not.toHaveBeenCalled()
})
