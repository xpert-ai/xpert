import { PermissionsEnum } from '@xpert-ai/contracts'
import { PERMISSIONS_METADATA } from '@xpert-ai/server-common'
import { BadRequestException } from '@nestjs/common'
import {
    XpertProjectAdminInterventionDTO,
    createProjectAdminInterventionValidationPipe
} from './dto/project-admin-intervention.dto'
import { XpertProjectAdminController } from './project-admin.controller'
import { XpertProjectMembershipService } from './services/project-membership.service'

describe('XpertProjectAdminController', () => {
    it('exposes intervention only behind Organization user administration permissions', () => {
        expect(Reflect.getMetadata(PERMISSIONS_METADATA, XpertProjectAdminController)).toEqual([
            PermissionsEnum.ORG_USERS_EDIT,
            PermissionsEnum.ALL_ORG_EDIT
        ])
    })

    it('delegates the explicit reason to the audited membership operation', async () => {
        const membershipService = {
            interveneAsOrganizationAdministrator: jest.fn().mockResolvedValue({
                projectId: 'project-1',
                userId: 'admin-1',
                role: 'manager'
            })
        }
        const controller = new XpertProjectAdminController(
            membershipService as unknown as XpertProjectMembershipService
        )

        await expect(controller.intervene('project-1', { reason: 'Support case' })).resolves.toMatchObject({
            role: 'manager'
        })
        expect(membershipService.interveneAsOrganizationAdministrator).toHaveBeenCalledWith('project-1', 'Support case')
    })

    it('rejects an empty intervention reason at the HTTP boundary', async () => {
        const pipe = createProjectAdminInterventionValidationPipe()

        await expect(
            pipe.transform(
                { reason: '   ' },
                { type: 'body', metatype: XpertProjectAdminInterventionDTO, data: undefined }
            )
        ).rejects.toBeInstanceOf(BadRequestException)
    })
})
