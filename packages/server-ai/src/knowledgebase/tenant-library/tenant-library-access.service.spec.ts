import { ForbiddenException } from '@nestjs/common'
import { KnowledgebasePermission, RolesEnum, type IUser } from '@xpert-ai/contracts'
import { RequestContext, runWithRequestContext } from '@xpert-ai/plugin-sdk'
import { IsNull, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { TenantLibraryAccessService, assertTenantLibraryAdministrator } from './tenant-library-access.service'

function context<T>(role: RolesEnum, scope: 'tenant' | 'organization', action: () => Promise<T>) {
    const user = { id: 'user-1', tenantId: 'tenant-1', role: { name: role } } as IUser
    const headers = { 'x-scope-level': scope, ...(scope === 'organization' ? { 'organization-id': 'org-1' } : {}) }
    return new Promise<T>((resolve, reject) =>
        runWithRequestContext({ user, headers }, {}, () => {
            action().then(resolve, reject)
        })
    )
}

describe('Tenant library explicit scope and access', () => {
    it('requires an authenticated super administrator already in tenant scope', async () => {
        await context(RolesEnum.SUPER_ADMIN, 'tenant', async () => {
            expect(() => assertTenantLibraryAdministrator()).not.toThrow()
            expect(RequestContext.getOrganizationId()).toBeNull()
        })
        await context(RolesEnum.ADMIN, 'tenant', async () => {
            expect(() => assertTenantLibraryAdministrator()).toThrow(ForbiddenException)
        })
        expect(() => assertTenantLibraryAdministrator()).toThrow(ForbiddenException)
    })

    it('rejects a super administrator in organization scope without changing the request', async () => {
        await context(RolesEnum.SUPER_ADMIN, 'organization', async () => {
            const request = RequestContext.currentRequest()
            expect(() => assertTenantLibraryAdministrator()).toThrow(ForbiddenException)
            expect(RequestContext.currentRequest()).toBe(request)
            expect(RequestContext.getScope()).toEqual({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                level: 'organization'
            })
        })
    })

    it('reads shared libraries in the current tenant without switching organization scope', async () => {
        const findOne = jest.fn().mockResolvedValue({ id: 'shared' })
        const find = jest.fn().mockResolvedValue([{ id: 'shared' }])
        const service = new TenantLibraryAccessService(
            Object.assign(new Repository<Knowledgebase>(Knowledgebase, null), { findOne, find })
        )
        await context(RolesEnum.AI_BUILDER, 'organization', async () => {
            const request = RequestContext.currentRequest()
            await expect(
                service.find('shared', { select: { id: true }, where: { tenantId: 'other-tenant' } })
            ).resolves.toEqual({ id: 'shared' })
            const boundary = {
                tenantId: 'tenant-1',
                organizationId: IsNull(),
                workspaceId: IsNull(),
                permission: KnowledgebasePermission.Public
            }
            expect(findOne).toHaveBeenCalledWith({ select: { id: true }, where: [{ ...boundary, id: 'shared' }] })
            await expect(service.list()).resolves.toEqual([{ id: 'shared' }])
            expect(find).toHaveBeenCalledWith({ where: boundary, order: { updatedAt: 'DESC' }, take: 500 })
            expect(RequestContext.currentRequest()).toBe(request)
            expect(RequestContext.getOrganizationId()).toBe('org-1')
            findOne.mockRejectedValueOnce(Error('database unavailable'))
            await expect(service.find('shared')).rejects.toThrow('database unavailable')
            expect(RequestContext.getOrganizationId()).toBe('org-1')
        })
    })

    it('rejects organization-scope provisioning before acquiring a lock or executing work', async () => {
        const service = new TenantLibraryAccessService(new Repository<Knowledgebase>(Knowledgebase, null))
        const action = jest.fn()
        await context(RolesEnum.SUPER_ADMIN, 'organization', async () => {
            await expect(service.withProvisioningLock('images', action)).rejects.toBeInstanceOf(ForbiddenException)
            expect(action).not.toHaveBeenCalled()
        })
    })
})
