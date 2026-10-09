import { INestApplication } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { ChatConversationService } from '../chat-conversation/conversation.service'
import { FileAssetAccessService } from '../file-understanding/file-asset-access.service'
import { FileUnderstandingController } from '../file-understanding/file-understanding.controller'
import { WorkbenchFilesAuthGuard } from './workbench-files-auth.guard'
import { WorkbenchFilesController } from './workbench-files.controller'

jest.mock('../chat-conversation/conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../file-understanding/file-asset-access.service', () => ({ FileAssetAccessService: class {} }))

// Exercise both real controllers together: isolated controller tests cannot
// detect an attachment-list route shadowing the workspace-directory route.
describe.each([
    { order: 'assets first', controllers: [FileUnderstandingController, WorkbenchFilesController] },
    { order: 'workspace first', controllers: [WorkbenchFilesController, FileUnderstandingController] }
])('conversation file route separation ($order)', ({ controllers }) => {
    let app: INestApplication
    let origin: string
    const id = '11111111-1111-4111-8111-111111111111'
    const files = [{ filePath: 'shared.txt' }]
    const assets = [{ id: 'asset-1', originalName: 'attachment.pdf' }]
    const conversations = {
        getWorkspaceFiles: jest.fn(async () => files),
        readWorkspaceFile: jest.fn(async () => ({ contents: 'shared' })),
        saveWorkspaceFile: jest.fn(async () => ({ contents: 'updated' })),
        deleteWorkspaceFile: jest.fn(async () => ({ deleted: true }))
    }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers,
            providers: [
                { provide: ChatConversationService, useValue: conversations },
                { provide: CommandBus, useValue: { execute: jest.fn() } },
                { provide: QueryBus, useValue: { execute: jest.fn(async () => assets) } },
                {
                    provide: FileAssetAccessService,
                    useValue: { assertConversationAccess: jest.fn(async () => ({ id })) }
                }
            ]
        })
            .overrideGuard(WorkbenchFilesAuthGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        origin = `${await app.getUrl()}/api/ai/conversations/${id}`
    })

    afterAll(async () => app?.close())

    it('keeps parsed attachments and workspace files distinct regardless of registration order', async () => {
        const attachmentResponse = await fetch(`${origin}/files`)
        const workspaceResponse = await fetch(`${origin}/workspace/files?path=collaboration`)
        expect(attachmentResponse.status).toBe(200)
        expect(await attachmentResponse.json()).toEqual(assets)
        expect(workspaceResponse.status).toBe(200)
        expect(await workspaceResponse.json()).toEqual(files)
        expect(conversations.getWorkspaceFiles).toHaveBeenCalledWith(id, 'collaboration', undefined)
    })

    it.each(['workspace/file', 'file'])('supports canonical and existing singular routes: %s', async (route) => {
        const read = await fetch(`${origin}/${route}?path=shared.txt`)
        expect(read.status).toBe(200)
        expect(await read.json()).toEqual({ contents: 'shared' })
        const save = await fetch(`${origin}/${route}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: 'shared.txt', content: 'updated' })
        })
        expect(save.status).toBe(200)
        expect(await save.json()).toEqual({ contents: 'updated' })
        const remove = await fetch(`${origin}/${route}?path=shared.txt`, { method: 'DELETE' })
        expect(remove.status).toBe(200)
        expect(await remove.json()).toEqual({ deleted: true })
    })
})
