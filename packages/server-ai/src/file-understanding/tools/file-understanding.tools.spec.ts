import type { QueryBus } from '@nestjs/cqrs'
import { ListConversationFilesQuery, ListFilePageImagesQuery } from '../queries'
import { createFileUnderstandingTools } from './file-understanding.tools'

describe('createFileUnderstandingTools', () => {
    it('exposes only parsed-file tool names', () => {
        const queryBus = {
            execute: jest.fn()
        }
        const tools = createFileUnderstandingTools(queryBus as unknown as QueryBus)

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

    it('includes projected PDF page image paths in parsed_file_list results', async () => {
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
                if (query instanceof ListFilePageImagesQuery) {
                    return [
                        {
                            orderNo: 2,
                            mimeType: 'image/png',
                            anchor: { page: 1, path: 'page-0001.png' },
                            file: {
                                workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0001.png',
                                url: 'https://files.example/page-0001.png',
                                fileName: 'page-0001.png',
                                width: 800,
                                height: 1000,
                                size: 1234
                            }
                        }
                    ]
                }
                return null
            })
        }
        const tools = createFileUnderstandingTools(queryBus as unknown as QueryBus, {
            conversationId: 'conversation-1'
        })
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
                capabilities: ['preview', 'read', 'page_images', 'vision'],
                pageImages: [
                    {
                        orderNo: 2,
                        mimeType: 'image/png',
                        page: 1,
                        path: 'page-0001.png',
                        workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0001.png',
                        url: 'https://files.example/page-0001.png',
                        fileName: 'page-0001.png',
                        width: 800,
                        height: 1000,
                        size: 1234
                    }
                ]
            }
        ])
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListConversationFilesQuery))
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListFilePageImagesQuery))
    })

    it('lists PDF page images by file and page range', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue([
                {
                    orderNo: 6,
                    mimeType: 'image/png',
                    anchor: { page: 3, path: 'page-0003.png' },
                    file: {
                        workspacePath: '/workspace/sessions/conversation-1/files/file-1/pages/page-0003.png',
                        fileName: 'page-0003.png'
                    }
                }
            ])
        }
        const tools = createFileUnderstandingTools(queryBus as unknown as QueryBus, {
            conversationId: 'conversation-1'
        })
        const pageImagesTool = tools.find((item) => item.name === 'parsed_file_page_images')
        if (!pageImagesTool) {
            throw new Error('parsed_file_page_images tool not found')
        }

        const result = await pageImagesTool.invoke({
            fileId: 'file-1',
            pageStart: 3,
            pageEnd: 3
        })

        expect(JSON.parse(String(result))).toEqual({
            fileId: 'file-1',
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
                fileAssetId: 'file-1',
                options: {
                    pageStart: 3,
                    pageEnd: 3,
                    limit: undefined
                }
            })
        )
    })
})
