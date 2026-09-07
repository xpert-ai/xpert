import { randomUUID } from 'node:crypto'
import { KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { DataSource, EntitySchema, QueryRunner } from 'typeorm'
import { KnowledgeDocument } from './document.entity'
import {
    KnowledgeDocumentPublicationWriter,
    writeKnowledgeDocumentProcessingMetadata,
    writeKnowledgeDocumentPublication
} from './document-publication'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const documentSchema = new EntitySchema<KnowledgeDocument>({
    name: 'DocumentPublicationFixture',
    tableName: 'document_publication_fixture',
    schema: 'pg_temp',
    columns: {
        id: { type: 'uuid', primary: true },
        contentHash: { type: 'varchar', length: 64 },
        publicationEpoch: { type: 'int', nullable: true },
        metadata: { type: 'jsonb', nullable: true },
        status: { type: 'varchar' },
        chunkNum: { type: 'int' }
    }
})

postgresDescribe('Document publication epoch', () => {
    let db: DataSource
    let runner: QueryRunner
    let documentId: string
    let writer: KnowledgeDocumentPublicationWriter
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            entities: [documentSchema],
            synchronize: false
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        await runner.query(`CREATE TEMP TABLE document_publication_fixture (id uuid PRIMARY KEY, "contentHash" varchar(64),
            "publicationEpoch" int DEFAULT 0, metadata jsonb, status varchar DEFAULT 'finish', "chunkNum" int DEFAULT 1)`)
        const repository = runner.manager.getRepository(documentSchema)
        writer = {
            update: (id, updates) => repository.update(id, updates),
            findOne: (id, options) => repository.findOne({ where: { id }, ...options })
        }
    })
    beforeEach(async () => {
        documentId = randomUUID()
        await runner.query('TRUNCATE pg_temp.document_publication_fixture')
        await runner.query(
            `INSERT INTO pg_temp.document_publication_fixture (id, "contentHash", metadata)
            VALUES ($1, 'A', '{"owner":"alice"}')`,
            [documentId]
        )
    })
    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })
    const read = () => runner.manager.getRepository(documentSchema).findOneBy({ id: documentId })

    it('distinguishes equivalent content after A -> B -> A and keeps metadata', async () => {
        for (const hash of ['A', 'B', 'A']) {
            await writeKnowledgeDocumentProcessingMetadata(
                writer,
                documentId,
                { status: KBDocumentStatusEnum.FINISH, contentHash: hash },
                { tokens: 10 },
                true
            )
        }
        expect(await read()).toMatchObject({
            contentHash: 'A',
            publicationEpoch: 3,
            metadata: { owner: 'alice', tokens: 10 }
        })
    })

    it('does not advance the epoch for progress or unchanged content, nor accept a stale supplied epoch', async () => {
        await writeKnowledgeDocumentPublication(writer, documentId, { contentHash: 'A' }, true)
        await writeKnowledgeDocumentProcessingMetadata(
            writer,
            documentId,
            { status: KBDocumentStatusEnum.EMBEDDING },
            { tokens: 20 }
        )
        await writeKnowledgeDocumentProcessingMetadata(
            writer,
            documentId,
            { status: KBDocumentStatusEnum.FINISH, contentHash: 'A', publicationEpoch: 0 },
            { tokens: 20 },
            false
        )
        expect(await read()).toMatchObject({ contentHash: 'A', publicationEpoch: 1 })
    })

    it('increments from the database value for concurrent publications and legacy null epochs', async () => {
        await runner.query('UPDATE pg_temp.document_publication_fixture SET "publicationEpoch" = NULL WHERE id = $1', [
            documentId
        ])
        await Promise.all(
            Array.from({ length: 8 }, () =>
                writeKnowledgeDocumentPublication(writer, documentId, { contentHash: 'A', publicationEpoch: 0 }, true)
            )
        )
        expect(await read()).toMatchObject({ contentHash: 'A', publicationEpoch: 8 })
    })

    it('does not advance the epoch when publication fails', async () => {
        await expect(
            writeKnowledgeDocumentPublication(writer, documentId, { contentHash: 'x'.repeat(65) }, true)
        ).rejects.toThrow()
        expect(await read()).toMatchObject({ contentHash: 'A', publicationEpoch: 0 })
    })
})
