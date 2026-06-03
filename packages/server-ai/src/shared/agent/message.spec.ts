import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { GetStorageFileQuery } from '@xpert-ai/server-core'
import { GetFileAssetByStorageFileQuery, GetFileAssetQuery, GetFilePreviewQuery } from '../../file-understanding'
import { LoadFileCommand } from '../commands'
import { createHumanMessage } from './message'
import { ResolvePromptWorkflowInvocationQuery } from './queries/resolve-prompt-workflow-invocation.query'
import { ListWorkspaceSkillsQuery } from '../../xpert-agent/queries/list-workspace-skills.query'

describe('createHumanMessage', () => {
    it('expands raw prompt workflow invocations before creating the agent human message', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue({
                input: {
                    input: 'Review this: src/app.ts'
                }
            })
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: '/review src/app.ts',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: { workspaceId: 'workspace-1', ids: [] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: [] }
                    }
                }
            },
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toBe('Review this: src/app.ts')
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolvePromptWorkflowInvocationQuery))
    })

    it('does not resolve prompt workflows for normal input even when xpert context is available', async () => {
        const queryBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as any,
            queryBus as any,
            {
                human: {
                    input: 'Please review src/app.ts'
                }
            },
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toBe('Please review src/app.ts')
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('appends explicitly selected runtime skills to the agent human message', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ListWorkspaceSkillsQuery) {
                    return [
                        {
                            id: 'skill-motor-bom',
                            name: 'motor-bom-parse',
                            metadata: {
                                name: 'motor-bom-parse'
                            }
                        }
                    ]
                }
                return null
            })
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                selectedSkillIds: ['skill-motor-bom'],
                selectedSkillWorkspaceId: 'workspace-1',
                human: {
                    input: 'Parse contract data from the documents',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: { workspaceId: 'workspace-1', ids: ['skill-motor-bom'] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: [] },
                        recommended: {
                            skills: { workspaceId: 'workspace-1', ids: ['skill-motor-bom'] },
                            plugins: { nodeKeys: [] },
                            subAgents: { nodeKeys: [] }
                        }
                    }
                }
            } as any,
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toContain('Parse contract data from the documents')
        expect(message.content).toContain('<selected_runtime_skills>')
        expect(message.content).toContain('For this request, I selected the following skill(s)')
        expect(message.content).toContain('motor-bom-parse')
        expect(message.content).toContain('please use the matching skill')
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ListWorkspaceSkillsQuery))
    })

    it('does not append available-only runtime skills as an explicit user skill mention', async () => {
        const queryBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                selectedSkillIds: ['skill-motor-bom'],
                selectedSkillWorkspaceId: 'workspace-1',
                human: {
                    input: 'Parse contract data from the documents',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: { workspaceId: 'workspace-1', ids: ['skill-motor-bom'] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: [] }
                    }
                }
            } as any,
            undefined
        )

        expect(message.content).toBe('Parse contract data from the documents')
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('attempts to resolve builtin-named slash invocations so middleware commands can own them', async () => {
        const queryBus = {
            execute: jest.fn().mockResolvedValue(null)
        }

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: '/goal Migrate the app'
                }
            },
            undefined,
            {
                xpert: {
                    id: 'xpert-1',
                    workspaceId: 'workspace-1'
                }
            }
        )

        expect(message.content).toBe('/goal Migrate the app')
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolvePromptWorkflowInvocationQuery))
    })

    it('turns image references into image_url content parts and preserves text fallback', async () => {
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            commandBus as any,
            queryBus as any,
            {
                human: {
                    input: 'Please analyze this image',
                    references: [
                        {
                            type: 'image',
                            url: 'https://example.com/image.png',
                            name: 'diagram.png',
                            mimeType: 'image/png',
                            text: 'Pasted image: diagram.png'
                        }
                    ]
                }
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: 'https://example.com/image.png'
                }
            },
            {
                type: 'text',
                text: expect.stringContaining('Please analyze this image')
            }
        ])
        expect((message.content as Array<{ type: string; text?: string }>)[1].text).toContain('[Image] diagram.png')
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('still creates multimodal content when the human input only contains image references', async () => {
        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as any,
            {
                execute: jest.fn()
            } as any,
            {
                human: {
                    input: '',
                    references: [
                        {
                            type: 'image',
                            url: 'https://example.com/reference-only.png',
                            name: 'reference-only.png',
                            text: 'Pasted image: reference-only.png'
                        }
                    ]
                }
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: 'https://example.com/reference-only.png'
                }
            },
            {
                type: 'text',
                text: expect.stringContaining('[Image] reference-only.png')
            }
        ])
    })

    it('adds file understanding cards without inlining preview chunks', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof GetFilePreviewQuery) {
                    return {
                        file: {
                            summary: 'preview summary',
                            workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/report.pdf'
                        },
                        artifacts: [
                            {
                                kind: 'page_image',
                                orderNo: 2,
                                mimeType: 'image/png',
                                anchor: { page: 1, path: 'page-0001.png' },
                                file: {
                                    workspacePath:
                                        '/workspace/sessions/conversation-1/files/file-asset-1/pages/page-0001.png',
                                    fileName: 'page-0001.png'
                                }
                            }
                        ],
                        chunks: [
                            {
                                id: 'chunk-1',
                                orderNo: 0,
                                anchor: { page: 1 },
                                content: 'FULL_FILE_TEXT_SHOULD_NOT_BE_IN_PROMPT'
                            }
                        ]
                    }
                }
                return null
            })
        }
        const commandBus = {
            execute: jest.fn()
        }

        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: 'What is this?',
                    files: [
                        {
                            filePath: '/tmp/report.pdf',
                            originalName: 'report.pdf',
                            mimeType: 'application/pdf',
                            fileAsset: {
                                id: 'file-asset-1',
                                status: 'ready',
                                capabilities: ['preview', 'read', 'search', 'workspace'],
                                summary: 'A'.repeat(900)
                            }
                        } as any
                    ]
                }
            },
            undefined
        )

        expect(Array.isArray(message.content)).toBe(true)
        const fileCard = (message.content as Array<{ type: string; text?: string }>)[0].text
        expect(fileCard).toContain('fileId: file-asset-1')
        expect(fileCard).toContain('workspacePath: /workspace/sessions/conversation-1/files/file-asset-1/report.pdf')
        expect(fileCard).toContain('availableAnchors: page 1')
        expect(fileCard).toContain('pageImages:')
        expect(fileCard).toContain('/workspace/sessions/conversation-1/files/file-asset-1/pages/page-0001.png')
        expect(fileCard).toContain('file_page_images')
        expect(fileCard).toContain('view-image')
        expect(fileCard).not.toContain('FULL_FILE_TEXT_SHOULD_NOT_BE_IN_PROMPT')
        expect(fileCard).not.toContain('<preview_chunks>')
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('does not resolve legacy fileId values as FileAsset ids when building attachments', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof GetFileAssetQuery) {
                    throw new Error('legacy fileId should not be used as a FileAsset id')
                }
                if (query instanceof GetStorageFileQuery) {
                    return []
                }
                return null
            })
        }
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof LoadFileCommand) {
                    return [{ pageContent: 'legacy file text' }]
                }
                throw new Error(`Unexpected command: ${command?.constructor?.name}`)
            })
        }
        const legacyFile = {
            id: '89d94277-097f-4b9d-ad02-8e1ddab03487',
            fileId: '1780307484176_4z5k3xian',
            filePath: '/tmp/resumes.zip',
            originalName: 'resumes.zip',
            mimeType: 'application/zip'
        }
        const state = {
            human: {
                input: 'Read this file',
                files: [legacyFile]
            }
        } as unknown as Parameters<typeof createHumanMessage>[2]

        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            state,
            undefined
        )

        expect(Array.isArray(message.content)).toBe(true)
        expect((message.content as Array<{ type: string; text?: string }>)[0].text).toContain('legacy file text')
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(GetFileAssetQuery))
    })

    it('does not resolve non-uuid bare file ids as StorageFile ids when building attachments', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof GetFileAssetQuery) {
                    throw new Error('bare id should not be used as a FileAsset id')
                }
                if (query instanceof GetStorageFileQuery) {
                    throw new Error('bare id should not be used as a StorageFile id')
                }
                if (query instanceof GetFileAssetByStorageFileQuery) {
                    throw new Error('bare id should not be used as a StorageFile id')
                }
                return null
            })
        }
        const commandBus = {
            execute: jest.fn().mockImplementation((command) => {
                if (command instanceof LoadFileCommand) {
                    return [{ pageContent: 'direct file text' }]
                }
                throw new Error(`Unexpected command: ${command?.constructor?.name}`)
            })
        }
        const state = {
            human: {
                input: 'Read this file',
                files: [
                    {
                        id: '1780307484176_4z5k3xian',
                        filePath: '/tmp/resumes.zip',
                        originalName: 'resumes.zip',
                        mimeType: 'application/zip'
                    }
                ]
            }
        } as unknown as Parameters<typeof createHumanMessage>[2]

        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            state,
            undefined
        )

        expect(Array.isArray(message.content)).toBe(true)
        expect((message.content as Array<{ type: string; text?: string }>)[0].text).toContain('direct file text')
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(GetFileAssetQuery))
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(GetStorageFileQuery))
        expect(queryBus.execute).not.toHaveBeenCalledWith(expect.any(GetFileAssetByStorageFileQuery))
    })
})
