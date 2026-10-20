import { createHash } from 'node:crypto'
import type { AgentMiddlewareAssistantTaskInput } from '@xpert-ai/plugin-sdk'

/** Match Task transport JSON semantics while ignoring object-key ordering introduced by JSONB. */
export function assistantTaskInputDigest(input: AgentMiddlewareAssistantTaskInput): string {
    const payload = JSON.stringify(input, (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(
                  Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
              )
            : value
    )
    return createHash('sha256').update(payload).digest('hex')
}
