import { DocumentTypeEnum } from '@xpert-ai/contracts'
import { DataSource, Repository } from 'typeorm'
import { StorageFileService } from '@xpert-ai/server-core'
import { CommandBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeWorkAreaResolver } from '../shared'
import { KnowledgeDocument } from './document.entity'
import { KnowledgeDocumentService } from './document.service'

function createService(documents: Partial<KnowledgeDocument>[]) {
    const repo = {
        findAndCount: jest.fn(async () => [documents, documents.length])
    } as unknown as Repository<KnowledgeDocument>

    const storageFileService = {
        findOne: jest.fn()
    } as unknown as StorageFileService
    const knowledgeWorkAreaResolver = {
        resolve: jest.fn(async () => ({
            volume: {
                path: (filePath: string) => `/knowledge-volume/${filePath}`
            }
        }))
    } as unknown as KnowledgeWorkAreaResolver

    return new KnowledgeDocumentService(
        repo,
        {} as DataSource,
        storageFileService,
        knowledgeWorkAreaResolver,
        {} as KnowledgebaseService,
        {} as CommandBus,
        {} as Queue
    )
}

describe('KnowledgeDocumentService original file downloads', () => {
    it('selects uploaded workspace files with original file paths', async () => {
        const service = createService([
            {
                id: 'doc-workspace',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'DESIGN.md',
                filePath: 'files/DESIGN.md',
                mimeType: 'text/markdown'
            }
        ])

        await expect(service.getOriginalFileDownloadTargets(['doc-workspace'])).resolves.toEqual([
            expect.objectContaining({
                absolutePath: '/knowledge-volume/files/DESIGN.md',
                fileName: 'DESIGN.md',
                mimeType: 'text/markdown'
            })
        ])
    })

    it('excludes agent-written and non-file documents from original downloads', async () => {
        const service = createService([
            {
                id: 'doc-local',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'local.txt',
                filePath: 'files/local.txt'
            },
            {
                id: 'doc-agent',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                metadata: { systemManaged: true, systemManagedType: 'agent-writer' },
                name: 'agent.txt',
                filePath: 'files/agent.txt'
            },
            {
                id: 'doc-folder',
                sourceType: DocumentTypeEnum.FOLDER,
                name: 'folder',
                filePath: 'files/folder'
            },
            {
                id: 'doc-no-file',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE
            }
        ])

        await expect(service.getOriginalFileDownloadTargets(['doc-local', 'doc-agent', 'doc-folder'])).resolves.toEqual([
            expect.objectContaining({
                absolutePath: '/knowledge-volume/files/local.txt',
                fileName: 'local.txt'
            })
        ])
    })

    it('deduplicates selected documents that reference the same original file path', async () => {
        const service = createService([
            {
                id: 'doc-1',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'shared.txt',
                filePath: 'files/shared.txt'
            },
            {
                id: 'doc-2',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'shared-copy.txt',
                filePath: 'files/shared.txt'
            }
        ])

        const targets = await service.getOriginalFileDownloadTargets(['doc-1', 'doc-2'])

        expect(targets).toHaveLength(1)
        expect(targets[0]).toEqual(
            expect.objectContaining({
                fileName: 'shared.txt',
                absolutePath: '/knowledge-volume/files/shared.txt'
            })
        )
    })
})
