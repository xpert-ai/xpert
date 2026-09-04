import { ForbiddenException } from '@nestjs/common'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'

describe('ProjectAccessRuntimeService', () => {
    const actor = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }

    it.each(['owner', 'manager', 'editor'] as const)('allows %s to edit an active Project', async (role) => {
        const service = new ProjectAccessRuntimeService({} as never)
        jest.spyOn(service, 'listReadable').mockResolvedValue([
            { projectId: 'project-1', role, canManage: role !== 'editor', archived: false }
        ])

        await expect(service.assertEdit({ actor, projectId: 'project-1' })).resolves.toMatchObject({ role })
    })

    it.each([
        ['member access', { projectId: 'project-1', role: 'member', canManage: false, archived: false }],
        ['an archived Project', { projectId: 'project-1', role: 'owner', canManage: false, archived: true }],
        ['missing access', undefined]
    ])('rejects %s for Project edits', async (_label, access) => {
        const service = new ProjectAccessRuntimeService({} as never)
        jest.spyOn(service, 'listReadable').mockResolvedValue(access ? [access as never] : [])

        await expect(service.assertEdit({ actor, projectId: 'project-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })
})
