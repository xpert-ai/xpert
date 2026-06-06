jest.mock('../../copilot-model/utils/context-size', () => ({
    ensureCopilotModelContextSize: jest.fn()
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('./execution', () => {
    const { XpertAgentExecutionStatusEnum } = require('@xpert-ai/contracts')
    const { XpertAgentExecutionUpsertCommand } = require('../../xpert-agent-execution/commands/upsert.command')
    const { XpertAgentExecutionOneQuery } = require('../../xpert-agent-execution/queries/get-one.query')

    return {
        wrapAgentExecution:
            (run: (execution: Record<string, unknown>) => Promise<{ output?: unknown; state: unknown }>, params: any) =>
            async () => {
                const { commandBus, queryBus, execution, subscriber, catchError } = params
                execution.status = XpertAgentExecutionStatusEnum.RUNNING

                let subexecution = await commandBus.execute(
                    new XpertAgentExecutionUpsertCommand({
                        ...execution
                    })
                )
                execution.id = subexecution.id
                subscriber?.next({ data: { event: 'start', data: subexecution } })

                let status = XpertAgentExecutionStatusEnum.SUCCESS
                let error = null
                let output = null

                try {
                    const results = await run(execution)
                    output = results?.output ?? null
                    return results?.state
                } catch (caught) {
                    status = XpertAgentExecutionStatusEnum.ERROR
                    error = caught instanceof Error ? caught.message : String(caught)
                    catchError?.(caught).catch(() => undefined)
                    throw caught
                } finally {
                    subexecution = await commandBus.execute(
                        new XpertAgentExecutionUpsertCommand({
                            ...subexecution,
                            ...execution,
                            status,
                            error,
                            outputs: {
                                output
                            }
                        })
                    )
                    await queryBus.execute(new XpertAgentExecutionOneQuery(subexecution.id))
                    subscriber?.next({ data: { event: 'end', data: subexecution } })
                }
            }
    }
})

import { ChatMessageEventTypeEnum, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    AssistantTaskRuntimeCapability,
    FileRuntimeCapability,
    KnowledgebaseDocumentsRuntimeCapability,
    KnowledgebaseRuntimeCapability,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { GetStorageFileQuery } from '@xpert-ai/server-core'
import { of } from 'rxjs'
import { AIModelGetProviderQuery } from '../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../copilot-provider/queries/get-model.query'
import { CopilotCheckLimitCommand } from '../../copilot-user/commands/check-limit.command'
import { CopilotTokenRecordCommand } from '../../copilot-user/commands/token-record.command'
import { ExceedingLimitException } from '../../core/errors'
import { CopilotGetOneQuery } from '../../copilot/queries/get-one.query'
import { GetChatConversationQuery } from '../../chat-conversation/queries/conversation-get.query'
import { GetFileAssetQuery } from '../../file-understanding'
import {
    CreateKnowledgebaseDocumentsCommand,
    DeleteAgentKnowledgeChunksCommand,
    DeleteKnowledgebaseDocumentsCommand,
    ImportKnowledgebaseArchiveCommand,
    UploadKnowledgebaseDocumentFileCommand,
    WriteAgentKnowledgeChunkCommand
} from '../../knowledgebase/commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../../knowledgebase/queries'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries/get-one.query'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

describe('AgentMiddlewareRuntimeService', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let service: AgentMiddlewareRuntimeService

    beforeEach(() => {
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }
        service = new AgentMiddlewareRuntimeService(
            commandBus as any,
            queryBus as any,
            {
                t: jest.fn().mockReturnValue('AI model not found')
            } as any
        )

        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('emits middleware events as chat events without agent identity', async () => {
        await service.api.emitMiddlewareEvent({
            middlewareName: 'ModelRetryMiddleware',
            middlewareKey: 'model-retry-node',
            title: 'Model retry',
            message: 'Retrying model call, attempt 2/3',
            status: 'running',
            phase: 'retry_started',
            executionId: 'exec-1',
            threadId: 'thread-1',
            agentKey: 'should-not-leak'
        } as any)

        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: 'middleware_event',
                middlewareName: 'ModelRetryMiddleware',
                middlewareKey: 'model-retry-node',
                title: 'Model retry',
                message: 'Retrying model call, attempt 2/3',
                status: 'running',
                phase: 'retry_started',
                executionId: 'exec-1',
                threadId: 'thread-1',
                created_date: expect.any(String)
            })
        )
        expect((dispatchCustomEvent as jest.Mock).mock.calls[0][1]).not.toHaveProperty('agentKey')
    })

    function mockCreateModelClientDependencies(options?: { tokenRecordError?: Error }) {
        const modelInstance = {
            invoke: jest.fn()
        }
        const getModelInstance = jest.fn().mockReturnValue(modelInstance)

        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotGetOneQuery) {
                return {
                    id: 'copilot-1',
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'openai'
                    }
                }
            }

            if (query instanceof GetCopilotProviderModelQuery) {
                return [
                    {
                        modelProperties: {
                            reasoningEffort: 'medium'
                        }
                    }
                ]
            }

            if (query instanceof AIModelGetProviderQuery) {
                return {
                    getModelInstance
                }
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof CopilotCheckLimitCommand) {
                return undefined
            }

            if (command instanceof CopilotTokenRecordCommand) {
                if (options?.tokenRecordError) {
                    throw options.tokenRecordError
                }
                return undefined
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        return {
            getModelInstance,
            modelInstance
        }
    }

    it('creates a model client and records token usage through the runtime facade', async () => {
        const { getModelInstance, modelInstance } = mockCreateModelClientDependencies()
        const usageCallback = jest.fn()

        const client = await service.createModelClient(
            {
                copilotId: 'copilot-1',
                model: 'gpt-4o-mini',
                modelType: 'LLM'
            } as any,
            {
                usageCallback
            }
        )

        expect(client).toBe(modelInstance)
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CopilotCheckLimitCommand))
        expect(getModelInstance).toHaveBeenCalledWith(
            'LLM',
            expect.objectContaining({
                model: 'gpt-4o-mini',
                copilot: expect.objectContaining({
                    id: 'copilot-1'
                })
            }),
            expect.objectContaining({
                modelProperties: {
                    reasoningEffort: 'medium'
                }
            })
        )

        const modelOptions = getModelInstance.mock.calls[0][2]
        const usage = {
            totalTokens: 42,
            totalPrice: 1.25,
            currency: 'USD'
        }

        await modelOptions.handleLLMTokens({
            model: 'gpt-4o-mini',
            usage
        })

        expect(usageCallback).toHaveBeenCalledWith(usage)

        const tokenRecordCommand = commandBus.execute.mock.calls.find(
            ([command]) => command instanceof CopilotTokenRecordCommand
        )?.[0] as CopilotTokenRecordCommand

        expect(tokenRecordCommand.input).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                model: 'gpt-4o-mini',
                tokenUsed: 42,
                priceUsed: 1.25,
                currency: 'USD'
            })
        )
    })

    it('aborts the active model request when token recording hits an exceeding-limit error', async () => {
        const { getModelInstance } = mockCreateModelClientDependencies({
            tokenRecordError: new ExceedingLimitException('quota exceeded')
        })
        const abortController = {
            abort: jest.fn(),
            signal: {
                aborted: false
            }
        } as any

        await service.createModelClient(
            {
                copilotId: 'copilot-1',
                model: 'gpt-4o-mini',
                modelType: 'LLM'
            } as any,
            {
                abortController,
                usageCallback: jest.fn()
            }
        )

        const modelOptions = getModelInstance.mock.calls[0][2]
        await modelOptions.handleLLMTokens({
            model: 'gpt-4o-mini',
            usage: {
                totalTokens: 99,
                totalPrice: 2,
                currency: 'USD'
            }
        })

        expect(abortController.abort).toHaveBeenCalledWith('quota exceeded')
    })

    it('wraps workflow node execution and preserves start/end lifecycle events', async () => {
        const upsertCommands: XpertAgentExecutionUpsertCommand[] = []
        const subscriber = {
            next: jest.fn()
        }

        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                upsertCommands.push(command)
                return {
                    id: 'subexec-1',
                    ...command.execution
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: query.id,
                    status: XpertAgentExecutionStatusEnum.SUCCESS
                }
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        const result = await service.wrapWorkflowNodeExecution(
            async (execution) => {
                expect(execution.id).toBe('subexec-1')
                return {
                    state: 'done',
                    output: 'tracked output'
                }
            },
            {
                execution: {
                    category: 'workflow',
                    type: 'middleware',
                    title: 'Tracked Middleware',
                    threadId: 'thread-1'
                } as any,
                subscriber: subscriber as any
            }
        )

        expect(result).toBe('done')
        expect(upsertCommands).toHaveLength(2)
        expect(upsertCommands[0].execution.status).toBe(XpertAgentExecutionStatusEnum.RUNNING)
        expect(upsertCommands[1].execution.status).toBe(XpertAgentExecutionStatusEnum.SUCCESS)
        expect(upsertCommands[1].execution.outputs).toEqual({
            output: 'tracked output'
        })
        expect(subscriber.next).toHaveBeenCalledTimes(2)
    })

    it('records error state when wrapped workflow execution fails', async () => {
        const upsertCommands: XpertAgentExecutionUpsertCommand[] = []
        const catchError = jest.fn().mockResolvedValue(undefined)
        const subscriber = {
            next: jest.fn()
        }

        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                upsertCommands.push(command)
                return {
                    id: 'subexec-2',
                    ...command.execution
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: query.id,
                    status: XpertAgentExecutionStatusEnum.ERROR
                }
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        await expect(
            service.wrapWorkflowNodeExecution(
                async () => {
                    throw new Error('boom')
                },
                {
                    execution: {
                        category: 'workflow',
                        type: 'middleware',
                        title: 'Failing Middleware'
                    } as any,
                    subscriber: subscriber as any,
                    catchError
                }
            )
        ).rejects.toThrow('boom')

        await Promise.resolve()

        expect(upsertCommands).toHaveLength(2)
        expect(upsertCommands[1].execution.status).toBe(XpertAgentExecutionStatusEnum.ERROR)
        expect(upsertCommands[1].execution.error).toBe('boom')
        expect(catchError).toHaveBeenCalledWith(expect.any(Error))
        expect(subscriber.next).toHaveBeenCalledTimes(2)
    })

    it('exposes knowledgebase search through the runtime facade', async () => {
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof KnowledgeSearchQuery) {
                return [
                    {
                        pageContent: 'BOM profile',
                        metadata: {
                            rootId: 'root-1',
                            score: 0.92
                        }
                    }
                ]
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        const docs = await service.api.capabilities?.require(KnowledgebaseRuntimeCapability).search({
            knowledgebaseIds: ['kb-1'],
            query: 'YBX4 180M',
            k: 5,
            filter: {
                documentType: 'bom-product-profile'
            },
            retrieval: {
                mode: 'hybrid'
            },
            source: 'test',
            requestId: 'request-1'
        })

        expect(docs?.[0].metadata?.['rootId']).toBe('root-1')
        const query = queryBus.execute.mock.calls[0][0] as KnowledgeSearchQuery
        expect(query.input).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebases: ['kb-1'],
                query: 'YBX4 180M',
                source: 'test',
                id: 'request-1'
            })
        )
    })

    it('lists workspace knowledgebases through the runtime facade', async () => {
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof ListWorkspaceKnowledgebasesQuery) {
                return [
                    {
                        id: 'kb-1',
                        name: 'BOM 知识库',
                        type: 'Standard',
                        status: 'ready',
                        permission: 'Private',
                        workspaceId: 'workspace-1',
                        documentNum: 3,
                        chunkNum: 12
                    }
                ]
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        const items = await service.api.capabilities?.require(KnowledgebaseRuntimeCapability).list({
            workspaceId: 'workspace-1',
            limit: 20
        })

        expect(items).toEqual([
            expect.objectContaining({
                id: 'kb-1',
                name: 'BOM 知识库',
                workspaceId: 'workspace-1',
                documentNum: 3,
                chunkNum: 12
            })
        ])
        const query = queryBus.execute.mock.calls[0][0] as ListWorkspaceKnowledgebasesQuery
        expect(query.input).toEqual({
            workspaceId: 'workspace-1',
            published: undefined,
            limit: 20
        })
    })

    it('exposes knowledgebase chunk write through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof WriteAgentKnowledgeChunkCommand) {
                return {
                    status: 'created',
                    chunkId: 'chunk-1'
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities?.require(KnowledgebaseRuntimeCapability).writeChunk({
            xpertId: 'xpert-1',
            agentKey: 'agent-1',
            knowledgebaseIds: ['kb-1'],
            knowledgebaseId: 'kb-1',
            text: 'BOM profile',
            title: 'BOM root',
            metadata: {
                rootId: 'root-1'
            },
            writeKey: 'bom-root:root-1'
        })

        expect(result?.status).toBe('created')
        const command = commandBus.execute.mock.calls[0][0] as WriteAgentKnowledgeChunkCommand
        expect(command.input).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                knowledgebaseId: 'kb-1',
                writeKey: 'bom-root:root-1'
            })
        )
    })

    it('exposes knowledgebase chunk deletion through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof DeleteAgentKnowledgeChunksCommand) {
                return {
                    deletedCount: 2,
                    knowledgebaseId: 'kb-1'
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities?.require(KnowledgebaseRuntimeCapability).deleteChunks({
            xpertId: 'xpert-1',
            agentKey: 'agent-1',
            knowledgebaseIds: ['kb-1'],
            knowledgebaseId: 'kb-1',
            writeKeyPrefix: 'bom-product-profile:v2:root-1:'
        })

        expect(result?.deletedCount).toBe(2)
        const command = commandBus.execute.mock.calls[0][0] as DeleteAgentKnowledgeChunksCommand
        expect(command.input).toEqual(
            expect.objectContaining({
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                knowledgebaseId: 'kb-1',
                writeKeyPrefix: 'bom-product-profile:v2:root-1:'
            })
        )
    })

    it('exposes knowledgebase document upload through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof UploadKnowledgebaseDocumentFileCommand) {
                return {
                    name: 'reference.pdf',
                    filePath: 'files/reference.pdf',
                    fileUrl: 'https://files.example/reference.pdf',
                    sourceHash: 'hash-1'
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities?.require(KnowledgebaseDocumentsRuntimeCapability).uploadFile({
            knowledgebaseId: 'kb-1',
            file: {
                buffer: Buffer.from('pdf'),
                originalname: 'reference.pdf',
                mimetype: 'application/pdf'
            },
            path: 'contract-reference-packages/25C13087'
        })

        expect(result?.sourceHash).toBe('hash-1')
        const command = commandBus.execute.mock.calls[0][0] as UploadKnowledgebaseDocumentFileCommand
        expect(command.input).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'kb-1',
                path: 'contract-reference-packages/25C13087',
                file: expect.objectContaining({
                    originalname: 'reference.pdf'
                })
            })
        )
    })

    it('exposes knowledgebase archive import through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof ImportKnowledgebaseArchiveCommand) {
                return {
                    archive: {
                        name: 'reference.zip',
                        filePath: 'files/reference.zip',
                        fileUrl: 'https://files.example/reference.zip'
                    },
                    documents: [{ id: 'doc-1', name: 'spec.pdf', knowledgebaseId: 'kb-1' }],
                    skipped: [],
                    warnings: [],
                    processingStarted: true
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities?.require(KnowledgebaseDocumentsRuntimeCapability).importArchive({
            knowledgebaseId: 'kb-1',
            file: {
                buffer: Buffer.from('zip'),
                originalname: 'reference.zip',
                mimetype: 'application/zip'
            },
            packageCode: '25C13087',
            process: true
        })

        expect(result?.documents[0]?.id).toBe('doc-1')
        const command = commandBus.execute.mock.calls[0][0] as ImportKnowledgebaseArchiveCommand
        expect(command.input).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'kb-1',
                packageCode: '25C13087',
                process: true
            })
        )
    })

    it('exposes knowledgebase document creation through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof CreateKnowledgebaseDocumentsCommand) {
                return {
                    documents: [{ id: 'doc-1', name: 'reference.pdf', knowledgebaseId: 'kb-1' }],
                    processingStarted: true
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities
            ?.require(KnowledgebaseDocumentsRuntimeCapability)
            .createDocuments({
                knowledgebaseId: 'kb-1',
                documents: [
                    {
                        name: 'reference.pdf',
                        filePath: 'files/reference.pdf',
                        metadata: {
                            documentType: 'contract-reference-source'
                        }
                    }
                ],
                process: true
            })

        expect(result?.processingStarted).toBe(true)
        const command = commandBus.execute.mock.calls[0][0] as CreateKnowledgebaseDocumentsCommand
        expect(command.input).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'kb-1',
                process: true
            })
        )
    })

    it('exposes knowledgebase document deletion through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof DeleteKnowledgebaseDocumentsCommand) {
                return {
                    knowledgebaseId: 'kb-1',
                    documentIds: ['doc-1'],
                    deletedDocumentCount: 1,
                    missingDocumentIds: []
                }
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities
            ?.require(KnowledgebaseDocumentsRuntimeCapability)
            .deleteDocuments({
                knowledgebaseId: 'kb-1',
                documentIds: ['doc-1']
            })

        expect(result?.deletedDocumentCount).toBe(1)
        const command = commandBus.execute.mock.calls[0][0] as DeleteKnowledgebaseDocumentsCommand
        expect(command.input).toEqual({
            knowledgebaseId: 'kb-1',
            documentIds: ['doc-1']
        })
    })

    it('resolves file asset references through the runtime facade', async () => {
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof GetFileAssetQuery) {
                return {
                    id: 'file-asset-1',
                    storageFileId: 'storage-1',
                    originalName: '合同.pdf',
                    mimeType: 'application/pdf',
                    size: 1024
                }
            }

            if (query instanceof GetStorageFileQuery) {
                return [
                    {
                        id: 'storage-1',
                        file: 'files/tenant-1/contract.pdf',
                        fileUrl: 'https://files.example/contract.pdf',
                        originalName: '合同.pdf',
                        mimetype: 'application/pdf',
                        size: 1024
                    }
                ]
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        const file = await service.api.capabilities?.require(FileRuntimeCapability).resolveFile({
            fileAssetId: 'file-asset-1'
        })

        expect(file).toEqual(
            expect.objectContaining({
                id: 'file-asset-1',
                fileId: 'file-asset-1',
                fileAssetId: 'file-asset-1',
                storageFileId: 'storage-1',
                name: '合同.pdf',
                mimeType: 'application/pdf',
                url: 'https://files.example/contract.pdf',
                previewUrl: 'https://files.example/contract.pdf'
            })
        )
    })

    it('starts an assistant task through the runtime facade', async () => {
        commandBus.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof XpertChatCommand) {
                return of({ data: { event: 'done' } } as MessageEvent)
            }

            throw new Error(`Unexpected command: ${command?.constructor?.name}`)
        })

        const result = await service.api.capabilities?.require(AssistantTaskRuntimeCapability).startTask({
            xpertId: 'assistant-1',
            agentKey: 'agent-main',
            taskId: 'task-1',
            prompt: '重新解析合同',
            files: [
                {
                    fileAssetId: 'file-asset-1',
                    storageFileId: 'storage-1',
                    name: '合同.pdf',
                    mimeType: 'application/pdf'
                }
            ],
            context: {
                source: 'test'
            }
        })

        expect(result).toEqual(expect.objectContaining({ status: 'running', taskId: 'task-1' }))
        const command = commandBus.execute.mock.calls[0][0] as XpertChatCommand
        expect(command.request).toEqual(
            expect.objectContaining({
                action: 'send',
                message: expect.objectContaining({
                    input: expect.objectContaining({
                        input: '重新解析合同',
                        files: [
                            expect.objectContaining({
                                fileId: 'file-asset-1',
                                fileAssetId: 'file-asset-1',
                                storageFileId: 'storage-1'
                            })
                        ]
                    })
                })
            })
        )
        expect(command.options).toEqual(
            expect.objectContaining({
                xpertId: 'assistant-1',
                from: 'job',
                taskId: 'task-1',
                context: { source: 'test' }
            })
        )
    })

    it('checks assistant task status from the chat conversation thread', async () => {
        queryBus.execute.mockImplementation(async (query: unknown) => {
            if (query instanceof GetChatConversationQuery) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    xpertId: 'assistant-1',
                    status: 'idle'
                }
            }

            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })

        const result = await service.api.capabilities?.require(AssistantTaskRuntimeCapability).getTaskStatus?.({
            threadId: 'thread-1',
            xpertId: 'assistant-1'
        })

        expect(result).toEqual(
            expect.objectContaining({
                status: 'succeeded',
                conversationId: 'conversation-1',
                threadId: 'thread-1'
            })
        )
        const query = queryBus.execute.mock.calls[0][0] as GetChatConversationQuery
        expect(query.conditions).toEqual({
            threadId: 'thread-1',
            xpertId: 'assistant-1'
        })
    })
})
