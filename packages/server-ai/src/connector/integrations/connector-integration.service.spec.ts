import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ConnectorIntegrationService } from './connector-integration.service'

const definition = {
    provider: 'github',
    label: 'GitHub',
    authMethods: [
        {
            id: 'oauth',
            type: 'oauth2' as const,
            label: 'OAuth',
            appCredentials: { integration: { provider: 'github', fields: [] } }
        }
    ]
}
describe('Connector integration selection', () => {
    const bindings = { findOne: jest.fn(), update: jest.fn() }
    const workspaces = { assertCanRead: jest.fn(), assertCanManage: jest.fn() }
    const providers = { getRuntime: jest.fn() }
    const applications = { list: jest.fn(), select: jest.fn(), create: jest.fn() }
    const service = new ConnectorIntegrationService(bindings, workspaces, providers, applications)
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        bindings.findOne.mockResolvedValue({
            id: 'binding',
            tenantId: 'tenant',
            organizationId: null,
            workspaceId: 'workspace',
            scopeType: 'workspace',
            authorizationMode: 'shared',
            provider: 'github',
            status: 'error'
        })
        bindings.update.mockResolvedValue({ affected: 1 })
        workspaces.assertCanRead.mockResolvedValue({ workspace: { organizationId: null } })
        workspaces.assertCanManage.mockResolvedValue({ workspace: { organizationId: null } })
        providers.getRuntime.mockResolvedValue({ definition })
        applications.select.mockResolvedValue({ id: 'app', name: 'Application', organizationId: null })
    })
    afterEach(() => jest.restoreAllMocks())

    it('remembers a selected app before starting OAuth, including after an earlier connection error', async () => {
        expect(
            await service.prepare('binding', {
                authMethodId: 'oauth',
                selection: { type: 'existing', integrationId: 'app' }
            })
        ).toEqual({ id: 'app', name: 'Application', organizationId: null })
        expect(bindings.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'binding', tenantId: 'tenant', status: 'error' }),
            expect.objectContaining({ appIntegrationId: 'app' })
        )
    })

    it('rejects inaccessible workspace bindings before selecting an integration', async () => {
        workspaces.assertCanManage.mockRejectedValue(new Error('Forbidden'))
        await expect(
            service.prepare('binding', { authMethodId: 'oauth', selection: { type: 'existing', integrationId: 'app' } })
        ).rejects.toThrow('Forbidden')
        expect(applications.select).not.toHaveBeenCalled()
    })

    it('does not replace application configuration during an in-flight OAuth attempt', async () => {
        bindings.findOne.mockResolvedValue({
            id: 'binding',
            tenantId: 'tenant',
            workspaceId: 'workspace',
            provider: 'github',
            status: 'pending'
        })
        await expect(
            service.prepare('binding', { authMethodId: 'oauth', selection: { type: 'existing', integrationId: 'app' } })
        ).rejects.toThrow()
        expect(bindings.update).not.toHaveBeenCalled()
    })
})
