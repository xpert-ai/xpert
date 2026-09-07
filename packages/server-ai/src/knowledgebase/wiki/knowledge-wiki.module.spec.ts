import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { AgentMiddlewareRuntimeModule, AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { KnowledgeWikiFinalizeService } from './knowledge-wiki-finalize.service'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { KnowledgeWikiPageReduceService } from './knowledge-wiki-page-reduce.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiModule } from './knowledge-wiki.module'

describe('KnowledgeWikiModule', () => {
    it('registers and constructs the worker and its extracted stages', async () => {
        const registered: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, KnowledgeWikiModule)
        if (!Array.isArray(registered)) throw new Error('KnowledgeWikiModule providers are unavailable')
        const stages = [KnowledgeWikiGenerationService, KnowledgeWikiPageReduceService, KnowledgeWikiFinalizeService]
        expect(registered).toEqual(expect.arrayContaining(stages))

        // Verify constructor injection without opening database, queue or model connections.
        const moduleRef = await Test.createTestingModule({
            providers: stages.filter((stage) => registered.includes(stage))
        })
            .useMocker(() => ({}))
            .compile()
        try {
            for (const stage of stages) expect(moduleRef.get(stage)).toBeInstanceOf(stage)
        } finally {
            await moduleRef.close()
        }
    })

    it('wires Wiki model invocation through the exported agent middleware runtime facade', () => {
        const imports: unknown = Reflect.getMetadata(MODULE_METADATA.IMPORTS, KnowledgeWikiModule)
        const dependencies: unknown = Reflect.getMetadata('design:paramtypes', KnowledgeWikiModelInvocationService)

        expect(Array.isArray(imports)).toBe(true)
        expect(Array.isArray(dependencies)).toBe(true)
        if (!Array.isArray(imports) || !Array.isArray(dependencies)) {
            throw new Error('KnowledgeWikiModule metadata is unavailable')
        }

        expect(imports).toContain(AgentMiddlewareRuntimeModule)
        expect(dependencies[1]).toBe(AgentMiddlewareRuntimeService)
    })
})
