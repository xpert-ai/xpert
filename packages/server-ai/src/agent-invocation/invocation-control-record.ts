import { executionRuntimeTargetSchema } from '@xpert-ai/contracts'
import type { AgentInvocation, AgentJson } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'

const json: z.ZodType<AgentJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
const controlFields = z.object({
    executionTarget: executionRuntimeTargetSchema.optional(),
    completionEvidence: z.union([z.literal(1), z.literal(2)]).optional(),
    reportedOutcome: z.enum(['succeeded', 'failed', 'cancelled']).optional(),
    hostResponse: z
        .object({ interactionId: z.string().min(1), response: json, claimed: z.boolean() })
        .strict()
        .optional()
})

/** Validate persisted host-routing data once, before it can select a process or deliver a response. */
export function parseInvocationControlRecord(invocation: AgentInvocation): AgentInvocation {
    const parsed = controlFields.parse(invocation)
    return {
        ...invocation,
        ...parsed,
        hostResponse: parsed.hostResponse
            ? {
                  interactionId: parsed.hostResponse.interactionId,
                  response: parsed.hostResponse.response,
                  claimed: parsed.hostResponse.claimed
              }
            : undefined
    }
}
