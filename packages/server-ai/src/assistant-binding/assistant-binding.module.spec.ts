import { MODULE_METADATA } from '@nestjs/common/constants'

describe('AssistantBindingModule dependency graph', () => {
    it('keeps transitive module imports defined when loaded through the server-ai entrypoint', () => {
        const { AssistantBindingModule } = require('@xpert-ai/server-ai')
        const { FileUnderstandingModule } = require('../file-understanding/file-understanding.module')
        const { KnowledgebaseModule } = require('../knowledgebase/knowledgebase.module')
        const { KnowledgeDocumentModule } = require('../knowledge-document/document.module')
        const { XpertToolsetModule } = require('../xpert-toolset/xpert-toolset.module')

        expect(AssistantBindingModule).toBeDefined()
        for (const moduleType of [
            FileUnderstandingModule,
            KnowledgebaseModule,
            KnowledgeDocumentModule,
            XpertToolsetModule
        ]) {
            const imports = (Reflect as any).getMetadata(MODULE_METADATA.IMPORTS, moduleType) ?? []
            expect(imports).not.toContain(undefined)
        }
    })
})
