jest.mock('../../utils/context-size', () => ({
    ensureCopilotModelContextSize: jest.fn()
}))

import { HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, FetchFrom, ModelFeature } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand } from '../../../copilot-user'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetChatModelHandler } from './get-chat-model.handler'
import { prepareMessagesForModel } from '../../model-capabilities'

describe('CopilotModelGetChatModelHandler', () => {
    function createFixture(features: ModelFeature[] = []) {
        const commandBus = {
            execute: jest.fn().mockResolvedValue(undefined)
        }
        const model = { invoke: jest.fn() }
        const getModelInstance = jest.fn().mockReturnValue(model)
        const getProviderModels = jest.fn().mockReturnValue([
            {
                model: 'qwen3.6-plus',
                model_type: AiModelTypeEnum.LLM,
                fetch_from: FetchFrom.PREDEFINED_MODEL,
                model_properties: {},
                features,
                label: { en_US: 'qwen3.6-plus', zh_Hans: 'qwen3.6-plus' }
            }
        ])
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query instanceof GetCopilotProviderModelQuery) {
                    return []
                }
                if (query instanceof AIModelGetProviderQuery) {
                    return {
                        name: 'tongyi',
                        getModelInstance,
                        getProviderModels
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
        const query = new CopilotModelGetChatModelQuery(
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

        return { commandBus, handler, model, query }
    }

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('assistant-tech-user')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('includes xpertId when pre-checking copilot limits', async () => {
        const { commandBus, handler, query } = createFixture()

        await handler.execute(query)

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

    it('marks predefined vision models', async () => {
        const { handler, model, query } = createFixture([ModelFeature.VISION])

        await handler.execute(query)

        const messages = [
            new HumanMessage({
                content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }]
            })
        ]
        expect(prepareMessagesForModel(messages, model)).toBe(messages)
    })
})
