import { groupComposerSchema } from './group-composer.schema'
import { iconDefinitionSchema } from '@xpert-ai/contracts'
import { z } from 'zod'
import type { ChatGroupCommunication, ChatGroupSendInput } from '@xpert-ai/contracts'

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
    // Keep the shared required fields explicit under this repository's non-strict null checking.
    .transform((value) => value as ChatGroupSendInput)
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
    z
        .object({
            ...base,
            intent: z.literal('reply'),
            replyToMessageId: z.string().uuid(),
            // Existing human/internal callers retain final-reply semantics; model tools require an explicit stage.
            replyStage: z.enum(['progress', 'final']).optional()
        })
        .strict(),
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
const resourceLinkBase = {
    projectId: z.string().uuid(),
    title: z.string().max(200),
    // Invalid decorative metadata must not hide an otherwise valid historical resource link.
    icon: iconDefinitionSchema.optional().catch(undefined)
}
const resourceTargetSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('group-reference'), id: z.string().uuid() }).strict(),
    z.object({ kind: z.literal('project-content'), id: z.string().uuid() }).strict()
])
/** Normalize persisted legacy links once; business code and new writes use only resource.kind/id. */
export const groupResourceLinkSchema = z.union([
    z.object({ ...resourceLinkBase, resource: resourceTargetSchema }).strict(),
    z
        .object({ ...resourceLinkBase, kind: z.literal('group-reference').optional(), referenceId: z.string().uuid() })
        .strict()
        .transform(({ projectId, title, referenceId, icon }) => ({
            projectId,
            title,
            ...(icon ? { icon } : {}),
            resource: { kind: 'group-reference' as const, id: referenceId }
        })),
    z
        .object({ ...resourceLinkBase, kind: z.literal('project-content'), contentId: z.string().uuid() })
        .strict()
        .transform(({ projectId, title, contentId, icon }) => ({
            projectId,
            title,
            ...(icon ? { icon } : {}),
            resource: { kind: 'project-content' as const, id: contentId }
        }))
])
export const groupCommunicationSchema = z
    .object({
        resourceLinks: z.array(groupResourceLinkSchema).max(10).optional(),
        resourceNavigation: z
            .object({
                requestId: z.string().uuid(),
                issuedAt: z.number().int().positive(),
                clientMessageId: z.string().uuid(),
                participantId: z.string().uuid()
            })
            .strict()
            .optional(),
        projectTask: z
            .object({
                invocationId: z.string().uuid(),
                projectId: z.string().uuid(),
                projectTaskId: z.string().uuid(),
                taskExecutionId: z.string().uuid()
            })
            .strict()
            .optional(),
        runtimeResult: z
            .object({
                invocationId: z.string().uuid(),
                consumerExecutionId: z.string().uuid(),
                revision: z.number().int().nonnegative(),
                projectId: z.string().uuid(),
                projectTaskId: z.string().uuid(),
                taskExecutionId: z.string().uuid(),
                specificationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/)
            })
            .strict()
            .optional(),
        composer: groupComposerSchema.optional(),
        intent: z.enum(['request', 'reply', 'message']),
        senderId: z.string().uuid(),
        recipientIds: ids,
        replyToMessageId: z.string().uuid().optional(),
        replyStage: z.enum(['progress', 'final']).optional(),
        causedByMessageId: z.string().uuid().optional(),
        rootMessageId: z.string().uuid(),
        rootUserId: z.string().uuid(),
        hop: z.number().int().min(0).max(8)
    })
    .strict()
    .refine((value) => value.replyStage === undefined || value.intent === 'reply', {
        path: ['replyStage'],
        message: 'replyStage is only valid for replies'
    })
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
        search: z.string().trim().max(100).default(''),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0)
    })
    .strict()
