import { z } from 'zod'

export const mapQuerySchema = z.object({
    /** Optional public-history filters; the host determines the authorized group. */
    before: z.number().int().positive().optional(),
    participantId: z.string().uuid().optional(),
    projectId: z.string().uuid().nullable().optional(),
    conversationId: z.string().uuid().optional(),
    threadId: z.string().trim().min(1).max(100).optional(),
    representation: z.enum(['turns', 'segments']).default('turns'),
    showHistory: z.boolean().default(false),
    showShared: z.boolean().default(false),
    search: z.string().trim().max(200).default(''),
    searchOffset: z.coerce.number().int().min(0).default(0),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20)
})
export type MapQuery = z.infer<typeof mapQuerySchema>
export const mapOptionsQuerySchema = z.object({
    operation: z.literal('options'),
    kind: z.enum(['projects', 'conversations']),
    projectId: z.string().uuid().nullable().optional(),
    search: z.string().trim().max(200).default(''),
    offset: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20)
})
export type MapOptionsQuery = z.infer<typeof mapOptionsQuerySchema>
export const mapOptionsPageSchema = z.object({
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    nextOffset: z.number().int().nonnegative().nullable()
})
export type MapOptionsPage = z.infer<typeof mapOptionsPageSchema>
export const mapActionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('create'),
        projectId: z.string().uuid().nullable(),
        title: z.string().trim().min(1).max(160),
        requestId: z.string().uuid()
    }),
    z.object({
        type: z.literal('rename'),
        conversationId: z.string().uuid(),
        threadId: z.string().trim().min(1).max(100).optional(),
        title: z.string().trim().min(1).max(160)
    }),
    z.object({
        type: z.literal('side-chat'),
        conversationId: z.string().uuid(),
        threadId: z.string().trim().min(1).max(100),
        requestId: z.string().uuid()
    }),
    z.object({
        type: z.literal('branch'),
        conversationId: z.string().uuid(),
        threadId: z.string().trim().min(1).max(100),
        messageId: z.string().uuid(),
        requestId: z.string().uuid()
    }),
    z.object({
        type: z.literal('locate'),
        conversationId: z.string().uuid(),
        threadId: z.string().trim().min(1).max(100),
        messageId: z.string().uuid().optional()
    })
])
export type MapAction = z.infer<typeof mapActionSchema>
/** Internal single-chat reader output; normalized before crossing the View boundary. */
export const mapSourceNodeSchema = z.object({
    id: z.string(),
    kind: z.enum(['project', 'conversation', 'thread', 'turn', 'segment']),
    title: z.string(),
    conversationTitle: z.string().optional(),
    updatedAt: z.string().datetime().optional(),
    lastHumanMessage: z
        .object({
            id: z.string(),
            text: z.string(),
            createdAt: z.string().datetime().optional(),
            inherited: z.boolean()
        })
        .optional(),
    conversationId: z.string().optional(),
    threadId: z.string().optional(),
    messageId: z.string().optional(),
    branchMessageId: z.string().optional(),
    parentId: z.string().nullable(),
    parentThreadId: z.string().nullable().optional(),
    sourceConversationId: z.string().optional(),
    sourceMessageId: z.string().optional(),
    preview: z.string().default(''),
    answer: z.string().optional(),
    expandable: z.boolean().default(false),
    purpose: z.enum(['side-chat', 'message-edit']).optional(),
    current: z.boolean().optional(),
    shared: z.boolean().optional(),
    status: z.string().optional(),
    branchAvailable: z.boolean().optional(),
    branchReason: z.string().optional(),
    threadIds: z.array(z.string()).optional(),
    branchOptions: z.array(z.object({ threadId: z.string(), title: z.string() })).optional(),
    messageCount: z.number().int().nonnegative().optional(),
    endMessageId: z.string().optional(),
    segmentThreads: z
        .array(z.object({ threadId: z.string(), title: z.string(), current: z.boolean(), status: z.string() }))
        .optional(),
    path: z.array(z.object({ id: z.string(), title: z.string() })).optional()
})
export type MapSourceNode = z.infer<typeof mapSourceNodeSchema>
export const mapSourcePageSchema = z.object({
    currentConversationId: z.string().nullable().optional(),
    nodes: z.array(mapSourceNodeSchema),
    nextOffset: z.number().nullable(),
    nextSearchOffset: z.number().optional(),
    total: z.number(),
    projectId: z.string().nullable(),
    projectTitle: z.string(),
    projectUpdatedAt: z.string().datetime().optional(),
    assistantId: z.string(),
    projects: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
    projectsNextOffset: z.number().nullable().optional()
})
export type MapSourcePage = z.infer<typeof mapSourcePageSchema>

/** UI affordances only. Servers must still authorize every read and mutation independently. */
export const mapNodeCapabilitySchema = z.enum(['locate', 'copy', 'rename', 'side-chat', 'branch', 'inspect'])
export type MapNodeCapability = z.infer<typeof mapNodeCapabilitySchema>
/** Explicit navigation audience: public group anchors never identify private Assistant executions. */
export const mapAnchorSchema = z.object({
    target: z.enum(['assistant.conversation', 'group.message']),
    conversationId: z.string(),
    threadId: z.string(),
    messageId: z.string().optional()
})
/** A shared display node. Message intent is distinct from structural node kind. */
export const mapNodeSchema = mapSourceNodeSchema.extend({
    kind: z.enum(['project', 'conversation', 'thread', 'turn', 'segment', 'message']),
    /** Containment fallback only; semantic relationships live in MapPage.edges. */
    parentId: z.string().nullable(),
    capabilities: z.array(mapNodeCapabilitySchema).default([]),
    anchor: mapAnchorSchema.optional(),
    message: z
        .object({
            sequence: z.number().int(),
            senderId: z.string(),
            recipientIds: z.array(z.string()),
            intent: z.enum(['message', 'request', 'reply']),
            replyStage: z.enum(['progress', 'final']).optional(),
            contentKinds: z.array(z.enum(['resource', 'result']))
        })
        .optional()
})
export type MapNode = z.infer<typeof mapNodeSchema>
/** Direction is origin/parent -> derived/child. Missing endpoints may be on another page, not missing data. */
export const mapEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    kind: z.enum(['contains', 'branch', 'source', 'reply', 'caused-by', 'root'])
})
export type MapEdge = z.infer<typeof mapEdgeSchema>
/** Transport-neutral continuation; the adapter translates it to its native paging mechanism. */
export const mapCursorSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('offset'),
        offset: z.number().int().nonnegative(),
        searchOffset: z.number().int().nonnegative().optional()
    }),
    z.object({ type: z.literal('before'), sequence: z.number().int().positive() })
])
export type MapCursor = z.infer<typeof mapCursorSchema>
/** Canonical read model used by all three views, independent of storage and execution-trace models. */
export const mapPageSchema = mapSourcePageSchema
    .omit({ nodes: true, nextOffset: true, nextSearchOffset: true })
    .extend({
        scope: z.object({
            kind: z.enum(['assistant', 'group']),
            /** Stable authorized scope key; resetting scope discards cached nodes and selections. */
            id: z.string(),
            title: z.string(),
            conversationId: z.string().optional(),
            threadId: z.string().optional()
        }),
        nodes: z.array(mapNodeSchema),
        edges: z.array(mapEdgeSchema),
        /** Empty participants means member filtering is not supported in this scope. */
        participants: z.array(
            z.object({ id: z.string(), name: z.string(), kind: z.enum(['user', 'assistant']), active: z.boolean() })
        ),
        capabilities: z.array(
            z.enum(['select-project', 'history', 'segments', 'execution-trail', 'participants', 'live'])
        ),
        pageInfo: z.object({ next: mapCursorSchema.nullable(), revision: z.number().int().optional() })
    })
export type MapPage = z.infer<typeof mapPageSchema>
