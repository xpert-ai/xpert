import { CopilotCheckLimitCommand } from '../check-limit.command'
import { CopilotCheckLimitHandler } from './check-limit.handler'

describe('CopilotCheckLimitHandler', () => {
    it('returns a controlled model error when the configured Copilot no longer exists', async () => {
        const copilotUserService = {
            getUsageSummary: jest.fn()
        }
        const copilotOrganizationService = {
            getUsageSummary: jest.fn()
        }
        const membershipService = {
            assertCanUse: jest.fn()
        }
        const handler = new CopilotCheckLimitHandler(
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            { t: jest.fn().mockResolvedValue('No AI model provided') } as never
        )

        await expect(
            handler.execute(
                new CopilotCheckLimitCommand({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-1',
                    model: 'deepseek-chat'
                })
            )
        ).rejects.toThrow('No AI model provided')
        expect(membershipService.assertCanUse).not.toHaveBeenCalled()
        expect(copilotUserService.getUsageSummary).not.toHaveBeenCalled()
    })

    it('passes xpertId to membership checks while keeping runtime user quota checks', async () => {
        const copilotUserService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const membershipService = {
            assertCanUse: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new CopilotCheckLimitHandler(
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotCheckLimitCommand({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1',
                copilot: {
                    organizationId: 'copilot-org-1',
                    modelProvider: {
                        providerName: 'tongyi'
                    }
                } as never,
                model: 'qwen3.6-plus'
            })
        )

        expect(membershipService.assertCanUse).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            copilotOrganizationId: 'copilot-org-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            provider: 'tongyi',
            model: 'qwen3.6-plus'
        })
        expect(copilotUserService.getUsageSummary).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'copilot-org-1',
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        )
    })

    it('checks membership access for an organization provider with configured credentials', async () => {
        const copilotUserService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const membershipService = {
            assertCanUse: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new CopilotCheckLimitHandler(
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotCheckLimitCommand({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                copilot: {
                    organizationId: 'org-1',
                    modelProvider: {
                        organizationId: 'org-1',
                        providerName: 'deepseek',
                        credentials: { api_key: 'configured' }
                    }
                } as never,
                model: 'deepseek-chat'
            })
        )

        expect(membershipService.assertCanUse).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            copilotOrganizationId: 'org-1',
            userId: 'user-1',
            xpertId: undefined,
            provider: 'deepseek',
            model: 'deepseek-chat'
        })
        expect(copilotUserService.getUsageSummary).toHaveBeenCalled()
        expect(copilotOrganizationService.getUsageSummary).toHaveBeenCalled()
    })
})
