import { tool } from '@langchain/core/tools'
import { QueryBus } from '@nestjs/cqrs'
import { z } from 'zod'
import type { FilePageImageResult } from '../queries'
import {
    GetFilePreviewQuery,
    ListConversationFilesQuery,
    ListFilePageImagesQuery,
    ReadFileChunkQuery,
    SearchFileChunksQuery
} from '../queries'

type CreateFileUnderstandingToolsOptions = {
    conversationId?: string
}

const WORKSPACE_LIST_PAGE_IMAGE_LIMIT = 12

export function createFileUnderstandingTools(queryBus: QueryBus, options?: CreateFileUnderstandingToolsOptions) {
    const listConversationFiles = async () => {
        return options?.conversationId
            ? await queryBus.execute(new ListConversationFilesQuery(options.conversationId))
            : []
    }

    const resolveFileIds = async (fileIds?: string[]) => {
        if (fileIds?.length) {
            return fileIds
        }
        const files = await listConversationFiles()
        return files.map((file) => file.id)
    }

    const findConversationFileByPath = async (workspacePath?: string) => {
        if (!workspacePath) {
            return null
        }
        const normalizedPath = workspacePath.trim()
        const files = await listConversationFiles()
        return (
            files.find((file) => file.workspacePath === normalizedPath) ??
            files.find((file) => file.workspacePath?.endsWith(normalizedPath)) ??
            null
        )
    }

    // Parsed-file tools are scoped by ConversationFileLink through
    // ListConversationFilesQuery, so agents cannot discover unrelated uploads.
    const fileSearch = tool(
        async ({ fileIds, query, limit }) => {
            const ids = await resolveFileIds(fileIds)
            const conversationFiles = await listConversationFiles()
            const results = []
            for (const fileId of ids) {
                const file = conversationFiles.find((item) => item.id === fileId)
                const chunks = await queryBus.execute(new SearchFileChunksQuery({ fileId, query, limit }))
                results.push({
                    fileId,
                    name: file?.originalName,
                    workspacePath: file?.workspacePath,
                    chunks: chunks.map((chunk) => ({
                        chunkId: chunk.id,
                        orderNo: chunk.orderNo,
                        anchor: chunk.anchor,
                        content: chunk.content
                    }))
                })
            }
            return JSON.stringify(results)
        },
        {
            name: 'file_search',
            description:
                'Search parsed user-uploaded files by query. Returns matching chunks with page, sheet, slide, path, or chunk anchors for citation.',
            schema: z.object({
                fileIds: z.array(z.string()).optional(),
                query: z.string().describe('Search query. Use the user question or a focused keyword query.'),
                limit: z.number().int().positive().max(20).optional()
            })
        }
    )

    const fileRead = tool(
        async ({ fileId, chunkId, orderNo }) => {
            const chunk = await queryBus.execute(new ReadFileChunkQuery({ fileId, chunkId, orderNo }))
            return JSON.stringify(
                chunk
                    ? {
                          fileId,
                          chunkId: chunk.id,
                          orderNo: chunk.orderNo,
                          anchor: chunk.anchor,
                          content: chunk.content
                      }
                    : null
            )
        },
        {
            name: 'file_read',
            description:
                'Read a parsed file chunk by chunkId or orderNo. Use after file_search when exact surrounding text is needed.',
            schema: z.object({
                fileId: z.string(),
                chunkId: z.string().optional(),
                orderNo: z.number().int().nonnegative().optional()
            })
        }
    )

    const filePreview = tool(
        async ({ fileId }) => {
            const preview = await queryBus.execute(new GetFilePreviewQuery(fileId))
            return JSON.stringify(preview)
        },
        {
            name: 'file_preview',
            description:
                'Preview parsed file metadata, summary, artifacts, and first chunks. PDF page_image artifacts include workspace image paths that can be inspected with view-image tools.',
            schema: z.object({
                fileId: z.string()
            })
        }
    )

    const filePageImages = tool(
        async ({ fileId, pageStart, pageEnd, limit }) => {
            const pageImages = await queryBus.execute<ListFilePageImagesQuery, FilePageImageResult[]>(
                new ListFilePageImagesQuery(fileId, {
                    pageStart,
                    pageEnd,
                    limit
                })
            )
            return JSON.stringify({
                fileId,
                pageImages: toPageImageToolFiles(pageImages)
            })
        },
        {
            name: 'file_page_images',
            description:
                'List rendered PDF page images for a parsed file. Use this before view-image when a PDF page must be inspected visually.',
            schema: z.object({
                fileId: z.string(),
                pageStart: z.number().int().positive().optional(),
                pageEnd: z.number().int().positive().optional(),
                limit: z.number().int().positive().max(300).optional()
            })
        }
    )

    const fileTableQuery = tool(
        async ({ fileId, query, limit }) => {
            const chunks = await queryBus.execute(new SearchFileChunksQuery({ fileId, query, limit }))
            return JSON.stringify(
                chunks.map((chunk) => ({
                    chunkId: chunk.id,
                    anchor: chunk.anchor,
                    content: chunk.content
                }))
            )
        },
        {
            name: 'file_table_query',
            description:
                'Query parsed spreadsheet or CSV table artifacts. Returns sheet/table chunks and anchors that can be cited.',
            schema: z.object({
                fileId: z.string(),
                query: z.string(),
                limit: z.number().int().positive().max(20).optional()
            })
        }
    )

    const workspaceList = tool(
        async () => {
            const files = await listConversationFiles()
            const pageImagesByFileId = await listPageImagesByFileId(files)
            return JSON.stringify(
                files.map((file) => {
                    const pageImages = pageImagesByFileId.get(file.id)
                    return {
                        fileId: file.id,
                        name: file.originalName,
                        workspacePath: file.workspacePath,
                        status: file.status,
                        capabilities: file.capabilities,
                        ...(pageImages?.length ? { pageImages } : {})
                    }
                })
            )
        },
        {
            name: 'workspace_list',
            description:
                'List uploaded files currently linked to this conversation workspace. PDF files with rendered page images include initial pageImages paths or URLs; use file_page_images for a complete or page-specific list.',
            schema: z.object({})
        }
    )

    const workspaceRead = tool(
        async ({ fileId, path, chunkId, orderNo }) => {
            // This reads parsed chunks by file id/path. Raw original files should
            // be read with sandbox_file or shell using the returned workspacePath.
            const file = fileId ? null : await findConversationFileByPath(path)
            const resolvedFileId = fileId ?? file?.id
            if (!resolvedFileId) {
                return JSON.stringify(null)
            }
            const chunk = await queryBus.execute(new ReadFileChunkQuery({ fileId: resolvedFileId, chunkId, orderNo }))
            return JSON.stringify(chunk)
        },
        {
            name: 'workspace_read',
            description:
                'Read a parsed file chunk from the conversation workspace file index by fileId or workspacePath. For raw file bytes, use sandbox_file or shell with the returned workspacePath.',
            schema: z.object({
                fileId: z.string().optional(),
                path: z.string().optional().describe('workspacePath returned by workspace_list or the file card.'),
                chunkId: z.string().optional(),
                orderNo: z.number().int().nonnegative().optional()
            })
        }
    )

    const workspaceSearch = tool(
        async ({ query, limit }) => {
            const files = await listConversationFiles()
            const fileIds = files.map((file) => file.id)
            const results = []
            for (const fileId of fileIds) {
                const chunks = await queryBus.execute(new SearchFileChunksQuery({ fileId, query, limit }))
                const file = files.find((item) => item.id === fileId)
                results.push({
                    fileId,
                    name: file?.originalName,
                    workspacePath: file?.workspacePath,
                    chunks
                })
            }
            return JSON.stringify(results)
        },
        {
            name: 'workspace_search',
            description: 'Search every parsed file linked to this conversation workspace.',
            schema: z.object({
                query: z.string(),
                limit: z.number().int().positive().max(20).optional()
            })
        }
    )

    async function listPageImagesByFileId(files: Awaited<ReturnType<typeof listConversationFiles>>) {
        const entries = await Promise.all(
            files.map(async (file) => {
                if (!file.capabilities?.includes('page_images')) {
                    return null
                }
                const pageImages = await queryBus.execute<ListFilePageImagesQuery, FilePageImageResult[]>(
                    new ListFilePageImagesQuery(file.id, {
                        limit: WORKSPACE_LIST_PAGE_IMAGE_LIMIT
                    })
                )
                const pageImageFiles = toPageImageToolFiles(pageImages)
                return pageImageFiles.length ? ([file.id, pageImageFiles] as const) : null
            })
        )
        return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)))
    }

    return [
        fileSearch,
        fileRead,
        fileTableQuery,
        filePreview,
        filePageImages,
        workspaceList,
        workspaceRead,
        workspaceSearch
    ]
}

function toPageImageToolFiles(pageImages: FilePageImageResult[]) {
    return pageImages.flatMap((pageImage) => {
        const workspacePath = pageImage.file.workspacePath
        const url = pageImage.file.url
        if (!workspacePath && !url) {
            return []
        }
        return [
            {
                orderNo: pageImage.orderNo,
                mimeType: pageImage.mimeType,
                page: pageImage.anchor?.page,
                path: pageImage.anchor?.path,
                workspacePath,
                url,
                fileName: pageImage.file.fileName,
                width: pageImage.file.width,
                height: pageImage.file.height,
                size: pageImage.file.size
            }
        ]
    })
}
