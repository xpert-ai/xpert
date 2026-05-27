import { Injectable } from '@nestjs/common'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareStrategy, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import { z } from 'zod/v3'
import { ClientToolMiddleware, ClientToolMiddlewareConfig } from './client-tool.middleware'

export const OFFICE_AUTOMATION_MIDDLEWARE_NAME = 'office-automation'

export const OFFICE_POWERPOINT_TOOL_NAMES = [
    'office_powerpoint_snapshot',
    'office_powerpoint_select_slide',
    'office_powerpoint_add_slide',
    'office_powerpoint_delete_slide',
    'office_powerpoint_add_text_box',
    'office_powerpoint_add_shape',
    'office_powerpoint_update_shape',
    'office_powerpoint_delete_shape',
    'office_powerpoint_insert_image'
] as const

export const OFFICE_WORD_TOOL_NAMES = [
    'office_word_snapshot',
    'office_word_insert_text',
    'office_word_replace_selection',
    'office_word_insert_heading',
    'office_word_insert_table',
    'office_word_search_text'
] as const

export const OFFICE_EXCEL_TOOL_NAMES = [
    'office_excel_snapshot',
    'office_excel_get_range',
    'office_excel_set_range_values',
    'office_excel_add_worksheet',
    'office_excel_delete_worksheet',
    'office_excel_autofit_range',
    'office_excel_add_table'
] as const

export const OFFICE_AUTOMATION_TOOL_NAMES = [
    ...OFFICE_POWERPOINT_TOOL_NAMES,
    ...OFFICE_WORD_TOOL_NAMES,
    ...OFFICE_EXCEL_TOOL_NAMES
] as const

export const OFFICE_AUTOMATION_HOSTS = ['powerpoint', 'word', 'excel', 'all'] as const

type ClientToolDefinition = NonNullable<ClientToolMiddlewareConfig['clientTools']>[number]
type OfficeAutomationHost = (typeof OFFICE_AUTOMATION_HOSTS)[number]

const OFFICE_HOST_TOOL_NAMES = {
    powerpoint: OFFICE_POWERPOINT_TOOL_NAMES,
    word: OFFICE_WORD_TOOL_NAMES,
    excel: OFFICE_EXCEL_TOOL_NAMES,
    all: OFFICE_AUTOMATION_TOOL_NAMES
} satisfies Record<OfficeAutomationHost, readonly string[]>

const OFFICE_TOOL_DISPLAY_MESSAGES = {
    office_powerpoint_snapshot: {
        en_US: 'Inspect the presentation',
        zh_Hans: '查看演示文稿'
    },
    office_powerpoint_select_slide: {
        en_US: 'Select a slide',
        zh_Hans: '选择幻灯片'
    },
    office_powerpoint_add_slide: {
        en_US: 'Add a slide',
        zh_Hans: '添加幻灯片'
    },
    office_powerpoint_delete_slide: {
        en_US: 'Delete a slide',
        zh_Hans: '删除幻灯片'
    },
    office_powerpoint_add_text_box: {
        en_US: 'Add a text box',
        zh_Hans: '添加文本框'
    },
    office_powerpoint_add_shape: {
        en_US: 'Add a shape',
        zh_Hans: '添加形状'
    },
    office_powerpoint_update_shape: {
        en_US: 'Update a shape',
        zh_Hans: '更新形状'
    },
    office_powerpoint_delete_shape: {
        en_US: 'Delete a shape',
        zh_Hans: '删除形状'
    },
    office_powerpoint_insert_image: {
        en_US: 'Insert an image',
        zh_Hans: '插入图片'
    },
    office_word_snapshot: {
        en_US: 'Inspect the document',
        zh_Hans: '查看文档'
    },
    office_word_insert_text: {
        en_US: 'Insert text',
        zh_Hans: '插入文本'
    },
    office_word_replace_selection: {
        en_US: 'Replace selection',
        zh_Hans: '替换选区'
    },
    office_word_insert_heading: {
        en_US: 'Insert a heading',
        zh_Hans: '插入标题'
    },
    office_word_insert_table: {
        en_US: 'Insert a table',
        zh_Hans: '插入表格'
    },
    office_word_search_text: {
        en_US: 'Search text',
        zh_Hans: '搜索文本'
    },
    office_excel_snapshot: {
        en_US: 'Inspect the workbook',
        zh_Hans: '查看工作簿'
    },
    office_excel_get_range: {
        en_US: 'Read a range',
        zh_Hans: '读取区域'
    },
    office_excel_set_range_values: {
        en_US: 'Update range values',
        zh_Hans: '更新单元格区域'
    },
    office_excel_add_worksheet: {
        en_US: 'Add a worksheet',
        zh_Hans: '添加工作表'
    },
    office_excel_delete_worksheet: {
        en_US: 'Delete a worksheet',
        zh_Hans: '删除工作表'
    },
    office_excel_autofit_range: {
        en_US: 'Autofit a range',
        zh_Hans: '自动调整区域'
    },
    office_excel_add_table: {
        en_US: 'Add a table',
        zh_Hans: '添加表格'
    }
} as const

const configSchema = z.object({
    host: z.enum(OFFICE_AUTOMATION_HOSTS).default('powerpoint'),
    allowDeletes: z.boolean().default(true),
    allowImageInsert: z.boolean().default(true)
})

export type OfficeAutomationMiddlewareConfig = InferInteropZodInput<typeof configSchema>

function stringifySchema(schema: object): string {
    return JSON.stringify(schema)
}

const SLIDE_SELECTOR_PROPERTIES = {
    slideIndex: {
        type: 'number',
        minimum: 1,
        description:
            'User-visible 1-based slide index. If omitted where allowed, the current selected slide is used, then slide 1.'
    }
}

const GEOMETRY_PROPERTIES = {
    left: {
        type: 'number',
        description: 'Left position in PowerPoint points.'
    },
    top: {
        type: 'number',
        description: 'Top position in PowerPoint points.'
    },
    width: {
        type: 'number',
        description: 'Width in PowerPoint points.'
    },
    height: {
        type: 'number',
        description: 'Height in PowerPoint points.'
    }
}

const STYLE_PROPERTIES = {
    name: {
        type: 'string',
        description: 'Optional PowerPoint shape name to assign.'
    },
    text: {
        type: 'string',
        description: 'Text content to place inside the text box or shape.'
    },
    fillColor: {
        type: 'string',
        description: 'Fill color as a hex string such as #0f766e.'
    },
    lineColor: {
        type: 'string',
        description: 'Line color as a hex string such as #111827.'
    }
}

const SHAPE_TARGET_PROPERTIES = {
    ...SLIDE_SELECTOR_PROPERTIES,
    shapeId: {
        type: 'string',
        description: 'PowerPoint shape id from office_powerpoint_snapshot.'
    },
    shapeName: {
        type: 'string',
        description: 'PowerPoint shape name from office_powerpoint_snapshot.'
    }
}

const WORD_INSERT_LOCATION_PROPERTY = {
    type: 'string',
    enum: ['Start', 'End'],
    description: 'Where to insert content in the Word document body. Defaults to End.'
}

const WORD_TABLE_VALUES_SCHEMA = {
    type: 'array',
    description: 'Two-dimensional table values. Jagged rows are padded by the client.',
    items: {
        type: 'array',
        items: {
            type: ['string', 'number', 'boolean', 'null']
        }
    }
}

const EXCEL_WORKSHEET_SELECTOR_PROPERTIES = {
    worksheetName: {
        type: 'string',
        description: 'Optional worksheet name. If omitted, the active worksheet is used.'
    }
}

const EXCEL_RANGE_ADDRESS_PROPERTY = {
    type: 'string',
    description: 'A1-style Excel range address such as A1:D10.'
}

const EXCEL_RANGE_VALUES_SCHEMA = {
    type: 'array',
    description: 'Two-dimensional range values. Jagged rows are padded with null by the client.',
    items: {
        type: 'array',
        items: {
            type: ['string', 'number', 'boolean', 'null']
        }
    }
}

export const OFFICE_POWERPOINT_CLIENT_TOOLS: ClientToolDefinition[] = [
    {
        name: 'office_powerpoint_snapshot',
        description:
            'Inspect the active PowerPoint presentation. Returns host details, Office requirement support, slide count, selected slides, and a bounded shape summary for the selected or requested slide. Use this before editing when the current slide or shape ids are unknown.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SLIDE_SELECTOR_PROPERTIES,
                maxShapes: {
                    type: 'number',
                    minimum: 1,
                    maximum: 200,
                    description: 'Maximum number of shapes to include in the slide summary.'
                }
            }
        })
    },
    {
        name: 'office_powerpoint_select_slide',
        description: 'Select a PowerPoint slide by its user-visible 1-based slide index.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: SLIDE_SELECTOR_PROPERTIES,
            required: ['slideIndex']
        })
    },
    {
        name: 'office_powerpoint_add_slide',
        description:
            'Add a new slide to the end of the presentation. Optionally provide slideMasterId and layoutId when they are known from a template or earlier inspection.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                slideMasterId: {
                    type: 'string',
                    description: 'Optional PowerPoint slide master id.'
                },
                layoutId: {
                    type: 'string',
                    description: 'Optional PowerPoint layout id. Must belong to the selected slide master.'
                }
            }
        })
    },
    {
        name: 'office_powerpoint_delete_slide',
        description:
            'Delete a slide by its user-visible 1-based slide index. Only call after the user explicitly confirmed deleting that slide. The args must include confirm: true.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SLIDE_SELECTOR_PROPERTIES,
                confirm: {
                    type: 'boolean',
                    description: 'Must be true after explicit user confirmation.'
                }
            },
            required: ['slideIndex', 'confirm']
        })
    },
    {
        name: 'office_powerpoint_add_text_box',
        description: 'Add a text box to the selected or requested slide. Coordinates and size are PowerPoint points.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SLIDE_SELECTOR_PROPERTIES,
                ...GEOMETRY_PROPERTIES,
                ...STYLE_PROPERTIES,
                text: {
                    type: 'string',
                    description: 'Text content for the new text box.'
                }
            },
            required: ['text']
        })
    },
    {
        name: 'office_powerpoint_add_shape',
        description:
            'Add a geometric shape to the selected or requested slide. Use common shapeType values such as Rectangle, RoundRectangle, Ellipse, Diamond, Chevron, RightArrow, or Hexagon.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SLIDE_SELECTOR_PROPERTIES,
                ...GEOMETRY_PROPERTIES,
                ...STYLE_PROPERTIES,
                shapeType: {
                    type: 'string',
                    description: 'PowerPoint geometric shape type. Defaults to Rectangle.'
                }
            }
        })
    },
    {
        name: 'office_powerpoint_update_shape',
        description:
            'Update an existing shape on a PowerPoint slide by shapeId or shapeName. Use shape ids from office_powerpoint_snapshot when possible.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SHAPE_TARGET_PROPERTIES,
                ...GEOMETRY_PROPERTIES,
                ...STYLE_PROPERTIES
            }
        })
    },
    {
        name: 'office_powerpoint_delete_shape',
        description:
            'Delete an existing shape by shapeId or shapeName. Only call after the user explicitly confirmed deleting that object. The args must include confirm: true.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SHAPE_TARGET_PROPERTIES,
                confirm: {
                    type: 'boolean',
                    description: 'Must be true after explicit user confirmation.'
                }
            },
            required: ['confirm']
        })
    },
    {
        name: 'office_powerpoint_insert_image',
        description:
            'Insert a base64-encoded image onto the selected or requested PowerPoint slide through Office CoercionType.Image. Prefer PNG or JPEG data. Coordinates and size are PowerPoint points.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...SLIDE_SELECTOR_PROPERTIES,
                left: GEOMETRY_PROPERTIES.left,
                top: GEOMETRY_PROPERTIES.top,
                width: GEOMETRY_PROPERTIES.width,
                height: GEOMETRY_PROPERTIES.height,
                base64: {
                    type: 'string',
                    description: 'Base64 encoded image without a data URL prefix.'
                },
                dataUrl: {
                    type: 'string',
                    description: 'Image data URL. The client strips the data URL prefix before insertion.'
                }
            }
        })
    }
]

export const OFFICE_WORD_CLIENT_TOOLS: ClientToolDefinition[] = [
    {
        name: 'office_word_snapshot',
        description:
            'Inspect the active Word document. Returns host details, Office requirement support, selected text, and a bounded body text preview. Use this before editing when the document context is unknown.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                maxCharacters: {
                    type: 'number',
                    minimum: 1,
                    maximum: 20000,
                    description: 'Maximum number of body text characters to include.'
                }
            }
        })
    },
    {
        name: 'office_word_insert_text',
        description: 'Insert plain text at the start or end of the Word document body.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                text: {
                    type: 'string',
                    description: 'Text to insert.'
                },
                location: WORD_INSERT_LOCATION_PROPERTY
            },
            required: ['text']
        })
    },
    {
        name: 'office_word_replace_selection',
        description: 'Replace the current Word selection with plain text.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                text: {
                    type: 'string',
                    description: 'Replacement text.'
                }
            },
            required: ['text']
        })
    },
    {
        name: 'office_word_insert_heading',
        description: 'Insert a Word heading paragraph at the start or end of the document body.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                text: {
                    type: 'string',
                    description: 'Heading text.'
                },
                level: {
                    type: 'number',
                    minimum: 1,
                    maximum: 9,
                    description: 'Word heading level from 1 through 9. Defaults to 1.'
                },
                location: WORD_INSERT_LOCATION_PROPERTY
            },
            required: ['text']
        })
    },
    {
        name: 'office_word_insert_table',
        description:
            'Insert a table into the Word document body. Provide values or explicit rowCount and columnCount for an empty table.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                values: WORD_TABLE_VALUES_SCHEMA,
                rowCount: {
                    type: 'number',
                    minimum: 1,
                    description: 'Number of table rows. Required when values is omitted.'
                },
                columnCount: {
                    type: 'number',
                    minimum: 1,
                    description: 'Number of table columns. Required when values is omitted.'
                },
                location: WORD_INSERT_LOCATION_PROPERTY
            }
        })
    },
    {
        name: 'office_word_search_text',
        description: 'Search the Word document body for text and return bounded matching snippets.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                query: {
                    type: 'string',
                    description: 'Text to search for.'
                },
                matchCase: {
                    type: 'boolean',
                    description: 'Whether the search should be case-sensitive.'
                },
                matchWholeWord: {
                    type: 'boolean',
                    description: 'Whether the search should match whole words only.'
                },
                maxResults: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    description: 'Maximum number of search results to return.'
                }
            },
            required: ['query']
        })
    }
]

export const OFFICE_EXCEL_CLIENT_TOOLS: ClientToolDefinition[] = [
    {
        name: 'office_excel_snapshot',
        description:
            'Inspect the active Excel workbook. Returns host details, Office requirement support, worksheet names, active worksheet, and a bounded used-range preview.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                maxRows: {
                    type: 'number',
                    minimum: 1,
                    maximum: 200,
                    description: 'Maximum number of used-range rows to include.'
                },
                maxColumns: {
                    type: 'number',
                    minimum: 1,
                    maximum: 100,
                    description: 'Maximum number of used-range columns to include.'
                }
            }
        })
    },
    {
        name: 'office_excel_get_range',
        description: 'Read values and formatted text from an Excel range.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...EXCEL_WORKSHEET_SELECTOR_PROPERTIES,
                address: EXCEL_RANGE_ADDRESS_PROPERTY
            },
            required: ['address']
        })
    },
    {
        name: 'office_excel_set_range_values',
        description:
            'Set values into an Excel range. The provided two-dimensional values must fit the target address dimensions.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...EXCEL_WORKSHEET_SELECTOR_PROPERTIES,
                address: EXCEL_RANGE_ADDRESS_PROPERTY,
                values: EXCEL_RANGE_VALUES_SCHEMA
            },
            required: ['address', 'values']
        })
    },
    {
        name: 'office_excel_add_worksheet',
        description: 'Add a worksheet to the active Excel workbook.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                name: {
                    type: 'string',
                    description: 'Optional worksheet name.'
                }
            }
        })
    },
    {
        name: 'office_excel_delete_worksheet',
        description:
            'Delete an Excel worksheet by name. Only call after the user explicitly confirmed deleting that worksheet. The args must include confirm: true.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                name: {
                    type: 'string',
                    description: 'Worksheet name to delete.'
                },
                confirm: {
                    type: 'boolean',
                    description: 'Must be true after explicit user confirmation.'
                }
            },
            required: ['name', 'confirm']
        })
    },
    {
        name: 'office_excel_autofit_range',
        description:
            'Autofit rows and columns for an Excel range. If address is omitted, the active worksheet used range is autofit.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...EXCEL_WORKSHEET_SELECTOR_PROPERTIES,
                address: EXCEL_RANGE_ADDRESS_PROPERTY
            }
        })
    },
    {
        name: 'office_excel_add_table',
        description: 'Create an Excel table from an existing range.',
        schema: stringifySchema({
            type: 'object',
            additionalProperties: false,
            properties: {
                ...EXCEL_WORKSHEET_SELECTOR_PROPERTIES,
                address: EXCEL_RANGE_ADDRESS_PROPERTY,
                hasHeaders: {
                    type: 'boolean',
                    description: 'Whether the first row contains table headers. Defaults to true.'
                },
                name: {
                    type: 'string',
                    description: 'Optional table name.'
                }
            },
            required: ['address']
        })
    }
]

export const OFFICE_CLIENT_TOOLS: ClientToolDefinition[] = [
    ...OFFICE_POWERPOINT_CLIENT_TOOLS,
    ...OFFICE_WORD_CLIENT_TOOLS,
    ...OFFICE_EXCEL_CLIENT_TOOLS
]

function createClientTools(options?: unknown): ClientToolDefinition[] {
    const config = interopParse(configSchema, options || {})
    const allowedToolNames = new Set<string>(OFFICE_HOST_TOOL_NAMES[config.host])

    return OFFICE_CLIENT_TOOLS.filter((clientTool) => {
        if (!allowedToolNames.has(clientTool.name)) {
            return false
        }
        if (!config.allowDeletes && clientTool.name.includes('delete')) {
            return false
        }
        if (!config.allowImageInsert && clientTool.name === 'office_powerpoint_insert_image') {
            return false
        }
        return true
    })
}

@Injectable()
@AgentMiddlewareStrategy(OFFICE_AUTOMATION_MIDDLEWARE_NAME)
export class OfficeAutomationMiddleware extends ClientToolMiddleware {
    override meta: TAgentMiddlewareMeta = {
        name: OFFICE_AUTOMATION_MIDDLEWARE_NAME,
        label: {
            en_US: 'Office Automation',
            zh_Hans: 'Office 自动化'
        },
        description: {
            en_US: 'Lets ChatKit clients execute safe Office.js PowerPoint, Word, and Excel operations from Agent tool calls.',
            zh_Hans: '允许 ChatKit 客户端通过 Agent 工具调用执行安全的 Office.js PowerPoint、Word 和 Excel 操作。'
        },
        icon: {
            type: 'svg',
            value: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
<path d="M8 9H14.5C16.4 9 17.5 10 17.5 11.5C17.5 13 16.4 14 14.5 14H10.5V17H8V9Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
            color: 'teal'
        },
        configSchema: {
            type: 'object',
            properties: {
                host: {
                    type: 'string',
                    enum: [...OFFICE_AUTOMATION_HOSTS],
                    title: {
                        en_US: 'Office host',
                        zh_Hans: 'Office 主机'
                    },
                    description: {
                        en_US: 'Choose which host tool set to expose. Use all only for cross-host Agents because every exposed tool consumes model context.',
                        zh_Hans:
                            '选择要暴露的主机工具集。只有跨 Office 场景才使用 all，因为每个暴露的工具都会占用模型上下文。'
                    },
                    default: 'powerpoint'
                },
                allowDeletes: {
                    type: 'boolean',
                    title: {
                        en_US: 'Allow deletes',
                        zh_Hans: '允许删除'
                    },
                    description: {
                        en_US: 'Expose delete tools. Delete calls still require confirm: true.',
                        zh_Hans: '暴露删除工具。删除调用仍然需要 confirm: true。'
                    },
                    default: true
                },
                allowImageInsert: {
                    type: 'boolean',
                    title: {
                        en_US: 'Allow image insertion',
                        zh_Hans: '允许插入图片'
                    },
                    description: {
                        en_US: 'Expose the tool that inserts base64 images into PowerPoint.',
                        zh_Hans: '暴露向 PowerPoint 插入 base64 图片的工具。'
                    },
                    default: true
                }
            }
        } as TAgentMiddlewareMeta['configSchema']
    }

    override async createMiddleware(
        options: ClientToolMiddlewareConfig | OfficeAutomationMiddlewareConfig,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        const middleware = await Promise.resolve(
            super.createMiddleware(
                {
                    clientTools: createClientTools(options),
                    displayToolset: OFFICE_AUTOMATION_MIDDLEWARE_NAME,
                    displayMessages: OFFICE_TOOL_DISPLAY_MESSAGES,
                    emitToolMessages: true
                },
                context
            )
        )

        return {
            ...middleware,
            name: OFFICE_AUTOMATION_MIDDLEWARE_NAME
        }
    }
}
