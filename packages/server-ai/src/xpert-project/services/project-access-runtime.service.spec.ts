import { noAssistantPrincipal } from '../../xpert/assistant-principal/testing/no-assistant-principal.fixture'
import { ForbiddenException } from '@nestjs/common'
import { ProjectAccessRuntimeService } from './project-access-runtime.service'

describe('ProjectAccessRuntimeService', () => {
    const actor = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }

    it.each(['owner', 'manager', 'editor'] as const)('allows %s to edit an active Project', async (role) => {
        const service = new ProjectAccessRuntimeService({} as never, {} as never, noAssistantPrincipal)
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
        const service = new ProjectAccessRuntimeService({} as never, {} as never, noAssistantPrincipal)
        jest.spyOn(service, 'listReadable').mockResolvedValue(access ? [access as never] : [])

        await expect(service.assertEdit({ actor, projectId: 'project-1' })).rejects.toBeInstanceOf(ForbiddenException)
    })
})

describe('installation bindings on managed projects', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'manager' }
    const project = {
        projectId: 'project',
        archived: false,
        role: 'owner' as const,
        canManage: true,
        applicationKey: '@vendor/plugin:orders'
    }
    function managedProject() {
        const findOne = jest.fn()
        const service = new ProjectAccessRuntimeService(
            { manager: { getRepository: () => ({ findOne }) } } as never,
            {} as never,
            noAssistantPrincipal
        )
        jest.spyOn(service, 'listReadable').mockImplementation(async () => [{ ...project }])
        return { service, findOne, request: { actor, projectId: project.projectId, includeApplicationBindings: true } }
    }

    it.each(['initializing', 'degraded', 'failed'])(
        'distinguishes %s from missing business settings only when bindings are requested',
        async (status) => {
            const { service, findOne, request } = managedProject()
            findOne.mockResolvedValue({ status, errorCode: 'resource_missing' })
            await expect(service.assertManage({ actor, projectId: project.projectId })).resolves.toEqual(project)
            expect(findOne).not.toHaveBeenCalled()
            await expect(service.assertManage(request)).rejects.toMatchObject({
                status: 409,
                response: {
                    errorCode: 'organization_application_installation_not_ready',
                    installationStatus: status,
                    reason: 'resource_missing'
                }
            })
        }
    )

    it('keeps the published roles on an older ready installation with no saved settings', async () => {
        const { service, findOne, request } = managedProject()
        findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
            status: 'ready',
            xpertId: 'coordinator',
            resourceRefs: { 'role:capability': 'maintenance' }
        })
        await expect(service.assertManage(request)).resolves.toEqual(project)
        await expect(service.assertManage(request)).resolves.toMatchObject({
            applicationBindings: {
                coordinatorId: 'coordinator',
                roles: { capability: 'maintenance' },
                settings: { revision: 0, members: {}, queries: {} }
            }
        })
    })

    it('uses the exact organization and application of the authorized project and only returns role references', async () => {
        const actor = { tenantId: 'tenant', organizationId: 'org-b', userId: 'manager' }
        const settings = { revision: 2, members: {}, queries: {} }
        const findOne = jest.fn().mockResolvedValue({
            status: 'ready',
            xpertId: 'coordinator-b',
            resourceRefs: { 'role:contract': 'contract-b', workspace: 'hidden' },
            organizationSettings: settings
        })
        const service = new ProjectAccessRuntimeService(
            { manager: { getRepository: () => ({ findOne }) } } as never,
            {} as never,
            noAssistantPrincipal
        )
        const readable = jest.spyOn(service, 'listReadable').mockResolvedValue([
            {
                projectId: 'project-b',
                archived: false,
                role: 'owner',
                canManage: true,
                applicationKey: '@vendor/plugin:orders'
            }
        ])
        await expect(
            service.assertManage({ actor, projectId: 'project-b', includeApplicationBindings: true })
        ).resolves.toMatchObject({
            applicationBindings: { coordinatorId: 'coordinator-b', roles: { contract: 'contract-b' }, settings }
        })
        expect(findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    tenantId: 'tenant',
                    organizationId: 'org-b',
                    scopeKey: 'org-b',
                    declaredScope: 'organization',
                    pluginName: '@vendor/plugin',
                    appName: 'orders'
                }
            })
        )
        readable.mockResolvedValue([])
        await expect(
            service.assertManage({ actor, projectId: 'project-a', includeApplicationBindings: true })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(findOne).toHaveBeenCalledTimes(1)
    })
})
