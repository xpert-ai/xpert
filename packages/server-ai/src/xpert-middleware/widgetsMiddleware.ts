import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { AIMessage, isHumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import { ChatMessageEventTypeEnum, type IconDefinition, type TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddlewareStrategy,
    type AgentMiddleware,
    type IAgentMiddlewareContext,
    type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { A2UIRenderToolSchema, WidgetsMiddlewareOptionsSchema, type WidgetsMiddlewareConfig } from './widgets/options'
import { A2UI_CATALOG_PROMPT, widgetGuidance } from './widgets/prompts'
import { normalizeA2UIWidgetResults, type WidgetResult } from './widgets/protocol'
import { collectAgentActions } from './widgets/validation'
import {
    buildManualWidgetResult,
    buildManualWidgetResults,
    buildWidgetDefinitions,
    manualWidgetPrompt,
    parseWidgetJson
} from './widgets/templates'
import { extractWidgetJson, supportsToolCalling } from './widgets/model'

export { normalizeA2UIServerMessages, normalizeA2UIWidgetResults } from './widgets/protocol'
export { WidgetsMiddlewareOptionsSchema, type WidgetsMiddlewareConfig } from './widgets/options'
export { composerToComponentTreeFormat, shortuuid } from './widgets/legacy'

const RENDER_TOOL = 'render_a2ui_surface'
const CATALOG_TOOL = 'a2ui_catalog'
const WIDGETS_ICON: IconDefinition = {
    type: 'svg',
    value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5" fill="#6366f1" fill-opacity=".12"/><g stroke="#6366f1" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-5M3 9h9"/><rect x="6" y="12" width="4" height="6" rx="1" fill="#6366f1" fill-opacity=".2"/><path d="M13 13h4m-4 4h4"/></g><path d="m18 2 1.2 3.8L23 7l-3.8 1.2L18 12l-1.2-3.8L13 7l3.8-1.2L18 2Z" fill="#14b8a6" fill-opacity=".2" stroke="#14b8a6" stroke-width="1.4" stroke-linejoin="round"/></svg>'
}

async function emitWidgets(
    widgets: WidgetResult[],
    id: string,
    generated: boolean,
    mode: 'a2ui_messages' | 'tool_calls' | 'json' = 'a2ui_messages'
) {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
        id,
        category: 'Computer',
        type: 'Widget',
        mode,
        widgets: widgets.map((widget) => ({
            ...widget,
            ...(generated ? { agentActions: collectAgentActions(widget.messages), requiresIdleThread: true } : {})
        }))
    })
}

@Injectable()
@AgentMiddlewareStrategy('WidgetsMiddleware')
export class WidgetsMiddleware implements IAgentMiddlewareStrategy {
    meta: TAgentMiddlewareMeta = {
        name: 'WidgetsMiddleware',
        label: { en_US: 'Widgets Middleware', zh_Hans: '小部件中间件' },
        description: {
            en_US: 'Generate interactive A2UI answers when useful and continue from user actions.',
            zh_Hans: '按需生成 A2UI 交互界面，并接收用户提交继续处理。'
        },
        icon: WIDGETS_ICON,
        configSchema: {
            type: 'object',
            properties: {
                autoRender: {
                    type: 'boolean',
                    default: true,
                    title: { en_US: 'Generate UI when useful', zh_Hans: '按回答内容自动生成界面' }
                },
                widgets: {
                    type: 'array',
                    title: { en_US: 'Optional templates', zh_Hans: '可选小部件模板' },
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', title: { en_US: 'Name', zh_Hans: '名称' } },
                            description: {
                                type: 'string',
                                title: { en_US: 'Description', zh_Hans: '说明' },
                                'x-ui': { component: 'textarea' }
                            },
                            widget: {
                                type: 'string',
                                title: { en_US: 'Template JSON', zh_Hans: '模板 JSON' },
                                'x-ui': {
                                    component: 'code-editor',
                                    inputs: { language: 'json', editable: true, lineNumbers: true },
                                    help: 'https://a2ui-composer.ag-ui.com/components'
                                }
                            },
                            value: {
                                type: 'string',
                                title: { en_US: 'Example values', zh_Hans: '值样例' },
                                'x-ui': {
                                    component: 'code-editor',
                                    inputs: { language: 'json', editable: true, lineNumbers: true }
                                }
                            }
                        },
                        required: ['widget']
                    },
                    'x-ui': { span: 2 }
                },
                systemPrompt: {
                    type: 'string',
                    title: { en_US: 'JSON mode guidance', zh_Hans: 'JSON 模式补充提示词' },
                    'x-ui': { component: 'textarea', span: 2 }
                },
                toolPrompt: {
                    type: 'string',
                    title: { en_US: 'Tool mode guidance', zh_Hans: '工具模式补充提示词' },
                    'x-ui': { component: 'textarea', span: 2 }
                }
            }
        } as TAgentMiddlewareMeta['configSchema']
    }

    async createMiddleware(
        options: WidgetsMiddlewareConfig | null | undefined,
        _context?: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        const config = WidgetsMiddlewareOptionsSchema.parse(options ?? {})
        const templates = buildWidgetDefinitions(config.widgets)
        const names = [RENDER_TOOL, CATALOG_TOOL, ...templates.map((item) => item.name)]
        if (new Set(names).size !== names.length)
            throw new Error(t('server-ai:Widgets.DuplicateTool', { defaultValue: 'Widget tool names must be unique.' }))
        const tools = [
            tool(async (input) => input, {
                name: RENDER_TOOL,
                description:
                    'Render a complete A2UI 0.8 card when an answer benefits from comparison, structured input or parameter exploration. Skip simple facts and short prose. Call a2ui_catalog for the exact protocol. Button actions return to this conversation as user messages.',
                schema: A2UIRenderToolSchema,
                metadata: {
                    toolName: { en_US: 'Generate interactive UI', zh_Hans: '生成交互界面' },
                    toolIcon: WIDGETS_ICON
                }
            }),
            tool(async () => A2UI_CATALOG_PROMPT, {
                name: CATALOG_TOOL,
                description:
                    'Read the supported A2UI 0.8 components, data bindings and flat-message examples before generating a complex card.',
                schema: z.object({}),
                metadata: {
                    toolName: { en_US: 'Read UI component catalog', zh_Hans: '查看界面组件目录' },
                    toolIcon: WIDGETS_ICON
                }
            }),
            ...templates.map((widget) =>
                tool(async (input) => input, {
                    name: widget.name,
                    description: widget.description || `Fill the configured widget ${widget.name}.`,
                    schema: widget.schema,
                    metadata: {
                        toolName: {
                            en_US: `Fill UI template · ${widget.name}`,
                            zh_Hans: `填充界面模板 · ${widget.name}`
                        },
                        toolIcon: WIDGETS_ICON
                    }
                })
            )
        ]
        return {
            name: 'WidgetsMiddleware',
            contextSchema: WidgetsMiddlewareOptionsSchema,
            tools,
            async wrapModelCall(request, handler) {
                if (!request.messages.some(isHumanMessage)) return handler(request)
                const toolCalling = supportsToolCalling(request.model)
                const guidance = widgetGuidance(config.autoRender, toolCalling)
                const extra = toolCalling ? config.toolPrompt : config.systemPrompt
                const systemMessage = new SystemMessage({
                    content: [
                        ...(typeof request.systemMessage?.content === 'string'
                            ? [{ type: 'text' as const, text: request.systemMessage.content }]
                            : (request.systemMessage?.content ?? [])),
                        {
                            type: 'text',
                            text: [
                                guidance,
                                extra,
                                !toolCalling ? A2UI_CATALOG_PROMPT : '',
                                manualWidgetPrompt(templates, toolCalling)
                            ]
                                .filter(Boolean)
                                .join('\n\n')
                        }
                    ]
                })
                const response = await handler({ ...request, systemMessage })
                if (response.tool_calls?.length || typeof response.content !== 'string') return response
                const parsed = extractWidgetJson(response.content)
                if (parsed === undefined) return response
                let widgets: WidgetResult[]
                let generated = true
                try {
                    widgets = normalizeA2UIWidgetResults(parsed)
                    for (const widget of widgets) collectAgentActions(widget.messages)
                } catch {
                    // An invalid generated surface must not silently become an unrelated template.
                    if (
                        !templates.length ||
                        (parsed && typeof parsed === 'object' && ('messages' in parsed || 'widgets' in parsed))
                    )
                        return response
                    try {
                        widgets = buildManualWidgetResults(templates, parsed)
                        generated = false
                    } catch {
                        return response
                    }
                }
                await emitWidgets(widgets, response.id ?? randomUUID(), generated, generated ? 'a2ui_messages' : 'json')
                return new AIMessage({
                    ...response,
                    content: t('server-ai:Widgets.Rendered', { defaultValue: 'The interactive card is ready.' })
                })
            },
            async wrapToolCall(request, handler) {
                const template = templates.find((item) => item.name === request.toolCall.name)
                if (request.toolCall.name !== RENDER_TOOL && !template) return handler(request)
                let widgets: WidgetResult[]
                try {
                    const args =
                        typeof request.toolCall.args === 'string'
                            ? parseWidgetJson(request.toolCall.args)
                            : request.toolCall.args
                    widgets = template ? [buildManualWidgetResult(template, args)] : normalizeA2UIWidgetResults(args)
                    // Resolve the action allowlist before emitting anything, so invalid output is atomic.
                    if (!template) for (const widget of widgets) collectAgentActions(widget.messages)
                } catch (error) {
                    return new ToolMessage({
                        name: request.toolCall.name,
                        tool_call_id: request.toolCall.id,
                        status: 'error',
                        content: t('server-ai:Widgets.Invalid', {
                            defaultValue: 'Invalid A2UI surface: {{reason}}. Fix the payload and call the tool again.',
                            reason: error instanceof Error ? error.message : 'invalid payload'
                        })
                    })
                }
                await emitWidgets(
                    widgets,
                    request.toolCall.id ?? randomUUID(),
                    !template,
                    template ? 'tool_calls' : 'a2ui_messages'
                )
                return new ToolMessage({
                    name: request.toolCall.name,
                    tool_call_id: request.toolCall.id,
                    content: JSON.stringify(
                        template
                            ? { widget: widgets[0] }
                            : {
                                  ok: true,
                                  surfaces: widgets.map((item) => item.name),
                                  note: 'The card is visible. Finish with brief prose; do not render the same card again.'
                              }
                    )
                })
            }
        }
    }
}
