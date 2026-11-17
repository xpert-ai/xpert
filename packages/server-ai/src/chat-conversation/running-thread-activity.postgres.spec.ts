import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import { DataSource, QueryRunner } from 'typeorm'
import type { ChatConversation } from './conversation.entity'
import { runningThreadActivity } from './running-thread-activity'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('desktop running threads / PostgreSQL', () => {
    let db: DataSource, runner: QueryRunner
    const tenant = randomUUID(),
        org = randomUUID(),
        owner = randomUUID(),
        assistant = randomUUID(),
        project = randomUUID()
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        db = await new DataSource({ type: 'postgres', url }).initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        await runner.query(`CREATE TEMP TABLE chat_conversation (
            id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "createdById" uuid, "xpertId" uuid, "projectId" uuid,
            "threadId" text, title text, status text, purpose text, "updatedAt" timestamptz DEFAULT now());
            CREATE TEMP TABLE chat_conversation_thread ("conversationId" uuid, "tenantId" uuid, "organizationId" uuid,
            "threadId" text UNIQUE, metadata jsonb, status text, "updatedAt" timestamptz DEFAULT now())`)
    })
    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })

    it('returns only accessible running threads, including branches and roots without a thread row', async () => {
        const root = randomUUID()
        await runner.query(
            `INSERT INTO pg_temp.chat_conversation
            (id,"tenantId","organizationId","createdById","xpertId","projectId","threadId",title,status,purpose)
            VALUES ($1,$2,$3,$4,$5,NULL,'root','Quote A','busy','private'),
                   (gen_random_uuid(),$2,$3,$4,$5,NULL,'legacy','Quote B','busy','private'),
                   (gen_random_uuid(),$2,$3,$4,$5,$6,'project','Quote C','pausing','private'),
                   (gen_random_uuid(),$2,$3,$4,$5,$6,'project-2','Quote D','busy','private'),
                   (gen_random_uuid(),$2,$3,$4,$5,NULL,'cooldown','Paused','paused','private'),
                   (gen_random_uuid(),$2,$3,gen_random_uuid(),$5,NULL,'foreign','Private','busy','private'),
                   (gen_random_uuid(),$2,gen_random_uuid(),$4,$5,NULL,'other-org','Private','busy','private'),
                   (gen_random_uuid(),gen_random_uuid(),$3,$4,$5,NULL,'other-tenant','Private','busy','private'),
                   (gen_random_uuid(),$2,$3,$4,$5,NULL,'group','Group','busy','group')`,
            [root, tenant, org, owner, assistant, project]
        )
        await runner.query(
            `INSERT INTO pg_temp.chat_conversation_thread
            ("conversationId","tenantId","organizationId","threadId",metadata,status) VALUES
            ($1,$2,$3,'root','{}','idle'), ($1,$2,$3,'branch','{"title":"Supplier B"}','pausing'),
            ($1,$2,gen_random_uuid(),'bad-scope','{}','busy')`,
            [root, tenant, org]
        )
        const projects = { assertCanRead: jest.fn() }
        const read = () =>
            runningThreadActivity(
                runner.manager.getRepository<ChatConversation>('chat_conversation'),
                projects,
                tenant,
                org,
                owner,
                [assistant]
            )
        projects.assertCanRead.mockResolvedValue({})
        expect(
            (await read())
                .get(assistant)
                ?.map((r) => r.threadId)
                .sort()
        ).toEqual(['branch', 'legacy', 'project', 'project-2'])
        expect(projects.assertCanRead).toHaveBeenCalledTimes(1)
        projects.assertCanRead.mockRejectedValue(new ForbiddenException())
        expect((await read()).get(assistant)).toEqual([
            { threadId: 'branch', title: 'Supplier B' },
            { threadId: 'legacy', title: 'Quote B' }
        ])
        projects.assertCanRead.mockRejectedValue(new Error('unavailable'))
        await expect(read()).rejects.toThrow('unavailable')
    })
})
