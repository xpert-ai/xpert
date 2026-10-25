import { RolesEnum, getPluginApplicationScopes, PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { ApplicationAccessService } from './application-access.service'
import { applicationInstallationIdentity, applicationInitializationAccess } from './application-scope'
import { applicationScopeQuerySchema } from './application-scope.schema'

const application = (scope: 'personal' | 'organization'): PluginTemplateApplicationSummary => ({
    id: '@test/app:example',
    pluginName: '@test/app',
    appName: 'example',
    displayName: 'Example',
    scope,
    assistantTemplateKey: 'assistant',
    config: {
        scope: ['organization', 'personal'],
        assistantTemplateKey: 'assistant',
        workspace: { mode: 'dedicated', name: 'Example' }
    }
})

describe('App installation scope and authorization', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('alice')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.VIEWER } } as never)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
    })
    afterEach(() => jest.restoreAllMocks())

    it('normalizes legacy and multiple declarations without introducing another metadata field', () => {
        expect(getPluginApplicationScopes('organization')).toEqual(['organization'])
        expect(getPluginApplicationScopes(['personal', 'organization', 'personal'])).toEqual([
            'personal',
            'organization'
        ])
        for (const invalid of [[], null, {}, 'unknown', ['personal', 'unknown']])
            expect(getPluginApplicationScopes(invalid)).toEqual([])
    })

    it('preserves the legacy organization key and isolates members and organizations', () => {
        expect(applicationInstallationIdentity(application('organization')).scopeKey).toBe('org')
        const alice = applicationInstallationIdentity(application('personal'))
        expect(alice).toMatchObject({
            tenantId: 'tenant',
            organizationId: 'org',
            ownerUserId: 'alice',
            scopeKey: 'personal:org:alice'
        })
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('bob')
        expect(applicationInstallationIdentity(application('personal')).scopeKey).toBe('personal:org:bob')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('another-org')
        expect(applicationInstallationIdentity(application('personal')).scopeKey).toBe('personal:another-org:bob')
    })

    it('does not allow selecting a scope absent from the trusted declaration', () => {
        const app = application('personal')
        app.config.scope = 'organization'
        expect(applicationInitializationAccess(app)).toBe('unsupported')
    })

    it('accepts only a scalar selector, rejecting owner spoofing and extra fields', () => {
        expect(applicationScopeQuerySchema.safeParse({ installationScope: 'personal' }).success).toBe(true)
        for (const value of [
            { installationScope: ['personal'] },
            { ownerUserId: 'alice' },
            { scope: 'personal' },
            { tenantId: 'other' }
        ])
            expect(applicationScopeQuerySchema.safeParse(value).success).toBe(false)
    })

    async function access(role = RolesEnum.VIEWER) {
        const execute = jest.fn().mockResolvedValue({ id: 'alice', role: { name: role } })
        const module = await Test.createTestingModule({
            providers: [ApplicationAccessService, { provide: CommandBus, useValue: { execute } }]
        }).compile()
        return { service: module.get(ApplicationAccessService), execute }
    }

    it('allows an active ordinary member to manage their own installation but not an organization installation', async () => {
        const { service, execute } = await access()
        await expect(service.assertCanInitialize(application('personal'))).resolves.toBeUndefined()
        await expect(service.assertCanInitialize(application('organization'))).rejects.toThrow(ForbiddenException)
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ input: expect.objectContaining({ userId: 'alice' }) })
        )
    })

    it('rechecks active membership even for admins and refuses revoked membership', async () => {
        const { service, execute } = await access(RolesEnum.ADMIN)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as never)
        await expect(service.assertCanInitialize(application('organization'))).resolves.toBeUndefined()
        execute.mockResolvedValue(null)
        await expect(service.assertCanInitialize(application('personal'))).rejects.toThrow(ForbiddenException)
        await expect(service.assertMembership()).rejects.toThrow(ForbiddenException)
    })

    it('does not trust stale admin roles or API principals for personal ownership', async () => {
        const { service, execute } = await access()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as never)
        await expect(service.assertCanInitialize(application('organization'))).rejects.toThrow(ForbiddenException)
        execute.mockClear()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({ id: 'key' } as never)
        await expect(service.assertCanInitialize(application('personal'))).rejects.toThrow(ForbiddenException)
        expect(execute).not.toHaveBeenCalled()
    })
})
