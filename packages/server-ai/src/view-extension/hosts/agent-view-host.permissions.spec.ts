import { AIPermissionsEnum, PermissionsEnum, UserType, XpertTypeEnum, type IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { AgentViewHostDefinition } from './agent-view-host.definition'

describe('Assistant View identity and permissions', () => {
    afterEach(() => jest.restoreAllMocks())

    function fixture(type = UserType.USER) {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'human',
            tenantId: 'tenant',
            type,
            role: {
                rolePermissions: [
                    AIPermissionsEnum.XPERT_EDIT,
                    AIPermissionsEnum.XPERT_VIEW,
                    PermissionsEnum.ALL_ORG_EDIT
                ].map((permission) => ({ permission, enabled: true }))
            }
        } as IUser)
        const xpert = {
            id: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace',
            type: XpertTypeEnum.Agent,
            userId: 'assistant-user',
            name: 'review',
            title: 'Review',
            workspace: { name: 'Workspace' },
            organization: { name: 'Organization' }
        }
        const service = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue(xpert),
            assertCanAuthorById: jest.fn().mockResolvedValue(undefined)
        }
        const definition = new AgentViewHostDefinition(
            service as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {
                resolve: jest
                    .fn()
                    .mockResolvedValue({ instanceId: 'assistant', currentId: 'assistant', versionIds: ['assistant'] })
            } as never,
            { resolveInstallation: jest.fn().mockResolvedValue(null) } as never
        )
        return { definition, service }
    }

    it('keeps only identity references in assistant and reuses the display snapshot', async () => {
        const { definition, service } = fixture()
        const result = await definition.resolve('assistant')
        expect(result.context.assistant).toEqual({
            instanceId: 'assistant',
            currentId: 'assistant',
            versionIds: ['assistant'],
            principalUserId: 'assistant-user'
        })
        expect(result.hostSnapshot).toMatchObject({
            name: 'review',
            title: 'Review',
            workspace: { name: 'Workspace' },
            organization: { name: 'Organization' }
        })
        expect(result.context.permissions).toEqual([
            AIPermissionsEnum.XPERT_EDIT,
            AIPermissionsEnum.XPERT_VIEW,
            PermissionsEnum.ALL_ORG_EDIT
        ])
        expect(service.assertCanAuthorById).toHaveBeenCalledWith('assistant', 'workspace')
    })

    it('removes authoring permission from a runtime-only viewer and rechecks revocation', async () => {
        const { definition, service } = fixture()
        expect((await definition.resolve('assistant')).context.permissions).toContain(AIPermissionsEnum.XPERT_EDIT)
        service.assertCanAuthorById.mockRejectedValue(new ForbiddenException())
        const result = await definition.resolve('assistant')
        expect(result.context.permissions).not.toContain(AIPermissionsEnum.XPERT_EDIT)
        expect(result.context.permissions).toContain(AIPermissionsEnum.XPERT_VIEW)
    })

    it('does not give technical accounts authoring or organization management authority', async () => {
        const { definition, service } = fixture(UserType.COMMUNICATION)
        const result = await definition.resolve('assistant')
        expect(result.context.permissions).toEqual([AIPermissionsEnum.XPERT_VIEW])
        expect(service.assertCanAuthorById).not.toHaveBeenCalled()
    })

    it('propagates unexpected authorization failures instead of disguising them as read-only access', async () => {
        const { definition, service } = fixture()
        service.assertCanAuthorById.mockRejectedValue(new Error('database unavailable'))
        await expect(definition.resolve('assistant')).rejects.toThrow('database unavailable')
    })
})
