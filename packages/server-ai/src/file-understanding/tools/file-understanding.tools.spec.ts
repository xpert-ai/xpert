import type { QueryBus } from '@nestjs/cqrs'
import { ListConversationFilesQuery, ListFilePageImagesQuery, SearchFileChunksQuery } from '../queries'
import { createFileUnderstandingTools } from './file-understanding.tools'

type InvokableTool = {
    name: string
    invoke(input: Record<string, unknown>): Promise<unknown>
}

function fileUnderstandingTools(queryBus: QueryBus, conversationId?: string) {
    return createFileUnderstandingTools(
        queryBus,
        conversationId ? { conversationId } : undefined
    ) as unknown as InvokableTool[]
}

describe('createFileUnderstandingTools', () => {
    it('exposes only parsed-file tool names', () => {
        const queryBus = {
            execute: jest.fn()
        }
        const tools = fileUnderstandingTools(queryBus as unknown as QueryBus)

        expect(tools.map((item) => item.name)).toEqual([
            'parsed_file_search',
            'parsed_file_read',
            'parsed_file_table_query',
            'parsed_file_preview',
            'parsed_file_page_images',
            'parsed_file_list',
            'parsed_file_read_by_path',
            'parsed_file_search_all'
        ])
        expect(tools.map((item) => item.name)).not.toEqual(
            expect.arrayContaining([
                'file_search',
                'file_read',
                'file_table_query',
                'file_preview',
                'file_page_images',
                'workspace_list',
                'workspace_read',
                'workspace_search'
            ])
        )
    })

    it('keeps parsed_file_list compact and leaves page images to their dedicated tool', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof ListConversationFilesQuery) {
                    return [
                        {
                            id: 'file-1',
                            originalName: 'deck.pdf',
                            workspacePath: '/workspace/sessions/conversation-1/files/file-1/deck.pdf',
                            status: 'ready',
                            capabilities: ['preview', 'read', 'page_images', 'vision']
                        }
                    ]
                }
                return null
            })
        }
        const tools = fileUnderstandingTools(queryBus as unknown as QueryBus, 'conversation-1')
        const parsedFileListTool = tools.find((item) => item.name === 'parsed_file_list')
        if (!parsedFileListTool) {
            throw new Error('parsed_file_list tool not found')
        }

        const result = await parsedFileListTool.invoke({})

        expect(JSON.parse(String(result))).toEqual([
            {
                fileId: 'file-1',
                name: 'deck.pdf',
                workspacePath: '/workspace/sessions/conversation-1/files/file-1/deck.pdf',
                status: 'ready',
                capabilities: ['preview', 'read', 'page_images', 'vision']
            }
        ])
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListConversationFilesQuery))
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(ListFilePageImagesQuery))
    })

    it('enforces conversation scope and a global multi-file search limit', async () => {
        const files = [
            { id: '11111111-1111-4111-8111-111111111111', originalName: 'a.pdf' },
            { id: '22222222-2222-4222-8222-222222222222', originalName: 'b.pdf' }
        ]
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof ListConversationFilesQuery) return files
                if (query instanceof SearchFileChunksQuery) {
                    return Array.from({ length: 4 }, (_, index) => ({
                        id: `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`,
                        orderNo: index,
                        content: 'x'.repeat(900),
                        anchor: { page: index + 1 }
                    }))
                }
                return null
            })
        }
        const tools = fileUnderstandingTools(queryBus as unknown as QueryBus, 'conversation-1')
        const search = tools.find((item) => item.name === 'parsed_file_search')
        if (!search) throw new Error('parsed_file_search tool not found')

        const result = JSON.parse(
            String(await search.invoke({ fileIds: files.map((file) => file.id), query: '目录', limit: 8 }))
        )

        expect(result).toHaveLength(8)
        expect(result.every((item: { excerpt: string }) => item.excerpt.length <= 801)).toBe(true)
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({ input: expect.objectContaining({ limit: 4 }) })
        )
        await expect(
            search.invoke({
                fileIds: ['33333333-3333-4333-8333-333333333333'],
                query: '越权'
            })
        ).rejects.toThrow('not linked to this Assistant Task conversation')
    })

    it('lists PDF page images by file and page range', async () => {
        const fileId = '11111111-1111-4111-8111-111111111111'
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof ListConversationFilesQuery) {
                    return [{ id: fileId, originalName: 'deck.pdf' }]
                }
                if (query instanceof ListFilePageImagesQuery) {
                    return [
                        {
                            orderNo: 6,
                            mimeType: 'image/png',
                            anchor: { page: 3, path: 'page-0003.png' },
                            file: {
                                workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0003.png',
                                fileName: 'page-0003.png'
                            }
                        }
                    ]
                }
                return null
            })
        }
        const tools = fileUnderstandingTools(queryBus as unknown as QueryBus, 'conversation-1')
        const pageImagesTool = tools.find((item) => item.name === 'parsed_file_page_images')
        if (!pageImagesTool) {
            throw new Error('parsed_file_page_images tool not found')
        }

        const result = await pageImagesTool.invoke({
            fileId,
            pageStart: 3,
            pageEnd: 3
        })

        expect(JSON.parse(String(result))).toEqual({
            fileId,
            pageImages: [
                {
                    orderNo: 6,
                    mimeType: 'image/png',
                    page: 3,
                    path: 'page-0003.png',
                    workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0003.png',
                    fileName: 'page-0003.png'
                }
            ]
        })
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                fileAssetId: fileId,
                options: {
                    pageStart: 3,
                    pageEnd: 3,
                    limit: undefined
                }
            })
        )
    })
})
