import { RequestContext, runWithRequestContext } from '@xpert-ai/plugin-sdk'
import { applyPluginResourceOrganizationScope } from './plugin-resource-installation-scope'

describe('plugin installation scope', () => {
    it('rejects missing scope before issuing any query', () => {
        const query = { andWhere: jest.fn() }
        runWithRequestContext({ headers: {} }, {}, () => {
            expect(() => applyPluginResourceOrganizationScope(query as never, 'installation')).toThrow(
                'A tenant scope is required'
            )
        })
        expect(query.andWhere).not.toHaveBeenCalled()
    })

    it('retains the restored tenant without a signed-in user during bootstrap', () => {
        const query = { andWhere: jest.fn() }
        runWithRequestContext({ headers: { 'tenant-id': 'tenant-1', 'x-scope-level': 'tenant' } }, {}, () => {
            expect(RequestContext.currentUser()).toBeNull()
            expect(RequestContext.currentTenantId()).toBeNull()
            applyPluginResourceOrganizationScope(query as never, 'installation')
        })
        expect(query.andWhere.mock.calls).toEqual([
            ['installation.tenantId = :installationTenantId', { installationTenantId: 'tenant-1' }],
            ['installation.organizationId IS NULL']
        ])
    })

    it('keeps an organization-bound installation inside its restored tenant and organization', () => {
        const query = { andWhere: jest.fn() }
        runWithRequestContext({ headers: { 'tenant-id': 'tenant-2', 'organization-id': 'org-2' } }, {}, () => {
            applyPluginResourceOrganizationScope(query as never, 'installation')
        })
        expect(query.andWhere.mock.calls).toEqual([
            ['installation.tenantId = :installationTenantId', { installationTenantId: 'tenant-2' }],
            ['installation.organizationId = :installationOrganizationId', { installationOrganizationId: 'org-2' }]
        ])
    })
})
