import { groupComposerSchema } from './group-composer.schema'
import { z } from 'zod'
import type { ChatGroupCommunication } from '@xpert-ai/contracts'

const ids = z
    .array(z.string().uuid())
    .max(16)
    .refine((items) => new Set(items).size === items.length)
const base = {
    composer: groupComposerSchema.optional(),
    clientMessageId: z.string().uuid(),
    text: z.string().trim().min(1).max(32000)
}
export const groupHumanSendSchema = z
    .object({
        composer: groupComposerSchema.optional(),
        clientMessageId: z.string().uuid(),
        text: z
            .string()
            .min(1)
            .max(32000)
            .refine((text) => !!text.trim()),
        mentions: z
            .array(
                z
                    .object({
                        participantId: z.string().uuid(),
                        start: z.number().int().min(0),
                        end: z.number().int().positive()
                    })
                    .strict()
            )
            .max(32)
            .optional(),
        replyToMessageId: z.string().uuid().optional()
    })
    .strict()
export const groupSendSchema = z.discriminatedUnion('intent', [
    z
        .object({
            ...base,
            intent: z.literal('request'),
            recipientIds: z
                .array(z.string().uuid())
                .min(1)
                .max(16)
                .refine((items) => new Set(items).size === items.length)
        })
        .strict(),
    z.object({ ...base, intent: z.literal('reply'), replyToMessageId: z.string().uuid() }).strict(),
    z.object({ ...base, intent: z.literal('message'), recipientIds: ids }).strict()
])
export const groupCreateSchema = z
    .object({ title: z.string().trim().min(1).max(200), assistantId: z.string().uuid() })
    .strict()
export const groupMemberSchema = z
    .object({ kind: z.enum(['user', 'assistant']), subjectId: z.string().uuid() })
    .strict()
export const groupHistorySchema = z
    .object({
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
    })
    .strict()
export const groupPreferencesSchema = z
    .object({
        readSequence: z.number().int().min(0).optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional()
    })
    .strict()
    .refine((input) => Object.keys(input).length > 0)
export const groupJobSchema = z.object({ recipientId: z.string().uuid() }).strict()
export const groupCommunicationSchema = z
    .object({
        composer: groupComposerSchema.optional(),
        intent: z.enum(['request', 'reply', 'message']),
        senderId: z.string().uuid(),
        recipientIds: ids,
        replyToMessageId: z.string().uuid().optional(),
        causedByMessageId: z.string().uuid().optional(),
        rootMessageId: z.string().uuid(),
        rootUserId: z.string().uuid(),
        hop: z.number().int().min(0).max(8)
    })
    .strict()
export type GroupSendInput = z.output<typeof groupSendSchema>

export function parseGroupCommunication(value: unknown): ChatGroupCommunication {
    return groupCommunicationSchema.parse(value) as ChatGroupCommunication
}

/** Parsed at the HTTP boundary; target execution IDs prevent stale UI controls from affecting a newer run. */
export const groupControlSchema = z
    .object({ action: z.enum(['pause', 'cancel', 'resume']), runId: z.string().uuid() })
    .strict()

export type GroupControlInput = z.output<typeof groupControlSchema>

export const groupCandidatesSchema = z
    .object({
        kind: z.enum(['user', 'assistant']).default('assistant'),
        search: z.string().trim().max(100).default('')
    })
    .strict()
