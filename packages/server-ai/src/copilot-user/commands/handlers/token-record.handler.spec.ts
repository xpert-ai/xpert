import { CopilotGetOneQuery } from '../../../copilot/queries'
import { CopilotTokenRecordCommand } from '../token-record.command'
import { CopilotTokenRecordHandler } from './token-record.handler'

describe('CopilotTokenRecordHandler', () => {
    it('records membership usage with both runtime and copilot source scopes', async () => {
        const copilot = {
            id: 'copilot-1',
            organizationId: 'copilot-org-1',
            tokenBalance: null,
            modelProvider: {
                providerName: 'tongyi'
            }
        }
        const queryBus = {
            execute: jest.fn().mockImplementation(async (query) => {
                if (query instanceof CopilotGetOneQuery) {
                    return copilot
                }
                return null
            })
        }
        const copilotUserService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const membershipService = {
            recordUsage: jest.fn().mockResolvedValue(null)
        }
        const handler = new CopilotTokenRecordHandler(
            queryBus as never,
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotTokenRecordCommand({
                tenantId: 'tenant-1',
                organizationId: 'runtime-org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1',
                model: 'qwen3.6-plus',
                tokenUsed: 100
            })
        )

        expect(copilotUserService.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'runtime-org-1',
                orgId: 'copilot-org-1',
                userId: 'assistant-tech-user'
            })
        )
        expect(membershipService.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'runtime-org-1',
                copilotOrganizationId: 'copilot-org-1',
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                tokenUsed: 100,
                usageHour: expect.any(String)
            })
        )
    })

    it('charges membership points for an organization provider with configured credentials', async () => {
        const copilot = {
            id: 'copilot-1',
            organizationId: 'org-1',
            tokenBalance: null,
            modelProvider: {
                organizationId: 'org-1',
                providerName: 'deepseek',
                credentials: { api_key: 'configured' }
            }
        }
        const queryBus = {
            execute: jest.fn().mockResolvedValue(copilot)
        }
        const copilotUserService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const membershipService = {
            recordUsage: jest.fn().mockResolvedValue(null)
        }
        const handler = new CopilotTokenRecordHandler(
            queryBus as never,
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotTokenRecordCommand({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                copilotId: 'copilot-1',
                model: 'deepseek-chat',
                tokenUsed: 100
            })
        )

        expect(copilotUserService.upsert).toHaveBeenCalled()
        expect(copilotOrganizationService.upsert).toHaveBeenCalled()
        expect(membershipService.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'user-1',
                provider: 'deepseek',
                model: 'deepseek-chat',
                tokenUsed: 100,
                usageHour: expect.any(String),
                copilotId: 'copilot-1'
            })
        )
    })
})
