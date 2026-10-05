import type { TChatMessageEnvelope } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod'

const id = z.string().min(1).max(256)
export const chatMessageEnvelopeSchema = z
    .object({
        version: z.literal(1),
        source: z.discriminatedUnion('type', [
            z.object({ type: z.literal('user'), userId: id }).strict(),
            z.object({ type: z.literal('voice'), sessionId: id }).strict(),
            z.object({ type: z.literal('assistant'), xpertId: id }).strict(),
            z.object({ type: z.literal('agent'), xpertId: id, agentKey: id }).strict(),
            z.object({ type: z.literal('automation'), taskId: id }).strict()
        ]),
        presentation: z.enum(['message', 'event', 'runtime']),
        target: z
            .object({ xpertId: id, agentKey: id.optional(), conversationId: id.optional(), threadId: id.optional() })
            .strict()
            .optional(),
        correlation: z
            .object({
                messageId: id.optional(),
                executionId: id.optional(),
                invocationId: id.optional(),
                taskId: id.optional()
            })
            .strict()
            .optional()
    })
    .strict()

/** Validate host provenance and presentation at the command/queue boundary. */
export function parseChatMessageEnvelope(options: { messageEnvelope?: unknown }): TChatMessageEnvelope | undefined {
    if (options.messageEnvelope == null) return undefined
    const parsed = chatMessageEnvelopeSchema.safeParse(options.messageEnvelope)
    if (!parsed.success) throw new BadRequestException(t('server-ai:Error.ChatMessageEnvelopeInvalid'))
    return parsed.data as TChatMessageEnvelope
}

/** Read persisted metadata once at an output boundary; never forward arbitrary JSON as provenance. */
export function readChatMessageEnvelope(message: { messageEnvelope?: unknown }): TChatMessageEnvelope | undefined {
    try {
        return parseChatMessageEnvelope(message)
    } catch {
        return undefined
    }
}
