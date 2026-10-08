import { agentRuntimeModelSourceSchema, type AgentRuntimeModelSource } from '@xpert-ai/contracts'
import { executionError } from './execution-errors'

/** Binding configuration is a persistence boundary. An omitted source never selects an arbitrary Assistant. */
export function parseInvocationModelSource(value: unknown): AgentRuntimeModelSource {
    const parsed = agentRuntimeModelSourceSchema.safeParse(value)
    if (!parsed.success) throw executionError('Denied')
    return { type: parsed.data.type, xpertId: parsed.data.xpertId }
}
