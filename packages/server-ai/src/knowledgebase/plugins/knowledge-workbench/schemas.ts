import { z } from 'zod/v3'

export const knowledgeWorkbenchDocumentReferenceSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    path: z.string().optional()
})

export const knowledgeWorkbenchContextValueSchema = z.object({
    knowledgebaseId: z.string().optional(),
    documentIds: z.array(z.string().min(1)).optional(),
    documents: z.array(knowledgeWorkbenchDocumentReferenceSchema).optional()
})

export const knowledgeWorkbenchRequestContextSchema = z.object({
    knowledgebase_workbench: knowledgeWorkbenchContextValueSchema.optional()
})

export const openKnowledgeWorkbenchSchema = z.object({
    knowledgebaseId: z.string().optional().describe('Knowledgebase id to select in the workbench view.'),
    documentId: z.string().optional().describe('Document id to highlight or preview in the workbench view.'),
    chunkId: z.string().optional().describe('Chunk id to highlight in the document preview.'),
    search: z.string().optional().describe('Optional document search text for the workbench view.')
})

export const searchKnowledgeWorkbenchSchema = z.object({
    query: z
        .string()
        .min(1)
        .describe('Question or retrieval query to search in the connected knowledgebase documents.'),
    knowledgebaseId: z
        .string()
        .optional()
        .describe('Knowledgebase id. Optional when the current context or agent has a single connected knowledgebase.'),
    documentIds: z
        .array(z.string().min(1))
        .optional()
        .describe('Optional document ids. Defaults to documents selected in the workbench context.'),
    topK: z.number().int().min(1).max(20).optional().describe('Maximum chunks to return. Defaults to 6.')
})

export const listKnowledgeWorkbenchDocumentsSchema = z.object({
    knowledgebaseId: z
        .string()
        .optional()
        .describe('Knowledgebase id. Optional when the current agent has a single connected knowledgebase.'),
    parentId: z.string().optional().describe('Parent folder document id for directory browsing.'),
    search: z.string().optional().describe('Optional document search text.'),
    page: z.number().int().min(1).optional().describe('1-based page number.'),
    pageSize: z.number().int().min(1).max(100).optional().describe('Page size. Defaults to 20.')
})

export const previewKnowledgeWorkbenchDocumentSchema = z.object({
    documentId: z.string().min(1).describe('Knowledge document id to preview.')
})

export type KnowledgeWorkbenchRequestContext = z.infer<typeof knowledgeWorkbenchRequestContextSchema>
