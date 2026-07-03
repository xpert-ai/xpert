jest.mock('../../utils/context-size', () => ({
    ensureCopilotModelContextSize: jest.fn()
}))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand } from '../../../copilot-user'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetChatModelHandler } from './get-chat-model.handler'

describe('CopilotModelGetChatModelHandler', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('includes xpertId when pre-checking copilot limits', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('assistant-tech-user')

        const commandBus = {
            execute: jest.fn().mockResolvedValue(undefined)
        }
        const getModelInstance = jest.fn().mockReturnValue({ invoke: jest.fn() })
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query instanceof GetCopilotProviderModelQuery) {
                    return []
                }
                if (query instanceof AIModelGetProviderQuery) {
                    return {
                        name: 'tongyi',
                        getModelInstance
                    }
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new CopilotModelGetChatModelHandler(
            commandBus as never,
            queryBus as never,
            { t: jest.fn().mockReturnValue('not found') } as never
        )

        await handler.execute(
            new CopilotModelGetChatModelQuery(
                {
                    id: 'copilot-1',
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'tongyi'
                    }
                } as never,
                {
                    copilotId: 'copilot-1',
                    model: 'qwen3.6-plus',
                    modelType: 'llm'
                } as never,
                {
                    usageCallback: jest.fn(),
                    xpertId: 'xpert-1',
                    threadId: 'thread-1'
                }
            )
        )

        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CopilotCheckLimitCommand))
        const checkCommand = commandBus.execute.mock.calls[0][0] as CopilotCheckLimitCommand
        expect(checkCommand.input).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            model: 'qwen3.6-plus'
        })
    })
})
