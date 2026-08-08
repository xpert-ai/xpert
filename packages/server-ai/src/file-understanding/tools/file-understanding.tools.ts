import { tool } from '@langchain/core/tools'
import { QueryBus } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
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

const SEARCH_RESULT_LIMIT = 8
const SEARCH_SNIPPET_LIMIT = 800
const READ_CONTENT_LIMIT = 4_000

export function createFileUnderstandingTools(queryBus: QueryBus, options?: CreateFileUnderstandingToolsOptions) {
    const listConversationFiles = async () => {
        return options?.conversationId
            ? await queryBus.execute(new ListConversationFilesQuery(options.conversationId))
            : []
    }

    const resolveFileIds = async (fileIds?: string[]) => {
        const files = await listConversationFiles()
        const allowedIds = new Set(files.map((file) => file.id))
        const ids = fileIds?.length ? [...new Set(fileIds)] : files.map((file) => file.id)
        if (ids.some((fileId) => !allowedIds.has(fileId))) {
            throw new ForbiddenException('The requested file is not linked to this Assistant Task conversation')
        }
        return { ids, files }
    }

    const requireConversationFile = async (fileId: string) => {
        const { files } = await resolveFileIds([fileId])
        return files.find((file) => file.id === fileId)!
    }

    const searchConversationFiles = async (fileIds: string[] | undefined, query: string, limit?: number) => {
        const globalLimit = Math.min(limit ?? SEARCH_RESULT_LIMIT, SEARCH_RESULT_LIMIT)
        const { ids, files } = await resolveFileIds(fileIds)
        const perFileLimit = Math.max(1, Math.ceil(globalLimit / Math.max(ids.length, 1)))
        const resultsByFile = await Promise.all(
            ids.map(async (fileId) => ({
                fileId,
                chunks: await queryBus.execute(new SearchFileChunksQuery({ fileId, query, limit: perFileLimit }))
            }))
        )
        return resultsByFile
            .flatMap((result, fileIndex) =>
                result.chunks.map((chunk, rank) => ({
                    rank: rank * Math.max(resultsByFile.length, 1) + fileIndex,
                    fileId: result.fileId,
                    name: files.find((file) => file.id === result.fileId)?.originalName,
                    workspacePath: files.find((file) => file.id === result.fileId)?.workspacePath,
                    chunkId: chunk.id,
                    orderNo: chunk.orderNo,
                    anchor: chunk.anchor,
                    excerpt: compactText(chunk.content, SEARCH_SNIPPET_LIMIT)
                }))
            )
            .sort((left, right) => left.rank - right.rank)
            .slice(0, globalLimit)
            .map(({ rank: _rank, ...result }) => result)
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
        async ({ fileIds, query, limit }) => JSON.stringify(await searchConversationFiles(fileIds, query, limit)),
        {
            name: 'parsed_file_search',
            description:
                'Search parsed files linked to this conversation by query. Returns matching parsed chunks with page, sheet, slide, path, or chunk anchors for citation.',
            schema: z
                .object({
                    fileIds: z.array(z.string().uuid()).min(1).max(12).optional(),
                    query: z
                        .string()
                        .trim()
                        .min(1)
                        .max(500)
                        .describe('Focused semantic and keyword query for the current planning topic.'),
                    limit: z.number().int().positive().max(SEARCH_RESULT_LIMIT).optional()
                })
                .strict(),
            verboseParsingErrors: true
        }
    )

    const fileRead = tool(
        async ({ fileId, chunkId, orderNo }) => {
            await requireConversationFile(fileId)
            const chunk = await queryBus.execute(new ReadFileChunkQuery({ fileId, chunkId, orderNo }))
            return JSON.stringify(
                chunk
                    ? {
                          fileId,
                          chunkId: chunk.id,
                          orderNo: chunk.orderNo,
                          anchor: chunk.anchor,
                          content: compactText(chunk.content, READ_CONTENT_LIMIT)
                      }
                    : null
            )
        },
        {
            name: 'parsed_file_read',
            description:
                'Read a parsed file chunk by chunkId or orderNo. Use after parsed_file_search when exact surrounding text is needed.',
            schema: z
                .object({
                    fileId: z.string().uuid(),
                    chunkId: z.string().uuid().optional(),
                    orderNo: z.number().int().nonnegative().optional()
                })
                .strict()
                .refine((value) => (value.chunkId ? value.orderNo == null : value.orderNo != null), {
                    message: 'Provide exactly one of chunkId or orderNo'
                }),
            verboseParsingErrors: true
        }
    )

    const filePreview = tool(
        async ({ fileId }) => {
            await requireConversationFile(fileId)
            const preview = await queryBus.execute(new GetFilePreviewQuery(fileId))
            return JSON.stringify(
                preview
                    ? {
                          file: preview.file,
                          artifactCount: preview.artifacts.length,
                          availableReads: ['parsed_file_search', 'parsed_file_read', 'parsed_file_table_query']
                      }
                    : null
            )
        },
        {
            name: 'parsed_file_preview',
            description: 'Return compact parsed-file status, summary and statistics. It never returns parsed chunks.',
            schema: z.object({ fileId: z.string().uuid() }).strict(),
            verboseParsingErrors: true
        }
    )

    const filePageImages = tool(
        async ({ fileId, pageStart, pageEnd, limit }) => {
            await requireConversationFile(fileId)
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
            name: 'parsed_file_page_images',
            description:
                'List rendered PDF page images for a parsed file. Use this before view-image when a parsed PDF page must be inspected visually.',
            schema: z
                .object({
                    fileId: z.string().uuid(),
                    pageStart: z.number().int().positive().optional(),
                    pageEnd: z.number().int().positive().optional(),
                    limit: z.number().int().positive().max(30).optional()
                })
                .strict()
                .refine(
                    (value) => value.pageStart == null || value.pageEnd == null || value.pageEnd >= value.pageStart,
                    { message: 'pageEnd must be greater than or equal to pageStart' }
                ),
            verboseParsingErrors: true
        }
    )

    const fileTableQuery = tool(
        async ({ fileId, query, limit }) => {
            await requireConversationFile(fileId)
            const chunks = await queryBus.execute(new SearchFileChunksQuery({ fileId, query, limit }))
            return JSON.stringify(
                chunks.map((chunk) => ({
                    chunkId: chunk.id,
                    anchor: chunk.anchor,
                    excerpt: compactText(chunk.content, SEARCH_SNIPPET_LIMIT)
                }))
            )
        },
        {
            name: 'parsed_file_table_query',
            description:
                'Query parsed spreadsheet or CSV table artifacts. Returns parsed sheet/table chunks and anchors that can be cited.',
            schema: z
                .object({
                    fileId: z.string().uuid(),
                    query: z.string().trim().min(1).max(500),
                    limit: z.number().int().positive().max(SEARCH_RESULT_LIMIT).optional()
                })
                .strict(),
            verboseParsingErrors: true
        }
    )

    const workspaceList = tool(
        async () => {
            const files = await listConversationFiles()
            return JSON.stringify(
                files.map((file) => ({
                    fileId: file.id,
                    name: file.originalName,
                    workspacePath: file.workspacePath,
                    status: file.status,
                    capabilities: file.capabilities
                }))
            )
        },
        {
            name: 'parsed_file_list',
            description:
                'List compact metadata for parsed files linked to this conversation. Use a dedicated tool to search, read, or list page images.',
            schema: z.object({}).strict(),
            verboseParsingErrors: true
        }
    )

    const workspaceRead = tool(
        async ({ fileId, path, chunkId, orderNo }) => {
            // This reads parsed chunks by file id/path. Raw original files should
            // be read with sandbox_read_file, or sandbox_shell only when command execution is needed.
            const file = fileId ? null : await findConversationFileByPath(path)
            const resolvedFileId = fileId ?? file?.id
            if (!resolvedFileId) {
                return JSON.stringify(null)
            }
            await requireConversationFile(resolvedFileId)
            const chunk = await queryBus.execute(new ReadFileChunkQuery({ fileId: resolvedFileId, chunkId, orderNo }))
            return JSON.stringify(
                chunk
                    ? {
                          fileId: resolvedFileId,
                          chunkId: chunk.id,
                          orderNo: chunk.orderNo,
                          anchor: chunk.anchor,
                          content: compactText(chunk.content, READ_CONTENT_LIMIT)
                      }
                    : null
            )
        },
        {
            name: 'parsed_file_read_by_path',
            description:
                'Read a parsed chunk from the conversation-linked parsed file index by fileId or workspacePath. This does not read raw file bytes; use sandbox_read_file with the returned workspacePath for original files, or sandbox_shell only when command execution is necessary.',
            schema: z
                .object({
                    fileId: z.string().uuid().optional(),
                    path: z
                        .string()
                        .trim()
                        .min(1)
                        .max(1_000)
                        .optional()
                        .describe('workspacePath returned by parsed_file_list or the file card.'),
                    chunkId: z.string().uuid().optional(),
                    orderNo: z.number().int().nonnegative().optional()
                })
                .strict()
                .refine((value) => Boolean(value.fileId) !== Boolean(value.path), {
                    message: 'Provide exactly one of fileId or path'
                })
                .refine((value) => Boolean(value.chunkId) !== (value.orderNo != null), {
                    message: 'Provide exactly one of chunkId or orderNo'
                }),
            verboseParsingErrors: true
        }
    )

    const workspaceSearch = tool(
        async ({ query, limit }) => JSON.stringify(await searchConversationFiles(undefined, query, limit)),
        {
            name: 'parsed_file_search_all',
            description: 'Search every parsed file linked to this conversation.',
            schema: z
                .object({
                    query: z.string().trim().min(1).max(500),
                    limit: z.number().int().positive().max(SEARCH_RESULT_LIMIT).optional()
                })
                .strict(),
            verboseParsingErrors: true
        }
    )

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

function compactText(value: string, maxLength: number) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
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
