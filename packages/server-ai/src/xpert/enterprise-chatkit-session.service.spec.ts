import { RequestScopeLevel, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AccountBindingService, IntegrationService, RequestContext, SecretTokenService } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { EnterpriseChatkitSessionService } from './enterprise-chatkit-session.service'

describe('EnterpriseChatkitSessionService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    function createFixture() {
        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-1',
            level: RequestScopeLevel.TENANT,
            organizationId: null
        })
        const xpert = {
            id: 'xpert-1',
            slug: 'sales',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            app: {
                enabled: true,
                channels: {
                    dingtalk: {
                        enabled: true,
                        integrationId: 'integration-1'
                    }
                }
            }
        }
        const integration = {
            id: 'integration-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            provider: 'dingtalk_long',
            options: {
                corpId: 'corp-1'
            }
        }
        const strategy = {
            meta: {
                enterpriseH5: {
                    platform: 'dingtalk',
                    externalIdentityProvider: 'dingtalk',
                    accountBindingProvider: 'dingtalk-sso'
                }
            },
            getIdentityBootstrap: jest.fn().mockResolvedValue({
                platform: 'dingtalk',
                externalOrganizationId: 'corp-1',
                clientConfig: {
                    corpId: 'corp-1'
                }
            }),
            exchangeIdentity: jest.fn().mockResolvedValue({
                provider: 'dingtalk',
                externalOrganizationId: 'corp-1',
                subjectId: 'employee-1',
                displayName: 'Employee One',
                accountBinding: {
                    provider: 'dingtalk-sso',
                    subjectId: 'union-1'
                }
            })
        }
        const queryBuilder = {
            select: jest.fn(),
            from: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            getRawOne: jest.fn().mockResolvedValue(xpert)
        }
        queryBuilder.select.mockReturnValue(queryBuilder)
        queryBuilder.from.mockReturnValue(queryBuilder)
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const dataSource = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        }
        const integrationService = {
            findOneByIdWithinTenant: jest.fn().mockResolvedValue(integration),
            getIntegrationStrategy: jest.fn().mockReturnValue(strategy)
        }
        const accountBindingService = {
            resolveUser: jest.fn().mockResolvedValue({ id: 'xpert-user-1' })
        }
        const secretTokenService = {
            create: jest.fn().mockResolvedValue(undefined)
        }
        const service = new EnterpriseChatkitSessionService(
            dataSource as unknown as DataSource,
            integrationService as unknown as IntegrationService,
            accountBindingService as unknown as AccountBindingService,
            secretTokenService as unknown as SecretTokenService
        )

        return {
            service,
            xpert,
            queryBuilder,
            integration,
            strategy,
            integrationService,
            accountBindingService,
            secretTokenService
        }
    }

    it('returns the platform bootstrap and public assistant metadata needed by the H5 client', async () => {
        const { service, queryBuilder } = createFixture()

        await expect(service.getBootstrap('sales', 'dingtalk')).resolves.toMatchObject({
            xpert: { id: 'xpert-1' },
            platform: 'dingtalk',
            clientConfig: {
                corpId: 'corp-1'
            }
        })
        expect(queryBuilder.where).toHaveBeenCalledWith('xpert.slug = :identifier', { identifier: 'sales' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('xpert."tenantId" = :tenantId', {
            tenantId: 'tenant-1'
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('xpert.latest = true')
    })

    it('does not expose an assistant whose requested enterprise H5 channel is disabled', async () => {
        const { service, xpert } = createFixture()
        xpert.app.channels.dingtalk.enabled = false

        await expect(service.getBootstrap('sales', 'dingtalk')).rejects.toThrow()
    })

    it('exchanges the one-time code and creates a single-assistant enterprise client secret', async () => {
        const { service, strategy, integrationService, accountBindingService, secretTokenService } = createFixture()

        const result = await service.createSession('sales', 'dingtalk', {
            grant: {
                type: 'authorization_code',
                code: 'auth-code-1'
            }
        })

        expect(integrationService.getIntegrationStrategy).toHaveBeenCalledWith('dingtalk_long', 'org-1')
        expect(integrationService.findOneByIdWithinTenant).toHaveBeenCalledTimes(1)
        expect(strategy.exchangeIdentity).toHaveBeenCalledWith(expect.objectContaining({ id: 'integration-1' }), {
            type: 'authorization_code',
            code: 'auth-code-1'
        })
        expect(accountBindingService.resolveUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            provider: 'dingtalk-sso',
            subjectId: 'union-1'
        })
        expect(secretTokenService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                entityId: 'xpert-1',
                type: SecretTokenBindingType.ENTERPRISE_XPERT,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                createdById: 'xpert-user-1',
                enterpriseH5Scope: {
                    platform: 'dingtalk',
                    integrationId: 'integration-1'
                }
            })
        )
        expect(result).toMatchObject({
            expires_after: 600,
            xpertId: 'xpert-1',
            assistantId: 'xpert-1',
            organizationId: 'org-1'
        })
        expect(result.client_secret).toMatch(/^cs-x-/)
    })

    it('uses the formally bound Xpert user when the DingTalk identity exposes an SSO binding identity', async () => {
        const { service, strategy, accountBindingService, secretTokenService } = createFixture()
        strategy.exchangeIdentity.mockResolvedValue({
            provider: 'dingtalk',
            externalOrganizationId: 'corp-1',
            subjectId: 'employee-1',
            displayName: 'Employee One',
            accountBinding: {
                provider: 'dingtalk-sso',
                subjectId: 'union-1'
            }
        })
        accountBindingService.resolveUser.mockResolvedValue({ id: 'xpert-user-1' })

        await service.createSession('sales', 'dingtalk', {
            grant: { type: 'authorization_code', code: 'auth-code-1' }
        })

        expect(accountBindingService.resolveUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            provider: 'dingtalk-sso',
            subjectId: 'union-1'
        })
        expect(secretTokenService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                createdById: 'xpert-user-1'
            })
        )
    })

    it('requires DingTalk SSO binding before issuing an enterprise client secret', async () => {
        const { service, strategy, accountBindingService, secretTokenService } = createFixture()
        strategy.exchangeIdentity.mockResolvedValue({
            provider: 'dingtalk',
            externalOrganizationId: 'corp-1',
            subjectId: 'employee-1',
            displayName: 'Employee One',
            accountBinding: {
                provider: 'dingtalk-sso',
                subjectId: 'union-1'
            }
        })

        accountBindingService.resolveUser.mockResolvedValue(null)

        await expect(
            service.createSession('sales', 'dingtalk', {
                grant: { type: 'authorization_code', code: 'auth-code-1' }
            })
        ).resolves.toEqual({
            status: 'account_binding_required',
            accountBindingProvider: 'dingtalk-sso'
        })

        expect(accountBindingService.resolveUser).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            provider: 'dingtalk-sso',
            subjectId: 'union-1'
        })
        expect(secretTokenService.create).not.toHaveBeenCalled()
    })

    it('rejects an account binding identity from another provider', async () => {
        const { service, strategy, accountBindingService, secretTokenService } = createFixture()
        strategy.exchangeIdentity.mockResolvedValue({
            provider: 'dingtalk',
            externalOrganizationId: 'corp-1',
            subjectId: 'employee-1',
            accountBinding: {
                provider: 'github-sso',
                subjectId: 'github-user-1'
            }
        })

        await expect(
            service.createSession('sales', 'dingtalk', {
                grant: { type: 'authorization_code', code: 'auth-code-1' }
            })
        ).rejects.toThrow(UnauthorizedException)
        expect(accountBindingService.resolveUser).not.toHaveBeenCalled()
        expect(secretTokenService.create).not.toHaveBeenCalled()
    })

    it('rejects an integration from another Xpert organization', async () => {
        const { service, integration } = createFixture()
        integration.organizationId = 'org-other'

        await expect(service.getBootstrap('sales', 'dingtalk')).rejects.toThrow(ForbiddenException)
    })

    it('rejects an integration that does not declare the requested enterprise H5 platform', async () => {
        const { service, strategy } = createFixture()
        strategy.meta.enterpriseH5.platform = 'lark'

        await expect(service.getBootstrap('sales', 'dingtalk')).rejects.toThrow(ForbiddenException)
        expect(strategy.getIdentityBootstrap).not.toHaveBeenCalled()
    })

    it('rejects an identity returned for another DingTalk enterprise', async () => {
        const { service, strategy, secretTokenService } = createFixture()
        strategy.exchangeIdentity.mockResolvedValue({
            provider: 'dingtalk',
            externalOrganizationId: 'corp-other',
            subjectId: 'employee-1'
        })

        await expect(
            service.createSession('sales', 'dingtalk', {
                grant: { type: 'authorization_code', code: 'auth-code-1' }
            })
        ).rejects.toThrow(UnauthorizedException)
        expect(secretTokenService.create).not.toHaveBeenCalled()
    })
})
