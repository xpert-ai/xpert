import { getQueueToken } from '@nestjs/bull'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DocumentSourceRegistry } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { KnowledgeDocumentPage } from '../page/document-page.entity'
import { KnowledgeWorkAreaResolver } from '../../shared/volume/work-area'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import { KnowledgeParserSettingsService } from '../../knowledgebase/parser/parser-settings.service'
import { KnowledgeDerivedIndexPublicationService } from '../derived-index-publication.service'
import { KnowledgeDocument } from '../document.entity'
import { KnowledgeDocumentService } from '../document.service'
import { KnowledgeDocumentChunkService } from '../chunk/chunk.service'

it('resolves the document service through Nest and delegates chunk reads to its injected provider', async () => {
    const findAll = jest.fn().mockResolvedValue({ items: [], total: 0 })
    const dependencies = [
        getRepositoryToken(KnowledgeDocument),
        getRepositoryToken(KnowledgeDocumentPage),
        DataSource,
        KnowledgeWorkAreaResolver,
        KnowledgebaseService,
        KnowledgeParserSettingsService,
        KnowledgeDerivedIndexPublicationService,
        CommandBus,
        QueryBus,
        getQueueToken('embedding-document'),
        DocumentSourceRegistry
    ]
    const module = await Test.createTestingModule({
        providers: [
            KnowledgeDocumentService,
            ...dependencies.map((provide) => ({ provide, useValue: {} })),
            { provide: KnowledgeDocumentChunkService, useValue: { findAll } }
        ]
    }).compile()
    try {
        await expect(module.get(KnowledgeDocumentService).getChunks('document', {})).resolves.toEqual({
            items: [],
            total: 0
        })
        expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { documentId: 'document' } }))
    } finally {
        await module.close()
    }
})
