import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { getMetadataArgsStorage } from 'typeorm'
import { KnowledgeGraphEntity } from '../../graphrag/entities'
import { KnowledgeGraphExtractionService } from '../../graphrag/graph-extraction.service'
import { GraphragModule } from '../../graphrag/graphrag.module'
import { KnowledgeWikiPage } from '../wiki/entities'
import { KnowledgeWikiIdentityResolverService } from '../wiki/knowledge-wiki-identity-resolver.service'
import { KnowledgeWikiModule } from '../wiki/knowledge-wiki.module'
import { KnowledgeIdentityEmbeddingService } from './knowledge-identity-embedding.service'
import { KnowledgeIdentityModule } from './knowledge-identity.module'
import { KnowledgeIdentityService } from './knowledge-identity.service'

describe('Shared identity ownership and wiring', () => {
    it('constructs both adapters and the shared services without an undefined circular dependency', async () => {
        const services = [
            KnowledgeIdentityService,
            KnowledgeIdentityEmbeddingService,
            KnowledgeWikiIdentityResolverService,
            KnowledgeGraphExtractionService
        ]
        const module = await Test.createTestingModule({ providers: services })
            .useMocker(() => ({}))
            .compile()
        try {
            for (const service of services) expect(module.get(service)).toBeInstanceOf(service)
        } finally {
            await module.close()
        }
        for (const consumer of [KnowledgeWikiModule, GraphragModule]) {
            const imports: unknown = Reflect.getMetadata(MODULE_METADATA.IMPORTS, consumer)
            if (!Array.isArray(imports)) throw new Error('Module imports are missing')
            const resolved = imports.map((item) =>
                item && typeof item === 'object' && 'forwardRef' in item && typeof item.forwardRef === 'function'
                    ? item.forwardRef()
                    : item
            )
            expect(resolved).toContain(KnowledgeIdentityModule)
            expect(resolved).not.toContain(undefined)
        }
    })

    it('keys each projection by identity and limits name uniqueness to unbound manual nodes', () => {
        const indices = getMetadataArgsStorage().indices
        for (const target of [KnowledgeWikiPage, KnowledgeGraphEntity]) {
            expect(
                indices.find(
                    (index) =>
                        index.target === target &&
                        JSON.stringify(index.columns) === JSON.stringify(['knowledgebaseId', 'identityId'])
                )?.unique
            ).toBe(true)
        }
        expect(
            indices.find(
                (index) => index.target === KnowledgeGraphEntity && index.name === 'IDX_graph_manual_entity_name'
            )
        ).toMatchObject({ unique: true, where: '"identityId" IS NULL' })
    })
})
