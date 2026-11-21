import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import { normalizeA2UIServerMessages, normalizeA2UIWidgetResults, WidgetsMiddleware } from './widgetsMiddleware'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    __esModule: true,
    AgentMiddlewareStrategy: () => (target: unknown) => target
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn().mockResolvedValue(undefined) }))

describe('WidgetsMiddleware A2UI flat messages', () => {
    beforeEach(() => jest.clearAllMocks())
    it('defaults missing surface ids and keeps flat messages', () => {
        const messages = normalizeA2UIServerMessages([
            {
                surfaceUpdate: {
                    components: [
                        {
                            id: 'root',
                            component: {
                                Text: { text: { literalString: 'Hello' } }
                            }
                        }
                    ]
                }
            },
            {
                beginRendering: {
                    root: 'root'
                }
            }
        ])

        expect(messages[0].surfaceUpdate?.surfaceId).toBe('@default')
        expect(messages[1].beginRendering?.surfaceId).toBe('@default')
        expect(Reflect.get(messages[0], 'componentTree')).toBeUndefined()
    })

    it('normalizes JSON fallback widget output to widgets with messages', () => {
        const results = normalizeA2UIWidgetResults({
            name: 'generated_surface',
            messages: createTextMessages()
        })

        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
            name: 'generated_surface',
            messages: expect.any(Array)
        })
        expect(Reflect.get(results[0], 'config')).toBeUndefined()
    })

    it('normalizes tool-call style output to widgets with messages', () => {
        const results = normalizeA2UIWidgetResults({
            name: 'tool_surface',
            messages: createTextMessages()
        })

        expect(results[0].name).toBe('tool_surface')
        expect(results[0].messages[0].surfaceUpdate?.components[0].id).toBe('root')
    })

    it('allows empty options for automatic A2UI generation', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware(undefined, {} as IAgentMiddlewareContext)

        expect(middleware.tools?.map((item) => item.name)).toEqual(['render_a2ui_surface', 'a2ui_catalog'])
    })

    it('keeps configured widget schema tools beside automatic A2UI generation', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware(
            createManualWidgetConfig(),
            {} as IAgentMiddlewareContext
        )

        expect(middleware.tools?.map((item) => item.name)).toEqual(
            expect.arrayContaining(['render_a2ui_surface', 'manual_card'])
        )
    })

    it('emits configured widget templates as flat A2UI messages', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware(
            createManualWidgetConfig(),
            {} as IAgentMiddlewareContext
        )
        const wrapToolCall = getWrapToolCall(middleware)
        const tool = middleware.tools?.find((item) => item.name === 'manual_card')

        if (!tool) {
            throw new Error('Expected manual_card tool to be registered.')
        }

        const result = await wrapToolCall(
            {
                toolCall: {
                    id: 'call_1',
                    name: 'manual_card',
                    args: { title: 'Revenue summary' }
                },
                tool,
                state: {},
                runtime: {}
            } as Parameters<typeof wrapToolCall>[0],
            async () => {
                throw new Error('Manual widget tool should not fall through to handler.')
            }
        )
        const content = Reflect.get(result, 'content')

        expect(typeof content).toBe('string')
        expect(JSON.parse(String(content))).toMatchObject({
            widget: {
                name: 'manual_card',
                messages: [
                    {
                        surfaceUpdate: {
                            surfaceId: '@default',
                            components: [
                                {
                                    id: 'root',
                                    component: {
                                        Text: {
                                            text: {
                                                literalString: 'Revenue summary'
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        beginRendering: {
                            surfaceId: '@default',
                            root: 'root'
                        }
                    }
                ]
            }
        })
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                mode: 'tool_calls',
                widgets: [expect.objectContaining({ name: 'manual_card', messages: expect.any(Array) })]
            })
        )
    })

    it('keeps manual widget templates permissive for legacy composer shapes', async () => {
        const middleware = await new WidgetsMiddleware().createMiddleware(
            createLegacyManualWidgetConfig(),
            {} as IAgentMiddlewareContext
        )
        const wrapToolCall = getWrapToolCall(middleware)
        const tool = middleware.tools?.find((item) => item.name === 'legacy_manual_card')

        if (!tool) {
            throw new Error('Expected legacy_manual_card tool to be registered.')
        }

        const result = await wrapToolCall(
            {
                toolCall: {
                    id: 'call_legacy',
                    name: 'legacy_manual_card',
                    args: {}
                },
                tool,
                state: {},
                runtime: {}
            } as Parameters<typeof wrapToolCall>[0],
            async () => {
                throw new Error('Manual widget tool should not fall through to handler.')
            }
        )
        const content = Reflect.get(result, 'content')

        expect(typeof content).toBe('string')
        expect(JSON.parse(String(content))).toMatchObject({
            widget: {
                name: 'legacy_manual_card',
                messages: [
                    {
                        surfaceUpdate: {
                            surfaceId: '@default',
                            components: [
                                {
                                    id: 'root',
                                    component: {
                                        Text: {
                                            text: 'Legacy manual title',
                                            style: { fontSize: '20' }
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        beginRendering: {
                            surfaceId: '@default',
                            root: 'root'
                        }
                    }
                ]
            }
        })
    })

    it('rejects missing beginRendering root', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'root',
                                component: {
                                    Text: { text: { literalString: 'Hello' } }
                                }
                            }
                        ]
                    }
                }
            ])
        ).toThrow('beginRendering.root')
    })

    it('rejects roots that do not reference a component id', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'title',
                                component: {
                                    Text: { text: { literalString: 'Hello' } }
                                }
                            }
                        ]
                    }
                },
                {
                    beginRendering: {
                        root: 'missing-root'
                    }
                }
            ])
        ).toThrow('does not reference an existing component id')
    })

    it('rejects component objects with multiple component type keys', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'root',
                                component: {
                                    Text: { text: { literalString: 'Hello' } },
                                    Column: { children: { explicitList: [] } }
                                }
                            }
                        ]
                    }
                },
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).toThrow('exactly one component type key')
    })

    it('rejects raw Text.text primitives in generated A2UI messages', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'root',
                                component: {
                                    Text: { text: 'Order Date' }
                                }
                            }
                        ]
                    }
                },
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).toThrow('text must be an object')
    })

    it('rejects unsupported style objects in generated A2UI messages', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'root',
                                component: {
                                    Text: {
                                        text: { literalString: 'Dashboard' },
                                        style: { fontSize: '20' }
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).toThrow('style is not supported')
    })

    it('rejects non-standard List template fields in generated A2UI messages', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'root',
                                component: {
                                    List: {
                                        children: {
                                            template: {
                                                dataPath: '/tableRows',
                                                itemTemplate: {
                                                    id: 'rowItem',
                                                    component: {
                                                        Text: { text: { path: 'date' } }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).toThrow('template.dataPath is not standard A2UI')
    })

    it('rejects flattened row keys for List template data models', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    dataModelUpdate: {
                        path: '/rows',
                        contents: [
                            { key: 'date', valueString: '2017-07-01' },
                            { key: 'sales', valueNumber: 28408.86 },
                            { key: 'yoy', valueString: 'N/A' },
                            { key: 'row_1_date', valueString: '2017-07-02' },
                            { key: 'row_1_sales', valueNumber: 42734.32 },
                            { key: 'row_1_yoy', valueString: 'N/A' }
                        ]
                    }
                },
                {
                    surfaceUpdate: {
                        components: [
                            {
                                id: 'root',
                                component: {
                                    List: {
                                        children: {
                                            template: {
                                                componentId: 'rowTemplate',
                                                dataBinding: '/rows'
                                            }
                                        }
                                    }
                                }
                            },
                            {
                                id: 'rowTemplate',
                                component: {
                                    Row: {
                                        children: {
                                            explicitList: ['dateCell']
                                        }
                                    }
                                }
                            },
                            {
                                id: 'dateCell',
                                component: {
                                    Text: {
                                        text: { path: 'date' }
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).toThrow('must be an array/valueMap row collection')
    })

    it('rejects repeated field keys in nested List valueMap data models', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    dataModelUpdate: {
                        path: '/',
                        contents: [
                            {
                                key: 'rows',
                                valueMap: [
                                    { key: 'month', valueString: '1月' },
                                    { key: 'sales2024', valueNumber: 1327674.78 },
                                    { key: 'sales2023', valueNumber: 3235186.98 },
                                    { key: 'yoy', valueString: '-58.96%' },
                                    { key: 'month', valueString: '2月' },
                                    { key: 'sales2024', valueNumber: 3936463.67 },
                                    { key: 'sales2023', valueNumber: 4070045.08 },
                                    { key: 'yoy', valueString: '-3.28%' }
                                ]
                            }
                        ]
                    }
                },
                createRowsSurfaceUpdate(),
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).toThrow('Repeated field key "month"')
    })

    it('accepts nested List valueMap row objects', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    dataModelUpdate: {
                        path: '/',
                        contents: [
                            {
                                key: 'rows',
                                valueMap: [
                                    {
                                        key: '0',
                                        valueMap: [
                                            { key: 'month', valueString: '1月' },
                                            { key: 'sales2024', valueNumber: 1327674.78 },
                                            { key: 'sales2023', valueNumber: 3235186.98 },
                                            { key: 'yoy', valueString: '-58.96%' }
                                        ]
                                    },
                                    {
                                        key: '1',
                                        valueMap: [
                                            { key: 'month', valueString: '2月' },
                                            { key: 'sales2024', valueNumber: 3936463.67 },
                                            { key: 'sales2023', valueNumber: 4070045.08 },
                                            { key: 'yoy', valueString: '-3.28%' }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
                createRowsSurfaceUpdate(),
                {
                    beginRendering: {
                        root: 'root'
                    }
                }
            ])
        ).not.toThrow()
    })
})

function createTextMessages() {
    return [
        {
            surfaceUpdate: {
                components: [
                    {
                        id: 'root',
                        component: {
                            Text: { text: { literalString: 'Hello' } }
                        }
                    }
                ]
            }
        },
        {
            beginRendering: {
                root: 'root'
            }
        }
    ]
}

function createRowsSurfaceUpdate() {
    return {
        surfaceUpdate: {
            components: [
                {
                    id: 'root',
                    component: {
                        List: {
                            children: {
                                template: {
                                    componentId: 'rowTemplate',
                                    dataBinding: '/rows'
                                }
                            }
                        }
                    }
                },
                {
                    id: 'rowTemplate',
                    component: {
                        Row: {
                            children: {
                                explicitList: ['cellMonth', 'cellSales2024', 'cellSales2023', 'cellYoY']
                            }
                        }
                    }
                },
                {
                    id: 'cellMonth',
                    component: {
                        Text: {
                            text: { path: 'month' }
                        }
                    }
                },
                {
                    id: 'cellSales2024',
                    component: {
                        Text: {
                            text: { path: 'sales2024' }
                        }
                    }
                },
                {
                    id: 'cellSales2023',
                    component: {
                        Text: {
                            text: { path: 'sales2023' }
                        }
                    }
                },
                {
                    id: 'cellYoY',
                    component: {
                        Text: {
                            text: { path: 'yoy' }
                        }
                    }
                }
            ]
        }
    }
}

function createManualWidgetConfig() {
    return {
        widgets: [
            {
                name: 'manual_card',
                description: 'Render a manually configured card.',
                widget: JSON.stringify([
                    {
                        id: 'root',
                        component: {
                            Text: {
                                text: {
                                    path: '/title'
                                }
                            }
                        }
                    }
                ]),
                value: JSON.stringify({
                    title: 'Fallback title'
                })
            }
        ]
    }
}

function createLegacyManualWidgetConfig() {
    return {
        widgets: [
            {
                name: 'legacy_manual_card',
                description: 'Render a legacy manually configured card.',
                widget: JSON.stringify([
                    {
                        id: 'root',
                        component: {
                            Text: {
                                text: 'Legacy manual title',
                                style: {
                                    fontSize: '20'
                                }
                            }
                        }
                    }
                ])
            }
        ]
    }
}

function getWrapToolCall(middleware: AgentMiddleware): NonNullable<AgentMiddleware['wrapToolCall']> {
    if (!middleware.wrapToolCall) {
        throw new Error('Expected middleware to expose wrapToolCall.')
    }
    return middleware.wrapToolCall
}
