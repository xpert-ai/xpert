jest.mock('../../conversation.service', () => ({ ChatConversationService: class {} }))

import { ForbiddenException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DataSource, QueryRunner } from 'typeorm'
import type { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { selectConversationNoProject } from '../../bind-empty-conversation-project'
import { ChatConversationBindProjectCommand } from '../bind-project.command'
import { ChatConversationBindProjectHandler } from './bind-project.handler'

const runPostgresIntegration = process.env.CHAT_CONVERSATION_BIND_PROJECT_PG_E2E === '1'
const postgresDescribe = runPostgresIntegration ? describe : describe.skip
const schemaName = `bind_project_test_${randomUUID().replace(/-/g, '')}`
const conversationId = '00000000-0000-4000-8000-000000000101'
const projectId = '00000000-0000-4000-8000-000000000102'
const threadId = '00000000-0000-4000-8000-000000000103'

postgresDescribe('conversation Project selection PostgreSQL integration', () => {
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
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`)
        await queryRunner.query(`SET search_path TO "${schemaName}"`)
        await queryRunner.query(`
            CREATE TABLE "chat_conversation" (
                id uuid PRIMARY KEY,
                "projectId" uuid NULL,
                "threadId" uuid NOT NULL,
                options json NULL,
                "updatedAt" timestamptz NOT NULL DEFAULT NOW()
            );
            CREATE TABLE "chat_message" ("conversationId" uuid NULL);
            CREATE TABLE "chat_conversation_goal" ("conversationId" uuid NULL);
            CREATE TABLE "conversation_file_link" ("conversationId" varchar NULL);
            CREATE TABLE "chat_conversation_attachment" ("chatConversationId" uuid NULL);
            CREATE TABLE "file_asset" ("conversationId" varchar NULL);
            CREATE TABLE "xpert_agent_execution" ("threadId" uuid NULL);
        `)
    }, 30000)

    beforeEach(async () => {
        await queryRunner.query('TRUNCATE "chat_conversation"')
        await queryRunner.query(`INSERT INTO "chat_conversation" (id, "threadId", options) VALUES ($1, $2, $3)`, [
            conversationId,
            threadId,
            { sandboxEnvironmentId: 'keep-environment' }
        ])
    })

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

    function repositoryFor(runner: QueryRunner) {
        return {
            query: (sql: string, parameters?: unknown[]) => runner.query(sql, parameters),
            findOneByOrFail: async ({ id }: { id: string }) => {
                const rows: ChatConversation[] = await runner.query(
                    `SELECT id::text AS id, "projectId"::text AS "projectId", options FROM "chat_conversation" WHERE id = $1::uuid`,
                    [id]
                )
                if (!rows[0]) throw new Error('Conversation not found')
                return rows[0]
            }
        }
    }

    function choose(runner: QueryRunner, mode: 'project' | 'none') {
        const repository = repositoryFor(runner)
        if (mode === 'none') return selectConversationNoProject(repository, conversationId)
        const handler = new ChatConversationBindProjectHandler({ repository } as unknown as ChatConversationService)
        return handler.execute(new ChatConversationBindProjectCommand(conversationId, projectId))
    }

    it('binds when legacy file link columns are varchar and the conversation id is uuid', async () => {
        await expect(choose(queryRunner, 'project')).resolves.toMatchObject({ projectId })
    })

    it('merges personal intent into current options and keeps repeated selections idempotent', async () => {
        await choose(queryRunner, 'none')
        await expect(choose(queryRunner, 'none')).resolves.toMatchObject({
            projectId: null,
            options: { sandboxEnvironmentId: 'keep-environment', projectSelection: { mode: 'none' } }
        })
    })

    it('initializes personal intent when options are null', async () => {
        await queryRunner.query('UPDATE "chat_conversation" SET options = NULL WHERE id = $1', [conversationId])
        await expect(choose(queryRunner, 'none')).resolves.toMatchObject({
            projectId: null,
            options: { projectSelection: { mode: 'none' } }
        })
    })

    it.each(['project', 'none'] as const)(
        'keeps only %s when its transaction wins a concurrent first send',
        async (winner) => {
            const loser = dataSource.createQueryRunner()
            await loser.connect()
            let pending: Promise<unknown> | undefined
            try {
                await loser.query(`SET search_path TO "${schemaName}"`)
                await loser.query("SET lock_timeout TO '10s'")
                const [{ pid: winnerPid }]: Array<{ pid: number }> = await queryRunner.query(
                    'SELECT pg_backend_pid() AS pid'
                )
                const [{ pid: loserPid }]: Array<{ pid: number }> = await loser.query('SELECT pg_backend_pid() AS pid')
                await queryRunner.startTransaction()
                await choose(queryRunner, winner)
                pending = choose(loser, winner === 'project' ? 'none' : 'project').then(
                    (value) => ({ status: 'fulfilled', value }),
                    (error: unknown) => ({ status: 'rejected', error })
                )

                // Confirm actual row-lock contention before committing; no timing-only race assertion.
                let blocked = false
                const deadline = Date.now() + 5000
                while (!blocked && Date.now() < deadline) {
                    const rows: Array<{ blocked: boolean }> = await queryRunner.query(
                        'SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked',
                        [winnerPid, loserPid]
                    )
                    blocked = rows[0].blocked
                    if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10))
                }
                expect(blocked).toBe(true)
                await queryRunner.commitTransaction()
                await expect(pending).resolves.toMatchObject({
                    status: 'rejected',
                    error: expect.any(ForbiddenException)
                })
                const saved = await repositoryFor(queryRunner).findOneByOrFail({ id: conversationId })
                expect(saved.projectId).toBe(winner === 'project' ? projectId : null)
                expect(saved.options).toEqual({
                    sandboxEnvironmentId: 'keep-environment',
                    ...(winner === 'none' ? { projectSelection: { mode: 'none' } } : {})
                })
                // A rejected competitor must not poison subsequent sends/retries in the winning scope.
                await expect(choose(queryRunner, winner)).resolves.toEqual(saved)
            } finally {
                if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction()
                await pending
                await loser.release()
            }
        },
        15000
    )
})
