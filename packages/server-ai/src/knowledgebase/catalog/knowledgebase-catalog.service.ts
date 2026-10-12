import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import {
    isDocumentKnowledgebaseType,
    KnowledgebasePermission,
    KnowledgebaseStatusEnum,
    TXpertWorkspaceCapabilities
} from '@xpert-ai/contracts'
import type {
    KnowledgebaseQuery,
    KnowledgebasePage,
    KnowledgebaseSummary,
    KnowledgebaseGetInput,
    KnowledgebaseDetail,
    KnowledgebaseAccessInput,
    KnowledgebaseAccessResult
} from '@xpert-ai/plugin-sdk'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseCatalogAccessService } from './knowledgebase-catalog-access.service'
import {
    catalogCursorSchema,
    catalogError,
    knowledgebaseQuerySchema,
    knowledgebaseGetSchema,
    knowledgebaseAccessSchema,
    parseCatalogInput
} from './knowledgebase-catalog.schema'

const batchSize = 100
const maxScannedPerPage = 1000
const fields = [
    'id',
    'tenantId',
    'organizationId',
    'workspaceId',
    'createdById',
    'name',
    'description',
    'applicationTags',
    'permission',
    'type',
    'status',
    'publishAt',
    'documentNum',
    'chunkNum',
    'copilotModelId'
] as const

/** Keyset cursors advance across rejected rows, never restart a scan or imply an authorization grant. */
@Injectable()
export class KnowledgebaseCatalogService {
    constructor(
        @InjectRepository(Knowledgebase) private readonly repository: Repository<Knowledgebase>,
        private readonly access: KnowledgebaseCatalogAccessService
    ) {}

    async query(input: KnowledgebaseQuery): Promise<KnowledgebasePage> {
        const parsed = parseCatalogInput(knowledgebaseQuerySchema, input)
        const context = this.access.context()
        if (parsed.scope.kind !== 'tenant' && !context.organizationId) throw catalogError('context')
        if (parsed.scope.kind === 'workspace') await this.access.requireWorkspace(parsed.scope.workspaceId)
        const query = this.repository
            .createQueryBuilder('kb')
            .select(fields.map((field) => `kb.${field}`))
            .where('kb.tenantId = :tenantId', { tenantId: context.tenantId })
            .orderBy('kb.id', 'ASC')
        if (parsed.scope.kind === 'tenant') {
            query.andWhere('kb.organizationId IS NULL AND kb.workspaceId IS NULL AND kb.permission = :public', {
                public: KnowledgebasePermission.Public
            })
        } else {
            query.andWhere('kb.organizationId = :organizationId', { organizationId: context.organizationId })
            if (parsed.scope.kind === 'workspace') {
                const { workspaceId, relation } = parsed.scope
                query.andWhere(
                    new Brackets((q) => {
                        q.where('kb.workspaceId = :workspaceId', { workspaceId })
                        if (relation === 'available')
                            q.orWhere('kb.permission IN (:...visibility)', {
                                visibility: [KnowledgebasePermission.Organization, KnowledgebasePermission.Public]
                            })
                    })
                )
            }
        }
        const filter = parsed.filter
        if (filter?.visibility) query.andWhere('kb.permission = :permission', { permission: filter.visibility })
        if (filter?.publication)
            query.andWhere(`kb.publishAt IS ${filter.publication === 'unpublished' ? '' : 'NOT '}NULL`)
        if (filter?.applicationTags)
            query.andWhere('kb.applicationTags @> CAST(:tags AS jsonb)', {
                tags: JSON.stringify(filter.applicationTags.allOf)
            })
        if (filter?.text)
            query.andWhere('(kb.name ILIKE :text OR kb.description ILIKE :text)', {
                text: `%${filter.text.replace(/[\\%_]/g, '\\$&')}%`
            })
        const fingerprint = createHash('sha256')
            .update(
                JSON.stringify({
                    ...context,
                    scope: parsed.scope,
                    filter: {
                        text: filter?.text,
                        visibility: filter?.visibility,
                        publication: filter?.publication,
                        tags: [...new Set(filter?.applicationTags?.allOf ?? [])].sort()
                    },
                    actions: [...new Set(parsed.access?.requireAll ?? [])].sort()
                })
            )
            .digest('hex')
        let after: string | undefined
        if (parsed.page?.cursor) {
            try {
                const cursor = catalogCursorSchema.parse(
                    JSON.parse(Buffer.from(parsed.page.cursor, 'base64url').toString('utf8'))
                )
                if (cursor.query !== fingerprint) throw catalogError('cursor')
                after = cursor.after
            } catch {
                throw catalogError('cursor')
            }
        }
        const cursor = (id: string) =>
            Buffer.from(JSON.stringify({ version: 1, after: id, query: fingerprint })).toString('base64url')
        const limit = parsed.page?.limit ?? 20
        const items: KnowledgebaseSummary[] = []
        const workspaceCache = new Map<string, TXpertWorkspaceCapabilities>()
        for (let scanned = 0; scanned < maxScannedPerPage; scanned += batchSize) {
            const page = query.clone().take(batchSize)
            if (after) page.andWhere('kb.id > :after', { after })
            const rows = await page.getMany()
            const permissions = await this.access.evaluate(rows, workspaceCache)
            for (const [index, row] of rows.entries()) {
                after = row.id
                const grant = permissions.get(row.id)
                if (
                    grant?.read &&
                    (parsed.access?.requireAll ?? []).every((action) => this.access.allows(grant, action))
                ) {
                    items.push(summary(row))
                }
                if (items.length === limit)
                    return {
                        items,
                        nextCursor: index < rows.length - 1 || rows.length === batchSize ? cursor(after) : null
                    }
            }
            if (rows.length < batchSize) return { items, nextCursor: null }
        }
        return { items, nextCursor: after ? cursor(after) : null }
    }

    async get(input: KnowledgebaseGetInput): Promise<KnowledgebaseDetail> {
        const { knowledgebaseId } = parseCatalogInput(knowledgebaseGetSchema, input)
        const rows = await this.read([knowledgebaseId])
        const row = rows[0]
        if (!row || !(await this.access.evaluate(rows)).get(row.id)?.read) throw catalogError('unavailable')
        const documentIngestion = isDocumentKnowledgebaseType(row.type)
        const embeddingConfigured = !!row.copilotModelId
        const reason = !documentIngestion
            ? 'unsupported_type'
            : row.status === KnowledgebaseStatusEnum.REBUILDING
              ? 'rebuilding'
              : !embeddingConfigured
                ? 'embedding_not_configured'
                : null
        return {
            ...summary(row),
            capabilities: { documentIngestion },
            configuration: { embeddingConfigured },
            processing: { blocked: !!reason, reason }
        }
    }

    async getAccess(input: KnowledgebaseAccessInput): Promise<KnowledgebaseAccessResult> {
        const parsed = parseCatalogInput(knowledgebaseAccessSchema, input)
        const ids = [...new Set(parsed.knowledgebaseIds)]
        const permissions = await this.access.evaluate(await this.read(ids))
        return {
            items: ids.map((knowledgebaseId) => {
                const grant = permissions.get(knowledgebaseId)
                return {
                    knowledgebaseId,
                    status: grant?.read ? 'available' : 'unavailable',
                    actions: [...new Set(parsed.actions)].map((action) => ({
                        action,
                        allowed: this.access.allows(grant, action)
                    }))
                }
            })
        }
    }

    private read(ids: string[]) {
        const context = this.access.context()
        const query = this.repository
            .createQueryBuilder('kb')
            .select(fields.map((field) => `kb.${field}`))
            .where('kb.tenantId = :tenantId', { tenantId: context.tenantId })
            .andWhere('kb.id IN (:...ids)', { ids })
        query.andWhere(
            new Brackets((q) => {
                if (context.organizationId)
                    q.where('kb.organizationId = :organizationId', { organizationId: context.organizationId })
                else q.where('kb.organizationId IS NULL')
                q.orWhere('kb.organizationId IS NULL AND kb.workspaceId IS NULL AND kb.permission = :public', {
                    public: KnowledgebasePermission.Public
                })
            })
        )
        return query.getMany()
    }
}

function summary(row: Knowledgebase): KnowledgebaseSummary {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        workspaceId: row.workspaceId ?? null,
        visibility: row.permission ?? KnowledgebasePermission.Private,
        applicationTags: row.applicationTags ?? [],
        type: row.type ?? null,
        status: row.status ?? null,
        published: !!row.publishAt,
        documentNum: row.documentNum ?? 0,
        chunkNum: row.chunkNum ?? 0
    }
}
