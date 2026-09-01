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
import { XpertProjectMembershipService } from './services/project-membership.service'

describe('XpertProjectController collaboration endpoints', () => {
    it('requires Project management access to bind or remove Xperts', () => {
        expect(Reflect.getMetadata(XPERT_PROJECT_PERMISSION, XpertProjectController.prototype.updateXperts)).toBe(
            AIPermissionsEnum.XPERT_PROJECT_MANAGE
        )
        expect(Reflect.getMetadata(XPERT_PROJECT_PERMISSION, XpertProjectController.prototype.removeXpert)).toBe(
            AIPermissionsEnum.XPERT_PROJECT_MANAGE
        )
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
})

function createController(
    service: object,
    accessService: object = {},
    membershipService: object = {}
) {
    return new XpertProjectController(
        service as XpertProjectService,
        {} as CommandBus,
        {} as QueryBus,
        {} as XpertProjectPlanService,
        {} as XpertProjectActivityService,
        {} as XpertProjectAssetService,
        {} as XpertProjectAutomationService,
        accessService as XpertProjectAccessService,
        membershipService as XpertProjectMembershipService,
        {} as VolumeClient
    )
}
