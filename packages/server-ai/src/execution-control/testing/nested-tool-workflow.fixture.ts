import { RunnableLambda } from '@langchain/core/runnables'
import { DynamicTool } from '@langchain/core/tools'
import { InMemoryStore } from '@langchain/langgraph'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { I18nService } from 'nestjs-i18n'
import { Subscriber } from 'rxjs'
import { randomUUID } from 'node:crypto'
import {
    channelName,
    type IWFNIterating,
    type IWFNIterator,
    type IWFNSubflow,
    type TXpertGraph,
    type TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { XpertAgentSubgraphCommand } from '../../xpert-agent/commands/subgraph.command'
import { XpertWorkflowSubgraphCommand } from '../../xpert-agent/commands/workflow-subgraph.command'
import { WorkflowIteratorNodeStrategy } from '../../xpert-agent/plugins/iterator/strategy'
import { CreateWNIteratingCommand } from '../../xpert-agent/workflow/create-wn-iterating.command'
import { CreateWNSubflowCommand } from '../../xpert-agent/workflow/create-wn-subflow.command'
import { CreateWNIteratingHandler } from '../../xpert-agent/workflow/handlers/create-wn-iterating.handler'
import { CreateWNSubflowHandler } from '../../xpert-agent/workflow/handlers/create-wn-subflow.handler'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'

/** Stub only compilation, trace persistence and the external converter. Use the real workflow nodes and tool callbacks. */
export async function nestedToolWorkflow(modern: boolean, convert: (input: string) => Promise<string>) {
    const converter = new DynamicTool({ name: 'pdf_to_markdown', description: 'Test converter', func: convert })
    const subflow = new CreateWNSubflowCommand(
        'assistant',
        { nodes: [], connections: [] },
        node({
            id: 'flow',
            key: 'flow',
            type: WorkflowNodeTypeEnum.SUBFLOW,
            inputParams: [{ name: 'file', variable: 'file' }],
            outputParams: [{ name: 'text', variable: 'converted' }]
        }),
        {
            isDraft: false,
            mute: [],
            environment: { name: 'test', variables: [] },
            store: new InMemoryStore(),
            subscriber: new Subscriber()
        }
    )
    const agent: TXpertTeamNode<'agent'> = {
        key: 'reader',
        type: 'agent',
        position: { x: 0, y: 0 },
        entity: { key: 'reader' }
    }
    subflow.graph.nodes.push(subflow.node, agent)
    subflow.graph.connections.push({ key: 'flow-reader', type: 'agent', from: 'flow', to: 'reader' })

    const reader = RunnableLambda.from(async (state: { file: string }, config) => ({
        converted: await converter.invoke(state.file, config)
    }))
    const iteration = node({
        id: 'loop',
        key: 'loop',
        ...(modern
            ? { type: WorkflowNodeTypeEnum.ITERATOR as const }
            : { type: WorkflowNodeTypeEnum.ITERATING as const, inputParams: [{ name: '$item', variable: 'file' }] }),
        inputVariable: 'files',
        outputParams: [{ name: '$item', variable: 'converted' }]
    })
    const graph: TXpertGraph = {
        nodes: [
            iteration,
            { ...agent, parentId: iteration.key, key: 'iteration-agent', entity: { key: 'iteration-agent' } }
        ],
        connections: [{ key: 'loop-agent', type: 'agent', from: 'loop', to: 'iteration-agent' }]
    }
    const commands = {
        execute: jest.fn(async (command: object) => {
            if (command instanceof XpertAgentExecutionUpsertCommand)
                return { ...command.execution, id: command.execution.id ?? randomUUID() }
            if (command instanceof XpertAgentSubgraphCommand && command.agentKeyOrName === 'reader')
                return { graph: reader, agent: agent.entity }
            if (command instanceof XpertAgentSubgraphCommand || command instanceof XpertWorkflowSubgraphCommand)
                return { graph: perItem, agent: agent.entity }
            throw new Error('Unexpected test command')
        })
    }
    const module = await Test.createTestingModule({
        providers: [
            CreateWNSubflowHandler,
            CreateWNIteratingHandler,
            WorkflowIteratorNodeStrategy,
            { provide: CommandBus, useValue: commands },
            { provide: QueryBus, useValue: { execute: jest.fn(async () => ({})) } },
            { provide: I18nService, useValue: {} }
        ]
    }).compile()
    const nested = (await module.get(CreateWNSubflowHandler).execute(subflow)).workflowNode.graph
    const perItem = RunnableLambda.from(async (state: { file?: string; [key: string]: unknown }, config) => {
        const input = state[channelName('loop')]
        const file = input && typeof input === 'object' && '$item' in input ? input.$item : state.file
        if (typeof file !== 'string') throw new Error('Missing iteration input')
        const result = await nested.invoke({ file }, config)
        return { converted: result[channelName('flow')].text }
    })
    const runnable = modern
        ? (
              await module.get(WorkflowIteratorNodeStrategy).create({
                  xpertId: 'assistant',
                  graph,
                  node: iteration,
                  environment: subflow.options.environment,
                  isDraft: false
              })
          ).graph
        : (
              await module
                  .get(CreateWNIteratingHandler)
                  .execute(new CreateWNIteratingCommand('assistant', graph, iteration, subflow.options))
          ).workflowNode.graph
    return { runnable, close: () => module.close() }
}

function node(entity: IWFNIterating | IWFNSubflow | IWFNIterator): TXpertTeamNode<'workflow'> {
    return { type: 'workflow', key: entity.key, position: { x: 0, y: 0 }, entity }
}
