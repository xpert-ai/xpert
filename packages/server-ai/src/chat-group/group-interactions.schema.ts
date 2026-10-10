import { z } from 'zod'
import { isClientToolRequest, isHITLRequest, ClientToolRequest, HITLRequest } from '@xpert-ai/chatkit-types'
import { groupInvalid } from './group.errors'

/** Private runtime requests disclosed only to the assigned human after a successful claim. */
export type GroupInteractionRequest =
    | { kind: 'client_tool'; request: ClientToolRequest }
    | { kind: 'approval'; request: HITLRequest }
/** Validate persisted interrupt JSON once before business logic reads its fields. */
export function parseGroupInteractionRequests(value: unknown): GroupInteractionRequest[] {
    if (!Array.isArray(value)) throw groupInvalid()
    return value.map((item: unknown) => {
        if (!item || typeof item !== 'object' || !('kind' in item) || !('request' in item)) throw groupInvalid()
        if (item.kind === 'client_tool' && isClientToolRequest(item.request))
            return { kind: 'client_tool', request: item.request }
        if (item.kind === 'approval' && isHITLRequest(item.request)) return { kind: 'approval', request: item.request }
        throw groupInvalid()
    })
}
/** A browser-generated claim ID allows retries while excluding a second tab. */
export const groupClaimSchema = z.object({ claimId: z.string().uuid() }).strict()
const decisionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('approve') }).strict(),
    z.object({ type: z.literal('reject'), message: z.string().max(32000).optional() }).strict(),
    z.object({ type: z.literal('respond'), message: z.string().max(32000) }).strict(),
    z
        .object({
            type: z.literal('edit'),
            editedAction: z.object({ name: z.string(), args: z.record(z.unknown()) }).strict()
        })
        .strict()
])
/** Transport shape only; the service matches results and decisions against the claimed requests. */
export const groupInteractionResponseSchema = z
    .object({
        claimId: z.string().uuid(),
        decisions: z.array(decisionSchema).max(32).optional(),
        toolMessages: z
            .array(
                z
                    .object({
                        tool_call_id: z.string().min(1),
                        name: z.string().optional(),
                        content: z.unknown(),
                        status: z.enum(['success', 'error']).optional(),
                        artifact: z.unknown().optional()
                    })
                    .strict()
            )
            .max(32)
            .optional()
    })
    .strict()
    .refine((input) => JSON.stringify(input).length <= 128000)

export type GroupInteractionResponse = z.output<typeof groupInteractionResponseSchema>
