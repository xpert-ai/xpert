jest.mock('@xpert-ai/server-core', () => {
    return {
        FileStorage: class FileStorage {
            getProvider() {
                return {
                    path: (file: string) => file,
                    url: (file: string) => file
                }
            }
        }
    }
})

import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import type { TChatRequestHuman } from '@xpert-ai/contracts'
import fs from 'fs'
import { GetFilePreviewQuery } from '../../file-understanding/queries/get-file-preview.query'
import { GetOwnedStorageFileQuery } from '../../file-understanding/queries/get-owned-storage-file.query'
import { ReadFileAssetSourceQuery } from '../../file-understanding/queries/read-file-asset-source.query'
import { ResolveAuthorizedFileAssetQuery } from '../../file-understanding/queries/resolve-authorized-file-asset.query'
import { LoadFileCommand } from '../commands'
import { hydrateSendRequestHumanInput } from './human-input'
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

    it('preserves remote audio attachments as standard LangChain audio blocks', async () => {
        const state = {
            human: {
                input: 'Transcribe this recording',
                files: [
                    {
                        filePath: '',
                        fileUrl: 'https://files.example/recording.wav',
                        originalName: 'recording.wav',
                        mimeType: 'audio/wav'
                    }
                ]
            }
        } as unknown as Parameters<typeof createHumanMessage>[2]

        const message = await createHumanMessage(
            {
                execute: jest.fn()
            } as unknown as CommandBus,
            {
                execute: jest.fn()
            } as unknown as QueryBus,
            state
        )

        expect(message.content).toEqual([
            {
                type: 'audio',
                source_type: 'url',
                url: 'https://files.example/recording.wav',
                mime_type: 'audio/wav'
            },
            {
                type: 'text',
                text: 'Transcribe this recording'
            }
        ])
    })

    it('does not read an unmanaged absolute path supplied by human input', async () => {
        const readFile = jest.spyOn(fs.promises, 'readFile')
        readFile.mockClear()
        const commandBus = { execute: jest.fn() }

        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            { execute: jest.fn() } as unknown as QueryBus,
            {
                human: {
                    input: 'Read this file',
                    files: [
                        {
                            filePath: '/etc/passwd',
                            originalName: 'passwd',
                            mimeType: 'text/plain'
                        }
                    ]
                } as unknown as TChatRequestHuman
            },
            undefined
        )

        expect(message.content).toBe('Read this file')
        expect(readFile).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('does not trust an unmanaged path from a client-controlled state variable', async () => {
        const readFile = jest.spyOn(fs.promises, 'readFile')
        readFile.mockClear()
        const commandBus = { execute: jest.fn() }

        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            { execute: jest.fn() } as unknown as QueryBus,
            {
                human: {
                    input: 'Read this variable'
                },
                client_files: [
                    {
                        filePath: '/etc/passwd',
                        workspacePath: '/etc/passwd',
                        originalName: 'passwd',
                        mimeType: 'text/plain'
                    }
                ]
            } as unknown as Parameters<typeof createHumanMessage>[2],
            {
                enabled: true,
                variable: 'client_files'
            }
        )

        expect(message.content).toBe('Read this variable')
        expect(readFile).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('keeps legacy StorageFile-only attachments through an owner-authorized fallback', async () => {
        const audioData = Buffer.from('legacy audio')
        const readFile = jest.spyOn(fs.promises, 'readFile').mockResolvedValue(audioData)
        const queryBus = {
            execute: jest.fn().mockImplementation(async (query: unknown) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    throw new ForbiddenException()
                }
                if (query instanceof GetOwnedStorageFileQuery) {
                    return {
                        id: 'legacy-storage-1',
                        tenantId: 'tenant-1',
                        organizationId: 'org-1',
                        createdById: 'user-1',
                        file: '/tmp/legacy-audio.wav',
                        originalName: 'legacy-audio.wav',
                        mimetype: 'audio/wav',
                        storageProvider: 'local'
                    }
                }
                return null
            })
        }

        const message = await createHumanMessage(
            { execute: jest.fn() } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: 'Transcribe this legacy upload',
                    files: [
                        {
                            id: 'legacy-storage-1',
                            filePath: '',
                            originalName: 'legacy-audio.wav',
                            mimeType: 'audio/wav'
                        }
                    ]
                } as unknown as TChatRequestHuman
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'audio',
                source_type: 'base64',
                data: audioData.toString('base64'),
                mime_type: 'audio/wav'
            },
            {
                type: 'text',
                text: 'Transcribe this legacy upload'
            }
        ])
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
        expect(readFile).toHaveBeenCalledWith('/tmp/legacy-audio.wav')
    })

    it('sends workspace-backed FileAsset images to the model as multimodal content', async () => {
        const imageData = Buffer.from('workspace image bytes')
        const queryBus = {
            execute: jest.fn().mockImplementation(async (query: unknown) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'file-asset-1',
                            tenantId: 'tenant-1',
                            userId: 'user-1',
                            xpertId: 'xpert-1',
                            originalName: 'diagram.png',
                            mimeType: 'image/png',
                            size: imageData.length,
                            status: 'partial',
                            capabilities: ['preview', 'workspace', 'read', 'vision'],
                            workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/diagram.png',
                            metadata: {
                                workspace: {
                                    catalog: 'xperts',
                                    scopeId: 'xpert-1',
                                    relativePath: 'sessions/conversation-1/files/file-asset-1/diagram.png'
                                }
                            }
                        }
                    }
                }
                if (query instanceof ReadFileAssetSourceQuery) {
                    return imageData
                }
                return null
            })
        }

        const message = await createHumanMessage(
            { execute: jest.fn() } as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                sys: {
                    thread_id: 'thread-1'
                } as never,
                human: {
                    input: 'Describe this image',
                    files: [
                        {
                            fileId: 'file-asset-1',
                            fileAssetId: 'file-asset-1',
                            filePath: 'sessions/conversation-1/files/file-asset-1/diagram.png',
                            workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/diagram.png',
                            originalName: 'diagram.png',
                            mimeType: 'image/png'
                        }
                    ]
                } as unknown as TChatRequestHuman
            },
            undefined
        )

        expect(message.content).toEqual([
            {
                type: 'image_url',
                image_url: {
                    url: `data:image/png;base64,${imageData.toString('base64')}`
                }
            },
            {
                type: 'text',
                text: 'Describe this image'
            }
        ])
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ReadFileAssetSourceQuery))
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: {
                    locator: { fileAssetId: 'file-asset-1' },
                    authority: { kind: 'conversation', threadId: 'thread-1' },
                    operation: 'read'
                }
            })
        )
    })

    it('overrides client-supplied image workspace paths with the authoritative file asset path', async () => {
        const workspacePath = '/workspace/sessions/conversation-1/files/asset-1/diagram.png'
        const clientWorkspacePath = '/workspace/forged/diagram.png'
        const imageReference = {
            type: 'image' as const,
            fileId: 'storage-1',
            url: 'https://example.com/diagram.png',
            workspacePath: clientWorkspacePath,
            name: 'diagram.png',
            mimeType: 'image/png',
            text: 'Pasted image: diagram.png'
        }
        const queryBus = {
            execute: jest.fn().mockImplementation(async (query: unknown) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'asset-1',
                            storageFileId: 'storage-1',
                            workspacePath
                        },
                        storageFile: {
                            id: 'storage-1',
                            file: 'files/diagram.png',
                            fileUrl: 'https://files.example/diagram.png',
                            originalName: 'diagram.png',
                            mimetype: 'image/png',
                            size: 2048,
                            storageProvider: 'local'
                        }
                    }
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
                human: {
                    input: 'Animate this image',
                    references: [imageReference]
                }
            },
            undefined
        )

        const textPart = (message.content as Array<{ type: string; text?: string }>).find(
            (part) => part.type === 'text'
        )
        expect(textPart?.text).toContain(`Workspace Path: ${workspacePath}`)
        expect(textPart?.text).not.toContain(clientWorkspacePath)
        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({ locator: { storageFileId: imageReference.fileId } })
            })
        )
    })

    it.each([
        ['compose input', 'Animate this image', 'diagram.png'],
        ['reference-only input', '', 'diagram.png'],
        ['replacement-token image name', 'Animate this image', 'price-$&.png']
    ])(
        'replaces a precomposed image reference prompt for %s when hydrating its workspace path',
        async (_, input, imageName) => {
            const workspacePath = '/workspace/sessions/conversation-1/files/asset-1/diagram.png'
            const imageReference = {
                type: 'image' as const,
                fileId: 'storage-1',
                url: 'https://example.com/diagram.png',
                name: imageName,
                mimeType: 'image/png',
                text: 'Pasted image'
            }
            const hydratedRequest = hydrateSendRequestHumanInput({
                action: 'send',
                message: {
                    input: {
                        input,
                        referenceComposition: 'compose' as const,
                        references: [imageReference]
                    }
                }
            })
            const queryBus = {
                execute: jest.fn().mockImplementation(async (query: unknown) => {
                    if (query instanceof ResolveAuthorizedFileAssetQuery) {
                        return {
                            asset: {
                                id: 'asset-1',
                                storageFileId: 'storage-1',
                                workspacePath
                            },
                            storageFile: {
                                id: 'storage-1',
                                file: 'files/diagram.png',
                                fileUrl: 'https://files.example/diagram.png',
                                originalName: imageName,
                                mimetype: 'image/png',
                                size: 2048,
                                storageProvider: 'local'
                            }
                        }
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
                    human: hydratedRequest.message.input
                },
                undefined
            )

            const textPart = (message.content as Array<{ type: string; text?: string }>).find(
                (part) => part.type === 'text'
            )
            if (input) {
                expect(textPart?.text).toContain(input)
            }
            expect(textPart?.text).toContain(`Workspace Path: ${workspacePath}`)
            expect(textPart?.text?.match(/Referenced content:/g)).toHaveLength(1)
            expect(textPart?.text?.split(`[Image] ${imageName}`)).toHaveLength(2)
        }
    )

    it('adds file understanding cards without inlining preview chunks', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'file-asset-1',
                            status: 'ready',
                            capabilities: ['preview', 'read', 'search', 'workspace'],
                            summary: 'A'.repeat(900)
                        }
                    }
                }
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
        expect(fileCard).toContain('parsed_file_search')
        expect(fileCard).toContain('parsed_file_read')
        expect(fileCard).toContain('parsed_file_page_images')
        expect(fileCard).not.toMatch(/(^|[^A-Za-z0-9_])file_search([^A-Za-z0-9_]|$)/)
        expect(fileCard).not.toMatch(/(^|[^A-Za-z0-9_])file_read([^A-Za-z0-9_]|$)/)
        expect(fileCard).not.toMatch(/(^|[^A-Za-z0-9_])file_page_images([^A-Za-z0-9_]|$)/)
        expect(fileCard).toContain('view-image')
        expect(fileCard).not.toContain('FULL_FILE_TEXT_SHOULD_NOT_BE_IN_PROMPT')
        expect(fileCard).not.toContain('<preview_chunks>')
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('creates file understanding cards from workspace-backed FileAsset handles without storage files', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'file-asset-1',
                            originalName: 'contract.docx',
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            size: 22900,
                            status: 'ready',
                            capabilities: ['preview', 'read', 'workspace'],
                            workspacePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx'
                        }
                    }
                }
                if (query instanceof GetFilePreviewQuery) {
                    return {
                        file: {
                            summary: 'Document summary',
                            workspacePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx'
                        },
                        artifacts: [],
                        chunks: []
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
                    input: '这讲的什么内容',
                    files: [
                        {
                            id: 'file-asset-1',
                            fileId: 'file-asset-1',
                            fileAssetId: 'file-asset-1',
                            originalName: 'contract.docx',
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            workspacePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx'
                        }
                    ]
                }
            },
            undefined
        )

        expect(Array.isArray(message.content)).toBe(true)
        const fileCard = (message.content as Array<{ type: string; text?: string }>)[0].text
        expect(fileCard).toContain('fileId: file-asset-1')
        expect(fileCard).toContain('storageFileId:')
        expect(fileCard).toContain('workspacePath: files/wechat/integration-1/uuid-1/msg-1/contract.docx')
        expect(fileCard).toContain('Document summary')
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('loads workspace-backed FileAsset fallbacks with the relative workspace path', async () => {
        const workspacePath = 'files/wechat/integration-1/uuid-1/msg-1/contract.docx'
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'file-asset-1',
                            originalName: 'contract.docx',
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            size: 22900,
                            status: 'uploaded',
                            capabilities: ['preview', 'workspace'],
                            workspacePath,
                            metadata: {
                                workspace: {
                                    catalog: 'xperts',
                                    scopeId: 'xpert-1',
                                    relativePath: workspacePath,
                                    workspacePath
                                }
                            }
                        }
                    }
                }
                return null
            })
        }
        const commandBus = {
            execute: jest.fn().mockResolvedValue([{ pageContent: '合同正文' }])
        }

        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            {
                human: {
                    input: '提取产品信息',
                    files: [
                        {
                            id: 'file-asset-1',
                            fileId: 'file-asset-1',
                            fileAssetId: 'file-asset-1',
                            filePath: workspacePath,
                            workspacePath,
                            originalName: 'contract.docx',
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        } as any
                    ]
                }
            },
            undefined
        )

        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(LoadFileCommand))
        const loadCommand = commandBus.execute.mock.calls[0][0] as LoadFileCommand
        expect(loadCommand.file.filePath).toBe(workspacePath)
        const fileText = (message.content as Array<{ type: string; text?: string }>)[0].text
        expect(fileText).toContain(`Attachment File: ${workspacePath}`)
        expect(fileText).toContain('合同正文')
    })

    it('does not raw-load a FileAsset when no workspace path is available', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'file-asset-1',
                            originalName: 'contract.docx',
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            status: 'uploaded',
                            capabilities: ['preview', 'workspace']
                        }
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
                    input: '提取产品信息',
                    files: [
                        {
                            fileId: 'file-asset-1',
                            fileAssetId: 'file-asset-1',
                            originalName: 'contract.docx',
                            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        } as any
                    ]
                }
            },
            undefined
        )

        expect(commandBus.execute).not.toHaveBeenCalled()
        const fileCard = (message.content as Array<{ type: string; text?: string }>)[0].text
        expect(fileCard).toContain('fileId: file-asset-1')
        expect(fileCard).toContain('status: uploaded')
    })
})
