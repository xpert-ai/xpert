import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage
} from '@langchain/core/messages'
import { Runnable } from '@langchain/core/runnables'
import { ModelFeature, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import type { ModelGatewayUsage } from './model-gateway.service'
import { modelGatewayMessage } from './model-gateway.i18n'

type OpenAIMessageRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool'

export type OpenAIToolDefinition = {
    type: 'function'
    function: {
        name: string
        description?: string
        parameters?: object
    }
}

export type OpenAIChatRequest = {
    model: string
    messages: OpenAIInputMessage[]
    stream: boolean
    streamIncludeUsage: boolean
    tools?: OpenAIToolDefinition[]
    toolChoice?: unknown
    parallelToolCalls?: boolean
    options: {
        temperature?: number
        top_p?: number
        max_tokens?: number
        stop?: string | string[]
        presence_penalty?: number
        frequency_penalty?: number
        seed?: number
    }
}

export type OpenAIInputMessage = {
    role: OpenAIMessageRole
    content: unknown
    name?: string
    toolCallId?: string
    toolCalls?: unknown[]
}

export type OpenAIResponseToolCall = {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string
    }
}

const SUPPORTED_KEYS = new Set([
    'model',
    'messages',
    'stream',
    'stream_options',
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'temperature',
    'top_p',
    'max_tokens',
    'max_completion_tokens',
    'stop',
    'presence_penalty',
    'frequency_penalty',
    'seed',
    'n'
])

export function parseOpenAIChatRequest(value: unknown): OpenAIChatRequest {
    assertObject(value, 'request body')
    const unsupported = Object.keys(value).filter((key) => !SUPPORTED_KEYS.has(key))
    if (unsupported.length) {
        throw badRequest(
            'ModelGatewayOpenAIUnsupportedParameters',
            'Unsupported OpenAI request parameters: {{parameters}}',
            { parameters: unsupported.join(', ') }
        )
    }
    const model = requiredString(readProperty(value, 'model'), 'model')
    const rawMessages = readProperty(value, 'messages')
    if (!Array.isArray(rawMessages) || !rawMessages.length) {
        throw badRequest('ModelGatewayOpenAIMessagesRequired', 'messages must be a non-empty array.')
    }
    const n = optionalNumber(readProperty(value, 'n'), 'n')
    if (n !== undefined && n !== 1) {
        throw badRequest('ModelGatewayOpenAINOnlyOne', 'Only n=1 is supported.')
    }
    const maxTokens =
        optionalNumber(readProperty(value, 'max_completion_tokens'), 'max_completion_tokens') ??
        optionalNumber(readProperty(value, 'max_tokens'), 'max_tokens')
    const streamOptions = readProperty(value, 'stream_options')
    let streamIncludeUsage = false
    if (streamOptions !== undefined) {
        assertObject(streamOptions, 'stream_options')
        const unsupportedStreamOptions = Object.keys(streamOptions).filter((key) => key !== 'include_usage')
        if (unsupportedStreamOptions.length) {
            throw badRequest(
                'ModelGatewayOpenAIStreamOptionsUnsupported',
                'Unsupported stream_options parameters: {{parameters}}',
                { parameters: unsupportedStreamOptions.join(', ') }
            )
        }
        streamIncludeUsage = optionalBoolean(readProperty(streamOptions, 'include_usage'), 'include_usage') ?? false
    }
    return {
        model,
        messages: rawMessages.map(parseMessage),
        stream: optionalBoolean(readProperty(value, 'stream'), 'stream') ?? false,
        streamIncludeUsage,
        tools: parseTools(readProperty(value, 'tools')),
        toolChoice: readProperty(value, 'tool_choice'),
        parallelToolCalls: optionalBoolean(readProperty(value, 'parallel_tool_calls'), 'parallel_tool_calls'),
        options: {
            temperature: optionalNumber(readProperty(value, 'temperature'), 'temperature'),
            top_p: optionalNumber(readProperty(value, 'top_p'), 'top_p'),
            max_tokens: maxTokens,
            stop: parseStop(readProperty(value, 'stop')),
            presence_penalty: optionalNumber(readProperty(value, 'presence_penalty'), 'presence_penalty'),
            frequency_penalty: optionalNumber(readProperty(value, 'frequency_penalty'), 'frequency_penalty'),
            seed: optionalNumber(readProperty(value, 'seed'), 'seed')
        }
    }
}

export function assertRequestCapabilities(request: OpenAIChatRequest, capabilities: ModelFeature[]) {
    const supported = new Set(capabilities)
    if (request.tools?.length && !supported.has(ModelFeature.TOOL_CALL)) {
        throw badRequest(
            'ModelGatewayOpenAIToolCallsUnsupported',
            'This model publication does not support tool calls.'
        )
    }
    if (request.parallelToolCalls === true && !supported.has(ModelFeature.MULTI_TOOL_CALL)) {
        throw badRequest(
            'ModelGatewayOpenAIParallelToolsUnsupported',
            'This model publication does not support parallel tool calls.'
        )
    }
    if (
        request.stream &&
        request.tools?.length &&
        !supported.has(ModelFeature.STREAM_TOOL_CALL)
    ) {
        throw badRequest(
            'ModelGatewayOpenAIStreamToolsUnsupported',
            'This model publication does not support streaming tool calls.'
        )
    }
    if (request.messages.some(messageContainsImage) && !supported.has(ModelFeature.VISION)) {
        throw badRequest(
            'ModelGatewayOpenAIImageUnsupported',
            'This model publication does not support image_url content.'
        )
    }
}

export function toLangChainMessages(messages: OpenAIInputMessage[]): BaseMessage[] {
    return messages.map((message) => {
        switch (message.role) {
            case 'system':
            case 'developer':
                return new SystemMessage({ content: parseMessageContent(message.content), name: message.name })
            case 'user':
                return new HumanMessage({ content: parseMessageContent(message.content), name: message.name })
            case 'assistant':
                return new AIMessage({
                    content: parseMessageContent(message.content, true),
                    name: message.name,
                    tool_calls: parseAssistantToolCalls(message.toolCalls)
                })
            case 'tool':
                if (!message.toolCallId) {
                    throw badRequest(
                        'ModelGatewayOpenAIToolMessageIdRequired',
                        'tool messages require tool_call_id.'
                    )
                }
                return new ToolMessage({
                    content: parseMessageContent(message.content, true),
                    name: message.name,
                    tool_call_id: message.toolCallId
                })
        }
    })
}

export function bindOpenAIRequest(model: BaseChatModel, request: OpenAIChatRequest) {
    let runnable: Runnable<BaseMessage[], AIMessage | AIMessageChunk> = model
    if (request.tools?.length) {
        const bound = model.bindTools(request.tools, {
            ...(request.toolChoice !== undefined ? { tool_choice: request.toolChoice } : {}),
            ...(request.parallelToolCalls !== undefined
                ? { parallel_tool_calls: request.parallelToolCalls }
                : {})
        })
        runnable = bound as Runnable<BaseMessage[], AIMessage | AIMessageChunk>
    }
    const options = compactObject(request.options)
    return Object.keys(options).length
        ? runnable.bind(options)
        : runnable
}

export function messageText(message: AIMessage | AIMessageChunk) {
    if (typeof message.content === 'string') {
        return message.content
    }
    return message.content
        .map((part) => {
            if (typeof part === 'string') {
                return part
            }
            if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
                return part.text
            }
            return ''
        })
        .join('')
}

export function responseToolCalls(message: AIMessage | AIMessageChunk): OpenAIResponseToolCall[] {
    return (message.tool_calls ?? []).map((call) => ({
        id: call.id ?? `call_${call.name}`,
        type: 'function',
        function: {
            name: call.name,
            arguments: JSON.stringify(call.args ?? {})
        }
    }))
}

export function responseUsage(
    messages: BaseMessage[],
    outputText: string,
    providerUsage?: Partial<{
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }> | null,
    response?: AIMessage | AIMessageChunk
): ModelGatewayUsage {
    const metadata = response?.usage_metadata
    const inputTokens =
        nonNegativeInteger(providerUsage?.promptTokens) ??
        nonNegativeInteger(metadata?.input_tokens) ??
        estimateMessages(messages)
    const outputTokens =
        nonNegativeInteger(providerUsage?.completionTokens) ??
        nonNegativeInteger(metadata?.output_tokens) ??
        estimateTextTokens(outputText)
    const providerTotal =
        nonNegativeInteger(providerUsage?.totalTokens) ??
        nonNegativeInteger(metadata?.total_tokens)
    const hasProviderUsage =
        nonNegativeInteger(providerUsage?.promptTokens) !== undefined ||
        nonNegativeInteger(providerUsage?.completionTokens) !== undefined ||
        nonNegativeInteger(providerUsage?.totalTokens) !== undefined ||
        nonNegativeInteger(metadata?.input_tokens) !== undefined ||
        nonNegativeInteger(metadata?.output_tokens) !== undefined ||
        nonNegativeInteger(metadata?.total_tokens) !== undefined
    return {
        inputTokens,
        outputTokens,
        totalTokens: providerTotal ?? inputTokens + outputTokens,
        source: hasProviderUsage ? ModelGatewayUsageSourceEnum.Provider : ModelGatewayUsageSourceEnum.Estimated
    }
}

function parseMessage(value: unknown): OpenAIInputMessage {
    assertObject(value, 'message')
    const role = requiredString(readProperty(value, 'role'), 'message.role')
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(role)) {
        throw badRequest('ModelGatewayOpenAIRoleUnsupported', 'Unsupported message role: {{role}}', { role })
    }
    const content = readProperty(value, 'content')
    if (content === undefined && role !== 'assistant') {
        throw badRequest(
            'ModelGatewayOpenAIContentRequired',
            "Message content is required for role '{{role}}'.",
            { role }
        )
    }
    const rawToolCalls = readProperty(value, 'tool_calls')
    return {
        role: role as OpenAIMessageRole,
        content: content ?? '',
        name: optionalString(readProperty(value, 'name'), 'message.name'),
        toolCallId: optionalString(readProperty(value, 'tool_call_id'), 'message.tool_call_id'),
        toolCalls: rawToolCalls === undefined ? undefined : requireArray(rawToolCalls, 'message.tool_calls')
    }
}

function parseTools(value: unknown): OpenAIToolDefinition[] | undefined {
    if (value === undefined) {
        return undefined
    }
    const tools = requireArray(value, 'tools')
    return tools.map((tool) => {
        assertObject(tool, 'tool')
        if (readProperty(tool, 'type') !== 'function') {
            throw badRequest('ModelGatewayOpenAIFunctionToolsOnly', 'Only function tools are supported.')
        }
        const definition = readProperty(tool, 'function')
        assertObject(definition, 'tool.function')
        const parameters = readProperty(definition, 'parameters')
        let normalizedParameters: object | undefined
        if (parameters !== undefined) {
            assertObject(parameters, 'tool.function.parameters')
            normalizedParameters = parameters
        }
        return {
            type: 'function',
            function: {
                name: requiredString(readProperty(definition, 'name'), 'tool.function.name'),
                description: optionalString(readProperty(definition, 'description'), 'tool.function.description'),
                parameters: normalizedParameters
            }
        }
    })
}

function parseAssistantToolCalls(value?: unknown[]) {
    if (!value) {
        return undefined
    }
    return value.map((call) => {
        assertObject(call, 'assistant tool call')
        const fn = readProperty(call, 'function')
        assertObject(fn, 'assistant tool_call.function')
        const args = requiredString(readProperty(fn, 'arguments'), 'assistant tool_call.function.arguments')
        let parsedArgs: object
        try {
            const parsed: unknown = JSON.parse(args)
            assertObject(parsed, 'assistant tool call arguments')
            parsedArgs = parsed
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error
            }
            throw badRequest(
                'ModelGatewayOpenAIToolArgumentsJson',
                'assistant tool call arguments must be valid JSON.'
            )
        }
        return {
            id: optionalString(readProperty(call, 'id'), 'assistant tool_call.id'),
            name: requiredString(readProperty(fn, 'name'), 'assistant tool_call.function.name'),
            args: parsedArgs,
            type: 'tool_call' as const
        }
    })
}

function parseMessageContent(content: unknown, allowEmpty = false) {
    if (typeof content === 'string') {
        if (!allowEmpty && !content.length) {
            return content
        }
        return content
    }
    if (!Array.isArray(content)) {
        throw badRequest(
            'ModelGatewayOpenAIContentShape',
            'Message content must be a string or an array.'
        )
    }
    return content.map((part) => {
        assertObject(part, 'message content part')
        const type = requiredString(readProperty(part, 'type'), 'message.content.type')
        if (type === 'text') {
            return { type: 'text', text: requiredString(readProperty(part, 'text'), 'message.content.text') }
        }
        if (type === 'image_url') {
            const image = readProperty(part, 'image_url')
            assertObject(image, 'message.content.image_url')
            return {
                type: 'image_url',
                image_url: {
                    url: requiredString(readProperty(image, 'url'), 'message.content.image_url.url'),
                    ...(optionalString(readProperty(image, 'detail'), 'message.content.image_url.detail')
                        ? { detail: optionalString(readProperty(image, 'detail'), 'message.content.image_url.detail') }
                        : {})
                }
            }
        }
        throw badRequest(
            'ModelGatewayOpenAIContentTypeUnsupported',
            'Unsupported message content type: {{type}}',
            { type }
        )
    })
}

function messageContainsImage(message: OpenAIInputMessage) {
    return (
        Array.isArray(message.content) &&
        message.content.some(
            (part) =>
                typeof part === 'object' &&
                part !== null &&
                readProperty(part, 'type') === 'image_url'
        )
    )
}

function estimateMessages(messages: BaseMessage[]) {
    return messages.reduce((total, message) => {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        return total + estimateTextTokens(content)
    }, 0)
}

function estimateTextTokens(text: string) {
    if (!text) {
        return 0
    }
    let cjkCharacters = 0
    let otherCharacters = 0
    for (const character of text) {
        if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(character)) {
            cjkCharacters++
        } else {
            otherCharacters++
        }
    }
    return Math.ceil(cjkCharacters / 1.5 + otherCharacters / 4)
}

function parseStop(value: unknown) {
    if (value === undefined) {
        return undefined
    }
    if (typeof value === 'string') {
        return value
    }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return value
    }
    throw badRequest(
        'ModelGatewayOpenAIStopShape',
        'stop must be a string or an array of strings.'
    )
}

function compactObject<T extends object>(value: T) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

function assertObject(value: unknown, field: string): asserts value is object {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw badRequest(
            'ModelGatewayOpenAIObjectRequired',
            '{{field}} must be an object.',
            { field }
        )
    }
}

function readProperty(value: object, property: string): unknown {
    return Reflect.get(value, property)
}

function requiredString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
        throw badRequest(
            'ModelGatewayOpenAIFieldNonEmptyString',
            '{{field}} must be a non-empty string.',
            { field }
        )
    }
    return value.trim()
}

function optionalString(value: unknown, field: string) {
    if (value === undefined || value === null) {
        return undefined
    }
    if (typeof value !== 'string') {
        throw badRequest('ModelGatewayOpenAIFieldString', '{{field}} must be a string.', { field })
    }
    return value
}

function optionalNumber(value: unknown, field: string) {
    if (value === undefined || value === null) {
        return undefined
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw badRequest(
            'ModelGatewayOpenAIFieldNumber',
            '{{field}} must be a finite number.',
            { field }
        )
    }
    return value
}

function optionalBoolean(value: unknown, field: string) {
    if (value === undefined || value === null) {
        return undefined
    }
    if (typeof value !== 'boolean') {
        throw badRequest('ModelGatewayOpenAIFieldBoolean', '{{field}} must be a boolean.', { field })
    }
    return value
}

function requireArray(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) {
        throw badRequest('ModelGatewayOpenAIFieldArray', '{{field}} must be an array.', { field })
    }
    return value
}

function nonNegativeInteger(value?: number | null) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined
}

function badRequest(
    key: string,
    defaultValue: string,
    values?: { [name: string]: string | number }
) {
    return new BadRequestException(modelGatewayMessage(key, defaultValue, values))
}
