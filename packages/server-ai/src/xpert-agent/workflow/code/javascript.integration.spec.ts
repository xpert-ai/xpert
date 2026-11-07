// The draft repository and knowledge-node branch are outside this Code-node fixture.
jest.mock('../../../xpert/xpert.service', () => ({ XpertService: class XpertService {} }))
jest.mock('../handlers/create-wn-knowledge-retrieval.handler', () => ({}))

import 'reflect-metadata'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { CommandBus, CommandHandler, CqrsModule, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { IWFNCode, TXpertTeamNode, WorkflowNodeTypeEnum, XpertParameterTypeEnum } from '@xpert-ai/contracts'
import { WorkflowNodeRegistry } from '@xpert-ai/plugin-sdk'
import { SandboxVMCommand } from '../../../sandbox/commands/vm.command'
import { SandboxVMHandler } from '../../../sandbox/commands/handlers/vm.handler'
import { XpertService } from '../../../xpert/xpert.service'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { WorkflowTestNodeCommand } from '../test.command'
import { WorkflowTestNodeHandler } from '../handlers/test.handler'
import { createCodeNode } from './node'
import { WorkflowCodeValidator } from './validator'

const entity: IWFNCode = {
    id: 'calculate',
    key: 'calculate',
    type: WorkflowNodeTypeEnum.CODE,
    language: 'javascript',
    code: 'return { total: order.items.reduce((sum, item) => sum + item.qty * item.price, 0) }',
    inputs: [{ name: 'order', variable: 'order' }],
    outputs: [{ name: 'total', type: XpertParameterTypeEnum.NUMBER }]
}
const node: TXpertTeamNode<'workflow'> = {
    key: entity.key,
    type: 'workflow',
    position: { x: 0, y: 0 },
    entity
}
const graph = { nodes: [node], connections: [] }
const order = { items: [{ qty: 3, price: 14 }] }

// Only persistence is substituted. Both entry points dispatch through Nest CQRS.
@CommandHandler(XpertAgentExecutionUpsertCommand)
class SaveExecution {
    execute({ execution }: XpertAgentExecutionUpsertCommand) {
        return { ...execution, id: 'test-execution' }
    }
}

@QueryHandler(XpertAgentExecutionOneQuery)
class ReadExecution {
    execute() {
        return { id: 'test-execution' }
    }
}

describe('JavaScript workflow Code node', () => {
    let app: TestingModule
    let bus: CommandBus

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                SandboxVMHandler,
                WorkflowTestNodeHandler,
                SaveExecution,
                ReadExecution,
                { provide: XpertService, useValue: { findOne: async () => ({ draft: graph }) } },
                { provide: WorkflowNodeRegistry, useValue: {} }
            ]
        }).compile()
        await app.init()
        bus = app.get(CommandBus)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('runs the Studio draft test command and flattens its JSON response', async () => {
        await expect(bus.execute(new WorkflowTestNodeCommand('test-assistant', node.key, { order }))).resolves.toEqual({
            total: 42,
            logs: undefined
        })
    })

    it('runs the same node in a compiled workflow and writes its output channel', async () => {
        const codeNode = createCodeNode(graph, node, {
            commandBus: bus,
            queryBus: app.get(QueryBus),
            validator: new WorkflowCodeValidator(),
            xpertId: 'test-assistant',
            environment: null
        })
        const state = Annotation.Root({
            order: Annotation<typeof order>(),
            calculate_channel: Annotation<{ total: number }>()
        })
        const workflow = new StateGraph(state)
            .addNode('calculate', codeNode.workflowNode.graph)
            .addEdge(START, 'calculate')
            .addEdge('calculate', END)
            .compile()
        const output = await workflow.invoke({ order }, { configurable: { thread_id: 'test-workflow' } })
        expect(output.calculate_channel).toEqual({ total: 42 })
    })

    it('copies structured inputs, preserves JSON results and exposes no host APIs', async () => {
        const input = { date: new Date('2001-01-01Z'), missing: undefined, bytes: new Uint8Array([0, 255]) }
        const result = await bus.execute(
            new SandboxVMCommand(
                'return [input.date.getUTCFullYear(), Object.hasOwn(input,"missing"), input.bytes[1], typeof require, typeof process, typeof fetch]',
                { input },
                null,
                'javascript'
            )
        )
        expect(result).toEqual({ result: [2001, true, 255, 'undefined', 'undefined', 'undefined'] })
        await expect(bus.execute(new SandboxVMCommand('return undefined', {}, null, 'javascript'))).rejects.toThrow()
        await expect(
            bus.execute(new SandboxVMCommand('throw new Error("bad input")', {}, null, 'javascript'))
        ).rejects.toThrow('bad input')
    })

    it('keeps typed-array offsets and shared backing stores without exposing Node buffer pools', async () => {
        const bytes = Uint8Array.of(4, 5, 6)
        const input = { bytes, tail: bytes.subarray(1), pooled: Buffer.from([9]) }
        const result = await bus.execute(
            new SandboxVMCommand(
                'return [input.tail.byteOffset, input.bytes.buffer === input.tail.buffer, input.tail[1], input.pooled.buffer.byteLength]',
                { input },
                null,
                'javascript'
            )
        )
        expect(result).toEqual({ result: [1, true, 6, 1] })
    })

    it('interrupts runaway code and runs the next request in a fresh global', async () => {
        await expect(
            bus.execute(new SandboxVMCommand('globalThis.leak = 1; while(true) {}', {}, null, 'javascript'))
        ).rejects.toThrow(/timed out/)
        await expect(bus.execute(new SandboxVMCommand('return typeof leak', {}, null, 'javascript'))).resolves.toEqual({
            result: 'undefined'
        })
    }, 15000)

    it('rejects excessive guest allocations and leaves the next execution healthy', async () => {
        await expect(
            bus.execute(
                new SandboxVMCommand(
                    'const buffers = []; for (;;) buffers.push(new ArrayBuffer(16 * 1024 * 1024))',
                    {},
                    null,
                    'javascript'
                )
            )
        ).rejects.toThrow(/out of memory/i)
        await expect(bus.execute(new SandboxVMCommand('return 42', {}, null, 'javascript'))).resolves.toEqual({
            result: 42
        })
    })

    it('shuts down active and queued workers and rejects new executions', async () => {
        const handler = new SandboxVMHandler()
        const tasks = Array.from({ length: 6 }, () =>
            handler.execute(new SandboxVMCommand('while(true) {}', {}, null, 'javascript'))
        )
        const settled = Promise.allSettled(tasks)
        await new Promise((resolve) => setTimeout(resolve, 250))
        handler.onModuleDestroy()
        for (const result of await settled) {
            expect(result).toMatchObject({
                status: 'rejected',
                reason: new Error('JavaScript sandbox is shutting down')
            })
        }
        await expect(handler.execute(new SandboxVMCommand('return 42', {}, null, 'javascript'))).rejects.toThrow(
            'shutting down'
        )
    })

    it('cancels an executing child', async () => {
        const stop = new AbortController()
        const run = bus.execute(new SandboxVMCommand('while(true) {}', {}, null, 'javascript', stop.signal))
        const timer = setTimeout(() => stop.abort(new Error('Cancelled workflow')), 200)
        try {
            await expect(run).rejects.toThrow('Cancelled workflow')
        } finally {
            clearTimeout(timer)
        }
    })
})
