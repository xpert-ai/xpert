jest.mock('../../utils/context-size', () => ({
    ensureCopilotModelContextSize: jest.fn()
}))

import { HumanMessage } from '@langchain/core/messages'
import {
    AiModelTypeEnum,
    FetchFrom,
    IModelAccessResolution,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum,
    ModelFeature
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand, CopilotTokenRecordCommand } from '../../../copilot-user'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetChatModelHandler } from './get-chat-model.handler'
import { prepareMessagesForModel } from '../../model-capabilities'

describe('CopilotModelGetChatModelHandler', () => {
    function createFixture(features: ModelFeature[] = [], modelType = AiModelTypeEnum.LLM) {
        const modelAccess: IModelAccessResolution = {
            allowed: true,
            channel: ModelAccessChannelEnum.Xpert,
            billableUserId: 'creator-user',
            copilotId: 'copilot-1',
            copilotModelId: 'qwen3.6-plus',
            provider: 'tongyi',
            modelType,
            model: 'qwen3.6-plus',
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Tenant
        }
        const commandBus = {
            execute: jest.fn().mockImplementation(async (command) => {
                if (command instanceof CopilotCheckLimitCommand) {
                    return modelAccess
                }
                return undefined
            })
        }
        const model = { invoke: jest.fn() }
        const getModelInstance = jest.fn().mockReturnValue(model)
        const getProviderModels = jest.fn().mockReturnValue([
            {
                model: 'qwen3.6-plus',
                model_type: modelType,
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
        const modelAccessCallback = jest.fn()
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
                modelType
            } as never,
            {
                usageCallback: jest.fn(),
                modelAccessCallback,
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            }
        )

        return { commandBus, getModelInstance, handler, model, modelAccess, modelAccessCallback, query }
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
            model: 'qwen3.6-plus',
            modelType: AiModelTypeEnum.LLM
        })
    })

    it('reuses the call-start authorization snapshot when recording usage', async () => {
        const { commandBus, getModelInstance, handler, modelAccess, modelAccessCallback, query } = createFixture()

        await handler.execute(query)
        expect(modelAccessCallback).toHaveBeenCalledWith(modelAccess)
        const modelOptions = getModelInstance.mock.calls[0][2]
        await modelOptions.handleLLMTokens({
            model: 'qwen3.6-plus',
            usage: { totalTokens: 120 }
        })

        const recordCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof CopilotTokenRecordCommand) as CopilotTokenRecordCommand
        expect(recordCommand.input).toMatchObject({
            model: 'qwen3.6-plus',
            modelType: AiModelTypeEnum.LLM,
            modelAccess,
            tokenUsed: 120
        })
        expect(commandBus.execute.mock.calls.filter(([command]) => command instanceof CopilotCheckLimitCommand)).toHaveLength(
            1
        )
    })

    it('waits for the execution usage callback before recording provider usage', async () => {
        const { commandBus, getModelInstance, handler, query } = createFixture()
        let releaseUsage: () => void
        query.options.usageCallback = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    releaseUsage = resolve
                })
        )

        await handler.execute(query)
        const modelOptions = getModelInstance.mock.calls[0][2]
        const reporting = modelOptions.handleLLMTokens({
            model: 'qwen3.6-plus',
            usage: { totalTokens: 120 }
        })
        await Promise.resolve()

        expect(
            commandBus.execute.mock.calls.some(([command]) => command instanceof CopilotTokenRecordCommand)
        ).toBe(false)

        releaseUsage!()
        await reporting

        expect(
            commandBus.execute.mock.calls.some(([command]) => command instanceof CopilotTokenRecordCommand)
        ).toBe(true)
    })

    it('does not record estimated usage in the provider billing ledger', async () => {
        const { commandBus, getModelInstance, handler, query } = createFixture()

        await handler.execute(query)
        const modelOptions = getModelInstance.mock.calls[0][2]
        await modelOptions.handleLLMTokens({
            model: 'qwen3.6-plus',
            usage: { totalTokens: 120, type: 'estimated' }
        })

        expect(
            commandBus.execute.mock.calls.some(([command]) => command instanceof CopilotTokenRecordCommand)
        ).toBe(false)
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
