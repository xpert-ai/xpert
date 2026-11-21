import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { WidgetsMiddleware } from '../widgetsMiddleware'

jest.mock('@xpert-ai/plugin-sdk', () => ({ AgentMiddlewareStrategy: () => (target: object) => target }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))

function form() {
    return {
        messages: [
            { dataModelUpdate: { contents: [{ key: 'name', valueString: '' }] } },
            {
                surfaceUpdate: {
                    components: [
                        { id: 'root', component: { Column: { children: { explicitList: ['field', 'submit'] } } } },
                        {
                            id: 'field',
                            component: { TextField: { label: { literalString: 'Name' }, text: { path: '/name' } } }
                        },
                        { id: 'caption', component: { Text: { text: { literalString: 'Submit' } } } },
                        {
                            id: 'submit',
                            component: {
                                Button: {
                                    child: 'caption',
                                    action: {
                                        name: 'submit_form',
                                        context: [{ key: 'name', value: { path: '/name' } }]
                                    }
                                }
                            }
                        }
                    ]
                }
            },
            { beginRendering: { root: 'root' } }
        ]
    }
}

describe('WidgetsMiddleware', () => {
    beforeEach(() => jest.clearAllMocks())

    it('exposes a render tool and an on-demand catalog without requiring a UI on every turn', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware({})
        expect(middleware.tools?.map((item) => item.name)).toEqual(['render_a2ui_surface', 'a2ui_catalog'])
        const messages = [new HumanMessage('2+2?')]
        const handler = jest.fn().mockResolvedValue(new AIMessage('4'))
        const result = await middleware.wrapModelCall!(
            {
                model: new FakeListChatModel({ responses: ['4'] }),
                messages,
                systemMessage: new SystemMessage('Existing instructions'),
                tools: middleware.tools!,
                state: { messages },
                runtime: {}
            },
            handler
        )
        expect(result.content).toBe('4')
        const prompt = JSON.stringify(handler.mock.calls[0][0].systemMessage.content)
        expect(prompt).toContain('Existing instructions')
        expect(prompt).toContain('A UI is optional')
        expect(prompt).not.toContain('Do not answer with normal text')
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
    })

    it('emits a durable Widget event with only its generated action names', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware({})
        const handler = jest.fn()
        const result = await middleware.wrapToolCall!(
            {
                toolCall: { id: 'call-form', name: 'render_a2ui_surface', args: form() },
                tool: middleware.tools![0],
                state: { messages: [] },
                runtime: {}
            },
            handler
        )
        expect(handler).not.toHaveBeenCalled()
        expect(result).toBeInstanceOf(ToolMessage)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'call-form',
                type: 'Widget',
                category: 'Computer',
                widgets: [
                    expect.objectContaining({
                        agentActions: ['submit_form'],
                        requiresIdleThread: true,
                        messages: expect.any(Array)
                    })
                ]
            })
        )
        expect(Reflect.get(result, 'content')).not.toContain('surfaceUpdate')
    })

    it('returns a correctable tool error without emitting a broken card', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware({})
        const result = await middleware.wrapToolCall!(
            {
                toolCall: { id: 'bad', name: 'render_a2ui_surface', args: { messages: [] } },
                tool: middleware.tools![0],
                state: { messages: [] },
                runtime: {}
            },
            jest.fn()
        )
        expect(Reflect.get(result, 'status')).toBe('error')
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
    })

    it('preserves manual templates and does not reroute their host actions', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware({
            widgets: [
                {
                    name: 'manual',
                    value: '{"title":"Example"}',
                    widget: JSON.stringify([{ id: 'root', component: { Text: { text: { path: '/title' } } } }])
                }
            ]
        })
        const result = await middleware.wrapToolCall!(
            {
                toolCall: { id: 'manual-call', name: 'manual', args: { title: 'Revenue' } },
                tool: middleware.tools![2],
                state: { messages: [] },
                runtime: {}
            },
            jest.fn()
        )
        expect(Reflect.get(result, 'status')).not.toBe('error')
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                widgets: [expect.objectContaining({ name: 'manual', messages: expect.any(Array) })]
            })
        )
        const event = jest.mocked(dispatchCustomEvent).mock.calls[0][1]
        expect(JSON.stringify(event)).toContain('Revenue')
        expect(JSON.stringify(event)).not.toContain('agentActions')
    })
})
