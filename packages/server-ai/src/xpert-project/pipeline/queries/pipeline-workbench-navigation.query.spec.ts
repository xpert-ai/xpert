import { Test } from '@nestjs/testing'
import { DataSource, IsNull } from 'typeorm'
import { ProjectPipelineWorkbenchHandler, ProjectPipelineWorkbenchQuery } from './pipeline-workbench-navigation.query'
import { XpertProjectTypeService } from '../../services/project-type.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectXpertBindingService } from '../../services/project-xpert-binding.service'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineNodeEntity
} from '../persistence/pipeline.entity'

const context = { projectId: 'project', actor: { tenantId: 'tenant', organizationId: 'org', userId: 'human' } }
const focus = { pipelineInstanceId: 'instance', pipelineRoundId: 'round', pipelineNodeId: 'node' }
async function fixture() {
    const access = { assertCanRead: jest.fn(), assertCanUseXpert: jest.fn() }
    const projectEntry = jest.fn().mockResolvedValue({ kind: 'project' })
    const resolve = jest.fn(async (id: string) => ({ id, name: 'Assistant' }))
    const binding = {
        templateRef: 'neutral@1',
        roleBindings: {},
        parameters: {},
        executorBindings: { worker: { kind: 'assistant', roleKey: 'worker', selectionKey: 'bound' } }
    }
    const rows = new Map<unknown, unknown>([
        [ProjectPipelineInstanceEntity, { id: 'instance', authority: 'platform' }],
        [ProjectPipelineRoundEntity, { id: 'round', runId: 'run' }],
        [ProjectPipelineRunEntity, { id: 'run', bindingSnapshot: binding }],
        [ProjectPipelineNodeEntity, { id: 'node' }]
    ])
    const read = jest.fn(async (entity: unknown) => rows.get(entity))
    const project = jest.fn(async () => ({ xperts: [{ id: 'bound' }] }))
    const module = await Test.createTestingModule({
        providers: [
            ProjectPipelineWorkbenchHandler,
            {
                provide: DataSource,
                useValue: { manager: { findOneBy: read }, getRepository: () => ({ findOne: project }) }
            },
            { provide: XpertProjectTypeService, useValue: { entryForProject: projectEntry } },
            { provide: XpertProjectAccessService, useValue: access },
            { provide: XpertProjectXpertBindingService, useValue: { resolveCurrentById: resolve } }
        ]
    }).compile()
    return {
        handler: module.get(ProjectPipelineWorkbenchHandler),
        access,
        resolve,
        rows,
        read,
        project,
        binding,
        projectEntry
    }
}

it('resolves only the selected run bindings and exact Project/round/node, independently of the Assistant catalog', async () => {
    const f = await fixture()
    const result = await f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))
    expect(result).toEqual({
        projectId: 'project',
        organizationId: 'org',
        assistant: { id: 'bound', name: 'Assistant' },
        view: { viewKey: 'platform.project-tasks__timeline', parameters: { initialTab: 'pipeline', ...focus } }
    })
    const scope = { projectId: 'project', tenantId: 'tenant', organizationId: 'org' }
    expect(f.read).toHaveBeenCalledWith(ProjectPipelineRunEntity, { ...scope, id: 'run', instanceId: 'instance' })
    expect(f.read).toHaveBeenCalledWith(ProjectPipelineNodeEntity, { ...scope, id: 'node', roundId: 'round' })
    expect(f.resolve).toHaveBeenCalledWith('bound', context.actor)
    expect(f.access.assertCanUseXpert).toHaveBeenCalledWith('project', 'bound')
    expect(f.project).not.toHaveBeenCalled()
})

it.each([
    ProjectPipelineInstanceEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineNodeEntity
])('rejects missing or foreign %p before resolving an Assistant', async (entity) => {
    const f = await fixture()
    f.rows.set(entity, null)
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow()
    expect(f.resolve).not.toHaveBeenCalled()
})

it('does not guess between multiple Assistants, including when one has no current published binding', async () => {
    const f = await fixture()
    Object.assign(f.binding.executorBindings, {
        reviewer: { kind: 'assistant', roleKey: 'reviewer', selectionKey: 'second' }
    })
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow()
    expect(f.access.assertCanUseXpert).not.toHaveBeenCalled()
    f.resolve.mockResolvedValueOnce(null)
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow()
})

it('normalizes published aliases before checking uniqueness and current Project assignment', async () => {
    const f = await fixture()
    Object.assign(f.binding.executorBindings, {
        reviewer: { kind: 'assistant', roleKey: 'reviewer', selectionKey: 'older' }
    })
    f.resolve.mockResolvedValue({ id: 'canonical', name: 'Assistant' })
    expect((await f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).assistant.id).toBe('canonical')
    expect(f.access.assertCanUseXpert).toHaveBeenCalledWith('project', 'canonical')
})

it('preserves tenant scope and uses a unique Project binding for an unfocused entry', async () => {
    const f = await fixture()
    const tenantContext = { ...context, actor: { ...context.actor, organizationId: null } }
    expect((await f.handler.execute(new ProjectPipelineWorkbenchQuery(tenantContext, {}))).organizationId).toBeNull()
    expect(f.project).toHaveBeenCalledWith({
        where: { id: 'project', tenantId: 'tenant', organizationId: IsNull() },
        relations: ['xperts']
    })
    expect(f.resolve).toHaveBeenCalledWith('bound', tenantContext.actor)
})

it('keeps Project authorization ahead of resource reads and rechecks Assistant use permission', async () => {
    const f = await fixture()
    f.access.assertCanRead.mockRejectedValueOnce(Error('revoked'))
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow('revoked')
    expect(f.read).not.toHaveBeenCalled()
    f.access.assertCanUseXpert.mockRejectedValueOnce(Error('binding revoked'))
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow(
        'binding revoked'
    )
})

it('requires a registered application Assistant for provider runs and preserves the originating focus', async () => {
    const f = await fixture()
    f.rows.set(ProjectPipelineInstanceEntity, { id: 'instance', authority: 'provider' })
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow()
    f.projectEntry.mockResolvedValue({ kind: 'assistant', xpertId: 'case-owner' })
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).resolves.toMatchObject({
        assistant: { id: 'case-owner' },
        view: { parameters: { initialTab: 'pipeline', ...focus } }
    })
    expect(f.projectEntry).toHaveBeenCalledWith('project')
    expect(f.access.assertCanUseXpert).toHaveBeenCalledWith('project', 'case-owner')
    f.rows.set(ProjectPipelineInstanceEntity, { id: 'instance', authority: 'platform' })
    f.rows.set(ProjectPipelineRunEntity, { id: 'run', bindingSnapshot: { ...f.binding, executorBindings: {} } })
    await expect(f.handler.execute(new ProjectPipelineWorkbenchQuery(context, focus))).rejects.toThrow()
    expect(f.project).not.toHaveBeenCalled()
})
