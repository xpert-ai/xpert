import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    channelName,
    type IWFNTool,
    type TXpertGraph,
    type TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { z } from 'zod'
import { _BaseToolset } from '../../../shared'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { createToolNode } from '.'

const nodeKey = 'Tool_1'
const toolsetId = 'toolset-1'
const toolName = 'lookup'

class WorkflowTestToolset extends _BaseToolset<StructuredToolInterface> {
    providerName = 'test'
    initTools = jest.fn(async () => this.tools)
    close = jest.fn(async () => undefined)

    constructor(tool: StructuredToolInterface) {
        super()
        this.tools = [tool]
    }

    getId(): string {
        return toolsetId
    }

    getName(): string {
        return 'Test Toolset'
    }

    getToolTitle(name: string): string {
        return name
    }
}

function createTool(func: () => Promise<string> | string) {
    return new DynamicStructuredTool({
        name: toolName,
        description: 'Lookup data',
        schema: z.object({
            query: z.string().optional()
        }),
        func: async () => await func()
    })
}

function createNode(overrides: Partial<IWFNTool> = {}): TXpertTeamNode<'workflow'> {
    const entity: IWFNTool = {
        id: 'node-1',
        key: nodeKey,
        type: WorkflowNodeTypeEnum.TOOL,
        title: 'Lookup',
        toolsetId,
        toolName,
        parameterVariable: '',
        parameters: {
            query: 'status'
        },
        ...overrides
    }

    return {
        type: 'workflow',
        key: nodeKey,
        position: { x: 0, y: 0 },
        entity
    }
}

function createGraph(node = createNode()): TXpertGraph {
    return {
        nodes: [node],
        connections: []
    }
}

function createBuses(toolset: WorkflowTestToolset) {
    const commandBus = {
        execute: jest.fn(async (command: object) => {
            if (command instanceof ToolsetGetToolsCommand) {
                return [toolset]
            }
            return { id: 'execution-1' }
        })
    }
    const queryBus = {
        execute: jest.fn(async () => ({ id: 'execution-1' }))
    }

    return { commandBus, queryBus }
}

async function invokeWorkflowToolNode(toolset: WorkflowTestToolset, node = createNode()) {
    const { commandBus, queryBus } = createBuses(toolset)
    const workflow = createToolNode(createGraph(node), node, {
        commandBus: commandBus as unknown as CommandBus,
        queryBus: queryBus as unknown as QueryBus,
        xpertId: 'xpert-1',
        workspaceId: 'workspace-1',
        environment: {
            name: 'Test',
            variables: []
        },
        conversationId: 'conversation-1'
    })

    const output = await workflow.workflowNode.graph.invoke(
        {},
        {
            configurable: {
                thread_id: 'thread-1',
                checkpoint_ns: 'checkpoint-ns',
                checkpoint_id: 'checkpoint-1',
                executionId: 'parent-execution-1',
                projectId: 'project-1',
                agentKey: 'agent-1'
            }
        }
    )

    return { output, commandBus, queryBus }
}

describe('workflow tool node cleanup', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('closes the toolset after a successful tool call', async () => {
        const toolset = new WorkflowTestToolset(createTool(async () => '{"ok":true}'))

        const { output } = await invokeWorkflowToolNode(toolset)

        expect(output[channelName(nodeKey)]).toEqual({
            text: '{"ok":true}',
            json: { ok: true },
            files: undefined,
            error: null
        })
        expect(toolset.initTools).toHaveBeenCalledTimes(1)
        expect(toolset.close).toHaveBeenCalledTimes(1)
    })

    it('closes the toolset when tool errors are handled with a default value', async () => {
        const toolset = new WorkflowTestToolset(
            createTool(async () => {
                throw new Error('tool failed')
            })
        )
        const node = createNode({
            errorHandling: {
                type: 'defaultValue',
                defaultValue: {
                    result: '{"fallback":true}'
                }
            }
        })

        const { output } = await invokeWorkflowToolNode(toolset, node)

        expect(output[channelName(nodeKey)]).toEqual({
            text: '{"fallback":true}',
            json: { fallback: true },
            files: [],
            error: null
        })
        expect(toolset.close).toHaveBeenCalledTimes(1)
    })

    it('closes the toolset when the tool call throws', async () => {
        const toolset = new WorkflowTestToolset(
            createTool(async () => {
                throw new Error('tool failed')
            })
        )

        await expect(invokeWorkflowToolNode(toolset)).rejects.toThrow('tool failed')

        expect(toolset.close).toHaveBeenCalledTimes(1)
    })

    it('closes the toolset when initTools throws', async () => {
        const toolset = new WorkflowTestToolset(createTool(async () => '{"ok":true}'))
        toolset.initTools.mockRejectedValue(new Error('init failed'))

        await expect(invokeWorkflowToolNode(toolset)).rejects.toThrow('init failed')

        expect(toolset.close).toHaveBeenCalledTimes(1)
    })

    it('logs cleanup failures without replacing the tool result', async () => {
        const loggerDebug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
        const closeError = new Error('close failed')
        const toolset = new WorkflowTestToolset(createTool(async () => '{"ok":true}'))
        toolset.close.mockRejectedValue(closeError)

        const { output } = await invokeWorkflowToolNode(toolset)
        await Promise.resolve()

        expect(output[channelName(nodeKey)].json).toEqual({ ok: true })
        expect(loggerDebug).toHaveBeenCalledWith(closeError)
    })
})
