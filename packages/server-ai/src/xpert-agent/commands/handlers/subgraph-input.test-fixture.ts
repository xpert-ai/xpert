jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('../../../xpert-middleware/thread-reference.runtime', () => ({
    createThreadReferenceMiddleware: jest.fn(async () => ({
        key: '__thread_reference_middleware__',
        middleware: { name: 'ThreadReferenceMiddleware' }
    }))
}))

import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { MemorySaver } from '@langchain/langgraph'
import {
    channelName,
    IEnvironment,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import type { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime'
import { setModelVisionSupport } from '../../../copilot-model/model-capabilities'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../create-node-stage-pending-steer-follow-ups.command'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../create-node-consume-pending-steer-follow-ups.command'
import { CreateNodeStagePendingSteerFollowUpsHandler } from './create-node-stage-pending-steer-follow-ups.handler'
import { CreateNodeConsumePendingSteerFollowUpsHandler } from './create-node-consume-pending-steer-follow-ups.handler'
import { XpertAgentSubgraphHandler } from './subgraph.handler'

export const agentKey = 'agent-1'
export const agentChannel = channelName(agentKey)
export const toolName = 'test_operation'
export const config = {
    configurable: {
        thread_id: 'input-test',
        checkpoint_ns: '',
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        agentKey,
        rootAgentKey: agentKey,
        executionId: 'execution-1'
    },
    recursionLimit: 30
}

export function createInputGraphFixture(
    options: {
        beforeModel?: boolean
        disableMessageHistory?: boolean
        promptTemplates?: IXpertAgent['promptTemplates']
        middleware?: AgentMiddleware
    } = {}
) {
    jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
    const saver = new MemorySaver()
    const requests: BaseMessage[][] = []
    const model = jest.fn(async (messages: BaseMessage[]): Promise<AIMessage> => {
        const last = messages.at(-1)
        if (last?.getType() === 'tool') return new AIMessage('tool completed')
        const human = messages.filter((message) => message.getType() === 'human').at(-1)
        if (human?.content === 'hi') return new AIMessage('hello')
        return new AIMessage({ content: '', tool_calls: [{ id: `call-${requests.length}`, name: toolName, args: {} }] })
    })
    const toolRun = jest.fn(async () => 'done')
    const testTool = tool(() => toolRun(), { name: toolName, description: 'Test operation', schema: z.object({}) })
    const chatModel = setModelVisionSupport(
        RunnableLambda.from(async (messages: BaseMessage[]) => {
            requests.push(messages)
            return model(messages)
        }),
        false
    )
    Object.defineProperty(chatModel, 'bindTools', { value: () => chatModel })
    const beforeModel = jest.fn(async () => undefined)
    const middleware: AgentMiddleware = {
        name: 'input-test',
        tools: [testTool],
        ...(options.beforeModel ? { beforeModel } : {}),
        ...options.middleware
    }
    const agent = {
        key: agentKey,
        name: 'Input test',
        prompt: 'Follow the latest user input.',
        toolsetIds: [],
        knowledgebaseIds: [],
        promptTemplates: options.promptTemplates,
        options: { fileUnderstanding: { enabled: false }, disableMessageHistory: options.disableMessageHistory },
        team: {
            id: 'xpert-1',
            tenantId: 'tenant',
            workspaceId: 'workspace',
            agentConfig: {},
            copilotModel: {
                model: 'test',
                copilot: { modelProvider: { providerName: 'test' }, copilotModel: { model: 'test' } }
            }
        }
    }
    const definition = {
        nodes: [
            { type: 'agent', key: agentKey, entity: agent },
            {
                type: 'workflow',
                key: 'input_middleware',
                entity: { type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: 'input-test' }
            }
        ],
        connections: [{ type: 'workflow', from: agentKey, to: 'input_middleware' }]
    }
    const repository = { find: jest.fn().mockResolvedValue([]), save: jest.fn() }
    const queryBus = {
        execute: jest.fn(async (query: object) => {
            switch (query.constructor.name) {
                case 'GetXpertWorkflowQuery':
                    return { agent, graph: definition, next: [], fail: [] }
                case 'GetXpertChatModelQuery':
                    return chatModel
                default:
                    throw new Error(`Unexpected query ${query.constructor.name}`)
            }
        })
    }
    const commandBus = {
        execute: jest.fn(async (command: object) => {
            if (command instanceof CreateNodeStagePendingSteerFollowUpsCommand)
                return new CreateNodeStagePendingSteerFollowUpsHandler(repository as never).execute(command)
            if (command instanceof CreateNodeConsumePendingSteerFollowUpsCommand)
                return new CreateNodeConsumePendingSteerFollowUpsHandler(
                    commandBus as unknown as CommandBus,
                    queryBus as unknown as QueryBus,
                    repository as never
                ).execute(command)
            if (command.constructor.name === 'ToolsetGetToolsCommand') return []
            throw new Error(`Unexpected command ${command.constructor.name}`)
        })
    }
    const runtime = {
        createScopedApi: jest.fn().mockReturnValue({}),
        resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
    }
    const handler = new XpertAgentSubgraphHandler(
        saver as never,
        commandBus as unknown as CommandBus,
        queryBus as unknown as QueryBus,
        { t: jest.fn(), translate: jest.fn() } as never,
        null,
        runtime as unknown as AgentMiddlewareRuntimeService,
        { findOne: jest.fn(async (id: string) => ({ id })) } as never
    )
    Object.defineProperty(handler, 'agentMiddlewareRegistry', {
        value: {
            get: () => ({ createMiddleware: (_options: object, _context: IAgentMiddlewareContext) => middleware })
        }
    })
    const compile = async (overrides: Partial<XpertAgentSubgraphCommand['options']> = {}) => {
        const controller = new AbortController()
        return (
            await handler.execute(
                new XpertAgentSubgraphCommand(
                    agentKey,
                    {
                        id: 'xpert-1',
                        tenantId: 'tenant',
                        workspaceId: 'workspace'
                    } as IXpert,
                    {
                        isStart: true,
                        isDraft: true,
                        mute: [],
                        store: null,
                        subscriber: null,
                        execution: { id: 'execution-1' } as IXpertAgentExecution,
                        rootController: controller,
                        signal: controller.signal,
                        channel: agentChannel,
                        thread_id: config.configurable.thread_id,
                        conversationId: 'conversation-1',
                        environment: { variables: [] } as IEnvironment,
                        partners: [],
                        ...overrides
                    }
                )
            )
        ).graph
    }
    return { compile, saver, model, toolRun, requests, beforeModel, repository }
}

export function input(text: string) {
    return {
        human: { input: text },
        input: text,
        sys: {
            language: 'en-US',
            user_email: 'user@example.com',
            timezone: 'UTC',
            date: '2026-10-27',
            datetime: '2026-10-27',
            common_times: ''
        }
    }
}

export function humanMessages(messages: BaseMessage[]) {
    return messages.filter((message) => message.getType() === 'human')
}
