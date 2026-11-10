import { z } from 'zod'

/** Public-history filters. The group and actor are resolved from the authorized host, never these parameters. */
export const groupMapQuerySchema = z.object({
    before: z.number().int().positive().optional(),
    participantId: z.string().uuid().optional(),
    search: z.string().trim().max(200).default(''),
    limit: z.number().int().min(1).max(100).default(50)
})
export type GroupMapQuery = z.infer<typeof groupMapQuerySchema>

/** A public message anchor, not a private Assistant execution or checkpoint. */
export const groupMapMessageSchema = z.object({
    id: z.string().uuid(),
    sequence: z.number().int(),
    senderId: z.string().uuid(),
    recipientIds: z.array(z.string().uuid()),
    intent: z.enum(['message', 'request', 'reply']),
    replyStage: z.enum(['progress', 'final']).optional(),
    /** Only validated, earlier messages in this same group can be relationship targets. */
    parentId: z.string().uuid().nullable(),
    relation: z.enum(['reply', 'caused-by', 'root']).nullable(),
    preview: z.string(),
    /** Explicit public presentation categories; never inferred from text/tool names. */
    contentKinds: z.array(z.enum(['resource', 'result'])),
    createdAt: z.string().datetime()
})
export type GroupMapMessage = z.infer<typeof groupMapMessageSchema>

/** Read-only group discussion projection. Membership authorizes these public messages only. */
export const groupMapPageSchema = z.object({
    groupId: z.string().uuid(),
    threadId: z.string(),
    title: z.string(),
    revision: z.number().int(),
    members: z.array(
        z.object({
            id: z.string().uuid(),
            name: z.string(),
            kind: z.enum(['user', 'assistant']),
            active: z.boolean()
        })
    ),
    messages: z.array(groupMapMessageSchema),
    /** Exclusive public sequence cursor; null means the filtered history has been exhausted. */
    nextBefore: z.number().int().nullable()
})
export type GroupMapPage = z.infer<typeof groupMapPageSchema>
