jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { Document } from '@langchain/core/documents'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    channelName,
    IEnvironment,
    IKnowledgebaseTask,
    IKnowledgeDocument,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    KnowledgebaseChannel,
    KnowledgeTask,
    TXpertGraph,
    WorkflowNodeTypeEnum,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { WorkflowSourceNodeStrategy } from '../../../knowledgebase/plugins/source/strategy'
import { WorkflowProcessorNodeStrategy } from '../../../knowledgebase/plugins/processor/strategy'
import { WorkflowChunkerNodeStrategy } from '../../../knowledgebase/plugins/chunker/strategy'
import { WorkflowKnowledgeBaseNodeStrategy } from '../../../knowledgebase/plugins/knowledgebase/strategy'
import { RecursiveCharacterStrategy } from '../../../knowledgebase/plugins/textsplitter-common/recursive-character.strategy'
import { KnowledgeStrategyQuery } from '../../../knowledgebase/queries'
import { GetXpertWorkflowQuery } from '../../../xpert/queries'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset/commands/get-tools.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { CreateWorkflowNodeCommand } from '../../workflow/create-workflow.command'
import { CreateWorkflowNodeHandler } from '../../workflow/handlers/create-workflow.handler'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { XpertAgentSubgraphHandler } from './subgraph.handler'

describe('published knowledge pipeline preview', () => {
    it('preserves task scope through real source, processor, splitter and result nodes without a loaded knowledgebase relation', async () => {
        const xpert = {
            id: 'pipeline',
            type: XpertTypeEnum.Knowledge,
            workspaceId: 'workspace',
            agentConfig: {}
        } as IXpert
        const agent = {
            key: 'hidden',
            name: 'Hidden',
            options: { hidden: true },
            toolsetIds: [],
            knowledgebaseIds: [],
            team: xpert
        } as IXpertAgent
        const graphFixture = {
            nodes: [
                {
                    key: 'trigger',
                    type: 'workflow',
                    entity: { key: 'trigger', type: WorkflowNodeTypeEnum.TRIGGER, from: 'chat' }
                },
                {
                    key: 'source',
                    type: 'workflow',
                    entity: { key: 'source', type: WorkflowNodeTypeEnum.SOURCE, provider: 'local-file' }
                },
                {
                    key: 'processor',
                    type: 'workflow',
                    entity: {
                        key: 'processor',
                        type: WorkflowNodeTypeEnum.PROCESSOR,
                        provider: 'default',
                        input: `${channelName('source')}.documents`
                    }
                },
                {
                    key: 'chunker',
                    type: 'workflow',
                    entity: {
                        key: 'chunker',
                        type: WorkflowNodeTypeEnum.CHUNKER,
                        provider: 'recursive-character',
                        input: `${channelName('processor')}.documents`,
                        config: { chunkSize: 1000, chunkOverlap: 200 }
                    }
                },
                {
                    key: 'result',
                    type: 'workflow',
                    entity: {
                        key: 'result',
                        type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
                        inputs: [`${channelName('chunker')}.documents`]
                    }
                }
            ],
            connections: ['trigger/source', 'source/processor', 'processor/chunker', 'chunker/result'].map((key) => ({
                key,
                type: 'edge',
                from: key.split('/')[0],
                to: key.split('/')[1]
            }))
        }
        const graph: TXpertGraph = {
            nodes: graphFixture.nodes.map((node) => ({
                ...node,
                type: 'workflow',
                position: { x: 0, y: 0 },
                entity: { ...node.entity, id: node.key }
            })),
            connections: graphFixture.connections.map((connection) => ({ ...connection, type: 'edge' }))
        }
        let cachedDocuments: Partial<IKnowledgeDocument>[] = [{ id: 'doc', name: 'test.md' }]
        const task = { id: 'task', status: 'running' } as IKnowledgebaseTask
        const tasks = {
            findOne: jest.fn(async (id: string) => {
                if (id !== task.id) throw new Error('Preview lost its task ID')
                return { ...task, context: { documents: structuredClone(cachedDocuments) } }
            }),
            upsertDocuments: jest.fn(async (id: string, docs: Partial<IKnowledgeDocument>[]) => {
                expect(id).toBe(task.id)
                cachedDocuments = structuredClone(docs)
            }),
            update: jest.fn(async (id: string, update: Partial<IKnowledgebaseTask>) => {
                expect(id).toBe(task.id)
                Object.assign(task, update)
            })
        }
        const transformDocuments = jest.fn(async (kbId: string) => {
            expect(kbId).toBe('kb')
            // File parsing is the external boundary; all workflow nodes and text splitting below are real.
            return [
                {
                    id: 'doc',
                    name: 'test.md',
                    chunks: [
                        new Document({
                            pageContent: '# Preview test\n\n'.repeat(1200),
                            metadata: {}
                        })
                    ]
                }
            ]
        })
        const executions = new Map<string, Partial<IXpertAgentExecution>>()
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof ToolsetGetToolsCommand) return []
                if (command instanceof CreateWorkflowNodeCommand) return workflowHandler.execute(command)
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    const id = command.execution.id ?? `execution-${executions.size}`
                    const execution = { ...executions.get(id), ...command.execution, id }
                    executions.set(id, execution)
                    return execution
                }
                throw new Error(`Unexpected command: ${command?.constructor.name}`)
            })
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                if (query instanceof GetXpertWorkflowQuery) return { agent, graph, next: [], fail: [] }
                if (query instanceof KnowledgeStrategyQuery) return new RecursiveCharacterStrategy()
                if (query instanceof XpertAgentExecutionOneQuery) return { id: 'node-execution' }
                throw new Error(`Unexpected query: ${query?.constructor.name}`)
            })
        }
        const strategies = [
            new WorkflowSourceNodeStrategy(commandBus as never, queryBus as never),
            new WorkflowProcessorNodeStrategy(commandBus as never, queryBus as never),
            new WorkflowChunkerNodeStrategy(commandBus as never, queryBus as never),
            new WorkflowKnowledgeBaseNodeStrategy(commandBus as never, queryBus as never)
        ]
        for (const strategy of strategies) {
            Object.defineProperty(strategy, 'taskService', { value: tasks })
            Object.defineProperty(strategy, 'knowledgebaseService', { value: { transformDocuments } })
            // Production document writes must not be reached by preview.
            Object.defineProperty(strategy, 'documentService', { value: {} })
        }
        const workflowHandler = new CreateWorkflowNodeHandler(commandBus as never, queryBus as never)
        Object.defineProperty(workflowHandler, 'nodeRegistry', {
            value: { get: (type: WorkflowNodeTypeEnum) => strategies.find((strategy) => strategy.meta.name === type) }
        })
        const handler = new XpertAgentSubgraphHandler(
            null,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            null,
            null,
            {
                createScopedApi: () => ({}),
                resolveSelectedConnectorRuntimeBindings: async () => []
            } as never,
            { findOne: async (id: string) => ({ id }) } as never
        )
        Object.defineProperty(handler, 'agentMiddlewareRegistry', {
            value: { get: () => ({ createMiddleware: () => ({ name: 'ClientToolMiddleware', tools: [] }) }) }
        })
        const controller = new AbortController()
        const { graph: compiled } = await handler.execute(
            new XpertAgentSubgraphCommand('hidden', xpert, {
                isStart: true,
                isDraft: false,
                disableCheckpointer: true,
                mute: [],
                store: null,
                subscriber: null,
                execution: { id: 'execution' } as IXpertAgentExecution,
                rootController: controller,
                signal: controller.signal,
                channel: channelName('hidden'),
                thread_id: 'thread',
                environment: { variables: [] } as IEnvironment,
                from: 'knowledge'
            })
        )
        const context = { knowledgebaseId: 'kb', [KnowledgeTask]: task.id, sources: ['source'], stage: 'preview' }
        const output = await compiled.invoke(
            {
                [KnowledgebaseChannel]: context,
                [channelName('source')]: { documents: ['doc'] }
            },
            { configurable: { thread_id: 'thread', executionId: 'execution' } }
        )
        expect(output[KnowledgebaseChannel]).toEqual(context)
        expect(task.status).toBe('success')
        expect(transformDocuments).toHaveBeenCalledTimes(1)
        expect(cachedDocuments[0].draft.chunks.length).toBeGreaterThan(2)
        expect(cachedDocuments[0].draft.chunks.every((chunk) => chunk.pageContent.length <= 1000)).toBe(true)
    })
})
