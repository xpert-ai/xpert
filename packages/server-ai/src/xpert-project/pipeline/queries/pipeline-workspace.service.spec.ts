import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectPipelineRuntimeAdapterRegistry } from '@xpert-ai/plugin-sdk'
import { ProjectPipelineWorkspaceService } from './pipeline-workspace.service'
import { XpertProjectTypeService } from '../../services/project-type.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { ProjectPipelineInstanceEntity, ProjectPipelineDefinitionEntity } from '../persistence/pipeline.entity'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' } }
const definition = {
    key: 'neutral',
    version: '1.0.0',
    title: 'Neutral',
    executionAuthority: 'platform',
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
        authority: 'platform',
        definitionId: 'definition',
        currentRoundId: 'round',
        currentRunId: 'run'
    })
    const round = {
        subjectVersionSet: [
            { resolverRef: 'neutral.subject@1', objectKey: 'exact-object', version: '1', digest: 'a'.repeat(64) }
        ]
    }
    const read = jest.fn(async (entity) => (entity === ProjectPipelineDefinitionEntity ? { definition } : round))
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
    return { service: module.get(ProjectPipelineWorkspaceService), entry, resolve, access, instance, round }
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
    expect(f.entry).toHaveBeenCalledWith(context, 'exact-object')
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
