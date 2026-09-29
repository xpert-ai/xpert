import { KeywordQueryPlan } from '../analyzer/keyword-query'
import { compileKnowledgeFilterToPostgres } from '../filter'
import { shiftKnowledgeFilterParameters } from '../filter/knowledge-graph-filter-scope'
import { postgresContentScopePredicate } from './content-scope'
import { KnowledgeRetrievalRequest } from './types'

// Preserve the existing FTS/exact weights; a title hit adds one phrase-equivalent point.
const FULL_TEXT_WEIGHT = 4
const EXACT_CONTENT_WEIGHT = 4
const TITLE_MATCH_BOOST = 1
const MIN_TRIGRAM_QUERY_LENGTH = 3

const projection = `c."id" AS "chunkRowId",
    COALESCE(c."metadata" ->> 'chunkId', c."id"::text) AS "chunkId",
    c."metadata" ->> 'parentId' AS "parentChunkId",
    c."pageContent", c."metadata", d."id" AS "documentId", d."name" AS "documentName",
    d."sourceType", d."type" AS "fileExtension", d."category", d."fileUrl"`

export function keywordCandidateQuery(
    request: KnowledgeRetrievalRequest,
    normalizedQuery: string,
    terms: string[],
    window: number,
    offset: number,
    plan?: KeywordQueryPlan,
    relaxed = false
) {
    const parameters: unknown[] = [request.scope.tenantId, request.scope.organizationId, request.knowledgebase.id]
    const parameter = (value: unknown) => {
        parameters.push(value)
        return `$${parameters.length}`
    }
    const compiled = request.preparedFilter.effective
        ? compileKnowledgeFilterToPostgres(request.preparedFilter.effective, request.preparedFilter.registry)
        : { sql: 'TRUE', parameters: [] }
    const filter = shiftKnowledgeFilterParameters(compiled.sql, parameters.length)
    parameters.push(...compiled.parameters)
    const documentScope = `d."tenantId" IS NOT DISTINCT FROM $1
        AND d."organizationId" IS NOT DISTINCT FROM $2 AND d."knowledgebaseId" = $3
        AND COALESCE(d."disabled", FALSE) = FALSE`
    const chunkScope = `c."tenantId" IS NOT DISTINCT FROM $1
        AND c."organizationId" IS NOT DISTINCT FROM $2 AND c."knowledgebaseId" = $3
        AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
        AND (${filter}) AND (${postgresContentScopePredicate(request.contentScope)})`
    const exact = parameter(normalizedQuery)
    const vector = plan ? 'c."keywordVector"' : `to_tsvector('simple', COALESCE(c."pageContent", ''))`
    const query = plan
        ? `${parameter(relaxed ? plan.relaxed : plan.strict)}::tsquery`
        : `plainto_tsquery('simple', ${exact})`
    let bodyMatch = `${vector} @@ ${query}`
    let titleMatch = 'FALSE'
    let bodyScore = `CASE WHEN lower(COALESCE(c."pageContent", '')) = ${exact} THEN ${EXACT_CONTENT_WEIGHT} ELSE 0 END
        + COALESCE(ts_rank_cd(${vector}, ${query}), 0) * ${FULL_TEXT_WEIGHT}`
    let titleScore = '0'
    let bodyCoverage = 'NULL::int'
    let titleCoverage = 'NULL::int'
    if (plan) {
        titleMatch = `d."keywordTitleVector" @@ ${query}`
        const groups = plan.groups.map((group) => `${parameter(group)}::tsquery`)
        const coverage = (expression: string) =>
            groups.map((group) => `CASE WHEN ${expression} @@ ${group} THEN 1 ELSE 0 END`).join(' + ') || '0'
        bodyCoverage = coverage(vector)
        titleCoverage = coverage('d."keywordTitleVector"')
        titleScore = `COALESCE(ts_rank_cd(d."keywordTitleVector", ${query}), 0) * ${FULL_TEXT_WEIGHT} + ${TITLE_MATCH_BOOST}`
        bodyScore += ` + CASE WHEN ${titleMatch} THEN ${TITLE_MATCH_BOOST} ELSE 0 END`
        if (relaxed) {
            const strict = `${parameter(plan.strict)}::tsquery`
            bodyMatch += ` AND NOT COALESCE(${vector} @@ ${strict}, FALSE)`
            titleMatch += ` AND NOT COALESCE(d."keywordTitleVector" @@ ${strict}, FALSE)`
        }
    } else {
        // Legacy KBs retain their simple/trigram lexemes and short-query safeguards.
        const supportsTrigram = (text: string) => Array.from(text).length >= MIN_TRIGRAM_QUERY_LENGTH
        const pattern = (text: string) => parameter(`%${text.replace(/[\\%_]/g, '\\$&')}%`)
        const phrase = supportsTrigram(normalizedQuery) ? pattern(normalizedQuery) : undefined
        const termPatterns = terms.filter(supportsTrigram).map(pattern)
        const patterns = [phrase, ...termPatterns].filter((value): value is string => !!value)
        const match = (expression: string, value: string) => `${expression} ILIKE ${value} ESCAPE '\\'`
        const title = `COALESCE(d."name", '')`
        bodyMatch = [bodyMatch, ...patterns.map((value) => match('c."pageContent"', value))].join(' OR ')
        titleMatch = patterns.map((value) => match(title, value)).join(' OR ') || 'FALSE'
        titleScore =
            [
                ...(phrase ? [`CASE WHEN ${match(title, phrase)} THEN 1 ELSE 0 END`] : []),
                ...termPatterns.map((value) => `CASE WHEN ${match(title, value)} THEN 0.5 ELSE 0 END`)
            ].join(' + ') || '0'
        bodyScore += ` + ${titleScore}`
        if (phrase) bodyScore += ` + CASE WHEN ${match('c."pageContent"', phrase)} THEN 2 ELSE 0 END`
        termPatterns.forEach((value) => {
            bodyScore += ` + CASE WHEN ${match('c."pageContent"', value)} THEN 1 ELSE 0 END`
        })
    }
    const offsetParameter = parameter(offset)
    const limit = parameter(window)
    const sql = `WITH body_hits AS (
        SELECT ${projection}, (${bodyScore})::double precision AS "keywordScore", (${bodyCoverage}) AS coverage,
            FALSE AS "titleOnly"
        FROM "knowledge_document_chunk" c
        INNER JOIN "knowledge_document" d ON d."id" = c."documentId"
        WHERE ${documentScope} AND ${chunkScope} AND (${bodyMatch})
    ), title_hits AS (
        SELECT ${projection}, (${titleScore})::double precision AS "keywordScore", (${titleCoverage}) AS coverage,
            NOT (${bodyMatch}) AS "titleOnly"
        FROM "knowledge_document" d
        CROSS JOIN LATERAL (
            SELECT c.* FROM "knowledge_document_chunk" c
            WHERE c."documentId" = d."id" AND ${chunkScope}
            ORDER BY CASE WHEN (${bodyMatch}) THEN 0 ELSE 1 END,
                (c."metadata" ->> 'parentId' IS NOT NULL), c."id"
            LIMIT 1
        ) c
        WHERE ${documentScope} AND (${titleMatch})
    ), hits AS (
        SELECT DISTINCT ON ("chunkRowId") * FROM (
            SELECT * FROM body_hits UNION ALL SELECT * FROM title_hits
        ) combined ORDER BY "chunkRowId", coverage DESC, "keywordScore" DESC
    )
    SELECT * FROM hits
    ORDER BY coverage DESC, "keywordScore" DESC, length(COALESCE("pageContent", '')) ASC, "chunkRowId"
    LIMIT ${limit} OFFSET ${offsetParameter}`
    return { sql, parameters }
}
