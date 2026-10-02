// Invariants: only text and client-side tools are translated. Opaque reasoning, media,
// server tools and stored conversation references require a native provider.
import { z } from 'zod/v3'
import { createHash } from 'node:crypto'
import type { NativeModelProtocol } from '@xpert-ai/plugin-sdk'
import { type OpenAIInputMessage, type OpenAIChatRequest } from '../model-gateway/openai-adapter'
import { executionError } from './execution-errors'

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
const json: z.ZodType<Json> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(json)])
)
const schema = z.record(json)
const name = z.string().min(1).max(256)
const text = z.string()
const cache = z
    .object({ type: z.literal('ephemeral'), ttl: z.enum(['5m', '1h']).optional() })
    .strict()
    .optional()
const responseText = z
    .object({
        type: z.enum(['input_text', 'output_text']),
        text,
        annotations: z.array(z.never()).optional(),
        logprobs: z.array(z.never()).optional()
    })
    .strict()
const responseMessage = z
    .object({
        type: z.literal('message').optional(),
        role: z.enum(['system', 'developer', 'user', 'assistant']),
        content: z.union([text, z.array(responseText)]),
        id: name.optional(),
        status: z.enum(['completed', 'in_progress', 'incomplete']).optional(),
        phase: z.enum(['commentary', 'final_answer']).optional()
    })
    .strict()
const functionCall = z
    .object({
        type: z.literal('function_call'),
        id: name.optional(),
        call_id: name,
        name,
        namespace: name.nullable().optional(),
        arguments: text,
        status: name.optional()
    })
    .strict()
const functionOutput = z
    .object({
        type: z.literal('function_call_output'),
        id: name.optional(),
        call_id: name,
        output: z.union([text, z.array(responseText)])
    })
    .strict()
const customCall = z
    .object({
        type: z.literal('custom_tool_call'),
        id: name.optional(),
        call_id: name,
        name,
        namespace: name.nullable().optional(),
        input: text,
        status: name.optional()
    })
    .strict()
const customOutput = z
    .object({
        type: z.literal('custom_tool_call_output'),
        id: name.optional(),
        call_id: name,
        output: z.union([text, z.array(responseText)])
    })
    .strict()
const responseClientTool = z.union([
    z
        .object({
            type: z.literal('function'),
            name,
            description: text.optional(),
            parameters: schema,
            strict: z.literal(false).nullable().optional()
        })
        .strict(),
    z
        .object({
            type: z.literal('custom'),
            name,
            description: text.optional(),
            format: z
                .object({ type: z.literal('text') })
                .strict()
                .optional()
        })
        .strict()
])
const responseTool = z.union([
    responseClientTool,
    z
        .object({
            type: z.literal('namespace'),
            name,
            description: text.optional(),
            tools: z.array(responseClientTool)
        })
        .strict()
])
const responses = z
    .object({
        model: name,
        input: z.union([
            text,
            z.array(z.union([responseMessage, functionCall, functionOutput, customCall, customOutput]))
        ]),
        instructions: text.nullable().optional(),
        stream: z.boolean().optional(),
        store: z.literal(false).optional(),
        max_output_tokens: z.number().int().positive().optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        tools: z.array(responseTool).optional(),
        tool_choice: z
            .union([
                z.enum(['auto', 'none', 'required']),
                z.object({ type: z.literal('function'), name, namespace: name.optional() }).strict()
            ])
            .optional(),
        parallel_tool_calls: z.boolean().optional(),
        reasoning: z
            .object({ effort: z.literal('none').optional(), summary: z.literal('none').optional() })
            .strict()
            .optional(),
        text: z
            .object({
                format: z
                    .object({ type: z.literal('text') })
                    .strict()
                    .optional()
            })
            .strict()
            .optional(),
        include: z.array(z.literal('reasoning.encrypted_content')).optional(),
        // These are advisory routing/caching/trace hints, never authorization or actual-usage facts.
        client_metadata: z.record(text).optional(),
        prompt_cache_key: text.optional(),
        metadata: z.record(text).optional(),
        safety_identifier: text.optional()
    })
    .strict()
const claudeText = z.object({ type: z.literal('text'), text, cache_control: cache }).strict()
const claudeToolUse = z
    .object({ type: z.literal('tool_use'), id: name, name, input: schema, cache_control: cache })
    .strict()
const claudeToolResult = z
    .object({
        type: z.literal('tool_result'),
        tool_use_id: name,
        content: z.union([text, z.array(claudeText)]).optional(),
        is_error: z.boolean().optional(),
        cache_control: cache
    })
    .strict()
const messages = z
    .object({
        model: name,
        stream: z.boolean().optional(),
        max_tokens: z.number().int().positive(),
        system: z.union([text, z.array(claudeText)]).optional(),
        messages: z
            .array(
                z
                    .object({
                        role: z.enum(['user', 'assistant']),
                        content: z.union([text, z.array(z.union([claudeText, claudeToolUse, claudeToolResult]))])
                    })
                    .strict()
            )
            .min(1),
        tools: z
            .array(
                z.object({ name, description: text.optional(), input_schema: schema, cache_control: cache }).strict()
            )
            .optional(),
        tool_choice: z
            .union([
                z
                    .object({
                        type: z.enum(['auto', 'any', 'none']),
                        disable_parallel_tool_use: z.boolean().optional()
                    })
                    .strict(),
                z.object({ type: z.literal('tool'), name, disable_parallel_tool_use: z.boolean().optional() }).strict()
            ])
            .optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        stop_sequences: z.array(z.never()).optional(),
        thinking: z
            .object({ type: z.literal('disabled') })
            .strict()
            .optional(),
        metadata: z.object({ user_id: text.optional() }).strict().optional()
    })
    .strict()

export interface ChatBridgeRequest {
    parsed: OpenAIChatRequest
    customTools: Set<string>
    toolNames: Map<string, ChatBridgeToolName>
}
export interface ChatBridgeToolName {
    name: string
    namespace?: string
}
const joinText = (value: string | Array<{ text?: string }>) =>
    typeof value === 'string' ? value : value.map((p) => p.text).join('\n')

export function parseChatBridgeRequest(body: unknown, protocol: NativeModelProtocol): ChatBridgeRequest {
    try {
        return protocol === 'openai_responses'
            ? fromResponses(responses.parse(body))
            : fromMessages(messages.parse(body))
    } catch {
        throw executionError('BridgeUnsupported')
    }
}
function fromResponses(body: z.infer<typeof responses>): ChatBridgeRequest {
    const input: OpenAIInputMessage[] = []
    const customTools = new Set<string>()
    const toolNames = new Map<string, ChatBridgeToolName>()
    const toolName = (name: string, namespace?: string | null) => {
        // Stable across tool ordering/history; never conflate same-named tools from different namespaces.
        const alias = namespace
            ? `xpt_ns_${createHash('sha256')
                  .update(JSON.stringify([namespace, name]))
                  .digest('hex')
                  .slice(0, 48)}`
            : name
        const identity = { name, ...(namespace ? { namespace } : {}) }
        const previous = toolNames.get(alias)
        if (previous && (previous.name !== identity.name || previous.namespace !== identity.namespace))
            throw executionError('BridgeUnsupported')
        toolNames.set(alias, identity)
        return alias
    }
    const tools: OpenAIChatRequest['tools'] = body.tools
        ?.flatMap((tool) =>
            tool.type === 'namespace'
                ? tool.tools.map((child) => ({ tool: child, namespace: tool.name, description: tool.description }))
                : [{ tool, namespace: undefined, description: undefined }]
        )
        .map(({ tool, namespace, description }) => {
            const alias = toolName(tool.name, namespace)
            if (tool.type === 'custom') customTools.add(alias)
            return {
                type: 'function',
                function: {
                    name: alias,
                    description: namespace
                        ? [`${namespace}.${tool.name}`, description, tool.description].filter(Boolean).join('\n')
                        : tool.description,
                    parameters:
                        tool.type === 'function'
                            ? tool.parameters
                            : {
                                  type: 'object',
                                  properties: { input: { type: 'string' } },
                                  required: ['input'],
                                  additionalProperties: false
                              }
                }
            }
        })
    if (tools && new Set(tools.map((tool) => tool.function.name)).size !== tools.length)
        throw executionError('BridgeUnsupported')
    if (body.instructions) input.push({ role: 'system', content: body.instructions })
    if (typeof body.input === 'string') input.push({ role: 'user', content: body.input })
    else
        for (const item of body.input) {
            if (item.type === 'function_call' || item.type === 'custom_tool_call') {
                const call = {
                    id: item.call_id,
                    type: 'function',
                    function: {
                        name: toolName(item.name, item.namespace),
                        arguments:
                            item.type === 'function_call' ? item.arguments : JSON.stringify({ input: item.input })
                    }
                }
                const last = input.at(-1)
                if (last?.role === 'assistant') (last.toolCalls ??= []).push(call)
                else input.push({ role: 'assistant', content: '', toolCalls: [call] })
            } else if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output')
                input.push({ role: 'tool', toolCallId: item.call_id, content: joinText(item.output) })
            else input.push({ role: item.role, content: joinText(item.content) })
        }
    return {
        customTools,
        toolNames,
        parsed: {
            model: body.model,
            messages: input,
            stream: body.stream ?? false,
            streamIncludeUsage: true,
            tools,
            toolChoice:
                typeof body.tool_choice === 'object'
                    ? {
                          type: 'function',
                          function: { name: toolName(body.tool_choice.name, body.tool_choice.namespace) }
                      }
                    : body.tool_choice,
            parallelToolCalls: body.parallel_tool_calls,
            options: { max_tokens: body.max_output_tokens, temperature: body.temperature, top_p: body.top_p }
        }
    }
}
function fromMessages(body: z.infer<typeof messages>): ChatBridgeRequest {
    const input: OpenAIInputMessage[] = []
    if (body.system) input.push({ role: 'system', content: joinText(body.system) })
    for (const message of body.messages) {
        if (typeof message.content === 'string') {
            input.push({ role: message.role, content: message.content })
            continue
        }
        for (const block of message.content) {
            if (block.type === 'text') {
                const last = input.at(-1)
                if (last?.role === message.role && typeof last.content === 'string') last.content += '\n' + block.text
                else input.push({ role: message.role, content: block.text })
            } else if (block.type === 'tool_use') {
                if (message.role !== 'assistant') throw executionError('BridgeUnsupported')
                const call = {
                    id: block.id,
                    type: 'function',
                    function: { name: block.name, arguments: JSON.stringify(block.input) }
                }
                const last = input.at(-1)
                if (last?.role === 'assistant') (last.toolCalls ??= []).push(call)
                else input.push({ role: 'assistant', content: '', toolCalls: [call] })
            } else {
                if (message.role !== 'user') throw executionError('BridgeUnsupported')
                input.push({
                    role: 'tool',
                    toolCallId: block.tool_use_id,
                    content: (block.is_error ? 'Tool error:\n' : '') + joinText(block.content ?? '')
                })
            }
        }
    }
    const choice = body.tool_choice
    return {
        customTools: new Set(),
        toolNames: new Map(),
        parsed: {
            model: body.model,
            messages: input,
            stream: body.stream ?? false,
            streamIncludeUsage: true,
            tools: body.tools?.map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
            })),
            toolChoice:
                choice?.type === 'tool'
                    ? { type: 'function', function: { name: choice.name } }
                    : choice?.type === 'any'
                      ? 'required'
                      : choice?.type,
            parallelToolCalls: choice?.disable_parallel_tool_use === true ? false : undefined,
            options: {
                max_tokens: body.max_tokens,
                temperature: body.temperature,
                top_p: body.top_p,
                stop: body.stop_sequences
            }
        }
    }
}
