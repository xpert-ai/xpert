import { BadRequestException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { DataSource } from 'typeorm'

export const KNOWLEDGE_KEYWORD_FTS_INDEX = 'IDX_knowledge_document_chunk_content_fts'
export const KNOWLEDGE_KEYWORD_TRIGRAM_INDEX = 'IDX_knowledge_document_chunk_content_trgm'
export const KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX = 'IDX_knowledge_document_name_trgm'

type KnowledgeKeywordIndexStatusRow = {
    fullTextReady: boolean
    trigramReady: boolean
    documentNameTrigramReady: boolean
}

export type KnowledgeKeywordIndexStatus = KnowledgeKeywordIndexStatusRow & {
    ready: boolean
}

@Injectable()
export class KnowledgeKeywordIndexService {
    private readyStatus?: KnowledgeKeywordIndexStatus

    constructor(private readonly dataSource: DataSource) {}

    async status(): Promise<KnowledgeKeywordIndexStatus> {
        this.assertPostgres()
        if (this.readyStatus?.ready) return this.readyStatus
        const [row] = await this.dataSource.query<KnowledgeKeywordIndexStatusRow[]>(
            `SELECT
                EXISTS (
                    SELECT 1
                    FROM pg_index
                    WHERE indexrelid = to_regclass($1)
                      AND indisready
                      AND indisvalid
                ) AS "fullTextReady",
                EXISTS (
                    SELECT 1
                    FROM pg_index
                    WHERE indexrelid = to_regclass($2)
                      AND indisready
                      AND indisvalid
                ) AS "trigramReady",
                EXISTS (
                    SELECT 1
                    FROM pg_index
                    WHERE indexrelid = to_regclass($3)
                      AND indisready
                      AND indisvalid
                ) AS "documentNameTrigramReady"`,
            [
                `"${KNOWLEDGE_KEYWORD_FTS_INDEX}"`,
                `"${KNOWLEDGE_KEYWORD_TRIGRAM_INDEX}"`,
                `"${KNOWLEDGE_DOCUMENT_NAME_TRIGRAM_INDEX}"`
            ]
        )
        const status = {
            fullTextReady: row?.fullTextReady === true,
            trigramReady: row?.trigramReady === true,
            documentNameTrigramReady: row?.documentNameTrigramReady === true,
            ready: row?.fullTextReady === true && row?.trigramReady === true && row?.documentNameTrigramReady === true
        }
        if (status.ready) this.readyStatus = status
        return status
    }

    private assertPostgres() {
        if (this.dataSource.options.type !== 'postgres') {
            const defaultValue = 'Knowledge keyword indexes currently require PostgreSQL.'
            throw new BadRequestException(
                t('server-ai:Error.KeywordIndexPostgresRequired', {
                    defaultValue
                }) || defaultValue
            )
        }
    }
}
