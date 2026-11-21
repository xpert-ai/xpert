import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import i18next from 'i18next'
import translations from '../../i18n/en.json'
import { composerToComponentTreeFormat, shortuuid, WidgetsMiddleware } from '../widgetsMiddleware'
import { buildManualWidgetResult, buildWidgetDefinitions } from './templates'

jest.mock('@xpert-ai/plugin-sdk', () => ({ AgentMiddlewareStrategy: () => (target: object) => target }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))

const template = (name = 'manual') => ({
    name,
    description: 'Revenue card',
    widget: JSON.stringify([{ id: 'root', component: { Text: { text: { path: '/title' } } } }]),
    value: JSON.stringify({ title: 'Default title' })
})
const textSurface = {
    messages: [
        {
            surfaceUpdate: {
                components: [{ id: 'root', component: { Text: { text: { literalString: 'Generated' } } } }]
            }
        },
        { beginRendering: { root: 'root' } }
    ]
}

async function modelCall(content: string, widgets = [template()], model = new FakeListChatModel({ responses: [] })) {
    const middleware = await new WidgetsMiddleware().createMiddleware({
        widgets,
        systemPrompt: 'JSON guidance',
        toolPrompt: 'Tool guidance'
    })
    const messages = [new HumanMessage('Show the revenue card')]
    const handler = jest.fn().mockResolvedValue(new AIMessage({ id: 'model-response', content }))
    const response = await middleware.wrapModelCall!(
        {
            model,
            messages,
            tools: middleware.tools!,
            systemMessage: new SystemMessage('Existing instructions'),
            state: { messages },
            runtime: {}
        },
        handler
    )
    return { response, handler, middleware }
}

describe('WidgetsMiddleware legacy compatibility', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: { en: { 'server-ai': translations } } })
    })
    beforeEach(() => jest.clearAllMocks())

    it.each([
        '{"title":"Revenue"}',
        '```json\n{"title":"Revenue"}\n```',
        'Here are the values: {"title":"Revenue"} End.'
    ])('renders legacy template JSON output: %s', async (content) => {
        const model = new FakeListChatModel({ responses: [], metadata: { profile: { toolCalling: false } } })
        const { response, handler, middleware } = await modelCall(content, [template()], model)
        expect(middleware.contextSchema).toBeDefined()
        expect(response.content).not.toContain('"title"')
        expect(JSON.stringify(handler.mock.calls[0][0].systemMessage.content)).toContain('Value template:')
        expect(JSON.stringify(handler.mock.calls[0][0].systemMessage.content)).toContain('JSON guidance')
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'model-response',
                mode: 'json',
                widgets: [expect.objectContaining({ name: 'manual', values: { title: 'Revenue' } })]
            })
        )
        const event = jest.mocked(dispatchCustomEvent).mock.calls[0][1]
        expect(JSON.stringify(event)).toContain('"literalString":"Revenue"')
        expect(JSON.stringify(event)).not.toContain('agentActions')
    })

    it.each([
        [{ title: 'First' }, { title: 'Second' }],
        { first: { title: 'First' }, second: { title: 'Second' } },
        { 0: { title: 'First' }, 1: { title: 'Second' } },
        { 1: { title: 'First' }, 2: { title: 'Second' } }
    ])('preserves multiple-template value output: %j', async (values) => {
        await modelCall(JSON.stringify(values), [template('first'), template('second')])
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                mode: 'json',
                widgets: [
                    expect.objectContaining({ name: 'first', values: { title: 'First' } }),
                    expect.objectContaining({ name: 'second', values: { title: 'Second' } })
                ]
            })
        )
    })

    it('retains example values for omitted templates', async () => {
        await modelCall('[{"title":"First"}]', [template('first'), template('second')])
        expect(JSON.stringify(jest.mocked(dispatchCustomEvent).mock.calls[0][1])).toContain('Default title')
    })

    it('supports a model profile without metadata and generated JSON output', async () => {
        const model = Object.assign(new FakeListChatModel({ responses: [] }), { profile: { toolCalling: false } })
        const { handler } = await modelCall(JSON.stringify(textSurface), [], model)
        expect(JSON.stringify(handler.mock.calls[0][0].systemMessage.content)).toContain('JSON guidance')
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                mode: 'a2ui_messages',
                widgets: [expect.objectContaining({ agentActions: [], requiresIdleThread: true })]
            })
        )
    })

    it('still accepts direct surface JSON from a tool-capable model', async () => {
        await modelCall(JSON.stringify(textSurface), [])
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
    })

    it('does not substitute templates for a malformed generated surface', async () => {
        const content = '{"messages":[]}'
        const { response } = await modelCall(content)
        expect(response.content).toBe(content)
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
    })

    it('leaves ordinary prose and model tool calls unchanged', async () => {
        const { response } = await modelCall('Revenue increased by 10%.')
        expect(response.content).toBe('Revenue increased by 10%.')
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
        const middleware = await new WidgetsMiddleware().createMiddleware({ widgets: [template()] })
        const answer = new AIMessage({
            content: JSON.stringify(textSurface),
            tool_calls: [{ id: 'call', name: 'manual', args: { title: 'Revenue' } }]
        })
        const messages = [new HumanMessage('Show revenue')]
        const result = await middleware.wrapModelCall!(
            {
                model: new FakeListChatModel({ responses: [] }),
                messages,
                tools: middleware.tools!,
                state: { messages },
                runtime: {}
            },
            async () => answer
        )
        expect(result).toBe(answer)
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
    })

    it('preserves wrapped tool values and the legacy widget result', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware({ widgets: [template()] })
        const result = await middleware.wrapToolCall!(
            {
                toolCall: { id: 'manual-call', name: 'manual', args: { values: { title: 'Revenue' } } },
                tool: middleware.tools![2],
                state: { messages: [] },
                runtime: {}
            },
            jest.fn()
        )
        expect(JSON.parse(String(Reflect.get(result, 'content')))).toMatchObject({
            widget: { name: 'manual', values: { title: 'Revenue' } }
        })
    })

    it('preserves root, escaped pointer and null literal bindings', () => {
        const [widget] = buildWidgetDefinitions([
            {
                widget: JSON.stringify([
                    {
                        id: 'root',
                        component: {
                            Text: {
                                text: { path: '/' },
                                escaped: { path: '/a~1b/~0key' },
                                empty: { path: '/missing' }
                            }
                        }
                    }
                ])
            }
        ])
        const result = buildManualWidgetResult(widget, { 'a/b': { '~key': 'Value' }, missing: null })
        expect(result.messages[0].surfaceUpdate?.components[0].component).toMatchObject({
            Text: {
                text: { literalString: '{"a/b":{"~key":"Value"},"missing":null}' },
                escaped: { literalString: 'Value' },
                empty: { literalString: '' }
            }
        })
    })

    it('retains the Composer converter and short id exports', () => {
        const items = [
            { id: 'root', component: { Column: { children: { explicitList: ['button'] } } } },
            { id: 'button', component: { Button: { child: 'label', action: 'submit' } } },
            { id: 'label', component: { Text: { text: 'Submit' } } }
        ]
        const converted = composerToComponentTreeFormat(items, { value: 1 }, { styles: { color: 'red' } })
        expect(converted).toMatchObject({
            dataModel: { value: 1 },
            styles: { color: 'red' },
            componentTree: {
                id: 'root',
                properties: {
                    children: [
                        {
                            id: 'button',
                            properties: {
                                action: { name: 'submit' },
                                child: { id: 'label', type: 'Text', properties: { text: 'Submit' } }
                            }
                        }
                    ]
                }
            }
        })
        expect(
            composerToComponentTreeFormat(items, {}, { rootComponentId: 'button', normalizeButtonAction: false })
                .componentTree.properties.action
        ).toBe('submit')
        expect(shortuuid()).toMatch(/^[a-zA-Z0-9]{10}$/)
    })
})
