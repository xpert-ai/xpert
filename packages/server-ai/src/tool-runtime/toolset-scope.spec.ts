import { persistedToolsetWhere } from './toolset-scope'

describe('persistedToolsetWhere', () => {
    it('allows an organization-bound MCP principal to use its organization or a tenant-shared toolset', () => {
        expect(
            persistedToolsetWhere({ source: 'mcp', tenantId: 'tenant-1', organizationId: 'organization-1' }, null, [
                'toolset-1'
            ])
        ).toEqual([
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: expect.objectContaining({ _type: 'isNull' })
            }),
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: expect.objectContaining({ _type: 'isNull' }),
                workspaceId: expect.objectContaining({ _type: 'isNull' })
            })
        ])
    })

    it('does not broaden an explicitly tenant-only request to organization toolsets', () => {
        expect(
            persistedToolsetWhere({ source: 'mcp', tenantId: 'tenant-1', organizationId: null }, null, ['toolset-1'])
        ).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: expect.objectContaining({ _type: 'isNull' }),
                workspaceId: expect.objectContaining({ _type: 'isNull' })
            })
        )
    })

    it('keeps non-MCP organization lookups restricted to the exact organization', () => {
        expect(
            persistedToolsetWhere(
                { source: 'agent', tenantId: 'tenant-1', organizationId: 'organization-1' },
                'workspace-1',
                ['toolset-1']
            )
        ).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: 'workspace-1'
            })
        )
    })
})
