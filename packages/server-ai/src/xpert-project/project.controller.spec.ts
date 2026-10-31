jest.mock('./project.service', () => ({ XpertProjectService: class XpertProjectService {} }))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectWorkspaceFilesService } from './services/project-workspace-files.service'
import { XpertProjectInvitationService } from './services/project-invitation.service'
import { XpertProjectTypeService } from './services/project-type.service'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { VolumeClient } from '../shared/volume'
import { XPERT_PROJECT_PERMISSION } from './guards'
import { XpertProjectController } from './project.controller'
import { XpertProjectService } from './project.service'
import {
    XpertProjectActivityService,
    XpertProjectAssetService,
    XpertProjectAutomationService,
    XpertProjectPlanService
} from './services'
import { XpertProjectAccessService } from './services/project-access.service'
import { XpertProjectContentService } from './services/project-content.service'
import { XpertProjectMembershipService } from './services/project-membership.service'

describe('XpertProjectController collaboration endpoints', () => {
    afterEach(() => jest.restoreAllMocks())

    it('requires Project management access to bind or remove Xperts', () => {
        expect(Reflect.getMetadata(XPERT_PROJECT_PERMISSION, XpertProjectController.prototype.updateXperts)).toBe(
            AIPermissionsEnum.XPERT_PROJECT_MANAGE
        )
        expect(Reflect.getMetadata(XPERT_PROJECT_PERMISSION, XpertProjectController.prototype.removeXpert)).toBe(
            AIPermissionsEnum.XPERT_PROJECT_MANAGE
        )
    })

    it('passes creation seeds to the service and records the complete initialized member count', async () => {
        const project = {
            id: 'project',
            ownerId: 'owner',
            name: 'Project',
            xperts: [{ id: 'root' }, { id: 'child' }, { id: 'leaf' }]
        }
        const service = {
            createProject: jest.fn().mockResolvedValue(project),
            findOne: jest.fn().mockResolvedValue(project),
            addXpert: jest.fn()
        }
        const plans = { ensureDefaults: jest.fn() }
        const activity = { record: jest.fn() }
        const controller = createController(service, {}, {}, {}, plans, activity)
        await expect(controller.create({ name: 'Project', xpertIds: ['root'] })).resolves.toBe(project)
        expect(service.createProject).toHaveBeenCalledWith(expect.objectContaining({ xpertIds: ['root'] }))
        expect(service.addXpert).not.toHaveBeenCalled()
        expect(activity.record).toHaveBeenCalledWith(
            'project',
            expect.objectContaining({
                payload: expect.objectContaining({ xpertCount: 3 })
            })
        )
    })

    it('preserves route and permission metadata on extracted planning endpoints', () => {
        const method = XpertProjectController.prototype.createTask
        expect(Reflect.getMetadata('path', method)).toBe(':id/tasks')
        expect(Reflect.getMetadata(XPERT_PROJECT_PERMISSION, method)).toBe(AIPermissionsEnum.XPERT_PROJECT_EDIT)
    })

    it.each([false, true])('projects list and detail responses using XPERT_VIEW permission (%s)', async (canView) => {
        jest.spyOn(RequestContext, 'hasPermission').mockImplementation(
            (permission) => permission === AIPermissionsEnum.XPERT_VIEW && canView
        )
        const assistant = {
            id: 'assistant',
            name: 'Bid Assistant',
            slug: 'bid',
            graph: { nodes: [{ key: 'private-node' }], connections: [] },
            agent: { prompt: 'private prompt' },
            copilotModel: { model: 'private model' },
            options: { templateSource: { templateId: 'private-template' }, workspaceScope: 'user' }
        }
        const project = {
            id: 'project',
            name: 'Bid project',
            ownerId: 'owner',
            organizationId: 'org',
            status: 'active',
            applicationKey: 'bid',
            projectTypeKey: 'tender',
            settings: { instruction: 'private instruction' },
            copilotModel: { model: 'private model' },
            copilotModelId: 'model-id',
            workspace: { id: 'private-workspace' },
            xperts: [assistant]
        }
        const service = {
            findAvailableForXpert: jest.fn().mockResolvedValue({ items: [project], total: 5 }),
            findAllMy: jest.fn().mockResolvedValue({ items: [project], total: 5 }),
            findOne: jest.fn().mockResolvedValue(project)
        }
        const controller = createController(service)
        const available = await controller.findAvailable('assistant')
        const mine = await controller.findAllMyProjects({ take: 25, skip: 0, order: {}, where: {}, withDeleted: false })
        const detail = await controller.getXpertProject('project')
        expect(available.total).toBe(5)
        expect(mine.total).toBe(5)
        for (const output of [available.items[0], mine.items[0], detail]) {
            expect(output).toMatchObject({
                id: 'project',
                name: 'Bid project',
                ownerId: 'owner',
                organizationId: 'org',
                applicationKey: 'bid',
                projectTypeKey: 'tender',
                xperts: [{ id: 'assistant', name: 'Bid Assistant' }]
            })
            if (canView) {
                expect(output).toMatchObject({ settings: project.settings, copilotModel: project.copilotModel })
                expect(output.xperts[0]).toMatchObject({ graph: assistant.graph, agent: assistant.agent })
            } else {
                for (const key of ['settings', 'copilotModel', 'copilotModelId', 'workspace'])
                    expect(output).not.toHaveProperty(key)
                for (const key of ['graph', 'agent', 'copilotModel', 'options.templateSource'])
                    expect(output.xperts[0]).not.toHaveProperty(key)
            }
        }
        expect(project.settings.instruction).toBe('private instruction')
        expect(assistant.graph.nodes).toEqual([{ key: 'private-node' }])
    })

    it('normalizes the available Project query for the selected Xpert', async () => {
        const service = { findAvailableForXpert: jest.fn().mockResolvedValue({ items: [], total: 0 }) }
        const controller = createController(service)

        await expect(controller.findAvailable('  xpert-1  ', 'active', '-2', '500')).resolves.toEqual({
            items: [],
            total: 0
        })

        expect(service.findAvailableForXpert).toHaveBeenCalledWith({
            xpertId: 'xpert-1',
            filter: { applicationKey: undefined, projectTypeKey: undefined, search: undefined, unclassified: false },
            status: 'active',
            skip: 0,
            take: 100
        })
    })

    it('reports a member as read-only and delegates membership mutations', async () => {
        const accessService = {
            assertCanRead: jest.fn().mockResolvedValue({
                project: { id: 'project-1', status: 'active' },
                role: 'member'
            })
        }
        const membershipService = {
            add: jest.fn().mockResolvedValue({ id: 'membership-1' }),
            updateRole: jest.fn(),
            remove: jest.fn()
        }
        const controller = createController({}, accessService, membershipService)

        await expect(controller.getAccess('project-1')).resolves.toEqual({
            role: 'member',
            capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
        })
        await controller.addMember('project-1', { userId: 'user-2' })
        expect(membershipService.add).toHaveBeenCalledWith('project-1', 'user-2', 'member')
    })

    it('delegates Project instructions and skills to the governed Content service', async () => {
        const contentService = {
            readInstructions: jest.fn().mockResolvedValue({ content: 'Ship safely' }),
            updateInstructions: jest.fn().mockResolvedValue({ content: 'Ship now' }),
            listSkills: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = createController({}, {}, {}, contentService)

        await expect(controller.getInstructions('project-1')).resolves.toEqual({ content: 'Ship safely' })
        await expect(controller.updateInstructions('project-1', { content: 'Ship now' })).resolves.toEqual({
            content: 'Ship now'
        })
        await expect(controller.getProjectSkills('project-1')).resolves.toEqual({ items: [], total: 0 })

        expect(contentService.readInstructions).toHaveBeenCalledWith('project-1')
        expect(contentService.updateInstructions).toHaveBeenCalledWith('project-1', 'Ship now')
        expect(contentService.listSkills).toHaveBeenCalledWith('project-1')
    })
})

function createController(
    service: object,
    accessService: object = {},
    membershipService: object = {},
    contentService: object = {},
    planService: object = {},
    activityService: object = {}
) {
    return new XpertProjectController(
        service as XpertProjectService,
        {} as XpertProjectTypeService,
        {} as CommandBus,
        {} as QueryBus,
        planService as XpertProjectPlanService,
        activityService as XpertProjectActivityService,
        {} as XpertProjectAssetService,
        {} as XpertProjectAutomationService,
        accessService as XpertProjectAccessService,
        contentService as XpertProjectContentService,
        membershipService as XpertProjectMembershipService,
        {} as XpertProjectInvitationService,
        {} as XpertProjectWorkspaceFilesService,
        {} as VolumeClient
    )
}
