import { AiModelTypeEnum } from '@xpert-ai/contracts'
jest.mock('../../xpert.entity', () => ({
    Xpert: class Xpert {}
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

import { FindCopilotModelsQuery } from '../../../copilot/queries'
import { XpertCreateCommand } from '../create.command'
import { XpertCreateHandler } from './create.handler'

describe('XpertCreateHandler', () => {
    const availableCopilots = [
        {
            id: 'copilot-glm',
            providerWithModels: {
                models: [
                    {
                        model: 'glm-5',
                        model_type: AiModelTypeEnum.LLM,
                        features: []
                    }
                ]
            }
        },
        {
            id: 'copilot-openai',
            providerWithModels: {
                models: [
                    {
                        model: 'gpt-4o',
                        model_type: AiModelTypeEnum.LLM,
                        features: []
                    }
                ]
            }
        }
    ]

    const buildHandler = (overrides: Record<string, any> = {}) => {
        const roleService = {
            findOneOrFailByWhereOptions: jest.fn().mockResolvedValue({ success: false }),
            create: jest.fn().mockImplementation(async (entity) => entity),
            ...overrides
        }
        const queryBus = {
            execute: jest.fn().mockResolvedValue(availableCopilots)
        }

        return {
            roleService,
            queryBus,
            handler: new XpertCreateHandler(roleService as any, queryBus as any)
        }
    }

    it('syncs the selected team model into the primary agent when the agent has no valid copilotId', async () => {
        const { handler, roleService, queryBus } = buildHandler()

        await handler.execute(
            new XpertCreateCommand({
                name: 'Draft Expert',
                copilotModel: {
                    copilotId: 'copilot-glm',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'glm-5',
                    options: {
                        temperature: 0.2
                    }
                },
                agent: {
                    key: 'Agent_draft'
                }
            } as any)
        )

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindCopilotModelsQuery))
        expect(queryBus.execute.mock.calls[0][0].type).toBe(AiModelTypeEnum.LLM)
        expect(roleService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                agent: expect.objectContaining({
                    key: 'Agent_draft',
                    copilotModel: expect.objectContaining({
                        copilotId: 'copilot-glm',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'glm-5',
                        options: {
                            temperature: 0.2
                        }
                    })
                })
            })
        )
    })

    it('keeps the existing primary agent model when its copilotId is already valid', async () => {
        const { handler, roleService } = buildHandler()

        await handler.execute(
            new XpertCreateCommand({
                name: 'Draft Expert',
                copilotModel: {
                    copilotId: 'copilot-glm',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'glm-5'
                },
                agent: {
                    key: 'Agent_draft',
                    copilotModel: {
                        copilotId: 'copilot-openai',
                        modelType: AiModelTypeEnum.LLM,
                        model: 'gpt-4o',
                        options: {
                            temperature: 0.7
                        }
                    }
                }
            } as any)
        )

        expect(roleService.create).toHaveBeenCalledWith(
            expect.objectContaining({
                agent: expect.objectContaining({
                    copilotModel: expect.objectContaining({
                        copilotId: 'copilot-openai',
                        model: 'gpt-4o',
                        options: {
                            temperature: 0.7
                        }
                    })
                })
            })
        )
    })
})
