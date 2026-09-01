import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ForbiddenException, Logger } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { once } from 'events'
import type { Response } from 'express'
import { PassThrough, Readable } from 'stream'
import { finished } from 'stream/promises'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { ChatConversationController } from './conversation.controller'
import { ChatConversationService } from './conversation.service'
import { ChatConversationGoalService } from './goal'
import { ChatConversationBindXpertCommand } from './commands'
import { FindXpertQuery } from '../xpert'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'

describe('ChatConversationController goal routes', () => {
    let controller: ChatConversationController
    let service: {
        assertAccess: jest.Mock
        delete: jest.Mock
        findAll: jest.Mock
        findAllByXpert: jest.Mock
        findOneDetail: jest.Mock
        findOneInOrganizationOrTenant: jest.Mock
        getWorkspaceFileDownload: jest.Mock
        update: jest.Mock
    }
    let goalService: {
        clearGoalFromUser: jest.Mock
        getByConversationId: jest.Mock
        patchGoalFromUser: jest.Mock
        setGoalFromUser: jest.Mock
    }
    let organizationScopeService: { run: jest.Mock }
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let loggerWarn: jest.SpyInstance
    let workbenchNavigationService: WorkbenchAssistantConversationNavigationService
    let resolveWorkbenchNavigation: jest.Mock

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        service = {
            assertAccess: jest.fn().mockResolvedValue({
                id: 'scoped-conversation-1',
                threadId: 'thread-1'
            }),
            delete: jest.fn().mockResolvedValue(undefined),
            findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            findAllByXpert: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            findOneDetail: jest.fn().mockResolvedValue({ id: 'scoped-conversation-1', title: 'Updated' }),
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                id: 'scoped-conversation-1',
                threadId: 'thread-1'
            }),
            getWorkspaceFileDownload: jest.fn(),
            update: jest.fn().mockResolvedValue({ affected: 1 })
        }
        goalService = {
            clearGoalFromUser: jest.fn().mockResolvedValue(null),
            getByConversationId: jest.fn().mockResolvedValue({ id: 'goal-1' }),
            patchGoalFromUser: jest.fn().mockResolvedValue({ id: 'goal-1' }),
            setGoalFromUser: jest.fn().mockResolvedValue({ id: 'goal-1' })
        }
        organizationScopeService = {
            run: jest.fn((_organizationId: string | undefined, handler: () => Promise<unknown>) => handler())
        }
        commandBus = {
            execute: jest.fn().mockResolvedValue({
                id: 'scoped-conversation-1',
                threadId: 'thread-1',
                xpertId: 'xpert-1'
            })
        }
        queryBus = {
            execute: jest.fn().mockResolvedValue({ id: 'xpert-1' })
        }
        resolveWorkbenchNavigation = jest.fn().mockResolvedValue({
            conversationId: 'scoped-conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-2',
            projectId: 'project-1',
            isExternalAssistant: true
        })
        workbenchNavigationService = Object.assign(
            Object.create(WorkbenchAssistantConversationNavigationService.prototype),
            { resolve: resolveWorkbenchNavigation }
        )

        controller = new ChatConversationController(
            service as unknown as ChatConversationService,
            goalService as unknown as ChatConversationGoalService,
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            organizationScopeService as unknown as SuperAdminOrganizationScopeService,
            workbenchNavigationService
        )
    })

    it('resolves Workbench conversation navigation inside the requested organization scope', async () => {
        await expect(
            controller.resolveWorkbenchNavigation('conversation-1', 'requester-xpert-1', 'organization-1')
        ).resolves.toEqual({
            conversationId: 'scoped-conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-2',
            projectId: 'project-1',
            isExternalAssistant: true
        })

        expect(organizationScopeService.run).toHaveBeenCalledWith('organization-1', expect.any(Function))
        expect(resolveWorkbenchNavigation).toHaveBeenCalledWith('conversation-1', 'requester-xpert-1')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('streams a conversation file from its authorized handle and closes it after the response ends', async () => {
        const fileHandle = {
            close: jest.fn().mockResolvedValue(undefined),
            createReadStream: jest.fn().mockReturnValue(Readable.from([Buffer.from('conversation file')]))
        }
        service.getWorkspaceFileDownload.mockResolvedValue({
            absolutePath: '/proc/self/fd/11',
            fileHandle,
            fileName: 'report.txt',
            mimeType: 'text/plain',
            type: 'file'
        })
        const response = createDownloadResponse()

        await controller.downloadFile('conversation-1', 'report.txt', 'org-1', response.value)
        await response.completed

        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(service.getWorkspaceFileDownload).toHaveBeenCalledWith('conversation-1', 'report.txt')
        expect(response.body()).toEqual(Buffer.from('conversation file'))
        expect(fileHandle.createReadStream).toHaveBeenCalledTimes(1)
        expect(fileHandle.close).toHaveBeenCalled()
    })

    it('closes a conversation file handle when the client closes the response early', async () => {
        const source = new PassThrough()
        let markStreamReady: () => void = () => undefined
        const streamReady = new Promise<void>((resolve) => {
            markStreamReady = resolve
        })
        const fileHandle = {
            close: jest.fn().mockResolvedValue(undefined),
            createReadStream: jest.fn().mockImplementation(() => {
                markStreamReady()
                return source
            })
        }
        service.getWorkspaceFileDownload.mockResolvedValue({
            absolutePath: '/proc/self/fd/12',
            fileHandle,
            fileName: 'large.mov',
            mimeType: 'video/quicktime',
            type: 'file'
        })
        const response = createDownloadResponse()
        const responseCompleted = response.completed.catch(() => undefined)
        const responseClosed = once(response.stream, 'close')

        const download = controller.downloadFile('conversation-1', 'large.mov', 'org-1', response.value)
        await streamReady
        response.stream.destroy()
        await responseClosed
        await download
        await responseCompleted

        expect(source.destroyed).toBe(true)
        expect(fileHandle.close).toHaveBeenCalled()
    })

    it('archives conversation directory entries from authorized handles and closes every handle', async () => {
        const directoryHandle = { close: jest.fn().mockResolvedValue(undefined) }
        const entryHandle = {
            close: jest.fn().mockResolvedValue(undefined),
            createReadStream: jest.fn().mockReturnValue(Readable.from([Buffer.from('inside archive')]))
        }
        async function* entries() {
            try {
                yield { archivePath: 'nested/', type: 'directory' as const }
                try {
                    yield { archivePath: 'nested/report.txt', fileHandle: entryHandle, type: 'file' as const }
                } finally {
                    await entryHandle.close()
                }
            } finally {
                await directoryHandle.close()
            }
        }
        service.getWorkspaceFileDownload.mockResolvedValue({
            directoryHandle,
            entries: entries(),
            fileName: 'docs.zip',
            mimeType: 'application/zip',
            type: 'directory'
        })
        const response = createDownloadResponse()

        await controller.downloadFile('conversation-1', 'docs', 'org-1', response.value)
        await response.completed

        expect(response.body().subarray(0, 2)).toEqual(Buffer.from('PK'))
        expect(entryHandle.createReadStream).toHaveBeenCalledTimes(1)
        expect(entryHandle.close).toHaveBeenCalled()
        expect(directoryHandle.close).toHaveBeenCalled()
    })

    it('resolves the scoped conversation before reading a goal', async () => {
        await controller.getGoal('requested-conversation-1', 'org-1')

        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1')
        expect(goalService.getByConversationId).toHaveBeenCalledWith('scoped-conversation-1')
    })

    it.each(['attachments', 'messages.attachments', 'messages.fileAssets'])(
        'rejects sensitive file relation expansion through the generic conversation detail route: %s',
        async (relation) => {
            await expect(
                controller.findOneById('requested-conversation-1', 'org-1', [relation])
            ).rejects.toBeInstanceOf(ForbiddenException)

            expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1')
            expect(service.findOneDetail).not.toHaveBeenCalled()
        }
    )

    it.each(['attachments', 'messages.attachments', 'messages.fileAssets'])(
        'rejects sensitive file relation expansion through the current-user conversation list: %s',
        async (relation) => {
            await expect(
                controller.findMyAllPublic({
                    relations: [relation],
                    take: 20,
                    skip: 0,
                    order: {},
                    where: {},
                    withDeleted: false
                })
            ).rejects.toBeInstanceOf(ForbiddenException)

            expect(service.findAll).not.toHaveBeenCalled()
        }
    )

    it('keeps benign conversation detail relations available after access is authorized', async () => {
        await controller.findOneById('requested-conversation-1', 'org-1', ['xpert'])

        expect(service.findOneDetail).toHaveBeenCalledWith('requested-conversation-1', {
            select: undefined,
            relations: ['xpert']
        })
    })

    it('rejects malformed relation values instead of evaluating them as relation paths', async () => {
        await expect(
            controller.findOneById('requested-conversation-1', 'org-1', [null] as never)
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.findOneDetail).not.toHaveBeenCalled()
    })

    it('rejects managed file relation expansion from the Xpert conversation list', async () => {
        await expect(
            controller.findByXpert('xpert-1', {
                relations: ['messages.fileAssets'],
                take: 20,
                skip: 0,
                order: {},
                where: {},
                withDeleted: false
            })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.findAllByXpert).not.toHaveBeenCalled()
    })

    it('resolves the scoped conversation before setting a goal', async () => {
        await controller.setGoal('requested-conversation-1', { objective: 'ship feature' }, 'org-1')

        expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1', 'contribute')
        expect(goalService.setGoalFromUser).toHaveBeenCalledWith('scoped-conversation-1', { objective: 'ship feature' })
    })

    it('resolves the scoped conversation before patching a goal', async () => {
        await controller.updateGoal('requested-conversation-1', { status: 'paused' }, 'org-1')

        expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1', 'contribute')
        expect(goalService.patchGoalFromUser).toHaveBeenCalledWith('scoped-conversation-1', { status: 'paused' })
    })

    it('resolves the scoped conversation before clearing a goal', async () => {
        await controller.clearGoal('requested-conversation-1', 'org-1')

        expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1', 'contribute')
        expect(goalService.clearGoalFromUser).toHaveBeenCalledWith('scoped-conversation-1')
    })

    it('warns when the deprecated goal route is used', async () => {
        await controller.getGoal('requested-conversation-1', 'org-1')

        expect(loggerWarn).toHaveBeenCalledWith(
            expect.stringContaining('Deprecated GET /chat-conversation/:id/goal route used')
        )
        expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('organizationId=org-1'))
    })

    it('authorizes the legacy PUT route, preserves first Xpert binding, and ignores Project injection', async () => {
        await controller.updateConversation(
            'requested-conversation-1',
            {
                title: 'Updated',
                projectId: 'forged-project',
                xpertId: 'xpert-1'
            } as never,
            'org-1'
        )

        expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1', 'manage')
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(FindXpertQuery))
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(ChatConversationBindXpertCommand))
        expect(service.update).toHaveBeenCalledWith('requested-conversation-1', { title: 'Updated' })
    })

    it('rejects rebinding an existing legacy conversation to another Xpert', async () => {
        service.assertAccess.mockResolvedValue({
            id: 'scoped-conversation-1',
            threadId: 'thread-1',
            xpertId: 'xpert-1'
        })

        await expect(
            controller.updateConversation(
                'requested-conversation-1',
                {
                    title: 'Updated',
                    xpertId: 'xpert-2'
                },
                'org-1'
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(service.update).not.toHaveBeenCalled()
    })

    it('rejects first-binding a legacy conversation to an Xpert the user does not own', async () => {
        queryBus.execute.mockRejectedValue(new Error('not found'))

        await expect(
            controller.updateConversation(
                'requested-conversation-1',
                {
                    xpertId: 'xpert-2'
                },
                'org-1'
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(service.update).not.toHaveBeenCalled()
    })

    it('authorizes the legacy DELETE route before deleting', async () => {
        await controller.deleteConversation('requested-conversation-1', 'org-1')

        expect(service.assertAccess).toHaveBeenCalledWith('requested-conversation-1', 'manage')
        expect(service.delete).toHaveBeenCalledWith('requested-conversation-1')
    })
})

function createDownloadResponse() {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    const response = stream as PassThrough & { setHeader: jest.Mock }
    response.setHeader = jest.fn()
    return {
        value: response as unknown as Response,
        stream,
        completed: finished(stream),
        body: () => Buffer.concat(chunks)
    }
}
