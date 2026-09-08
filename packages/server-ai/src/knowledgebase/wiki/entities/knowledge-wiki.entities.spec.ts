import { getMetadataArgsStorage } from 'typeorm'
import {
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageReduceInput,
    KnowledgeWikiPageReduceInputSource,
    KnowledgeWikiPageVersion,
    KnowledgeWikiProjectionState,
    KnowledgeWikiSourceMapResult,
    KnowledgeWikiSourceState
} from './index'

describe('knowledge Wiki persistence entities', () => {
    it('registers canonical, version, lineage, projection, and execution records', () => {
        const targets = [
            KnowledgeWikiPage,
            KnowledgeWikiPageVersion,
            KnowledgeWikiPageContribution,
            KnowledgeWikiPageEvidenceEntity,
            KnowledgeWikiPageLinkEntity,
            KnowledgeWikiSourceMapResult,
            KnowledgeWikiPageReduceInput,
            KnowledgeWikiPageReduceInputSource,
            KnowledgeWikiJob,
            KnowledgeWikiModelInvocation,
            KnowledgeWikiProjectionState,
            KnowledgeWikiSourceState
        ]
        const tableNames = getMetadataArgsStorage()
            .tables.filter((table) => targets.includes(table.target as (typeof targets)[number]))
            .map((table) => table.name)

        expect(tableNames).toEqual(
            expect.arrayContaining([
                'knowledge_wiki_page',
                'knowledge_wiki_page_version',
                'knowledge_wiki_page_contribution',
                'knowledge_wiki_page_evidence',
                'knowledge_wiki_page_link',
                'knowledge_wiki_source_map_result',
                'knowledge_wiki_page_reduce_input',
                'knowledge_wiki_page_reduce_input_source',
                'knowledge_wiki_job',
                'knowledge_wiki_model_invocation',
                'knowledge_wiki_projection_state',
                'knowledge_wiki_source_state'
            ])
        )
    })

    it('uses explicit database types for structured and discriminated fields', () => {
        const columns = getMetadataArgsStorage().columns
        const column = (target: object, propertyName: string) =>
            columns.find((item) => item.target === target && item.propertyName === propertyName)?.options

        expect(column(KnowledgeWikiPage, 'pageType')).toMatchObject({ type: 'varchar' })
        expect(column(KnowledgeWikiPageVersion, 'aliases')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeWikiPageContribution, 'payload')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeWikiSourceMapResult, 'payload')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeWikiPageReduceInputSource, 'evidence')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeWikiJob, 'spendEnvelope')).toMatchObject({ type: 'jsonb' })
        expect(column(KnowledgeWikiModelInvocation, 'tokenUsage')).toMatchObject({ type: 'jsonb' })
    })
})
