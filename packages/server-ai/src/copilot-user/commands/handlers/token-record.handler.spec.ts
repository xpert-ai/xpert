import { CopilotGetOneQuery } from '../../../copilot/queries'
import { CopilotTokenRecordCommand } from '../token-record.command'
import { CopilotTokenRecordHandler } from './token-record.handler'

describe('CopilotTokenRecordHandler', () => {
    it('records membership usage in the copilot source scope, not the runtime organization scope', async () => {
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
                organizationId: 'copilot-org-1',
                userId: 'assistant-tech-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                tokenUsed: 100
            })
        )
    })
})
