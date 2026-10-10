import { SetMetadata } from '@nestjs/common'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import type { Response } from 'express'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { AssistantFileAccessGuard } from './assistant-file-access.guard'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { AssistantWorkspaceFilesController } from './assistant-workspace-files.controller'
import type { AssistantFilesService } from '../xpert/assistant-files/assistant-files.service'

jest.mock('@xpert-ai/server-core', () => ({
    Public: () => SetMetadata('isPublic', true),
    UUIDValidationPipe: class {},
    ApiKeyOrClientSecretAuthGuard: class {},
    ZodValidationPipe: class {}
}))
jest.mock('./assistant-file-access.guard', () => ({
    AssistantFileAccessGuard: class {},
    AssistantFileAccess: () => SetMetadata('ai:file-access-policy', 'workspace')
}))
jest.mock('../xpert/assistant-files/assistant-files.service', () => ({ AssistantFilesService: class {} }))

function createController() {
    const service = { list: jest.fn(), read: jest.fn(), download: jest.fn() }
    const forRuntime = jest.fn(() => service)
    return {
        service,
        forRuntime,
        controller: new AssistantWorkspaceFilesController({ forRuntime } as unknown as AssistantFilesService)
    }
}

function responseStream() {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    const response = Object.assign(stream, { setHeader: jest.fn() })
    return { response: response as unknown as Response, headers: response.setHeader, chunks }
}

describe('AssistantWorkspaceFilesController', () => {
    it.each([
        ['listWorkspaceFiles', 'files'],
        ['readWorkspaceFile', 'file'],
        ['downloadWorkspaceFile', 'file/download']
    ] as const)('routes %s through delegated authentication and workspace authorization', (method, route) => {
        const handler = AssistantWorkspaceFilesController.prototype[method]
        const reflector = new Reflector()
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(route)
        // The global JWT-only guard must yield to delegated authentication for
        // every read route, while the assistant and user access guards remain.
        expect(reflector.getAllAndOverride('isPublic', [handler, AssistantWorkspaceFilesController])).toBe(true)
        expect(Reflect.getMetadata(GUARDS_METADATA, AssistantWorkspaceFilesController)).toEqual([
            ApiKeyOrClientSecretAuthGuard,
            AssistantFileAccessGuard
        ])
    })

    it('passes list and read paths to the scoped workspace service', async () => {
        const { controller, service, forRuntime } = createController()
        service.list.mockResolvedValue([{ filePath: 'runs/result.txt' }])
        service.read.mockResolvedValue({ content: 'complete' })
        await expect(controller.listWorkspaceFiles('assistant', { path: 'runs', deepth: 2 })).resolves.toEqual([
            { filePath: 'runs/result.txt' }
        ])
        expect(forRuntime).toHaveBeenCalledWith('assistant')
        expect(service.list).toHaveBeenCalledWith('runs', 2)
        await expect(controller.readWorkspaceFile('assistant', { path: 'runs/result.txt' })).resolves.toEqual({
            content: 'complete'
        })
        expect(service.read).toHaveBeenCalledWith('runs/result.txt')
    })

    it('streams exact file bytes, encodes the filename and releases its handle', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'workspace-download-'))
        try {
            const filePath = path.join(root, 'result.txt')
            const bytes = Buffer.from('任务完成\n')
            await writeFile(filePath, bytes)
            const fileHandle = await open(filePath, 'r')
            const { controller, service } = createController()
            service.download.mockResolvedValue({
                type: 'file',
                fileName: '结果.txt',
                mimeType: 'text/plain',
                fileHandle
            })
            const { response, headers, chunks } = responseStream()
            await controller.downloadWorkspaceFile('assistant', { path: 'runs/result.txt' }, response)
            expect(service.download).toHaveBeenCalledWith('runs/result.txt')
            expect(Buffer.concat(chunks)).toEqual(bytes)
            expect(headers).toHaveBeenCalledWith('Content-Type', 'text/plain')
            expect(headers).toHaveBeenCalledWith(
                'Content-Disposition',
                `attachment; filename="${encodeURIComponent('结果.txt')}"; filename*=UTF-8''${encodeURIComponent('结果.txt')}`
            )
            expect(fileHandle.fd).toBe(-1)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    })

    it('propagates a scoped access denial before sending a file', async () => {
        const { controller, service } = createController()
        const error = new Error('Workspace access denied')
        service.download.mockRejectedValue(error)
        const { response, headers, chunks } = responseStream()
        await expect(controller.downloadWorkspaceFile('assistant', { path: 'private.txt' }, response)).rejects.toBe(
            error
        )
        expect(headers).not.toHaveBeenCalled()
        expect(chunks).toHaveLength(0)
        response.destroy()
    })
})
