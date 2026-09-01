import { resolveToolRuntimeScope } from './workspace-scope'

describe('resolveToolRuntimeScope', () => {
    it('binds two users on one user-scoped Xpert to distinct user-Xpert scopes', () => {
        const userA = resolveToolRuntimeScope({ tenantId: 'tenant-1', userId: 'user-a', xpertId: 'xpert-1' }, 'user')
        const userB = resolveToolRuntimeScope({ tenantId: 'tenant-1', userId: 'user-b', xpertId: 'xpert-1' }, 'user')

        expect(userA).toEqual({
            tenantId: 'tenant-1',
            userId: 'user-a',
            xpertId: 'xpert-1',
            catalog: 'user-xperts',
            scopeId: 'xpert-1',
            isolateByUser: true
        })
        expect(userB).toEqual({
            tenantId: 'tenant-1',
            userId: 'user-b',
            xpertId: 'xpert-1',
            catalog: 'user-xperts',
            scopeId: 'xpert-1',
            isolateByUser: true
        })
    })

    it('binds a shared Xpert to the tenant Xpert catalog', () => {
        expect(
            resolveToolRuntimeScope({ tenantId: 'tenant-1', userId: 'user-1', xpertId: 'xpert-1' }, 'shared')
        ).toEqual({
            tenantId: 'tenant-1',
            userId: 'user-1',
            xpertId: 'xpert-1',
            catalog: 'xperts',
            scopeId: 'xpert-1',
            isolateByUser: false
        })
    })

    it('makes the active Project authoritative over Xpert storage policy and supplied scope fields', () => {
        expect(
            resolveToolRuntimeScope(
                {
                    tenantId: 'tenant-1',
                    userId: 'user-1',
                    projectId: 'project-1',
                    xpertId: 'xpert-1',
                    catalog: 'xperts',
                    scopeId: 'forged-scope',
                    isolateByUser: true
                },
                'user'
            )
        ).toEqual({
            tenantId: 'tenant-1',
            userId: 'user-1',
            projectId: 'project-1',
            xpertId: 'xpert-1',
            catalog: 'projects',
            scopeId: 'project-1',
            isolateByUser: false
        })
    })

    it('rejects a user-scoped Xpert runtime without a user identity', () => {
        expect(() => resolveToolRuntimeScope({ tenantId: 'tenant-1', xpertId: 'xpert-1' }, 'user')).toThrow(
            'userId is required for a user-isolated Xpert workspace'
        )
    })
})
