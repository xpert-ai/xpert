import { createInvokeHarness, createGraph, createCompiledGraph, consumeStream } from './invoke.test-fixture'
jest.mock('i18next', () => ({ ...jest.requireActual('i18next'), t: (key: string) => key }))
import { Subscriber } from 'rxjs'
import { WorkflowNodeTypeEnum, type IWFNMiddleware, type IXpertAgent, type TXpertGraph } from '@xpert-ai/contracts'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { CompileGraphCommand } from '../compile-graph.command'
import { REQUEST_USER_INPUT_MIDDLEWARE_NAME } from '../../../shared/agent/user-input'

function fixture(enabled: boolean, agentOptions?: IXpertAgent['options']) {
    const harness = createInvokeHarness()
    const graph = createGraph()
    const compiled = createCompiledGraph(graph)
    const middleware: IWFNMiddleware = {
        id: 'input',
        key: 'input',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: REQUEST_USER_INPUT_MIDDLEWARE_NAME,
        required: true
    }
    const definition: TXpertGraph = {
        nodes: enabled
            ? [
                  {
                      type: 'workflow',
                      key: 'input',
                      position: { x: 0, y: 0 },
                      entity: middleware
                  }
              ]
            : [],
        connections: enabled ? [{ key: 'agent-1/input', type: 'workflow', from: 'agent-1', to: 'input' }] : []
    }
    harness.commandBus.execute.mockImplementation(async (command: unknown) => {
        if (command instanceof CompileGraphCommand)
            return {
                ...compiled,
                agent: { ...compiled.agent, options: agentOptions },
                xpertGraph: definition
            }
        return null
    })
    const invoke = (source: 'human' | 'options' | 'off') =>
        harness.handler.execute(
            new XpertAgentInvokeCommand(
                { human: { input: 'Plan this change', ...(source === 'human' ? { planMode: true } : {}) } },
                'agent-1',
                { id: 'xpert-1', workspaceDataScope: 'user' },
                {
                    isDraft: true,
                    thread_id: 'thread-1',
                    execution: { id: 'execution-1', threadId: 'thread-1' },
                    rootExecutionId: 'execution-1',
                    subscriber: new Subscriber<MessageEvent>(),
                    store: null,
                    ...(source === 'options' ? { planMode: true } : {})
                }
            )
        )
    return { ...harness, graph, invoke }
}

describe('Plan Mode invocation admission', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it.each(['human', 'options'] as const)(
        'rejects %s Plan Mode before model execution without the capability',
        async (source) => {
            const f = fixture(false)
            await expect(f.invoke(source)).rejects.toThrow('server-ai:UserInput.PlanModeRequiresCapability')
            expect(f.graph.streamEvents).not.toHaveBeenCalled()
            expect(f.executionCancelService.unregister).toHaveBeenCalledWith('execution-1')
        }
    )

    it.each(['human', 'options'] as const)(
        'delivers %s Plan Mode through runtime state when enabled',
        async (source) => {
            const f = fixture(true)
            await consumeStream(await f.invoke(source))
            expect(f.graph.streamEvents.mock.calls[0][0]).toMatchObject({ human: { planMode: true } })
        }
    )

    it('preserves ordinary invocation without the capability', async () => {
        const f = fixture(false)
        await consumeStream(await f.invoke('off'))
        expect(f.graph.streamEvents).toHaveBeenCalledTimes(1)
        expect(f.graph.streamEvents.mock.calls[0][0].human.planMode).toBeUndefined()
    })

    it.each<NonNullable<IXpertAgent['options']>>([{ hidden: true }, { structuredOutputMethod: 'jsonMode' }])(
        'rejects unsupported Agent options for Plan Mode: %j',
        async (options) => {
            const f = fixture(true, options)
            await expect(f.invoke('human')).rejects.toThrow('server-ai:UserInput.UnsupportedAgent')
            expect(f.graph.streamEvents).not.toHaveBeenCalled()
        }
    )
})
