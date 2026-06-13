import { AIMessage, ToolMessage } from '@langchain/core/messages'
import {
    channelName,
    IWFNAgentWorkflow,
    TXpertGraph,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertParameterTypeEnum
} from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import {
    agentToolOutputVariables,
    WORKFLOW_AGENT_TOOL_ARGS_CHANNEL,
    WorkflowAgentWorkflowNodeStrategy,
    WorkflowAgentToolNodeStrategy
} from './strategy'

function hasParse(value: unknown): value is { parse(input: unknown): unknown } {
    return typeof value === 'object' && value !== null && 'parse' in value && typeof value.parse === 'function'
}

describe('WorkflowAgentWorkflowNodeStrategy', () => {
    let moduleRef: TestingModule
    let strategy: WorkflowAgentWorkflowNodeStrategy
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }

    const leaderKey = 'Agent_Leader'
    const nodeKey = 'AgentWorkflow_1'

    const createNode = (overrides: Partial<IWFNAgentWorkflow> = {}): TXpertTeamNode<'workflow'> => {
        const entity: IWFNAgentWorkflow = {
            id: 'node-1',
            key: nodeKey,
            type: WorkflowNodeTypeEnum.AGENT_WORKFLOW,
            title: 'Submit report',
            toolName: 'submit_report',
            toolDescription: 'Submit the finished report.',
            toolParameters: [
                {
                    name: 'query',
                    type: XpertParameterTypeEnum.STRING,
                    title: 'Query',
                    description: 'Report query'
                }
            ],
            ...overrides
        }

        return {
            type: 'workflow',
            key: nodeKey,
            position: { x: 0, y: 0 },
            entity
        }
    }

    const createGraph = (): TXpertGraph => ({
        nodes: [
            createNode(),
            {
                type: 'workflow',
                key: 'Next_1',
                position: { x: 200, y: 0 },
                entity: {
                    id: 'next-1',
                    key: 'Next_1',
                    type: WorkflowNodeTypeEnum.ANSWER
                }
            }
        ],
        connections: [
            {
                type: 'edge',
                key: `${nodeKey}/Next_1`,
                from: nodeKey,
                to: 'Next_1'
            }
        ]
    })

    const createResult = (node = createNode()) =>
        strategy.create({
            graph: createGraph(),
            node,
            xpertId: 'xpert-1',
            environment: {
                name: 'Test',
                variables: []
            },
            isDraft: true,
            leaderKey,
            conversationId: 'conversation-1'
        })

    beforeEach(async () => {
        commandBus = {
            execute: jest.fn().mockResolvedValue({ id: 'execution-1' })
        }
        queryBus = {
            execute: jest.fn().mockResolvedValue({ id: 'execution-1' })
        }

        moduleRef = await Test.createTestingModule({
            providers: [
                WorkflowAgentWorkflowNodeStrategy,
                WorkflowAgentToolNodeStrategy,
                {
                    provide: CommandBus,
                    useValue: commandBus
                },
                {
                    provide: QueryBus,
                    useValue: queryBus
                }
            ]
        }).compile()

        strategy = moduleRef.get(WorkflowAgentWorkflowNodeStrategy)
    })

    afterEach(async () => {
        await moduleRef.close()
    })

    it('creates a callable workflow tool from the configured name and parameters', () => {
        const result = createResult()

        expect(result.name).toBe('submit_report')
        expect(result.caller).toBe(leaderKey)
        expect(result.toolset).toEqual({
            provider: 'workflow_agent_tool',
            title: 'Submit report'
        })
        expect(result.tool?.name).toBe('submit_report')
        expect(result.tool?.description).toBe('Submit the finished report.')
        expect(result.channel?.name).toBe(channelName(nodeKey))

        if (!result.tool || !('schema' in result.tool) || !hasParse(result.tool.schema)) {
            throw new Error('Expected agent tool to expose a parseable schema')
        }

        expect(result.tool.schema.parse({ query: 'quarterly status' })).toEqual({
            query: 'quarterly status'
        })
    })

    it('keeps the legacy agent-tool strategy registered as deprecated', () => {
        const legacyStrategy = moduleRef.get(WorkflowAgentToolNodeStrategy)

        expect(legacyStrategy.meta.name).toBe(WorkflowNodeTypeEnum.AGENT_TOOL)
        expect(legacyStrategy.meta.deprecated).toBe(true)
    })

    it('stores the incoming tool call and args on the agent-tool channel', async () => {
        const result = createResult()
        const toolCall = {
            id: 'call-1',
            name: 'submit_report',
            args: {
                query: 'quarterly status'
            }
        }

        const output = await result.graph.invoke(
            {
                toolCall,
                messages: []
            },
            {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: 'checkpoint-ns',
                    checkpoint_id: 'checkpoint-1',
                    executionId: 'parent-execution-1'
                }
            }
        )

        expect(output[channelName(nodeKey)]).toEqual({
            toolCall,
            [WORKFLOW_AGENT_TOOL_ARGS_CHANNEL]: {
                query: 'quarterly status'
            }
        })
        expect(commandBus.execute).toHaveBeenCalledTimes(2)
        expect(queryBus.execute).toHaveBeenCalledTimes(1)
    })

    it('writes the final tool message back to the leader when the stored tool call is complete', async () => {
        const result = createResult()
        const storedToolCall = {
            id: 'call-1',
            name: 'submit_report',
            args: {
                query: 'quarterly status'
            }
        }

        const output = await result.graph.invoke(
            {
                toolCall: null,
                messages: [new AIMessage('report completed')],
                [channelName(nodeKey)]: {
                    toolCall: storedToolCall
                }
            },
            {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: 'checkpoint-ns',
                    checkpoint_id: 'checkpoint-1',
                    executionId: 'parent-execution-1'
                }
            }
        )

        const leaderMessages = output[channelName(leaderKey)].messages
        const rootMessages = output.messages

        expect(leaderMessages).toHaveLength(1)
        expect(rootMessages).toHaveLength(1)
        expect(leaderMessages[0]).toBeInstanceOf(ToolMessage)
        expect(rootMessages[0]).toBeInstanceOf(ToolMessage)
        expect(leaderMessages[0].content).toBe('report completed')
        expect(leaderMessages[0].tool_call_id).toBe('call-1')
        expect(output[channelName(nodeKey)]).toEqual({
            toolCall: null
        })
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('uses the configured return variable as the final tool message content', async () => {
        const iteratorChannel = channelName('Iterator_1')
        const result = createResult(
            createNode({
                returnSource: {
                    type: 'variable',
                    variableSelector: `${iteratorChannel}.output_str`
                }
            })
        )
        const storedToolCall = {
            id: 'call-1',
            name: 'submit_report',
            args: {
                query: 'quarterly status'
            }
        }

        const output = await result.graph.invoke(
            {
                toolCall: null,
                messages: [new AIMessage('ignored last message')],
                [channelName(nodeKey)]: {
                    toolCall: storedToolCall
                },
                [iteratorChannel]: {
                    output_str: 'iterator completed'
                }
            },
            {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: 'checkpoint-ns',
                    checkpoint_id: 'checkpoint-1',
                    executionId: 'parent-execution-1'
                }
            }
        )

        expect(output[channelName(leaderKey)].messages[0].content).toBe('iterator completed')
        expect(output.messages[0].content).toBe('iterator completed')
    })

    it('uses the configured return template as the final tool message content', async () => {
        const iteratorChannel = channelName('Iterator_1')
        const result = createResult(
            createNode({
                returnSource: {
                    type: 'template',
                    template: 'Result: {{iterator_1_channel.output_str}}'
                }
            })
        )
        const storedToolCall = {
            id: 'call-1',
            name: 'submit_report',
            args: {
                query: 'quarterly status'
            }
        }

        const output = await result.graph.invoke(
            {
                toolCall: null,
                messages: [new AIMessage('ignored last message')],
                [channelName(nodeKey)]: {
                    toolCall: storedToolCall
                },
                [iteratorChannel]: {
                    output_str: 'iterator completed'
                }
            },
            {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: 'checkpoint-ns',
                    checkpoint_id: 'checkpoint-1',
                    executionId: 'parent-execution-1'
                }
            }
        )

        expect(output[channelName(leaderKey)].messages[0].content).toBe('Result: iterator completed')
        expect(output.messages[0].content).toBe('Result: iterator completed')
    })

    it('returns output variables under the args channel', () => {
        const variables = agentToolOutputVariables(createNode().entity)

        expect(variables).toEqual([
            {
                name: 'args.query',
                type: XpertParameterTypeEnum.STRING,
                title: 'Query',
                description: 'Report query'
            }
        ])
        expect(strategy.outputVariables(createNode().entity)).toEqual(variables)
    })
})
