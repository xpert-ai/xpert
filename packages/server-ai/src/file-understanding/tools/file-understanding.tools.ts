import { tool } from '@langchain/core/tools'
import { QueryBus } from '@nestjs/cqrs'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { z } from 'zod'
import type { FilePageImageResult } from '../queries'
import {
    GetFilePreviewQuery,
    ListConversationFilesQuery,
    ListProjectFilesQuery,
    ListFilePageImagesQuery,
    ReadFileChunkQuery,
    SearchFileChunksQuery
} from '../queries'

type CreateFileUnderstandingToolsOptions = {
    /** Conversation attachments used alone or as a Project visibility supplement. */
    conversationId?: string
    /** Trusted Project id injected by middleware runtime, never supplied by the model. */
    projectId?: string
}

const SEARCH_RESULT_LIMIT = 8
const SEARCH_SNIPPET_LIMIT = 800
const READ_CONTENT_LIMIT = 4_000

export function createFileUnderstandingTools(queryBus: QueryBus, options?: CreateFileUnderstandingToolsOptions) {
    // Project files become the primary visible set whenever a trusted Project
    // exists; legacy Assistants keep conversation-only behavior unchanged.
    const listVisibleFiles = async () => {
        if (options?.projectId) {
            return queryBus.execute(new ListProjectFilesQuery(options.projectId, options.conversationId))
        }
        return options?.conversationId ? queryBus.execute(new ListConversationFilesQuery(options.conversationId)) : []
    }

    const resolveFileIds = async (fileIds?: string[]) => {
        const files = await listVisibleFiles()
        const allowedIds = new Set(files.map((file) => file.id))
        const ids = fileIds?.length ? [...new Set(fileIds)] : files.map((file) => file.id)
        if (ids.some((fileId) => !allowedIds.has(fileId))) {
            throw new ForbiddenException('The requested file is not visible in the current workspace')
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
        const files = await listVisibleFiles()
        return (
            files.find((file) => file.workspacePath === normalizedPath) ??
            files.find((file) => file.workspacePath?.endsWith(normalizedPath)) ??
            null
        )
    }

    // Parsed-file tools use the trusted runtime Project plus explicit conversation
    // attachments. The model cannot select or override the Project scope.
    const fileSearch = tool(
        async ({ fileIds, query, limit }) => JSON.stringify(await searchConversationFiles(fileIds, query, limit)),
        {
            name: 'parsed_file_search',
            description:
                'Search parsed files visible in the current workspace by query. Returns matching parsed chunks with page, sheet, slide, path, or chunk anchors for citation.',
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
            if (!chunk) {
                throw parsedChunkNotFound({ fileId, chunkId, orderNo })
            }
            return JSON.stringify({
                fileId,
                chunkId: chunk.id,
                orderNo: chunk.orderNo,
                anchor: chunk.anchor,
                content: compactText(chunk.content, READ_CONTENT_LIMIT)
            })
        },
        {
            name: 'parsed_file_read',
            description:
                'Read exactly one parsed file chunk by a chunkId or orderNo returned by parsed_file_search. Never enumerate or increment orderNo to scan a file; a missing chunk is a terminal not-found error.',
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
                'List rendered PDF page images for a parsed file. Use this before view_image when a parsed PDF page must be inspected visually. Each workspacePath is a POSIX file path relative to the current workspace root, never an absolute path. Pass it unchanged to view_image; do not prepend a host or /workspace directory.',
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
            const files = await listVisibleFiles()
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
                'List compact metadata for parsed files visible in the current workspace. Use a dedicated tool to search, read, or list page images.',
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
                throw new NotFoundException(
                    'PARSED_FILE_NOT_FOUND: No parsed file matches the requested workspacePath. Call parsed_file_list and use an exact returned fileId or workspacePath.'
                )
            }
            await requireConversationFile(resolvedFileId)
            const chunk = await queryBus.execute(new ReadFileChunkQuery({ fileId: resolvedFileId, chunkId, orderNo }))
            if (!chunk) {
                throw parsedChunkNotFound({ fileId: resolvedFileId, chunkId, orderNo })
            }
            return JSON.stringify({
                fileId: resolvedFileId,
                chunkId: chunk.id,
                orderNo: chunk.orderNo,
                anchor: chunk.anchor,
                content: compactText(chunk.content, READ_CONTENT_LIMIT)
            })
        },
        {
            name: 'parsed_file_read_by_path',
            description:
                'Read exactly one parsed chunk from the current workspace index by fileId or workspacePath, using a chunkId or orderNo returned by parsed_file_search. Never enumerate orderNo; a missing file or chunk is a terminal not-found error. This does not read raw file bytes.',
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
            description: 'Search every parsed file visible in the current workspace.',
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

/** Return a terminal diagnostic that prevents Agents from probing sequential chunk ids. */
function parsedChunkNotFound(input: { fileId: string; chunkId?: string; orderNo?: number }) {
    const selector = input.chunkId ? `chunkId '${input.chunkId}'` : `orderNo '${input.orderNo}'`
    return new NotFoundException(
        `PARSED_FILE_CHUNK_NOT_FOUND: File '${input.fileId}' has no parsed chunk for ${selector}. Do not increment or enumerate orderNo. Call parsed_file_search and read only a returned chunkId or orderNo; stop when search returns no result.`
    )
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
