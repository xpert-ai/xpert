import { normalizeA2UIServerMessages, normalizeA2UIWidgetResults } from './protocol'

describe('Generated A2UI protocol', () => {
    it.each([
        { TextField: { label: { literalString: 'Name' }, value: { path: '/name' } } },
        { Button: { text: { literalString: 'Submit' }, action: { name: 'submit_form' } } }
    ])('rejects renderer-incompatible generated form fields: %j', (component) => {
        expect(() =>
            normalizeA2UIServerMessages([
                { surfaceUpdate: { components: [{ id: 'root', component }] } },
                { beginRendering: { root: 'root' } }
            ])
        ).toThrow()
    })

    it('rejects an empty widget batch and an oversized payload before rendering', () => {
        expect(() => normalizeA2UIWidgetResults({ widgets: [] })).toThrow('between 1 and 8')
        expect(() => normalizeA2UIWidgetResults({ values: 'x'.repeat(17000) })).toThrow('16K')
    })

    it('rejects cyclic component references', () => {
        expect(() =>
            normalizeA2UIServerMessages([
                {
                    surfaceUpdate: {
                        components: [{ id: 'root', component: { Column: { children: { explicitList: ['root'] } } } }]
                    }
                },
                { beginRendering: { root: 'root' } }
            ])
        ).toThrow('cycle')
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
