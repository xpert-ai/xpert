jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('../../../../server/src/file/file-upload/file-content-type'),
    FileStorage: class {
        getProvider() {
            return { path: (file: string) => file, url: (file: string) => file }
        }
    }
}))

import { ForbiddenException } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResolveAuthorizedFileAssetQuery } from '../../file-understanding/queries/resolve-authorized-file-asset.query'
import { GetFilePreviewQuery } from '../../file-understanding/queries/get-file-preview.query'
import { LoadFileCommand } from '../commands/load-file.command'
import { LoadFileHandler } from '../commands/handlers/load-file.handler'
import { createHumanMessage } from './message'

describe('binary attachment model messages', () => {
    let directory: string

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'attachment-reference-'))
    })
    afterEach(() => rm(directory, { recursive: true, force: true }))

    function setup(filePath: string, originalName: string, mimeType: string, status?: string) {
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: status
                            ? {
                                  id: 'asset-zip',
                                  originalName,
                                  mimeType,
                                  status,
                                  size: 15_254_890,
                                  workspacePath: 'uploads/' + originalName
                              }
                            : undefined,
                        storageFile: {
                            id: 'storage-zip',
                            originalName,
                            mimetype: mimeType,
                            file: filePath,
                            size: 15_254_890
                        }
                    }
                }
                if (query instanceof GetFilePreviewQuery) return null
                return []
            })
        }
        const handler = new LoadFileHandler(queryBus as unknown as QueryBus, {
            resolve: jest.fn(() => {
                throw new Error('Absolute storage path expected')
            })
        })
        const commandBus = { execute: jest.fn((command: LoadFileCommand) => handler.execute(command)) }
        const state = {
            human: {
                input: 'Parse the current student',
                files: [{ id: 'storage-zip', ...(status ? { fileId: 'asset-zip' } : {}) }]
            }
        }
        const create = () =>
            createHumanMessage(commandBus as unknown as CommandBus, queryBus as unknown as QueryBus, state, {
                enabled: false
            })
        return { create, state, handler, queryBus, commandBus }
    }

    it.each(['uploaded', 'parsing', 'failed', 'ready', undefined])(
        'keeps the inherited ZIP accessible as a small reference in state %s',
        async (status) => {
            const filePath = join(directory, 'students.zip')
            const bytes = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(512_000, 0xfe)])
            await writeFile(filePath, bytes)
            const { create, state } = setup(filePath, 'students.zip', 'application/zip', status)
            const message = await create()
            const payload = JSON.stringify(message.content)
            expect(payload.length).toBeLessThan(2000)
            expect(payload).toContain('<file_reference>')
            expect(payload).toContain('storageFileId: storage-zip')
            expect(payload).toContain('15254890')
            expect(payload).toContain(status ?? 'unknown')
            if (status) {
                expect(payload).toContain('asset-zip')
                expect(payload).toContain('uploads/students.zip')
            }
            expect(payload).not.toContain('<file_content>')
            expect(payload).not.toContain('\ufffd')
            expect(state.human.files).toHaveLength(1)
            expect(await readFile(filePath)).toEqual(bytes)
        }
    )

    it('omits the storage ID for a workspace-only ZIP while preserving its file handle', async () => {
        const queryBus = {
            execute: jest.fn().mockImplementation((query: unknown) => {
                if (query instanceof ResolveAuthorizedFileAssetQuery) {
                    return {
                        asset: {
                            id: 'workspace-zip',
                            originalName: 'students.zip',
                            mimeType: 'application/zip',
                            size: 1024,
                            status: 'uploaded',
                            workspacePath: 'uploads/students.zip'
                        }
                    }
                }
                return null
            })
        }
        const commandBus = { execute: jest.fn() }
        const state = { human: { input: 'Parse the current student', files: [{ fileAssetId: 'workspace-zip' }] } }
        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            state,
            { enabled: false }
        )
        const payload = JSON.stringify(message.content)
        expect(payload).toContain('<file_reference>')
        expect(payload).toContain('fileId: workspace-zip')
        expect(payload).toContain('workspacePath: uploads/students.zip')
        expect(payload).not.toContain('storageFileId:')
        expect(payload).not.toContain('<file_content>')
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(state.human.files).toEqual([{ fileAssetId: 'workspace-zip' }])
    })

    it('rejects raw ZIP reads at the legacy loader without invoking the text reader', async () => {
        const filePath = join(directory, 'students.zip')
        const { handler } = setup(filePath, 'students.zip', 'application/zip')
        const processText = jest.spyOn(handler, 'processText')
        await expect(
            handler.execute(new LoadFileCommand({ filePath, mimeType: 'application/zip' }))
        ).rejects.toMatchObject({ name: 'UnsupportedFileContentError' })
        expect(processText).not.toHaveBeenCalled()
    })

    it('retains the current student image alongside an inherited ZIP reference', async () => {
        const { state, commandBus, queryBus } = setup(
            join(directory, 'students.zip'),
            'students.zip',
            'application/zip',
            'parsing'
        )
        const imageUrl = 'https://files.example.test/current-student.png'
        const workflowState = {
            human: { ...state.human, studentFiles: [{ fileUrl: imageUrl, mimeType: 'image/png' }] }
        }
        const message = await createHumanMessage(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus,
            workflowState,
            { enabled: true, variable: 'human.studentFiles' }
        )
        expect(message.content).toContainEqual({
            type: 'image_url',
            image_url: { url: imageUrl }
        })
        expect(JSON.stringify(message.content)).toContain('<file_reference>')
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it.each([
        ['model.bin', 'application/octet-stream'],
        ['notes.txt', 'text/plain']
    ])('uses a reference for binary contents in %s without aborting the message', async (name, mimeType) => {
        const filePath = join(directory, name)
        await writeFile(filePath, Buffer.from([0xff, 0x00, 0xfe]))
        const { create } = setup(filePath, name, mimeType, 'parsing')
        expect(JSON.stringify((await create()).content)).toContain('<file_reference>')
    })

    it('still injects confirmed text for a legacy text attachment', async () => {
        const filePath = join(directory, 'notes.txt')
        await writeFile(filePath, 'Student: Alice\nScore: 90')
        const { create } = setup(filePath, 'notes.txt', 'text/plain')
        const content = JSON.stringify((await create()).content)
        expect(content).toContain('<file_content>')
        expect(content).toContain('Student: Alice')
    })

    it('does not convert a real document parser failure into a reference', async () => {
        const { create, handler } = setup(join(directory, 'resume.pdf'), 'resume.pdf', 'application/pdf')
        jest.spyOn(handler, 'processPdf').mockRejectedValue(new Error('PDF parse failed'))
        await expect(create()).rejects.toThrow('PDF parse failed')
    })

    it('does not hide authorization errors', async () => {
        const { create, queryBus } = setup(
            join(directory, 'students.zip'),
            'students.zip',
            'application/zip',
            'parsing'
        )
        queryBus.execute.mockRejectedValue(new ForbiddenException('Not authorized'))
        await expect(create()).rejects.toThrow('Not authorized')
    })
})
