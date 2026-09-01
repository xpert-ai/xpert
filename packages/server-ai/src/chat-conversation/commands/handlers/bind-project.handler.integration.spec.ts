import { DataSource, QueryRunner } from 'typeorm'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationBindProjectCommand } from '../bind-project.command'
import { ChatConversationBindProjectHandler } from './bind-project.handler'

const runPostgresIntegration = process.env.CHAT_CONVERSATION_BIND_PROJECT_PG_E2E === '1'
const postgresDescribe = runPostgresIntegration ? describe : describe.skip
const schemaName = `bind_project_test_${process.pid}`
const conversationId = '00000000-0000-4000-8000-000000000101'
const projectId = '00000000-0000-4000-8000-000000000102'
const threadId = '00000000-0000-4000-8000-000000000103'

postgresDescribe('ChatConversationBindProjectHandler PostgreSQL type integration', () => {
    let dataSource: DataSource
    let queryRunner: QueryRunner

    beforeAll(async () => {
        dataSource = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap'
        })
        await dataSource.initialize()
        queryRunner = dataSource.createQueryRunner()
        await queryRunner.connect()
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`)
        await queryRunner.query(`SET search_path TO "${schemaName}"`)
        await queryRunner.query(`
            CREATE TABLE "chat_conversation" (
                id uuid PRIMARY KEY,
                "projectId" uuid NULL,
                "threadId" uuid NOT NULL,
                "updatedAt" timestamptz NOT NULL DEFAULT NOW()
            );
            CREATE TABLE "chat_message" ("conversationId" uuid NULL);
            CREATE TABLE "chat_conversation_goal" ("conversationId" uuid NULL);
            CREATE TABLE "conversation_file_link" ("conversationId" varchar NULL);
            CREATE TABLE "chat_conversation_attachment" ("chatConversationId" uuid NULL);
            CREATE TABLE "file_asset" ("conversationId" varchar NULL);
            CREATE TABLE "xpert_agent_execution" ("threadId" uuid NULL);
        `)
        await queryRunner.query(`INSERT INTO "chat_conversation" (id, "threadId") VALUES ($1::uuid, $2::uuid)`, [
            conversationId,
            threadId
        ])
    }, 30000)

    afterAll(async () => {
        if (queryRunner?.isReleased === false) {
            await queryRunner.query('SET search_path TO public')
            await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
            await queryRunner.release()
        }
        if (dataSource?.isInitialized) {
            await dataSource.destroy()
        }
    })

    it('binds when legacy file link columns are varchar and the conversation id is uuid', async () => {
        const repository = {
            query: (sql: string, parameters?: unknown[]) => queryRunner.query(sql, parameters),
            findOneByOrFail: async ({ id }: { id: string }) => {
                const rows = await queryRunner.query(
                    `SELECT id::text AS id, "projectId"::text AS "projectId" FROM "chat_conversation" WHERE id = $1::uuid`,
                    [id]
                )
                if (!rows[0]) throw new Error('Conversation not found')
                return rows[0]
            }
        }
        const handler = new ChatConversationBindProjectHandler({ repository } as unknown as ChatConversationService)

        await expect(
            handler.execute(new ChatConversationBindProjectCommand(conversationId, projectId))
        ).resolves.toMatchObject({ projectId })
    })
})
