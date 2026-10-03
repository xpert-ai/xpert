import { In } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ModelExecutionSessionController } from './execution-session.controller'

describe('explicit execution authorization revocation', () => {
    afterEach(() => jest.restoreAllMocks())

    function setup() {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const grants = { update: jest.fn().mockResolvedValue({ affected: 2 }) }
        return { grants, controller: new ModelExecutionSessionController(grants as never) }
    }

    it('revokes only the logged-in user’s pending and active grants across their organizations', async () => {
        const { grants, controller } = setup()
        await expect(controller.revokeMine()).resolves.toEqual({ revoked: true })
        expect(grants.update).toHaveBeenCalledWith(
            { tenantId: 'tenant', ownerId: 'user', status: In(['pending', 'active']) },
            { status: 'revoked' }
        )
    })

    it.each(['tenant', 'user', 'delegated'] as const)('rejects missing or delegated identity: %s', async (kind) => {
        const { grants, controller } = setup()
        if (kind === 'tenant') jest.mocked(RequestContext.currentTenantId).mockReturnValue(undefined)
        if (kind === 'user') jest.mocked(RequestContext.currentUserId).mockReturnValue(undefined)
        if (kind === 'delegated')
            jest.mocked(RequestContext.currentApiPrincipal).mockReturnValue({ principalType: 'client_secret' } as never)
        await expect(controller.revokeMine()).rejects.toThrow()
        expect(grants.update).not.toHaveBeenCalled()
    })

    it('does not report success when persistence fails', async () => {
        const { grants, controller } = setup()
        grants.update.mockRejectedValue(new Error('database unavailable'))
        await expect(controller.revokeMine()).rejects.toThrow('database unavailable')
    })
})
