import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { DocumentTypeEnum, KNOWLEDGE_DOCUMENT_AGENT_WRITER_TYPE } from '@xpert-ai/contracts'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { KnowledgeDocument } from '../document.entity'
import { KnowledgeDocumentSubscriber } from '../document.subscriber'
import { deleteDocumentAndRecount } from './delete-and-recount'

const postgres = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip

postgres('document count transactions', () => {
    const schema = 'document_count_' + randomUUID().replace(/-/g, '')
    const scope = { tenantId: 'tenant', organizationId: 'org' }
    let db: DataSource

    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            schema,
            extra: { options: `-c search_path=${schema},public` },
            entities: [
                new EntitySchema<Knowledgebase>({
                    name: 'Knowledgebase',
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        id: { type: String, primary: true },
                        tenantId: { type: String },
                        organizationId: { type: String },
                        documentNum: { type: Number, nullable: true },
                        keywordAnalyzerLocked: { type: Boolean, default: false, update: false }
                    }
                }),
                new EntitySchema<KnowledgeDocument>({
                    name: 'KnowledgeDocument',
                    target: KnowledgeDocument,
                    tableName: 'knowledge_document',
                    columns: {
                        id: { type: String, primary: true },
                        version: { type: Number, default: 1 },
                        tenantId: { type: String },
                        organizationId: { type: String },
                        knowledgebaseId: { type: String },
                        sourceType: { type: String, nullable: true },
                        metadata: { type: 'jsonb', nullable: true },
                        deletedAt: { type: Date, deleteDate: true, nullable: true }
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.query(`CREATE TABLE "${schema}".knowledgebase (
            id text PRIMARY KEY, "tenantId" text, "organizationId" text, "documentNum" integer, "keywordAnalyzerLocked" boolean DEFAULT false)`)
        await db.query(`CREATE TABLE "${schema}".knowledge_document (
            id text PRIMARY KEY, version integer DEFAULT 1, "knowledgebaseId" text, "tenantId" text, "organizationId" text,
            "sourceType" text, metadata jsonb, "deletedAt" timestamptz)`)
        db.subscribers.push(new KnowledgeDocumentSubscriber())
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            try {
                await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            } finally {
                await db.destroy()
            }
        }
    })

    async function knowledgebase(id: string) {
        return db.getRepository(Knowledgebase).save({ id, ...scope })
    }
    async function add(kb: Knowledgebase, id: string, extra: Partial<KnowledgeDocument> = {}) {
        return db.getRepository(KnowledgeDocument).save({
            id,
            ...scope,
            knowledgebaseId: kb.id,
            sourceType: DocumentTypeEnum.FILE,
            ...extra
        })
    }
    function remove(doc: KnowledgeDocument, kb: Knowledgebase, version?: number) {
        doc.knowledgebase = kb
        return deleteDocumentAndRecount(db, doc, scope, version)
    }
    async function count(id: string) {
        return (await db.getRepository(Knowledgebase).findOneByOrFail({ id })).documentNum
    }

    it('serializes two deletions of different documents in the same knowledgebase', async () => {
        const kb = await knowledgebase('parallel')
        const first = await add(kb, 'first')
        const second = await add(kb, 'second')
        await add(kb, 'folder', { sourceType: DocumentTypeEnum.FOLDER })
        await add(kb, 'internal', { metadata: { systemManaged: true } })
        await add(kb, 'visible-agent', {
            metadata: { systemManaged: true, systemManagedType: KNOWLEDGE_DOCUMENT_AGENT_WRITER_TYPE }
        })
        expect(await count(kb.id)).toBe(3)
        const blocker = db.createQueryRunner()
        await blocker.connect()
        await blocker.startTransaction()
        let removals: Promise<unknown>[] = []
        try {
            await blocker.manager
                .getRepository(Knowledgebase)
                .findOneOrFail({ where: { id: kb.id }, lock: { mode: 'pessimistic_write' } })
            removals = [remove(first, kb, 1), remove(second, kb)]
            // Both database sessions must be waiting before releasing the row.
            const deadline = Date.now() + 4500
            let waiting = 0
            while (waiting < 2 && Date.now() < deadline) {
                const [row] = await db.query(
                    `SELECT count(*)::int AS n FROM pg_stat_activity
                    WHERE query LIKE $1 AND cardinality(pg_blocking_pids(pid)) > 0`,
                    ['%' + schema + '%FOR UPDATE%']
                )
                waiting = row.n
                if (waiting < 2) await new Promise((r) => setTimeout(r, 15))
            }
            expect(waiting).toBe(2)
        } finally {
            await blocker.rollbackTransaction()
            await blocker.release()
            await Promise.all(removals)
        }
        expect(await count(kb.id)).toBe(1)
        expect(await db.getRepository(KnowledgeDocument).countBy({ knowledgebaseId: kb.id })).toBe(3)
    }, 15000)

    it('keeps concurrent inserts and deletes consistent and counts visible legacy rows', async () => {
        const kb = await knowledgebase('mixed')
        const old = await add(kb, 'old')
        await add(kb, 'no-type', { sourceType: null })
        await db.getRepository(Knowledgebase).update(kb.id, { documentNum: null })
        await Promise.all([remove(old, kb), add(kb, 'new')])
        expect(await count(kb.id)).toBe(2)
        await expect(remove(old, kb, 1)).rejects.toThrow('modified')
        expect((await remove(old, kb)).affected).toBe(0)
        expect(await count(kb.id)).toBe(2)
    })

    it('rolls back the document delete if the counter write fails', async () => {
        const kb = await knowledgebase('rollback')
        const doc = await add(kb, 'restore')
        await db.query(`ALTER TABLE "${schema}".knowledgebase ADD CHECK (id <> 'rollback' OR "documentNum" > 0)`)
        await expect(remove(doc, kb, 1)).rejects.toThrow()
        expect(await db.getRepository(KnowledgeDocument).countBy({ id: doc.id })).toBe(1)
        expect(await count(kb.id)).toBe(1)
    })
})
