import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import type { QueryBus } from '@nestjs/cqrs'
import { Document } from 'langchain/document'
import { ResolveAuthorizedFileAssetQuery } from '../../../file-understanding/queries/resolve-authorized-file-asset.query'
import { VolumeClient, VolumeHandle, type VolumeRootResolution, type VolumeScope } from '../../volume/volume'
import { LoadFileCommand } from '../load-file.command'
import { LoadFileHandler } from './load-file.handler'
import { OfficeFileParser } from '../../../file-understanding/parsers/office.parser'

class TestVolumeClient extends VolumeClient {
    readonly scopes: VolumeScope[] = []

    resolve(scope: VolumeScope): VolumeHandle {
        this.scopes.push(scope)
        const root = `/tmp/workspace-volume/${scope.tenantId}/${scope.catalog}`
        return new VolumeHandle(scope, root, root, 'https://files.example.test')
    }

    resolveRoot(_tenantId: string): VolumeRootResolution {
        return {
            serverRoot: '/tmp/workspace-volume',
            hostRoot: '/tmp/workspace-volume'
        }
    }
}

describe('LoadFileHandler', () => {
    it.each([
        ['/tmp/resume.pdf', 'resume'],
        ['/tmp/upload', 'resume.pdf']
    ])('reads PDF content from %s with display name %s', async (filePath, originalName) => {
        const documents = [new Document({ pageContent: 'Resume source text' })]
        const load = jest.spyOn(PDFLoader.prototype, 'load').mockResolvedValue(documents)
        const queryBus = { execute: jest.fn() }
        const handler = new LoadFileHandler(queryBus as unknown as QueryBus, new TestVolumeClient())
        try {
            await expect(
                handler.execute(
                    new LoadFileCommand({
                        filePath,
                        originalName,
                        mimeType: 'application/pdf'
                    })
                )
            ).resolves.toEqual(documents)
        } finally {
            load.mockRestore()
        }
    })

    it('keeps a ZIP-based document on its parser when its display name has no extension', async () => {
        const documents = [new Document({ pageContent: 'Slide source text' })]
        const load = jest.spyOn(PPTXLoader.prototype, 'load').mockResolvedValue(documents)
        const queryBus = { execute: jest.fn() }
        const handler = new LoadFileHandler(queryBus as unknown as QueryBus, new TestVolumeClient())
        try {
            await expect(
                handler.execute(
                    new LoadFileCommand({
                        filePath: '/tmp/slides.pptx',
                        originalName: 'slides',
                        mimeType: 'application/zip'
                    })
                )
            ).resolves.toEqual(documents)
        } finally {
            load.mockRestore()
        }
    })

    it('uses the shared Office parser for attachment fallback without injecting its summary twice', async () => {
        const parse = jest.spyOn(OfficeFileParser.prototype, 'parse').mockResolvedValue({
            capabilities: ['read'],
            artifacts: [
                { kind: 'summary', content: 'Tender summary' },
                { kind: 'text', content: 'Tender source text', metadata: { source: 'tender.docx' } }
            ]
        })
        try {
            await expect(LoadFileHandler.prototype.processDoc('/tmp/tender.docx')).resolves.toEqual([
                new Document({ pageContent: 'Tender source text', metadata: { source: 'tender.docx' } })
            ])
            expect(parse).toHaveBeenCalledWith({ filePath: '/tmp/tender.docx' })
        } finally {
            parse.mockRestore()
        }
    })

    it.each([
        ['projects', 'project-1', { catalog: 'projects', projectId: 'project-1', userId: 'user-1' }],
        ['xperts', 'xpert-1', { catalog: 'xperts', xpertId: 'xpert-1', userId: 'user-1', isolateByUser: false }],
        ['user-xperts', 'xpert-1', { catalog: 'user-xperts', xpertId: 'xpert-1', userId: 'user-1' }],
        ['users', 'user-scope', { catalog: 'users', userId: 'user-scope' }],
        ['knowledges', 'knowledge-1', { catalog: 'knowledges', knowledgeId: 'knowledge-1', userId: 'user-1' }],
        ['skills', 'skill-root-1', { catalog: 'skills', rootId: 'skill-root-1', userId: 'user-1' }]
    ] as const)(
        'resolves %s workspace files from catalog/scope metadata and a relative path',
        async (catalog, scopeId, expectedScope) => {
            const relativePath = 'files/wechat/integration-1/uuid-1/msg-1/contract.txt'
            const queryBus = {
                execute: jest.fn().mockImplementation((query) => {
                    if (query instanceof ResolveAuthorizedFileAssetQuery) {
                        return {
                            asset: {
                                id: 'file-asset-1',
                                tenantId: 'tenant-1',
                                userId: catalog === 'users' ? scopeId : 'user-1',
                                projectId: catalog === 'projects' ? scopeId : undefined,
                                xpertId: catalog === 'xperts' || catalog === 'user-xperts' ? scopeId : undefined,
                                originalName: 'contract.txt',
                                mimeType: 'text/plain',
                                status: 'uploaded',
                                workspacePath: relativePath,
                                metadata: {
                                    workspace: {
                                        catalog,
                                        scopeId,
                                        relativePath,
                                        ...(catalog === 'xperts' ? { isolateByUser: false } : {})
                                    }
                                }
                            }
                        }
                    }
                    return null
                })
            }
            const volumeClient = new TestVolumeClient()
            const handler = new LoadFileHandler(queryBus as unknown as QueryBus, volumeClient)
            const processText = jest
                .spyOn(handler, 'processText')
                .mockResolvedValue([new Document({ pageContent: 'ok' })])

            await expect(
                handler.execute(
                    new LoadFileCommand({
                        fileId: 'file-asset-1',
                        filePath: relativePath,
                        mimeType: 'text/plain'
                    })
                )
            ).resolves.toEqual([expect.objectContaining({ pageContent: 'ok' })])

            expect(volumeClient.scopes[0]).toMatchObject({
                tenantId: 'tenant-1',
                ...expectedScope
            })
            expect(processText).toHaveBeenCalledWith(`/tmp/workspace-volume/tenant-1/${catalog}/${relativePath}`)
            expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolveAuthorizedFileAssetQuery))
        }
    )
})
