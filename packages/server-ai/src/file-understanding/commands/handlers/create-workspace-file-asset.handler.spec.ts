// server-core's package entry loads dist; use this checkout's MIME implementation.
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    ...jest.requireActual('../../../../../server/src/file/file-upload/file-content-type')
}))

import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { GetFilePreviewQuery, ResolveAuthorizedFileAssetQuery } from '../../queries'
import { createHumanMessage } from '../../../shared/agent/message'
import { VolumeHandle } from '../../../shared/volume'
import { EnqueueFileParseCommand } from '../enqueue-file-parse.command'
import { CreateWorkspaceFileAssetCommand } from '../create-workspace-file-asset.command'
import { CreateWorkspaceFileAssetHandler } from './create-workspace-file-asset.handler'

describe('CreateWorkspaceFileAssetHandler authorization', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('rejects a client-provided tenant or user scope before resolving a workspace path', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const volumeClient = { resolve: jest.fn() }
        const handler = new CreateWorkspaceFileAssetHandler(
            {} as never,
            {} as never,
            volumeClient as never,
            {} as never,
            {} as never
        )

        await expect(
            handler.execute(
                new CreateWorkspaceFileAssetCommand({
                    catalog: 'projects',
                    tenantId: 'foreign-tenant',
                    userId: 'user-1',
                    projectId: 'project-1',
                    filePath: 'shared/brief.pdf'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(volumeClient.resolve).not.toHaveBeenCalled()
    })

    it('uses the authorized conversation scope and persists a scoped workspace locator', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        mockOpenedFile(Buffer.alloc(42))
        const conversation = {
            id: 'conversation-1',
            threadId: 'thread-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            createdById: 'user-1',
            projectId: 'project-canonical',
            xpertId: 'xpert-previous'
        }
        const fileAssetRepository = {
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => ({ id: 'asset-1', ...value }))
        }
        const conversationFileLinkRepository = {
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value)
        }
        const volume = {
            ensureRoot: jest.fn(),
            serverRoot: '/srv/volumes/project-canonical',
            publicUrl: jest.fn(() => 'https://files.example.test/shared/brief.pdf')
        }
        volume.ensureRoot.mockResolvedValue(volume)
        const volumeClient = { resolve: jest.fn(() => volume) }
        const fileAssetAccessService = {
            assertConversationAccess: jest.fn().mockResolvedValue(conversation),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertUnderstandingScope: jest.fn()
        }
        const handler = new CreateWorkspaceFileAssetHandler(
            fileAssetRepository as never,
            conversationFileLinkRepository as never,
            volumeClient as never,
            {} as never,
            fileAssetAccessService as never
        )

        const result = await handler.execute(
            new CreateWorkspaceFileAssetCommand({
                catalog: 'projects',
                conversationId: conversation.id,
                threadId: conversation.threadId,
                projectId: 'project-canonical',
                xpertId: 'xpert-current',
                filePath: 'shared/brief.pdf',
                parseMode: 'none'
            })
        )

        expect(fileAssetAccessService.assertConversationInputScope).toHaveBeenCalledWith(
            conversation,
            expect.objectContaining({ xpertId: 'xpert-current' })
        )
        expect(fileAssetAccessService.assertCanCreateConversationAsset).toHaveBeenCalledWith(conversation, 'understand')
        expect(result).toMatchObject({
            conversationId: conversation.id,
            projectId: conversation.projectId,
            xpertId: conversation.xpertId,
            metadata: {
                workspace: {
                    catalog: 'projects',
                    scopeId: 'project-canonical',
                    relativePath: 'shared/brief.pdf'
                }
            }
        })
        expect(fileAssetAccessService.assertUnderstandingScope).not.toHaveBeenCalled()
    })

    it('uses Project can-use authorization for standalone understanding without requiring an edit', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('member-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        mockOpenedFile(Buffer.from('hello'))
        const volume = {
            ensureRoot: jest.fn(),
            serverRoot: '/srv/project',
            publicUrl: jest.fn(() => undefined)
        }
        volume.ensureRoot.mockResolvedValue(volume)
        const fileAssetAccessService = {
            assertConversationAccess: jest.fn(),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn(),
            assertUnderstandingScope: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new CreateWorkspaceFileAssetHandler(
            {
                create: jest.fn((value) => value),
                save: jest.fn(async (value) => ({ id: 'asset-1', ...value }))
            } as never,
            { create: jest.fn(), save: jest.fn() } as never,
            { resolve: jest.fn(() => volume) } as never,
            {} as never,
            fileAssetAccessService as never
        )

        await handler.execute(
            new CreateWorkspaceFileAssetCommand({
                catalog: 'projects',
                projectId: 'project-1',
                xpertId: 'xpert-1',
                filePath: 'shared/note.txt',
                parseMode: 'none'
            })
        )

        expect(fileAssetAccessService.assertUnderstandingScope).toHaveBeenCalledWith({
            projectId: 'project-1',
            xpertId: 'xpert-1'
        })
    })
})

describe('CreateWorkspaceFileAssetHandler content type', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([undefined, 'video/mp2t', 'video/vnd.dlna.mpeg-tts', 'application/octet-stream'])(
        'corrects an existing TypeScript file declared as %s before linking and parsing it',
        async (mimeType) => {
            const { handler, repository, links, commandBus, fileHandle } = fixture(
                Buffer.from('export const label: string = "\u4f60\u597d"\n')
            )

            await handler.execute(command({ mimeType, parseMode: 'fast' }))

            const expected = {
                mimeType: 'text/plain',
                metadata: { workspace: { mimeType: 'text/plain', relativePath: 'shared/streamLoad(1).ts' } }
            }
            expect(repository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    mimeType: expected.mimeType,
                    status: 'uploaded',
                    metadata: expect.objectContaining({
                        workspace: expect.objectContaining(expected.metadata.workspace)
                    })
                })
            )
            expect(links.save.mock.calls[0][0]).toMatchObject({ metadata: expected.metadata })
            expect(commandBus.execute).toHaveBeenCalledWith(new EnqueueFileParseCommand('asset-1', { runInline: true }))
            expect(VolumeHandle.openExistingFile).toHaveBeenCalledWith('/srv/project', 'shared/streamLoad(1).ts', {
                boundaryRoot: '/srv/project'
            })
            expect(fileHandle.readFile).toHaveBeenCalledTimes(1)
            expect(fileHandle.close).toHaveBeenCalledTimes(1)
        }
    )

    it('preserves an actual MPEG transport stream selected from the workspace', async () => {
        const data = Buffer.alloc(188 * 4, 0xff)
        for (let index = 0; index < 4; index++) data.set([0x47, 0x40, 0x00, 0x10 | index], index * 188)
        const { handler } = fixture(data)

        await expect(handler.execute(command())).resolves.toMatchObject({ mimeType: 'video/mp2t' })
    })

    it('sends the selected source file to the model as a text card without a video payload', async () => {
        const { handler } = fixture(Buffer.from('export const sql = "SELECT 1"'))
        const asset = await handler.execute(command({ mimeType: 'video/mp2t' }))
        const queryBus = {
            execute: jest.fn((query) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) return { asset }
                if (query instanceof GetFilePreviewQuery) {
                    return { file: { summary: 'TypeScript source' }, artifacts: [], chunks: [] }
                }
                throw new Error(`Unexpected query: ${query.constructor.name}`)
            })
        }
        const commandBus = { execute: jest.fn() }

        const message = await createHumanMessage(commandBus as never, queryBus as never, {
            human: {
                input: 'Read this file',
                files: [{ fileAssetId: asset.id, mimeType: 'video/mp2t', originalName: 'streamLoad(1).ts' }]
            }
        })

        expect(message.content).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'text', text: expect.stringContaining('TypeScript source') })
            ])
        )
        expect(message.content).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'video_url' })]))
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('does not label unknown binary bytes as video', async () => {
        const { handler } = fixture(Buffer.from([0xff, 0xfe, 0x80]))

        await expect(handler.execute(command())).resolves.toMatchObject({ mimeType: 'application/octet-stream' })
    })

    it('does not read file bytes for an unambiguous PDF type', async () => {
        const { handler, fileHandle } = fixture(Buffer.from('%PDF-1.7'))

        await expect(handler.execute(command({ filePath: 'shared/brief.pdf' }))).resolves.toMatchObject({
            mimeType: 'application/pdf'
        })
        expect(fileHandle.readFile).not.toHaveBeenCalled()
        expect(fileHandle.close).toHaveBeenCalledTimes(1)
    })

    it('closes the authorized file handle and persists nothing when reading fails', async () => {
        const { handler, repository, fileHandle } = fixture(Buffer.from('source'))
        fileHandle.readFile.mockRejectedValueOnce(new Error('read failed'))

        await expect(handler.execute(command())).rejects.toThrow('read failed')
        expect(fileHandle.close).toHaveBeenCalledTimes(1)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('does not open a workspace file when conversation access is denied', async () => {
        const { handler, access, repository } = fixture(Buffer.from('source'))
        access.assertConversationAccess.mockRejectedValueOnce(new ForbiddenException())

        await expect(handler.execute(command())).rejects.toBeInstanceOf(ForbiddenException)
        expect(VolumeHandle.openExistingFile).not.toHaveBeenCalled()
        expect(repository.save).not.toHaveBeenCalled()
    })

    function command(overrides: Partial<CreateWorkspaceFileAssetCommand['input']> = {}) {
        return new CreateWorkspaceFileAssetCommand({
            catalog: 'projects',
            projectId: 'project-1',
            conversationId: 'conversation-1',
            filePath: 'shared/streamLoad(1).ts',
            parseMode: 'none',
            ...overrides
        })
    }

    function fixture(data: Buffer) {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        const fileHandle = mockOpenedFile(data)
        const repository = {
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => ({ id: 'asset-1', ...value }))
        }
        const links = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) }
        const volume = { serverRoot: '/srv/project', ensureRoot: jest.fn(), publicUrl: jest.fn() }
        volume.ensureRoot.mockResolvedValue(volume)
        const commandBus = { execute: jest.fn() }
        const access = {
            assertConversationAccess: jest.fn().mockResolvedValue({
                id: 'conversation-1',
                projectId: 'project-1',
                organizationId: 'organization-1'
            }),
            assertConversationInputScope: jest.fn(),
            assertCanCreateConversationAsset: jest.fn()
        }
        const handler = new CreateWorkspaceFileAssetHandler(
            repository as never,
            links as never,
            { resolve: jest.fn(() => volume) } as never,
            commandBus as never,
            access as never
        )
        return { handler, repository, links, commandBus, fileHandle, access }
    }
})

function mockOpenedFile(data: Buffer) {
    const fileHandle = { readFile: jest.fn().mockResolvedValue(data), close: jest.fn().mockResolvedValue(undefined) }
    jest.spyOn(VolumeHandle, 'openExistingFile').mockResolvedValue({
        fileStat: { isFile: () => true, size: data.length },
        fileHandle
    } as never)
    return fileHandle
}
