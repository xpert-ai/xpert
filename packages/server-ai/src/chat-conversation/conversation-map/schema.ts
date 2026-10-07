import { z } from 'zod'

export const mapQuerySchema = z.object({
    projectId: z.string().uuid().nullable().optional(),
    conversationId: z.string().uuid().optional(),
    threadId: z.string().trim().min(1).max(100).optional(),
    showHistory: z.boolean().default(false),
    showShared: z.boolean().default(false),
    search: z.string().trim().max(200).default(''),
    searchOffset: z.coerce.number().int().min(0).default(0),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20)
})
export type MapQuery = z.infer<typeof mapQuerySchema>
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
export const mapNodeSchema = z.object({
    id: z.string(),
    kind: z.enum(['project', 'conversation', 'thread', 'turn']),
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
    path: z.array(z.object({ id: z.string(), title: z.string() })).optional()
})
export type MapNode = z.infer<typeof mapNodeSchema>
export const mapPageSchema = z.object({
    currentConversationId: z.string().nullable().optional(),
    nodes: z.array(mapNodeSchema),
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
export type MapPage = z.infer<typeof mapPageSchema>
