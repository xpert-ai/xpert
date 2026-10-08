// Why this exists: temporary bridge for models that serialize individual Assistant calls.
// TODO: migrate delegate_tasks callers to a better parallel delegation mechanism once selected,
// then retire this bridge while preserving authorization, cancellation and checkpoint isolation.
import { isBaseMessage, isToolMessage } from '@langchain/core/messages'
import { Runnable } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Annotation, END, isGraphInterrupt, Send, START, StateGraph } from '@langchain/langgraph'
import { t } from 'i18next'
import z from 'zod'
import type { ToolCallHandler, WrapToolCallHook } from '@xpert-ai/plugin-sdk'
import { AgentStateAnnotation } from '../shared/agent/state'
import { ExecutionCancelledError } from '../shared/execution/execution-cancelled.error'
import { AgentInvocationAuthorizationError, AgentInvocationError } from './invocation-errors'
import { invocationError } from './invocation-runtime'

export const PARALLEL_DELEGATION_TOOL = 'delegate_tasks'
// Transport bound, not a business task quota. Larger selections can use several calls.
export const MAX_PARALLEL_DELEGATIONS = 32

export interface ParallelDelegationTarget {
    tool: DynamicStructuredTool
    stateGraph: Runnable<typeof AgentStateAnnotation.State, Partial<typeof AgentStateAnnotation.State>>
}

interface DelegationCall {
    assistant: string
    arguments: Record<string, unknown>
}

interface DelegationResult {
    index: number
    assistant: string
    status: 'completed' | 'failed' | 'cancelled'
    result?: string
    error?: string
}

const BatchState = Annotation.Root({
    parentState: Annotation<typeof AgentStateAnnotation.State>,
    callId: Annotation<string>,
    tasks: Annotation<DelegationCall[]>,
    index: Annotation<number>,
    results: Annotation<DelegationResult[]>({ reducer: (left, right) => left.concat(right), default: () => [] })
})

/** Each Send has its own checkpoint namespace and invokes the existing governed native entry. */
export function parallelDelegationTool(targets: readonly ParallelDelegationTarget[], wrapToolCall?: WrapToolCallHook) {
    const declarations = targets.map((target) => {
        if (!(target.tool.schema instanceof z.ZodObject)) throw invocationError('InvalidRequest')
        return { ...target, schema: target.tool.schema }
    })
    const schemas = declarations.map(({ tool, schema }) =>
        z
            .object({
                assistant: z.literal(tool.name).describe(tool.description),
                arguments: schema
            })
            .strict()
    )
    const [first, second, ...rest] = schemas
    if (!first) throw invocationError('InvalidRequest')
    const item = second ? z.union([first, second, ...rest]) : first
    const schema = z
        .object({
            tasks: z
                .array(item)
                .min(1)
                .max(MAX_PARALLEL_DELEGATIONS)
                .superRefine((tasks, context) => {
                    const seen = new Set<string>()
                    tasks.forEach((task, index) => {
                        const identity = canonical(task)
                        if (seen.has(identity))
                            context.addIssue({
                                code: z.ZodIssueCode.custom,
                                path: [index],
                                message: t('server-ai:Error.AgentDelegationDuplicateTask', {
                                    defaultValue: 'Duplicate delegation. Include each independent task only once.'
                                })
                            })
                        seen.add(identity)
                    })
                })
        })
        .strict()
    const targetsByName = new Map(declarations.map((target) => [target.tool.name, target]))
    const graph = new StateGraph(BatchState)
        .addNode('delegate', async (state, config) => {
            const task = state.tasks[state.index]
            const target = targetsByName.get(task.assistant)
            if (!target) throw invocationError('InvalidRequest')
            const childCallId = `${state.callId}:${state.index}`
            const result: DelegationResult = { index: state.index, assistant: task.assistant, status: 'completed' }
            try {
                const childState = {
                    ...state.parentState,
                    toolCall: { id: childCallId, name: task.assistant, args: task.arguments }
                }
                const invoke: ToolCallHandler = async (request) => {
                    const input = { ...childState, ...request.state, toolCall: request.toolCall }
                    const runtime = request.runtime ?? config
                    const output = await target.stateGraph.invoke(input, {
                        ...runtime,
                        configurable: {
                            ...runtime.configurable,
                            tool_call_id: request.toolCall.id,
                            runtimeState: input
                        }
                    })
                    const reply = output.messages?.find(
                        (message) => isToolMessage(message) && message.tool_call_id === childCallId
                    )
                    if (!reply || !isToolMessage(reply)) throw invocationError('MissingResult')
                    return reply
                }
                const request = { toolCall: childState.toolCall, tool: target.tool, state: childState, runtime: config }
                const reply = wrapToolCall ? await wrapToolCall(request, invoke) : await invoke(request)
                if (!isBaseMessage(reply) || !isToolMessage(reply)) throw invocationError('Unsupported')
                if (reply.status === 'error') result.status = 'failed'
                result.result = typeof reply.content === 'string' ? reply.content : JSON.stringify(reply.content)
            } catch (error) {
                config.signal?.throwIfAborted()
                // Permission changes and suspension retain native graph control semantics.
                if (isGraphInterrupt(error) || error instanceof AgentInvocationAuthorizationError) throw error
                if (error instanceof AgentInvocationError && error.code !== 'DispatchUnknown') throw error
                result.status = error instanceof ExecutionCancelledError ? 'cancelled' : 'failed'
                result.error =
                    error instanceof Error ? error.message : t('server-ai:Error.AgentInvocationDispatchUnknown')
            }
            return { results: [result] }
        })
        .addConditionalEdges(START, (state) => state.tasks.map((_, index) => new Send('delegate', { ...state, index })))
        .addEdge('delegate', END)
        // Inherit the parent saver while retaining per-call namespaces. `true`
        // enables shared subgraph memory and strips task IDs, aliasing sibling runs.
        .compile()

    return new DynamicStructuredTool({
        name: PARALLEL_DELEGATION_TOOL,
        description:
            'Delegate independent tasks concurrently to the selected Assistants in ONE call. Each item starts a separate native execution, even for the same Assistant. Use the exact Assistant name and its usual arguments. Only include tasks you have chosen whose prerequisites are ready; do not include duplicate work or dependent tasks. Results are returned per item; completed items are not repeated when a suspended call resumes. Use the single Assistant tool for one task or tools requiring before/after approval.',
        schema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Delegate independent tasks', zh_Hans: '并发委派独立任务' } },
        func: async (args, _manager, config) => {
            const state: typeof AgentStateAnnotation.State = config?.configurable?.runtimeState
            const callId = config?.configurable?.tool_call_id
            if (!state || typeof callId !== 'string') throw invocationError('InvalidScope')
            // Validate every item before any side effect; use the same schemas as individual tools.
            const tasks: DelegationCall[] = args.tasks.map((task) => ({
                assistant: task.assistant,
                arguments: targetsByName.get(task.assistant).schema.parse(task.arguments)
            }))
            const output = await graph.invoke({ parentState: state, callId, tasks, results: [] }, config)
            return JSON.stringify({ results: output.results.sort((a, b) => a.index - b.index) })
        }
    })
}

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(',')}}`
    return JSON.stringify(value)
}
