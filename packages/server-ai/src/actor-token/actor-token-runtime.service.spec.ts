import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { OutboundActorTokenRequest } from '@xpert-ai/server-core'
import { ActorTokenRuntimeService } from './actor-token-runtime.service'

describe('ActorTokenRuntimeService scope and cache', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
    })
    afterEach(() => jest.restoreAllMocks())

    function fixture() {
        const mint = jest.fn((input: OutboundActorTokenRequest = {}) => ({
            token: 'test-token',
            audience: input.audience ?? 'test',
            expiresAt: new Date(Date.now() + 60_000).toISOString()
        }))
        return { factory: new ActorTokenRuntimeService({ mint } as never), mint }
    }

    it('keeps host-bound claims fixed despite later input mutation or per-call extras', async () => {
        const f = fixture()
        const scope = { executionId: 'execution-1', act: { sub: 'xpert_agent' } }
        const api = f.factory.createScopedApi(scope)
        scope.executionId = 'execution-2'
        scope.act.sub = 'changed'
        await api.getToken({ act: { execution_id: 'forged', sub: 'forged', middleware_name: 'test' } })
        expect(f.mint).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                user: expect.objectContaining({ id: 'user-1' }),
                act: expect.objectContaining({
                    sub: 'xpert_agent',
                    execution_id: 'execution-1',
                    middleware_name: 'test'
                })
            })
        )
    })

    it('does not return a cached token to another caller', async () => {
        const f = fixture()
        const api = f.factory.createScopedApi({})
        await api.getToken()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        await expect(api.getToken()).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.mint).toHaveBeenCalledTimes(1)
    })

    it('rejects mismatched tenant or organization before minting', async () => {
        const f = fixture()
        await expect(f.factory.createScopedApi({ tenantId: 'tenant-2' }).getToken()).rejects.toBeInstanceOf(
            ForbiddenException
        )
        await expect(f.factory.createScopedApi({ organizationId: 'org-2' }).getToken()).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(f.mint).not.toHaveBeenCalled()
    })

    it('does not reuse an organization token after the caller clears its organization context', async () => {
        const f = fixture()
        const api = f.factory.createScopedApi({})
        await api.getToken()
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        await expect(api.getToken()).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.mint).toHaveBeenCalledTimes(1)
    })

    it('separates audiences and refreshes tokens approaching expiry', async () => {
        const f = fixture()
        const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
        const api = f.factory.createScopedApi({})
        await api.getToken({ audience: 'first' })
        await api.getToken({ audience: 'first' })
        expect(f.mint).toHaveBeenCalledTimes(1)
        await api.getToken({ audience: 'second' })
        now.mockReturnValue(1_040_000)
        await api.getToken({ audience: 'second' })
        expect(f.mint).toHaveBeenCalledTimes(3)
    })
})
