import { BadRequestException, Injectable } from '@nestjs/common'
import {
    DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER,
    IKnowledgebase,
    KnowledgeKeywordAnalyzer,
    KnowledgeKeywordAnalyzerOption,
    KnowledgebaseTypeEnum
} from '@xpert-ai/contracts'
import { BUILTIN_GLOBAL_SCOPE, IKeywordAnalyzerStrategy, KeywordAnalyzerRegistry } from '@xpert-ai/plugin-sdk'
import { DataSource, EntityManager } from 'typeorm'
import { t } from 'i18next'
import { keywordTsQuery, keywordTsVector } from './keyword-lexemes'
import { Knowledgebase } from '../knowledgebase.entity'
import { keywordIdentifiers, keywordQueryPlan } from './keyword-query'

type AnalyzerKnowledgebase = Pick<
    IKnowledgebase,
    'id' | 'tenantId' | 'organizationId' | 'type' | 'keywordAnalyzer' | 'keywordAnalyzerLocked'
>

export function sameKeywordAnalyzer(
    left: KnowledgeKeywordAnalyzer | null | undefined,
    right: KnowledgeKeywordAnalyzer | null | undefined
) {
    if (!left || !right) return !left && !right
    return (
        left.provider === right.provider &&
        left.revision === right.revision &&
        left.source.kind === right.source.kind &&
        (left.source.kind === 'builtin' ||
            (right.source.kind === 'plugin' &&
                left.source.pluginName === right.source.pluginName &&
                left.source.scopeKey === right.source.scopeKey))
    )
}

/** Validate persisted JSON and API input once before using typed analyzer fields. */
function parseAnalyzer(value: unknown): KnowledgeKeywordAnalyzer {
    if (
        value &&
        typeof value === 'object' &&
        'provider' in value &&
        typeof value.provider === 'string' &&
        'revision' in value &&
        typeof value.revision === 'string' &&
        'source' in value &&
        value.source &&
        typeof value.source === 'object' &&
        'kind' in value.source
    ) {
        if (value.source.kind === 'builtin') {
            return { provider: value.provider, revision: value.revision, source: { kind: 'builtin' } }
        }
        if (
            value.source.kind === 'plugin' &&
            'pluginName' in value.source &&
            typeof value.source.pluginName === 'string' &&
            'scopeKey' in value.source &&
            typeof value.source.scopeKey === 'string'
        ) {
            return {
                provider: value.provider,
                revision: value.revision,
                source: {
                    kind: 'plugin',
                    pluginName: value.source.pluginName,
                    scopeKey: value.source.scopeKey
                }
            }
        }
    }
    throw analyzerError('KeywordAnalyzerInvalid', 'Invalid keyword analyzer configuration.')
}

function analyzerError(key: string, defaultValue: string) {
    return new BadRequestException(t(`server-ai:Error.${key}`, { defaultValue }) || defaultValue)
}

@Injectable()
export class KnowledgeKeywordAnalyzerService {
    constructor(
        private readonly registry: KeywordAnalyzerRegistry,
        private readonly dataSource: DataSource
    ) {}

    options(organizationId?: string): KnowledgeKeywordAnalyzerOption[] {
        return this.registry.listRegistrations(organizationId).map(({ type, strategy }) => ({
            label: strategy.meta.label,
            languages: strategy.meta.languages,
            analyzer: this.binding(type, strategy)
        }))
    }

    forCreate(value: unknown, organizationId?: string): KnowledgeKeywordAnalyzer {
        if (value == null) {
            const strategy = this.get(DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER, organizationId)
            return this.binding(DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER, strategy)
        }
        const binding = parseAnalyzer(value)
        this.resolve(binding, organizationId)
        return binding
    }

    /** Caller supplies an authorized entity with client-controlled ownership fields removed. */
    async saveSettings(knowledgebase: Knowledgebase, value: unknown) {
        return this.dataSource.transaction(async (manager) => {
            const keywordAnalyzer = await this.change(knowledgebase, value, manager)
            return manager.getRepository(Knowledgebase).save({ ...knowledgebase, keywordAnalyzer })
        })
    }

    async change(
        knowledgebase: AnalyzerKnowledgebase,
        value: unknown,
        database: Pick<EntityManager, 'query'> = this.dataSource
    ) {
        const next = value == null ? null : parseAnalyzer(value)
        const current = knowledgebase.keywordAnalyzer ? parseAnalyzer(knowledgebase.keywordAnalyzer) : null
        if (sameKeywordAnalyzer(current, next)) return current
        if (knowledgebase.type === KnowledgebaseTypeEnum.External) {
            throw analyzerError('KeywordAnalyzerExternal', 'External knowledgebases do not support keyword analyzers.')
        }
        if (next) this.resolve(next, knowledgebase.organizationId)
        // This conditional write serializes with the first document's lock update on the same KB row.
        const updated = await database.query<{ id: string }[]>(
            `WITH changed AS (UPDATE "knowledgebase" kb SET "keywordAnalyzer" = $1::jsonb
             WHERE kb."id" = $2 AND kb."tenantId" IS NOT DISTINCT FROM $3
               AND kb."organizationId" IS NOT DISTINCT FROM $4
               AND kb."keywordAnalyzerLocked" = false
               AND NOT EXISTS (SELECT 1 FROM "knowledge_document" d WHERE d."knowledgebaseId" = kb."id" AND d."sourceType" IS DISTINCT FROM 'folder')
               AND NOT EXISTS (SELECT 1 FROM "knowledge_document_chunk" c WHERE c."knowledgebaseId" = kb."id")
             RETURNING kb."id") SELECT "id" FROM changed`,
            [next ? JSON.stringify(next) : null, knowledgebase.id, knowledgebase.tenantId, knowledgebase.organizationId]
        )
        if (!updated.length)
            throw analyzerError(
                'KeywordAnalyzerLocked',
                'The keyword analyzer cannot be changed after documents have been added.'
            )
        return next
    }

    async vector(knowledgebase: AnalyzerKnowledgebase, text: string) {
        const analyzer = this.resolvePersisted(knowledgebase)
        return keywordTsVector(await analyzer.analyze(text, 'index'))
    }

    async query(knowledgebase: AnalyzerKnowledgebase, text: string) {
        const analyzer = this.resolvePersisted(knowledgebase)
        return keywordTsQuery(await analyzer.analyze(text, 'query'))
    }

    async queryPlan(knowledgebase: AnalyzerKnowledgebase, text: string) {
        const analyzer = this.resolvePersisted(knowledgebase)
        const terms = await analyzer.analyze(text, 'query')
        const identifiers = await Promise.all(
            keywordIdentifiers(text).map((identifier) => analyzer.analyze(identifier, 'query'))
        )
        return keywordQueryPlan(terms, identifiers)
    }

    private resolvePersisted(knowledgebase: AnalyzerKnowledgebase) {
        return this.resolve(parseAnalyzer(knowledgebase.keywordAnalyzer), knowledgebase.organizationId)
    }

    private get(provider: string, organizationId?: string) {
        try {
            return this.registry.get(provider, organizationId)
        } catch {
            throw analyzerError('KeywordAnalyzerUnavailable', 'The selected keyword analyzer is not available.')
        }
    }

    private resolve(binding: KnowledgeKeywordAnalyzer, organizationId?: string) {
        const source =
            binding.source.kind === 'builtin'
                ? { kind: 'builtin' as const, scopeKey: BUILTIN_GLOBAL_SCOPE }
                : binding.source
        const strategy = this.registry.getBySource(binding.provider, source, organizationId)
        if (!strategy) {
            throw analyzerError('KeywordAnalyzerUnavailable', 'The selected keyword analyzer is not available.')
        }
        if (!sameKeywordAnalyzer(binding, this.binding(binding.provider, strategy))) {
            throw analyzerError(
                'KeywordAnalyzerRevisionMismatch',
                'The installed analyzer no longer matches the version used by this knowledgebase.'
            )
        }
        return strategy
    }

    private binding(provider: string, strategy: IKeywordAnalyzerStrategy): KnowledgeKeywordAnalyzer {
        const source = this.registry.getSource(strategy)
        return {
            provider,
            revision: strategy.meta.revision,
            source:
                source.kind === 'builtin'
                    ? { kind: 'builtin' }
                    : { kind: 'plugin', pluginName: source.pluginName, scopeKey: source.scopeKey }
        }
    }
}
