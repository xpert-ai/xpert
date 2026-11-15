jest.mock('./project-configuration-connectors.adapter', () => ({
    ProjectConfigurationConnectorsAdapter: class ProjectConfigurationConnectorsAdapter {}
}))
jest.mock('./project-configuration-automation.adapter', () => ({
    ProjectConfigurationAutomationAdapter: class ProjectConfigurationAutomationAdapter {}
}))
jest.mock('./project-configuration-editors.adapter', () => ({
    ProjectConfigurationEditorsAdapter: class ProjectConfigurationEditorsAdapter {}
}))
jest.mock('../../project.service', () => ({ XpertProjectService: class XpertProjectService {} }))
import { ProjectConfigurationEditorsAdapter } from './project-configuration-editors.adapter'
import { ProjectConfigurationAutomationAdapter } from './project-configuration-automation.adapter'
import { ProjectConfigurationConnectorsAdapter } from './project-configuration-connectors.adapter'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { ProjectConfigurationScope } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ProjectConfigurationRuntimeService } from './project-configuration-runtime.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectContentService } from '../../services/project-content.service'
import { XpertProjectMembershipService } from '../../services/project-membership.service'
import { ProjectConfigurationService } from '../project-configuration.service'
import { XpertProjectService } from '../../project.service'
import { XpertTask } from '../../../xpert-task/xpert-task.entity'

const context: ProjectConfigurationScope = {
    actor: { tenantId: 'tenant', organizationId: 'organization', userId: 'user' },
    projectId: 'project',
    assistantId: 'assistant'
}
async function fixture() {
    const accessValue = { project: { id: 'project', name: 'Project', status: 'active' }, role: 'owner' }
    const access = {
        assertCanRead: jest.fn().mockResolvedValue(accessValue),
        assertCanUseXpert: jest.fn().mockResolvedValue(accessValue)
    }
    const content = {
        readInstructions: jest.fn().mockResolvedValue({ content: 'Instructions' }),
        listSkills: jest.fn().mockResolvedValue({ items: [] }),
        updateInstructions: jest.fn().mockResolvedValue({ content: 'Updated' }),
        uploadSkills: jest.fn()
    }
    const tasks = { findAndCount: jest.fn().mockResolvedValue([[], 0]) }
    const editors = { get: jest.fn().mockResolvedValue(null), update: jest.fn() }
    const automations = { listAutomations: jest.fn().mockResolvedValue(null) }
    const connectors = { listConnectors: jest.fn().mockResolvedValue(null) }
    const module = await Test.createTestingModule({
        providers: [
            ProjectConfigurationRuntimeService,
            { provide: ProjectConfigurationEditorsAdapter, useValue: editors },
            { provide: ProjectConfigurationAutomationAdapter, useValue: automations },
            { provide: ProjectConfigurationConnectorsAdapter, useValue: connectors },
            { provide: XpertProjectAccessService, useValue: access },
            { provide: XpertProjectContentService, useValue: content },
            { provide: XpertProjectMembershipService, useValue: { list: jest.fn().mockResolvedValue([]) } },
            {
                provide: ProjectConfigurationService,
                useValue: {
                    get: jest.fn().mockResolvedValue({
                        projectType: { applicationKey: 'coding', projectTypeKey: 'coding' },
                        revision: 3,
                        effectiveValues: { deliveryMode: 'local' },
                        taskExecution: {
                            effectiveMaxDurationSeconds: 7200,
                            tenantMaxDurationSeconds: 14400
                        }
                    })
                }
            },
            {
                provide: XpertProjectService,
                useValue: {
                    getXperts: jest
                        .fn()
                        .mockResolvedValue({ items: [{ id: 'assistant', name: 'Assistant', graph: 'private' }] })
                }
            },
            { provide: getRepositoryToken(XpertTask), useValue: tasks }
        ]
    }).compile()
    return {
        provider: module.get(ProjectConfigurationRuntimeService),
        access,
        accessValue,
        content,
        tasks,
        editors,
        automations,
        connectors
    }
}
beforeEach(() => {
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
})
afterEach(() => jest.restoreAllMocks())

it('uses the current authorized project, scopes scheduled tasks and strips private Assistant fields', async () => {
    const { provider, access, tasks } = await fixture()
    const result = await provider.getOverview(context)
    expect(access.assertCanUseXpert).toHaveBeenCalledWith('project', 'assistant')
    expect(tasks.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
            where: { projectId: 'project', tenantId: 'tenant', organizationId: 'organization' },
            select: ['id', 'name', 'prompt', 'monitor', 'schedule', 'options', 'status'],
            take: 20
        })
    )
    expect(result.experts).toEqual([{ id: 'assistant', name: 'Assistant' }])
    expect(result).toMatchObject({ projectId: 'project', canEdit: true, canManage: true })
})
it('rejects missing scope, mismatched identities, machine principals and revoked project access', async () => {
    const { provider, access, accessValue } = await fixture()
    await expect(provider.getOverview({ ...context, projectId: undefined })).rejects.toThrow()
    for (const mismatch of [{ userId: 'other' }, { tenantId: 'other' }, { organizationId: 'other' }]) {
        await expect(provider.getOverview({ ...context, actor: { ...context.actor, ...mismatch } })).rejects.toThrow()
    }
    accessValue.role = 'assistant'
    await expect(provider.getOverview(context)).rejects.toThrow()
    access.assertCanUseXpert.mockRejectedValue(Error('revoked'))
    await expect(provider.updateInstructions(context, 'Changed')).rejects.toThrow('revoked')
})
it('retains content write authorization behind the capability', async () => {
    const { provider, content } = await fixture()
    await provider.updateInstructions(context, 'Changed')
    expect(content.updateInstructions).toHaveBeenCalledWith('project', 'Changed')
    content.updateInstructions.mockRejectedValue(Error('editor required'))
    await expect(provider.updateInstructions(context, 'Changed')).rejects.toThrow('editor required')
})
it('renders member and archived access as read only', async () => {
    const { provider, accessValue } = await fixture()
    accessValue.role = 'member'
    expect(await provider.getOverview(context)).toMatchObject({
        canEdit: false,
        canManage: false,
        isOwner: false
    })
    accessValue.role = 'owner'
    accessValue.project.status = 'archived'
    expect(await provider.getOverview(context)).toMatchObject({
        canEdit: false,
        canManage: false,
        isOwner: false
    })
})

it('resolves scope anew on every operation and never shares project scope between calls', async () => {
    const { provider, access, editors, automations, connectors } = await fixture()
    await provider.get(context)
    const second = { ...context, projectId: 'second', assistantId: undefined }
    await provider.get(second)
    expect(editors.get.mock.calls.map(([projectId]) => projectId)).toEqual(['project', 'second'])
    access.assertCanUseXpert.mockRejectedValue(Error('revoked'))
    await expect(provider.get(context)).rejects.toThrow('revoked')
    await expect(provider.listAutomations(context, { page: 1, search: '' })).rejects.toThrow('revoked')
    await expect(provider.listConnectors(context)).rejects.toThrow('revoked')
    expect(editors.get).toHaveBeenCalledTimes(2)
    expect(automations.listAutomations).not.toHaveBeenCalled()
    expect(connectors.listConnectors).not.toHaveBeenCalled()
})
it('authorizes and bounds binary skill uploads on the host', async () => {
    const { provider, content, access } = await fixture()
    const file = { buffer: Buffer.from('archive'), originalname: 'skill.zip' }
    await provider.uploadSkill(context, file)
    expect(content.uploadSkills).toHaveBeenCalledWith('project', file)
    await expect(provider.uploadSkill(context, { buffer: Buffer.alloc(25 * 1024 * 1024 + 1) })).rejects.toThrow()
    access.assertCanUseXpert.mockRejectedValue(Error('revoked'))
    await expect(provider.uploadSkill(context, file)).rejects.toThrow('revoked')
    expect(content.uploadSkills).toHaveBeenCalledTimes(1)
})

it('supports a trusted execution scope without a View and denies an unrestored execution identity', async () => {
    const { provider, access, editors } = await fixture()
    const scope = { actor: context.actor, projectId: 'project' }
    await provider.get(scope)
    expect(access.assertCanRead).toHaveBeenCalledWith('project')
    expect(editors.get).toHaveBeenCalledWith('project')
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
    await expect(provider.get(scope)).rejects.toThrow()
    expect(editors.get).toHaveBeenCalledTimes(1)
})
it('preserves revision conflicts for direct configuration updates', async () => {
    const { provider, editors } = await fixture()
    const input = { revision: 3, values: { duration: 7200 } }
    editors.update.mockRejectedValue(Error('configuration revision conflict'))
    await expect(provider.update(context, input)).rejects.toThrow('configuration revision conflict')
    expect(editors.update).toHaveBeenCalledWith('project', input)
})

it('retains skill installation permission checks for runtime uploads', async () => {
    const { provider, content } = await fixture()
    const file = { buffer: Buffer.from('archive') }
    content.uploadSkills.mockRejectedValue(Error('editor required'))
    await expect(provider.uploadSkill(context, file)).rejects.toThrow('editor required')
    expect(content.uploadSkills).toHaveBeenCalledWith('project', file)
})

it('allows an authorized Assistant to read non-secret effective settings without management access', async () => {
    const { provider, accessValue, access, editors } = await fixture()
    accessValue.role = 'assistant'
    await expect(provider.getRuntimeConfiguration(context)).resolves.toEqual({
        projectType: { applicationKey: 'coding', projectTypeKey: 'coding' },
        revision: 3,
        effectiveValues: { deliveryMode: 'local' }
    })
    await expect(provider.get(context)).rejects.toThrow()
    await expect(provider.update(context, { revision: 3, values: {} })).rejects.toThrow()
    await expect(provider.getRuntimeConfiguration({ ...context, assistantId: undefined })).rejects.toThrow()
    await expect(
        provider.getRuntimeConfiguration({ ...context, actor: { ...context.actor, tenantId: 'other' } })
    ).rejects.toThrow()
    access.assertCanUseXpert.mockRejectedValueOnce(Error('revoked'))
    await expect(provider.getRuntimeConfiguration(context)).rejects.toThrow('revoked')
    expect(editors.update).not.toHaveBeenCalled()
})
