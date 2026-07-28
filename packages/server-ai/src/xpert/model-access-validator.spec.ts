import { AiModelTypeEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { XpertModelAccessValidator, collectDraftModelReferences } from './model-access-validator'
import { XpertDraftValidateEvent } from './types'

describe('XpertModelAccessValidator', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('collects exact configured models across team, agent, fallback, speech, memory and workflow fields', () => {
        const draft = {
            team: {
                copilotModel: {
                    copilotId: 'llm-copilot',
                    modelType: AiModelTypeEnum.LLM,
                    model: 'llm-main'
                },
                memory: {
                    copilotModel: {
                        copilotId: 'embedding-copilot',
                        modelType: AiModelTypeEnum.TEXT_EMBEDDING,
                        model: 'embedding-main'
                    }
                },
                features: {
                    textToSpeech: {
                        enabled: true,
                        copilotModel: {
                            copilotId: 'tts-copilot',
                            modelType: AiModelTypeEnum.TTS,
                            model: 'tts-main'
                        }
                    },
                    speechToText: {
                        enabled: false,
                        copilotModel: {
                            copilotId: 'stt-copilot',
                            modelType: AiModelTypeEnum.SPEECH2TEXT,
                            model: 'stt-disabled'
                        }
                    }
                }
            },
            nodes: [
                {
                    key: 'agent-1',
                    type: 'agent',
                    entity: {
                        copilotModel: {
                            copilotId: 'agent-copilot',
                            modelType: AiModelTypeEnum.LLM,
                            model: 'agent-main'
                        },
                        options: {
                            fallback: {
                                enabled: true,
                                copilotModel: {
                                    copilotId: 'fallback-copilot',
                                    modelType: AiModelTypeEnum.LLM,
                                    model: 'fallback-main'
                                }
                            }
                        }
                    }
                },
                {
                    key: 'classifier-1',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.CLASSIFIER,
                        copilotModel: {
                            copilotId: 'classifier-copilot',
                            modelType: AiModelTypeEnum.LLM,
                            model: 'classifier-main'
                        }
                    }
                },
                {
                    key: 'middleware-1',
                    type: 'workflow',
                    entity: {
                        type: WorkflowNodeTypeEnum.MIDDLEWARE,
                        provider: 'VisionMiddleware',
                        options: {
                            vision: {
                                copilotId: 'vision-copilot',
                                model: 'vision-main'
                            }
                        }
                    }
                }
            ],
            connections: []
        } as never

        expect(
            collectDraftModelReferences(draft, {
                VisionMiddleware: [{ path: 'vision', modelType: AiModelTypeEnum.LLM }]
            })
        ).toEqual([
            expect.objectContaining({ copilotId: 'llm-copilot', copilotModelId: 'llm-main' }),
            expect.objectContaining({
                copilotId: 'embedding-copilot',
                copilotModelId: 'embedding-main',
                modelType: AiModelTypeEnum.TEXT_EMBEDDING
            }),
            expect.objectContaining({
                copilotId: 'tts-copilot',
                copilotModelId: 'tts-main',
                modelType: AiModelTypeEnum.TTS
            }),
            expect.objectContaining({ copilotId: 'agent-copilot', copilotModelId: 'agent-main' }),
            expect.objectContaining({ copilotId: 'fallback-copilot', copilotModelId: 'fallback-main' }),
            expect.objectContaining({ copilotId: 'classifier-copilot', copilotModelId: 'classifier-main' }),
            expect.objectContaining({ copilotId: 'vision-copilot', copilotModelId: 'vision-main' })
        ])
    })

    it('validates models with the assistant creator and exact xpert scope', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('editor-user')
        const modelAccessService = {
            canUseCatalogModel: jest.fn().mockResolvedValue(true)
        }
        const validator = new XpertModelAccessValidator(
            modelAccessService as never,
            { getMiddlewareStrategies: jest.fn().mockReturnValue([]) } as never
        )

        await validator.handle(
            new XpertDraftValidateEvent(
                {
                    team: {
                        copilotModel: {
                            copilotId: 'copilot-1',
                            modelType: AiModelTypeEnum.LLM,
                            model: 'model-1'
                        }
                    },
                    nodes: [],
                    connections: []
                } as never,
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    xpertId: 'xpert-1',
                    creatorId: 'creator-user'
                }
            )
        )

        expect(modelAccessService.canUseCatalogModel).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'creator-user',
            xpertId: 'xpert-1',
            copilotId: 'copilot-1',
            copilotModelId: 'model-1',
            modelType: AiModelTypeEnum.LLM
        })
    })

    it('rejects an unavailable configured model', async () => {
        const validator = new XpertModelAccessValidator(
            {
                canUseCatalogModel: jest.fn().mockResolvedValue(false)
            } as never,
            { getMiddlewareStrategies: jest.fn().mockReturnValue([]) } as never
        )

        await expect(
            validator.handle(
                new XpertDraftValidateEvent(
                    {
                        team: {
                            copilotModel: {
                                copilotId: 'copilot-1',
                                modelType: AiModelTypeEnum.LLM,
                                model: 'model-1'
                            }
                        },
                        nodes: [],
                        connections: []
                    } as never,
                    {
                        tenantId: 'tenant-1',
                        xpertId: 'xpert-1',
                        creatorId: 'creator-user'
                    }
                )
            )
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects a configured model without an explicit model type', async () => {
        const modelAccessService = {
            canUseCatalogModel: jest.fn().mockResolvedValue(true)
        }
        const validator = new XpertModelAccessValidator(
            modelAccessService as never,
            { getMiddlewareStrategies: jest.fn().mockReturnValue([]) } as never
        )

        await expect(
            validator.handle(
                new XpertDraftValidateEvent(
                    {
                        team: {
                            copilotModel: {
                                copilotId: 'copilot-1',
                                model: 'model-1'
                            }
                        },
                        nodes: [],
                        connections: []
                    } as never,
                    {
                        tenantId: 'tenant-1',
                        xpertId: 'xpert-1',
                        creatorId: 'creator-user'
                    }
                )
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(modelAccessService.canUseCatalogModel).not.toHaveBeenCalled()
    })
})
