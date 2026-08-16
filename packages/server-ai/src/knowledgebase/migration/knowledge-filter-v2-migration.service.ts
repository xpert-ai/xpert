import { KBMetadataFieldDef, MetadataFieldType, VectorTypeEnum } from '@xpert-ai/contracts'
import { getErrorMessage, yaml } from '@xpert-ai/server-common'
import { ConfigService, environment } from '@xpert-ai/server-config'
import { Injectable, Logger } from '@nestjs/common'
import { DataSource, MoreThan } from 'typeorm'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { createMilvusFilterAttributes } from '../filter'
import { KnowledgeFilterMigrationIssue, migrateKnowledgeFilterConfigurations } from './knowledge-filter-v2-config'

export type KnowledgeFilterV2MigrationOptions = {
    dryRun?: boolean
    skipTemplates?: boolean
    skipMilvus?: boolean
    templateRoots?: string[]
}

export type KnowledgeFilterV2MigrationReport = {
    dryRun: boolean
    applied: boolean
    issues: KnowledgeFilterMigrationIssue[]
    knowledgebasesScanned: number
    xpertsScanned: number
    xpertsChanged: number
    retrievalsMigrated: number
    templatesScanned: number
    templatesChanged: number
    metadataDocumentsScanned: number
    metadataChunksScanned: number
    logicalFolderDocumentsScanned: number
    logicalFolderDocumentsPending: number
    logicalFolderDocumentsUpdated: number
    milvusCollectionsMigrated: number
    milvusChunksUpdated: number
    milvusSamplesVerified: number
}

type PendingXpertUpdate = {
    id: string
    agentConfig?: unknown
    draft?: unknown
    graph?: unknown
}

type PendingTemplateUpdate = {
    filePath: string
    content: string
}

@Injectable()
export class KnowledgeFilterV2MigrationService {
    private readonly logger = new Logger(KnowledgeFilterV2MigrationService.name)

    constructor(
        private readonly dataSource: DataSource,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly configService: ConfigService
    ) {}

    async run(options: KnowledgeFilterV2MigrationOptions = {}): Promise<KnowledgeFilterV2MigrationReport> {
        const dryRun = options.dryRun !== false
        this.assertPostgres()

        const knowledgebases = await this.dataSource.getRepository(Knowledgebase).find({
            select: { id: true, name: true, metadataSchema: true }
        })
        const schemas = new Map<string, KBMetadataFieldDef[]>()
        const issues: KnowledgeFilterMigrationIssue[] = []
        knowledgebases.forEach((knowledgebase) => {
            const schema: KBMetadataFieldDef[] = (knowledgebase.metadataSchema ?? []).map((field) => ({
                ...field,
                scope: field.scope ?? 'document'
            }))
            schemas.set(knowledgebase.id, schema)
            issues.push(...validateMetadataSchemaDefinitions(knowledgebase.id, schema))
        })

        const xpertResult = await this.preflightXperts(schemas)
        issues.push(...xpertResult.issues)

        const templateResult = options.skipTemplates
            ? { scanned: 0, changed: 0, migrated: 0, updates: [], issues: [] }
            : await this.preflightTemplates(schemas, options.templateRoots)
        issues.push(...templateResult.issues)

        const metadataResult = await this.preflightMetadata(schemas)
        issues.push(...metadataResult.issues)
        const logicalFolderResult = await this.inspectLogicalFolderPaths()

        const report: KnowledgeFilterV2MigrationReport = {
            dryRun,
            applied: false,
            issues,
            knowledgebasesScanned: knowledgebases.length,
            xpertsScanned: xpertResult.scanned,
            xpertsChanged: xpertResult.updates.length,
            retrievalsMigrated: xpertResult.migrated + templateResult.migrated,
            templatesScanned: templateResult.scanned,
            templatesChanged: templateResult.changed,
            metadataDocumentsScanned: metadataResult.documents,
            metadataChunksScanned: metadataResult.chunks,
            logicalFolderDocumentsScanned: logicalFolderResult.scanned,
            logicalFolderDocumentsPending: logicalFolderResult.pending,
            logicalFolderDocumentsUpdated: 0,
            milvusCollectionsMigrated: 0,
            milvusChunksUpdated: 0,
            milvusSamplesVerified: 0
        }

        if (issues.length || dryRun) return report

        await this.dataSource.transaction(async (manager) => {
            await this.applyPostgresSchema(manager.query.bind(manager))
            report.logicalFolderDocumentsUpdated = await this.backfillLogicalFolderPaths(manager.query.bind(manager))
            for (const knowledgebase of knowledgebases) {
                await manager.getRepository(Knowledgebase).update(knowledgebase.id, {
                    metadataSchema: schemas.get(knowledgebase.id) ?? []
                })
            }
            for (const update of xpertResult.updates) {
                await manager.getRepository(Xpert).update(update.id, {
                    agentConfig: update.agentConfig as Xpert['agentConfig'],
                    draft: update.draft as Xpert['draft'],
                    graph: update.graph as Xpert['graph']
                })
            }
        })

        for (const update of templateResult.updates) {
            await fs.writeFile(update.filePath, update.content, 'utf8')
        }

        if (!options.skipMilvus && environment.vectorStore === VectorTypeEnum.MILVUS) {
            const milvus = await this.migrateMilvus(knowledgebases, schemas)
            report.milvusCollectionsMigrated = milvus.collections
            report.milvusChunksUpdated = milvus.updated
            report.milvusSamplesVerified = milvus.verified
        }

        report.applied = true
        return report
    }

    private assertPostgres() {
        if (this.dataSource.options.type !== 'postgres') {
            throw new Error(
                `Knowledge Filter V2 migration requires PostgreSQL; found '${this.dataSource.options.type}'.`
            )
        }
    }

    private async preflightXperts(schemas: Map<string, KBMetadataFieldDef[]>) {
        const xperts = await this.dataSource.getRepository(Xpert).find({
            select: {
                id: true,
                name: true,
                agentConfig: true,
                draft: true,
                graph: true
            }
        })
        const updates: PendingXpertUpdate[] = []
        const issues: KnowledgeFilterMigrationIssue[] = []
        let migrated = 0
        for (const xpert of xperts) {
            const source = { agentConfig: xpert.agentConfig, draft: xpert.draft, graph: xpert.graph }
            const result = migrateKnowledgeFilterConfigurations(source, schemas, `Xpert(${xpert.id}:${xpert.name})`)
            issues.push(...result.issues)
            migrated += result.migratedRetrievals
            if (result.changed) updates.push({ id: xpert.id, ...result.value })
        }
        return { scanned: xperts.length, updates, issues, migrated }
    }

    private async preflightTemplates(
        schemas: Map<string, KBMetadataFieldDef[]>,
        configuredRoots?: string[]
    ): Promise<{
        scanned: number
        changed: number
        migrated: number
        updates: PendingTemplateUpdate[]
        issues: KnowledgeFilterMigrationIssue[]
    }> {
        const roots = configuredRoots?.length ? configuredRoots : this.getDefaultTemplateRoots()
        const files = await listTemplateFiles(roots)
        const updates: PendingTemplateUpdate[] = []
        const issues: KnowledgeFilterMigrationIssue[] = []
        let migrated = 0
        for (const filePath of files) {
            try {
                const raw = await fs.readFile(filePath, 'utf8')
                const isJson = path.extname(filePath).toLowerCase() === '.json'
                const parsed = isJson ? JSON.parse(raw) : yaml.parse(raw)
                const result = migrateKnowledgeFilterConfigurations(parsed, schemas, `Template(${filePath})`)
                issues.push(...result.issues)
                migrated += result.migratedRetrievals
                if (result.changed) {
                    updates.push({
                        filePath,
                        content: isJson ? JSON.stringify(result.value, null, 4) + '\n' : yaml.stringify(result.value)
                    })
                }
            } catch (error) {
                issues.push({
                    location: `Template(${filePath})`,
                    knowledgebaseIds: [],
                    message: `Cannot read or parse template: ${getErrorMessage(error)}`
                })
            }
        }
        return { scanned: files.length, changed: updates.length, migrated, updates, issues }
    }

    private getDefaultTemplateRoots() {
        const builtinRoot = path.join(
            this.configService.assetOptions.serverRoot,
            'packages/server-ai/src/xpert-template'
        )
        const configured = this.configService.environment.env?.XPERT_TEMPLATE_DIR?.trim()
        const externalRoot = configured
            ? path.resolve(
                  path.isAbsolute(configured)
                      ? configured
                      : path.join(this.configService.assetOptions.serverRoot, configured)
              )
            : path.join(this.configService.assetOptions.dataPath, 'xpert-template')
        return [path.join(builtinRoot, 'templates'), path.join(builtinRoot, 'pipelines'), externalRoot]
    }

    private async preflightMetadata(schemas: Map<string, KBMetadataFieldDef[]>) {
        const invalid = new Map<string, { count: number; ids: string[]; kbId: string; field: KBMetadataFieldDef }>()
        let documents = 0
        let chunks = 0

        await this.scanMetadata(
            KnowledgeDocument,
            'document',
            schemas,
            (id, kbId, field) => {
                const key = `${kbId}:document:${field.key}`
                const item = invalid.get(key) ?? { count: 0, ids: [], kbId, field }
                item.count += 1
                if (item.ids.length < 20) item.ids.push(id)
                invalid.set(key, item)
            },
            (count) => (documents += count)
        )
        await this.scanMetadata(
            KnowledgeDocumentChunk,
            'chunk',
            schemas,
            (id, kbId, field) => {
                const key = `${kbId}:chunk:${field.key}`
                const item = invalid.get(key) ?? { count: 0, ids: [], kbId, field }
                item.count += 1
                if (item.ids.length < 20) item.ids.push(id)
                invalid.set(key, item)
            },
            (count) => (chunks += count)
        )

        const issues = [...invalid.values()].map(({ count, ids, kbId, field }) => ({
            location: `Knowledgebase(${kbId}).metadataSchema.${field.key}`,
            knowledgebaseIds: [kbId],
            message: `${count} ${field.scope ?? 'document'} metadata values do not match type '${field.type}'. Sample IDs: ${ids.join(', ')}`
        }))
        return { documents, chunks, issues }
    }

    private async scanMetadata(
        entity: typeof KnowledgeDocument | typeof KnowledgeDocumentChunk,
        scope: 'document' | 'chunk',
        schemas: Map<string, KBMetadataFieldDef[]>,
        onInvalid: (id: string, kbId: string, field: KBMetadataFieldDef) => void,
        onBatch: (count: number) => void
    ) {
        const repository = this.dataSource.getRepository(entity)
        let cursor = ''
        for (;;) {
            const items = await repository.find({
                where: cursor ? { id: MoreThan(cursor) } : {},
                select: { id: true, knowledgebaseId: true, metadata: true } as never,
                order: { id: 'ASC' },
                take: 1000
            })
            if (!items.length) break
            onBatch(items.length)
            for (const item of items) {
                const kbId = item.knowledgebaseId
                if (!kbId) continue
                const metadata = isRecord(item.metadata) ? item.metadata : {}
                for (const field of schemas.get(kbId) ?? []) {
                    if ((field.scope ?? 'document') !== scope || !(field.key in metadata)) continue
                    if (!isMetadataValueValid(metadata[field.key], field)) onInvalid(item.id, kbId, field)
                }
            }
            cursor = items.at(-1).id
        }
    }

    private async inspectLogicalFolderPaths() {
        const rows = (await this.dataSource.query(
            `${logicalFolderPathsCte()}
             SELECT count(*)::integer AS "scanned",
                    count(*) FILTER (WHERE document."folder" IS DISTINCT FROM resolved."folder")::integer AS "pending"
             FROM "knowledge_document" document
             INNER JOIN resolved_logical_folder_paths resolved ON resolved."documentId" = document."id"`
        )) as Array<{ scanned?: number | string; pending?: number | string }>
        return {
            scanned: Number(rows[0]?.scanned ?? 0),
            pending: Number(rows[0]?.pending ?? 0)
        }
    }

    private async backfillLogicalFolderPaths(query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>) {
        const updated = await query(
            `${logicalFolderPathsCte()}
             UPDATE "knowledge_document" document
             SET "folder" = resolved."folder"
             FROM resolved_logical_folder_paths resolved
             WHERE resolved."documentId" = document."id"
               AND document."folder" IS DISTINCT FROM resolved."folder"
             RETURNING document."id"`
        )
        return updated.length
    }

    private async applyPostgresSchema(query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>) {
        await this.convertMetadataColumnToJsonb(query, 'knowledge_document')
        await this.convertMetadataColumnToJsonb(query, 'knowledge_document_chunk')
        const statements = [
            `UPDATE "knowledge_document" SET "type" = lower(ltrim(btrim("type"), '.')) WHERE "type" IS NOT NULL`,
            `UPDATE "knowledge_document" SET "mimeType" = lower(btrim("mimeType")) WHERE "mimeType" IS NOT NULL`,
            `UPDATE "knowledge_document" SET "category" = CASE
                WHEN "type" IN ('csv', 'xls', 'xlsx', 'ods', 'vnd.openxmlformats-officedocument.spreadsheetml.sheet') THEN 'sheet'
                WHEN "type" IN ('jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'svg', 'webp') THEN 'image'
                WHEN "type" IN ('mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm') THEN 'video'
                WHEN "type" IN ('mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a') THEN 'audio'
                ELSE 'text' END`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "filterVersion" integer`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "fixedFilter" jsonb`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "dynamicFilter" jsonb`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "requestFilter" jsonb`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "effectiveFilter" jsonb`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "filterHash" varchar(64)`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "filterStatus" varchar(32)`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "fallbackReason" varchar(64)`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "errorCode" varchar`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "candidateDocumentCount" integer`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "candidateChunkCount" integer`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "vectorBackend" varchar(32)`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "filterLatency" double precision`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "vectorLatency" double precision`,
            `ALTER TABLE "knowledge_retrieval_log" ADD COLUMN IF NOT EXISTS "diagnostics" jsonb`,
            `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_filter_boundary" ON "knowledge_document" ("tenantId", "organizationId", "knowledgebaseId", "disabled")`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_name_trgm" ON "knowledge_document" USING gin ("name" gin_trgm_ops)`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_folder_trgm" ON "knowledge_document" USING gin ("folder" gin_trgm_ops)`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_folder_prefix" ON "knowledge_document" ("folder" text_pattern_ops)`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_type_mime" ON "knowledge_document" ("knowledgebaseId", "type", "mimeType")`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_category_source" ON "knowledge_document" ("knowledgebaseId", "category", "sourceType")`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_metadata_gin" ON "knowledge_document" USING gin ("metadata")`,
            `CREATE INDEX IF NOT EXISTS "IDX_knowledge_document_chunk_metadata_gin" ON "knowledge_document_chunk" USING gin ("metadata")`
        ]
        for (const statement of statements) await query(statement)
    }

    private async convertMetadataColumnToJsonb(
        query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>,
        table: 'knowledge_document' | 'knowledge_document_chunk'
    ) {
        const rows = (await query(
            `SELECT data_type AS "dataType"
             FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'metadata'`,
            [table]
        )) as Array<{ dataType?: string }>
        if (rows[0]?.dataType === 'jsonb') return
        if (rows[0]?.dataType !== 'json') {
            throw new Error(`Cannot migrate ${table}.metadata from type '${rows[0]?.dataType ?? 'missing'}'.`)
        }

        const temporaryColumn = 'metadata__filter_v2'
        await query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${temporaryColumn}" jsonb`)
        for (;;) {
            const updated = await query(
                `WITH batch AS (
                    SELECT "id" FROM "${table}"
                    WHERE "${temporaryColumn}" IS NULL
                    ORDER BY "id"
                    LIMIT 5000
                 )
                 UPDATE "${table}" target
                 SET "${temporaryColumn}" = COALESCE(target."metadata"::jsonb, '{}'::jsonb)
                 FROM batch
                 WHERE target."id" = batch."id"
                 RETURNING target."id"`
            )
            if (!updated.length) break
        }
        await query(`ALTER TABLE "${table}" DROP COLUMN "metadata"`)
        await query(`ALTER TABLE "${table}" RENAME COLUMN "${temporaryColumn}" TO "metadata"`)
    }

    private async migrateMilvus(
        knowledgebases: Knowledgebase[],
        schemas: Map<string, KBMetadataFieldDef[]>
    ): Promise<{ collections: number; updated: number; verified: number }> {
        let collections = 0
        let updated = 0
        let verified = 0
        for (const knowledgebase of knowledgebases) {
            const store = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, false)
            const supported = await store.ensureFilterV2Schema(
                createMilvusArrayIndexes(schemas.get(knowledgebase.id) ?? [])
            )
            if (!supported) {
                throw new Error(
                    `Configured Milvus store '${store.vectorStoreType}' does not support Knowledge Filter V2.`
                )
            }
            collections += 1

            let cursor = ''
            const samples: Array<{ chunkId: string; expected: Record<string, unknown> }> = []
            for (;;) {
                const chunks = await this.dataSource.getRepository(KnowledgeDocumentChunk).find({
                    where: {
                        knowledgebaseId: knowledgebase.id,
                        ...(cursor ? { id: MoreThan(cursor) } : {})
                    },
                    relations: ['document'],
                    order: { id: 'ASC' },
                    take: 500
                })
                if (!chunks.length) break
                const byDocument = new Map<string, KnowledgeDocumentChunk[]>()
                chunks.forEach((chunk) => {
                    if (!chunk.document) throw new Error(`Chunk '${chunk.id}' has no document during Milvus migration.`)
                    const list = byDocument.get(chunk.document.id) ?? []
                    list.push(chunk)
                    byDocument.set(chunk.document.id, list)
                    const chunkId = chunk.metadata?.chunkId ?? chunk.id
                    if (samples.length < 100 && chunkId) {
                        samples.push({
                            chunkId,
                            expected: createMilvusFilterAttributes({
                                document: chunk.document as unknown as Record<string, unknown>,
                                documentMetadata: chunk.document.metadata,
                                chunkMetadata: chunk.metadata
                            })
                        })
                    }
                })
                for (const documentChunks of byDocument.values()) {
                    const count = await store.partialUpdateFilterAttributes(documentChunks[0].document, documentChunks)
                    if (count !== documentChunks.length) {
                        throw new Error(
                            `Milvus updated ${count}/${documentChunks.length} chunks for document '${documentChunks[0].documentId}'.`
                        )
                    }
                    updated += count
                }
                cursor = chunks.at(-1).id
            }

            const actual = await store.getFilterAttributesByChunkIds(samples.map((sample) => sample.chunkId))
            if (!actual) throw new Error(`Milvus store '${store.vectorStoreType}' cannot verify filterAttributes.`)
            for (const sample of samples) {
                if (!isDeepStrictEqual(actual[sample.chunkId], sample.expected)) {
                    throw new Error(
                        `Milvus filterAttributes verification failed for chunk '${sample.chunkId}' (hash ${hashJson(sample.expected)}).`
                    )
                }
                verified += 1
            }
            this.logger.log(`Migrated Knowledge Filter V2 collection for knowledgebase '${knowledgebase.id}'.`)
        }
        return { collections, updated, verified }
    }
}

function logicalFolderPathsCte() {
    return `WITH RECURSIVE logical_folder_paths AS (
                SELECT document."id" AS "documentId",
                       document."knowledgebaseId" AS "knowledgebaseId",
                       document."parentId" AS "nextParentId",
                       ARRAY[]::text[] AS "segments",
                       ARRAY[document."id"]::uuid[] AS "visited"
                FROM "knowledge_document" document

                UNION ALL

                SELECT paths."documentId",
                       paths."knowledgebaseId",
                       parent."parentId" AS "nextParentId",
                       CASE
                           WHEN parent."sourceType" = 'folder' AND nullif(btrim(parent."name"), '') IS NOT NULL
                               THEN array_prepend(btrim(parent."name"), paths."segments")
                           ELSE paths."segments"
                       END AS "segments",
                       paths."visited" || parent."id"
                FROM logical_folder_paths paths
                INNER JOIN "knowledge_document" parent
                    ON parent."id" = paths."nextParentId"
                   AND parent."knowledgebaseId" = paths."knowledgebaseId"
                WHERE NOT parent."id" = ANY(paths."visited")
            ),
            resolved_logical_folder_paths AS (
                SELECT DISTINCT ON (paths."documentId")
                       paths."documentId",
                       array_to_string(paths."segments", '/') AS "folder"
                FROM logical_folder_paths paths
                WHERE paths."nextParentId" IS NULL
                ORDER BY paths."documentId", cardinality(paths."visited") DESC
            )`
}

function isMetadataValueValid(value: unknown, field: KBMetadataFieldDef) {
    let valid = false
    switch (field.type) {
        case 'string':
        case 'enum':
            valid = typeof value === 'string'
            break
        case 'datetime':
            valid = typeof value === 'string' && !Number.isNaN(Date.parse(value)) && value.endsWith('Z')
            break
        case 'number':
            valid = typeof value === 'number' && Number.isFinite(value)
            break
        case 'boolean':
            valid = typeof value === 'boolean'
            break
        case 'string[]':
            valid = Array.isArray(value) && value.every((item) => typeof item === 'string')
            break
        case 'number[]':
            valid = Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
            break
        case 'object':
            valid = isRecord(value)
            break
    }
    return valid && (field.type !== 'enum' || !field.enumValues?.length || field.enumValues.includes(String(value)))
}

function validateMetadataSchemaDefinitions(knowledgebaseId: string, schema: KBMetadataFieldDef[]) {
    const issues: KnowledgeFilterMigrationIssue[] = []
    const keys = new Set<string>()
    const types = new Set<MetadataFieldType>([
        'string',
        'number',
        'boolean',
        'enum',
        'datetime',
        'string[]',
        'number[]',
        'object'
    ])
    schema.forEach((field, index) => {
        const location = `Knowledgebase(${knowledgebaseId}).metadataSchema[${index}]`
        const add = (message: string) => issues.push({ location, knowledgebaseIds: [knowledgebaseId], message })
        if (!field.key || field.key.length > 128 || !/^[\p{L}\p{N}_-]+$/u.test(field.key)) {
            add(`Invalid metadata field key '${field.key}'.`)
        } else if (keys.has(field.key)) {
            add(`Duplicate metadata field key '${field.key}'.`)
        }
        keys.add(field.key)
        if (!types.has(field.type)) add(`Unsupported metadata field type '${field.type}'.`)
        if (!['document', 'chunk'].includes(field.scope ?? 'document')) {
            add(`Unsupported metadata field scope '${field.scope}'.`)
        }
        if (
            field.type === 'enum' &&
            (!Array.isArray(field.enumValues) ||
                !field.enumValues.length ||
                field.enumValues.length > 100 ||
                field.enumValues.some((value) => typeof value !== 'string' || !value || value.length > 512) ||
                new Set(field.enumValues).size !== field.enumValues.length)
        ) {
            add(`Enum metadata field '${field.key}' has invalid enumValues.`)
        }
    })
    return issues
}

function createMilvusArrayIndexes(schema: KBMetadataFieldDef[]) {
    return schema
        .filter((field) => field.type === 'string[]' || field.type === 'number[]')
        .map((field) => ({
            path: `filterAttributes["${field.scope === 'chunk' ? 'chunkMetadata' : 'metadata'}"]["${escapeMilvusKey(field.key)}"]`,
            type: field.type as 'string[]' | 'number[]'
        }))
}

function escapeMilvusKey(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function listTemplateFiles(roots: string[]) {
    const result = new Set<string>()
    const visit = async (entryPath: string) => {
        let stat
        try {
            stat = await fs.stat(entryPath)
        } catch (error) {
            if (isFileNotFound(error)) return
            throw error
        }
        if (stat.isDirectory()) {
            for (const entry of await fs.readdir(entryPath)) await visit(path.join(entryPath, entry))
        } else if (['.yaml', '.yml', '.json'].includes(path.extname(entryPath).toLowerCase())) {
            result.add(path.resolve(entryPath))
        }
    }
    for (const root of roots) await visit(root)
    return [...result].sort()
}

function isFileNotFound(error: unknown) {
    return isRecord(error) && error.code === 'ENOENT'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hashJson(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
