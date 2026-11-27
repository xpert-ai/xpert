import { AIMessageChunk, isBaseMessage, isToolMessage } from '@langchain/core/messages'
import { createResourceCardContent, parseResourceCardContent } from '@xpert-ai/contracts'
import { RESOURCE_CARD_EVENT } from '@xpert-ai/plugin-sdk'
import { CompiledStateGraph, isCommand } from '@langchain/langgraph'
import {
    agentLabel,
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    ChatMessageTypeEnum,
    isAgentKey,
    IXpert,
    IXpertAgent,
    type IconDefinition,
    type PublicToolPresentation,
    TMessageChannel,
    TMessageComponent,
    TMessageComponentStep,
    TMessageContentComponent,
    TMessageContentReasoning,
    TXpertAgentConfig,
    TXpertTeamNode
} from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { instanceToPlain } from 'class-transformer'
import { AgentStateAnnotation, createTextChunk } from '../shared'
import { getSkillUsageSummary } from '../skill-package/plugins/skills-middleware/skill-usage'

import { parseToolIcon } from './tool-icon'
import { presentToolValue, toolPresentation } from './tool-presentation'
import { presentToolImages } from './tool-image-presentation'
import { ToolTimelineProjection, type ToolDetailWriter } from './tool-timeline'
import { ToolCallStatusProjection } from './tool-call-status'
import type { JSONValue } from '@xpert-ai/contracts'
import type { ToolDetailPhase, ToolOutputImageAttachment } from '@xpert-ai/chatkit-types'

export { FakeStreamingChatModel } from '../shared/agent/fake-streaming-chat-model'

type TExecutionStreamMetadata = {
    agentKey?: string
    xpertName?: string
    executionId?: string
    parentExecutionId?: string
    runId?: string
}

type TExecutionStreamMetadataSource = {
    executionId?: unknown
    execution_id?: unknown
    parentExecutionId?: unknown
    parent_execution_id?: unknown
    runId?: unknown
    run_id?: unknown
}

const XPERT_MCP_META_KEY_PREFIX = 'xpertai/'

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined
}

function readXpertMcpMetaArtifact(artifact: unknown): object | null {
    if (Array.isArray(artifact)) {
        for (const item of artifact) {
            const meta = readXpertMcpMetaArtifact(item)
            if (meta) {
                return meta
            }
        }
        return null
    }

    if (!artifact || typeof artifact !== 'object') {
        return null
    }

    return Object.keys(artifact).some((key) => key.startsWith(XPERT_MCP_META_KEY_PREFIX)) ? artifact : null
}

function getExecutionStreamMetadata(
    metadata: TExecutionStreamMetadataSource,
    rest: { run_id?: unknown },
    agentKey?: string | null,
    xpertName?: string
): TExecutionStreamMetadata {
    const executionId = readString(metadata.executionId) ?? readString(metadata.execution_id)
    const parentExecutionId = readString(metadata.parentExecutionId) ?? readString(metadata.parent_execution_id)
    const runId = readString(rest.run_id) ?? readString(metadata.runId) ?? readString(metadata.run_id)

    return {
        ...(agentKey ? { agentKey } : {}),
        ...(xpertName ? { xpertName } : {}),
        ...(executionId ? { executionId } : {}),
        ...(parentExecutionId ? { parentExecutionId } : {}),
        ...(runId ? { runId } : {})
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeToolInputForDisplay(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeToolInputForDisplay(item))
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => key !== 'changeSummary')
                .map(([key, item]) => [key, sanitizeToolInputForDisplay(item)])
        )
    }
    return value
}

function resolveLocalizedToolTitle(value: unknown, language?: string): string | undefined {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (!isRecord(value)) return undefined

    const normalized = language?.replace('-', '_').toLowerCase()
    const preferredKeys = normalized?.startsWith('zh') ? ['zh_Hans', 'zh_CN', 'en_US'] : ['en_US', 'en', 'zh_Hans']
    for (const key of preferredKeys) {
        const title = value[key]
        if (typeof title === 'string' && title.trim()) return title.trim()
    }
    return Object.values(value)
        .find((title): title is string => typeof title === 'string' && Boolean(title.trim()))
        ?.trim()
}

function toolTitle(metadata: Record<string, unknown>, name: string, language?: string) {
    return (
        resolveLocalizedToolTitle(metadata['toolName'], language) ?? resolveLocalizedToolTitle(metadata[name], language)
    )
}

function toolIcon(metadata: Record<string, unknown>): IconDefinition | undefined {
    return parseToolIcon(metadata['toolIcon']) ?? parseToolIcon(metadata['middlewareIcon'])
}

function normalizeMiddlewareChatEvent(data: unknown) {
    if (!isRecord(data) || data.type !== 'middleware_event') {
        return null
    }

    const {
        agentKey: _agentKey,
        metadata: _metadata,
        name: _name,
        runId: _runId,
        run_id: _run_id,
        tags: _tags,
        ...event
    } = data

    return {
        ...event,
        type: 'middleware_event',
        created_date: typeof event.created_date === 'string' ? event.created_date : new Date().toISOString()
    }
}

/**
 * Create an operator function that intercepts Langgraph events,
 * passes the message content through, and sends other events to client by sse subscriber.
 *
 * `metadata.internal` usage:
 * - Upstream runnables can mark an event or node with `metadata.internal = true`.
 * - Internal events are treated as server-only signals and are not forwarded to client streams.
 *
 * @param logger
 * @param subscriber
 * @param options
 * @returns
 */
export function createMapStreamEvents(
    logger: Logger,
    subscriber: Subscriber<MessageEvent>,
    options?: {
        agent?: IXpertAgent
        unmutes: TXpertAgentConfig['mute']
        xperts?: IXpert[]
        language?: string
        writeToolDetail?: ToolDetailWriter
    }
) {
    const { agent, unmutes, xperts, language } = options ?? {}
    const timeline = new ToolTimelineProjection(options?.writeToolDetail)
    const callStatuses = new ToolCallStatusProjection()
    const pendingEmissions: Promise<void>[] = []
    // Nested tools can inherit call IDs; declarations stay scoped to execution, call and tool name.
    const presentations = new Map<string, Map<string, PublicToolPresentation>>()

    const eventStack: string[] = []
    let prevEvent = ''

    function publishComponent(id: string, identity: TExecutionStreamMetadata, data: Record<string, unknown>) {
        subscriber.next({
            data: { type: ChatMessageTypeEnum.MESSAGE, data: { id, type: 'component', ...identity, data } }
        } as MessageEvent)
    }

    function sendComponent(id: string, identity: TExecutionStreamMetadata, data: Record<string, unknown>) {
        if (pendingEmissions.length) {
            pendingEmissions.push(Promise.all([...pendingEmissions]).then(() => publishComponent(id, identity, data)))
        } else publishComponent(id, identity, data)
    }

    const processFun = ({ event, tags, data, ...rest }: any) => {
        const metadata = rest?.metadata ?? {}
        if (metadata.internal === true) {
            return null
        }
        const langgraph_node = metadata.langgraph_node
        const metadataAgentKey =
            typeof metadata.agentKey === 'string' && isAgentKey(metadata.agentKey) ? metadata.agentKey : null
        const nodeAgentKey = isAgentKey(langgraph_node) && langgraph_node !== agent?.key ? langgraph_node : null
        const agentKey = metadataAgentKey ?? nodeAgentKey
        const xpert = xperts?.find((_) => _.agent?.key === agentKey)
        const xpertName = metadata.xpertName || xpert?.name
        const executionMeta = getExecutionStreamMetadata(metadata, rest, agentKey, xpertName)

        function presentationFor(id: string, name: string, declaration: unknown) {
            const key = JSON.stringify([executionMeta.executionId ?? executionMeta.agentKey ?? '', id])
            const policies = presentations.get(key)
            const saved = policies?.get(name)
            if (saved) return saved
            const policy = toolPresentation(declaration, name)
            if (policy) {
                if (policies) policies.set(name, policy)
                else presentations.set(key, new Map([[name, policy]]))
                return policy
            }
            // A nested or late event sharing a filtered call ID cannot publish its raw values.
            if (policies) return { tool: name }
        }

        function sendToolStep(
            id: string,
            name: string | undefined,
            fields: Record<string, unknown>,
            values: {
                input?: JSONValue
                output?: JSONValue
                error?: JSONValue
                images?: ToolOutputImageAttachment[]
            } = {},
            phases: readonly ToolDetailPhase[] = [],
            display: unknown = metadata.toolDisplay,
            displayMetadata: Record<string, unknown> = metadata
        ) {
            const icon = toolIcon(displayMetadata)
            const title = name && toolTitle(displayMetadata, name, language)
            const identity = getExecutionStreamMetadata(metadata, rest)
            const status = callStatuses.update(id, name, identity, fields.status)
            const projected = timeline.project(id, name, identity, display, values, phases, {
                running: status === 'running',
                failed: status === 'fail' || status === 'canceled',
                withheld: Boolean(presentationFor(id, name, metadata.publicToolPresentation))
            })
            const emit = (view: Awaited<typeof projected>) =>
                publishComponent(id, identity, {
                    category: 'Tool',
                    toolPresentation: 'redacted',
                    ...(name ? { tool: name } : {}),
                    ...(metadata.toolset ? { toolset: metadata.toolset } : {}),
                    ...(metadata.toolsetId ? { toolset_id: metadata.toolsetId } : {}),
                    ...(icon ? { icon } : {}),
                    ...fields,
                    ...(status ? { status } : {}),
                    ...view,
                    ...(title ? { title } : {})
                })
            if (projected instanceof Promise) pendingEmissions.push(projected.then(emit))
            else if (pendingEmissions.length)
                pendingEmissions.push(Promise.all([...pendingEmissions]).then(() => emit(projected)))
            else emit(projected)
        }

        if (Logger.isLevelEnabled('debug')) {
            if (event === 'on_chat_model_stream') {
                if (prevEvent === 'on_chat_model_stream') {
                    process.stdout.write('.')
                } else {
                    logger.debug(`on_chat_model_stream [${agent ? agentLabel(agent) : 'common'}]`)
                }
            } else {
                if (prevEvent === 'on_chat_model_stream') {
                    process.stdout.write('\n')
                }
                logger.debug(`${event} [${agent ? agentLabel(agent) : 'common'}]`)
            }
        } else {
            logger.verbose(`${event} [${agent ? agentLabel(agent) : 'common'}]`)
        }

        switch (event) {
            case 'on_chain_start': {
                eventStack.push(event)
                break
            }
            case 'on_chain_end': {
                let _event = eventStack.pop()
                if (_event === 'on_tool_start') {
                    // When an error occurs during the Tool call, the on_tool_end event is skipped, and the call proceeds directly to this event.
                    while (_event === 'on_tool_start') {
                        _event = eventStack.pop()
                    }
                }

                // All chains end
                if (_event !== 'on_chain_start') {
                    eventStack.pop()
                }
                break
            }
            case 'on_chat_model_start': {
                eventStack.push(event)
                break
            }
            case 'on_chat_model_end': {
                const _event = eventStack.pop()
                if (_event !== 'on_chat_model_start') {
                    eventStack.pop()
                }
                if (prevEvent !== 'on_chat_model_stream') {
                    if (!isMute(tags, unmutes)) {
                        const msg = data.output as AIMessageChunk
                        return createTextChunk(msg?.content ?? '', {
                            streamId: msg?.id || rest?.run_id,
                            ...executionMeta
                        })
                    }
                }
                return null
            }
            case 'on_chat_model_stream': {
                prevEvent = event

                if (!isMute(tags, unmutes)) {
                    const msg = data.chunk as AIMessageChunk
                    if (!msg.tool_call_chunks?.length) {
                        if (msg.content) {
                            return createTextChunk(msg.content, {
                                streamId: msg.id || rest?.run_id,
                                ...executionMeta
                            })
                        }

                        // Reasoning content in additional_kwargs
                        if (msg.additional_kwargs?.reasoning_content) {
                            const chunk = {
                                type: 'reasoning',
                                text: '',
                                id: msg.id || rest?.run_id,
                                created_date: new Date(),
                                ...executionMeta
                            } as TMessageContentReasoning

                            chunk.text += msg.additional_kwargs.reasoning_content
                            return chunk
                        }
                    }
                }
                break
            }

            case 'on_chain_stream': {
                if (!isMute(tags, unmutes)) {
                    const chunk = data?.chunk as unknown

                    if (typeof chunk === 'string') {
                        return createTextChunk(chunk, {
                            streamId: rest?.run_id,
                            ...executionMeta
                        })
                    }

                    if (!chunk || typeof chunk !== 'object') {
                        break
                    }

                    const message = chunk as {
                        id?: string
                        content?: unknown
                        tool_call_chunks?: unknown[]
                    }

                    if (Array.isArray(message.tool_call_chunks) && message.tool_call_chunks.length) {
                        break
                    }

                    if (typeof message.content === 'string' || Array.isArray(message.content)) {
                        return createTextChunk(message.content, {
                            streamId: message.id ?? rest?.run_id,
                            ...executionMeta
                        })
                    }
                }
                break
            }

            case 'on_tool_start': {
                eventStack.push(event)

                const tool_call_id = data.id || metadata.tool_call_id
                if (tool_call_id) {
                    let input = data.input
                    if (data.input && typeof data.input.input === 'string') {
                        try {
                            input = JSON.parse(data.input.input)
                        } catch (error) {
                            //
                        }
                    }
                    const policy = presentationFor(tool_call_id, rest.name, metadata.publicToolPresentation)
                    const preview = presentToolValue(policy, 'input', input)
                    sendToolStep(
                        tool_call_id,
                        rest.name,
                        {
                            title: rest.name,
                            created_date: new Date(),
                            status: 'running'
                        },
                        { input: preview },
                        ['input']
                    )
                }
                break
            }
            case 'on_tool_end': {
                // logger.verbose(data, rest)
                const _event = eventStack.pop()
                if (_event !== 'on_tool_start') {
                    // That shouldn't happen, right?
                    eventStack.pop()
                }

                let output = data.output
                if (isCommand(output)) {
                    const messages = (<typeof AgentStateAnnotation.State>output.update)?.messages
                    output = Array.isArray(messages) ? messages.at(-1) : undefined
                    if (!isBaseMessage(output) || !isToolMessage(output)) output = undefined
                }

                const tool_call_id = output?.tool_call_id || data.id || metadata.tool_call_id
                if (tool_call_id) {
                    const policy = presentationFor(tool_call_id, rest.name, metadata.publicToolPresentation)
                    const message = isBaseMessage(output) && isToolMessage(output) ? output : undefined
                    const content = message ? message.content : output
                    const failed = message?.status === 'error'
                    const preview = presentToolValue(policy, 'output', content)
                    const error = failed ? presentToolValue(policy, 'error', content) : undefined
                    const end_date = new Date()
                    const taskSummary = getSkillUsageSummary({
                        toolName: rest.name,
                        toolCallId: tool_call_id,
                        failed,
                        artifact: message?.artifact
                    })
                    sendToolStep(
                        tool_call_id,
                        rest.name,
                        {
                            ...(taskSummary ? { taskSummary } : {}),
                            status: failed ? 'fail' : 'success',
                            end_date
                        },
                        {
                            output: preview,
                            error,
                            images: failed ? undefined : presentToolImages(policy, message?.artifact)
                        },
                        failed ? ['output', 'error'] : ['output']
                    )
                    // Native widget artifacts retain their existing separate component and category.
                    const artifact = message?.artifact
                    const mcpMeta = readXpertMcpMetaArtifact(artifact)
                    if (mcpMeta) {
                        sendComponent(`native:${tool_call_id}`, executionMeta, {
                            category: 'Computer',
                            tool: rest.name,
                            status: failed ? 'fail' : 'success',
                            end_date,
                            artifact,
                            _meta: mcpMeta,
                            output: content
                        })
                    }
                }
                break
            }
            case 'on_retriever_start': {
                // console.log('on_retriever_start', data, rest)
                const icon = toolIcon(rest.metadata)
                subscriber.next({
                    data: {
                        type: ChatMessageTypeEnum.MESSAGE,
                        data: {
                            id: `native:${data.id || rest.metadata.tool_call_id || rest.run_id}`,
                            type: 'component',
                            ...executionMeta,
                            data: {
                                category: 'Tool',
                                type: ChatMessageStepCategory.Knowledges,
                                toolset: rest.metadata.toolset,
                                toolset_id: rest.metadata.toolsetId,
                                title: toolTitle(metadata, rest.name, language) ?? rest.name,
                                ...(icon ? { icon } : {}),
                                created_date: new Date(),
                                status: 'running',
                                message: data.input?.query,
                                end_date: null,
                                input: sanitizeToolInputForDisplay(data.input)
                            } as TMessageComponent<TMessageComponentStep>
                        } as TMessageContentComponent
                    }
                } as MessageEvent)
                break
            }
            case 'on_retriever_end': {
                subscriber.next({
                    data: {
                        type: ChatMessageTypeEnum.MESSAGE,
                        data: {
                            id: `native:${data.id || rest.metadata.tool_call_id || rest.run_id}`,
                            type: 'component',
                            ...executionMeta,
                            data: {
                                category: 'Computer',
                                end_date: new Date(),
                                status: 'success',
                                data: data.output
                            } as Partial<TMessageComponent<TMessageComponentStep>>
                        } as TMessageContentComponent
                    }
                } as MessageEvent)
                break
            }
            case 'on_custom_event': {
                // logger.verbose(data, rest)
                switch (rest.name) {
                    case RESOURCE_CARD_EVENT: {
                        const card = parseResourceCardContent(data)
                        if (card)
                            subscriber.next({
                                data: {
                                    type: ChatMessageTypeEnum.MESSAGE,
                                    executionId: executionMeta.executionId,
                                    data: createResourceCardContent(card.data)
                                }
                            } as MessageEvent)
                        break
                    }
                    case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
                        const id = data.id || data.toolCall?.id || rest.run_id
                        const name = data.toolCall?.name
                        // Catch events run on the parent node; prefer declarations from the registered failing tool.
                        const policy = presentationFor(
                            id,
                            name,
                            data.publicToolPresentation === undefined
                                ? metadata.publicToolPresentation
                                : data.publicToolPresentation
                        )
                        const error = presentToolValue(policy, 'error', data.error)
                        sendToolStep(
                            id,
                            name,
                            {
                                status: 'fail',
                                end_date: new Date()
                            },
                            { error },
                            ['error'],
                            data.toolDisplay ?? metadata.toolDisplay,
                            data
                        )
                        break
                    }
                    case ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR: {
                        subscriber.next({
                            data: {
                                type: ChatMessageTypeEnum.EVENT,
                                event: ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR,
                                data: {
                                    tags,
                                    ...rest,
                                    name: data.knowledgebaseId,
                                    error: data.error
                                }
                            }
                        } as MessageEvent)
                        break
                    }
                    case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
                        const id = data.id || rest.run_id
                        if (data.category === 'Tool') {
                            const name = data.tool
                            const policy = presentationFor(id, name, metadata.publicToolPresentation)
                            const fields: { input?: JSONValue; output?: JSONValue; error?: JSONValue } = {}
                            const phases: ToolDetailPhase[] = []
                            for (const phase of ['input', 'output', 'error'] as const) {
                                if (!(phase in data)) continue
                                phases.push(phase)
                                const value = presentToolValue(policy, phase, data[phase])
                                if (value !== undefined) fields[phase] = value
                            }
                            if (name || data.status) {
                                sendToolStep(
                                    id,
                                    name,
                                    {
                                        ...(typeof data.title === 'string' && data.title !== name
                                            ? { title: data.title }
                                            : {}),
                                        ...(typeof data.toolset === 'string' ? { toolset: data.toolset } : {}),
                                        ...(['running', 'success', 'fail', 'canceled'].includes(data.status)
                                            ? { status: data.status }
                                            : {}),
                                        ...(data.created_date ? { created_date: data.created_date } : {}),
                                        ...(data.end_date ? { end_date: data.end_date } : {})
                                    },
                                    fields,
                                    phases
                                )
                            }
                        }
                        if (data.category === 'Computer' || data.category === 'Dashboard') {
                            // Rich native components may contain executable widget payloads or shell output.
                            const { toolPresentation: _presentation, ...native } = data
                            sendComponent(`native:${id}`, executionMeta, {
                                ...native,
                                input: sanitizeToolInputForDisplay(data.input)
                            })
                        }
                        break
                    }
                    case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
                        const card = parseResourceCardContent(data)
                        if (card) {
                            subscriber.next({
                                data: {
                                    type: ChatMessageTypeEnum.MESSAGE,
                                    executionId: executionMeta.executionId,
                                    data: createResourceCardContent(card.data)
                                }
                            } as MessageEvent)
                            break
                        }
                        // logger.debug(`on_chat_event`, data)
                        const middlewareEvent = normalizeMiddlewareChatEvent(data)
                        if (middlewareEvent) {
                            subscriber.next({
                                data: {
                                    type: ChatMessageTypeEnum.EVENT,
                                    event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                                    data: middlewareEvent
                                }
                            } as MessageEvent)
                            break
                        }

                        subscriber.next({
                            data: {
                                type: ChatMessageTypeEnum.EVENT,
                                event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                                data: {
                                    tags,
                                    ...rest,
                                    ...data,
                                    ...executionMeta,
                                    created_date: new Date()
                                }
                            }
                        } as MessageEvent)
                    }
                }
                break
            }
        }

        prevEvent = event
        return null
    }

    return (event) => {
        const content = processFun(event)
        return pendingEmissions.length ? Promise.all(pendingEmissions.splice(0)).then(() => content) : content
    }
}

/**
 * Nodes without tags will default to unmute output. If you want to mute certain nodes, please add tags.
 *
 * @param tags Tags of graph node
 * @param unmutes List of unmute tag groups
 * @returns Is mute
 */
function isMute(tags: string[], unmutes: TXpertAgentConfig['mute']) {
    if (!tags.length || unmutes.some((_) => _.every((tag) => tags.includes(tag)))) {
        return false
    }

    return true
}

export function messageEvent(event: ChatMessageEventTypeEnum, data: any) {
    return {
        data: {
            type: ChatMessageTypeEnum.EVENT,
            event,
            data: instanceToPlain(data)
        }
    } as MessageEvent
}

export function getChannelState(state, channel: string): TMessageChannel {
    return channel ? state[channel] : state
}

export type TAgentSubgraphResult = {
    agent: IXpertAgent
    graph: CompiledStateGraph<unknown, unknown, any, typeof AgentStateAnnotation.spec, typeof AgentStateAnnotation.spec>
    nextNodes: TXpertTeamNode[]
    failNode: TXpertTeamNode
    mute?: TXpertAgentConfig['mute']
}

export { TAgentSubgraphParams, TXpertAgentRuntimeOptions } from '../shared'
