import 'reflect-metadata'
import { ForbiddenException, Global, INestApplication, Module } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import {
    PermissionsEnum,
    UserType,
    parseAnnouncement,
    parseNotificationSnapshot,
    createAnnouncementSchema
} from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { REDIS_CLIENT, User, UserOrganization } from '@xpert-ai/server-core'
import { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from 'redis'
import { DataSource, EntitySchema } from 'typeorm'
import {
    AnnouncementEntity,
    AnnouncementDismissal,
    NotificationOutbox,
    USER_NOTIFICATION_ENTITIES,
    UserNotificationEntity
} from './notification.entities'
import { UserNotificationModule } from './notification.module'
import { NotificationWorker } from './notification.worker'
import { NotificationRealtime } from './notification.realtime'
import { enqueueNotification } from './notification.outbox'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { XpertTask } from '../xpert-task/xpert-task.entity'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from '../xpert-task/scheduled-task-execution.entity'
import { TypeOrmScheduledTaskExecutionStore } from '../xpert-task/scheduled-task-execution.coordinator'

const integration = process.env.NOTIFICATIONS_PG_URL && process.env.NOTIFICATIONS_REDIS_URL ? describe : describe.skip
const tenant = randomUUID(),
    otherTenant = randomUUID(),
    user = randomUUID(),
    otherUser = randomUUID(),
    organization = randomUUID()
const schema = `notification_test_${randomUUID().replace(/-/g, '')}`
@Global()
@Module({})
class TestDatabaseModule {}
const input = () =>
    createAnnouncementSchema.parse({
        title: 'Maintenance',
        body: '# Scheduled work\nService resumes shortly.',
        clients: ['web', 'desktop'],
        startsAt: new Date(Date.now() - 1000).toISOString()
    })

integration('Notification HTTP, PostgreSQL and two-instance Redis integration', () => {
    let db: DataSource
    const apps: INestApplication[] = [],
        clients: ReturnType<typeof createClient>[] = []
    let origins: string[]
    let denied = false
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            url: process.env.NOTIFICATIONS_PG_URL,
            schema,
            installExtensions: false,
            extra: { options: `-c search_path=${schema},public`, statement_timeout: 10000 },
            entities: [
                ...USER_NOTIFICATION_ENTITIES,
                new EntitySchema<User>({
                    name: User.name,
                    target: User,
                    tableName: 'user',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        type: { type: 'varchar' },
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true }
                    }
                }),
                new EntitySchema<UserOrganization>({
                    name: UserOrganization.name,
                    target: UserOrganization,
                    tableName: 'user_organization',
                    columns: {
                        id: { type: 'uuid', primary: true, generated: 'uuid' },
                        tenantId: { type: 'uuid' },
                        userId: { type: 'uuid' },
                        organizationId: { type: 'uuid' },
                        isActive: { type: 'boolean' }
                    }
                }),
                new EntitySchema<ChatConversation>({
                    name: ChatConversation.name,
                    target: ChatConversation,
                    tableName: 'chat_conversation',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid', nullable: true },
                        createdById: { type: 'uuid' },
                        xpertId: { type: 'uuid' },
                        threadId: { type: 'uuid' },
                        status: { type: 'varchar' }
                    }
                }),
                new EntitySchema<XpertTask>({
                    name: XpertTask.name,
                    target: XpertTask,
                    tableName: 'xpert_task',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid', nullable: true },
                        projectId: { type: 'uuid', nullable: true },
                        runAsUserId: { type: 'uuid' },
                        xpertId: { type: 'uuid' }
                    }
                }),
                new EntitySchema<ScheduledTaskExecution>({
                    name: ScheduledTaskExecution.name,
                    target: ScheduledTaskExecution,
                    tableName: 'xpert_task_execution',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        taskId: { type: 'uuid' },
                        conversationId: { type: 'uuid', nullable: true },
                        ownerId: { type: 'varchar' },
                        status: { type: 'varchar' }
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        // Fixture-only identity/domain tables; notification tables use the production SQL migration.
        await db.query(`CREATE TABLE tenant (id uuid PRIMARY KEY); CREATE TABLE "user" (id uuid PRIMARY KEY, "tenantId" uuid NOT NULL, type varchar NOT NULL, "deletedAt" timestamptz); CREATE TABLE role (id uuid PRIMARY KEY, "tenantId" uuid, name varchar); CREATE TABLE role_permission (id uuid PRIMARY KEY, "createdAt" timestamptz, "updatedAt" timestamptz, "tenantId" uuid, "roleId" uuid, permission varchar, enabled boolean);
            CREATE TABLE user_organization (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid, "userId" uuid, "organizationId" uuid, "isActive" boolean);
            CREATE TABLE chat_conversation (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "createdById" uuid, "xpertId" uuid, "threadId" uuid, status varchar);
            CREATE TABLE xpert_task (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "projectId" uuid, "runAsUserId" uuid, "xpertId" uuid);
            CREATE TABLE xpert_task_execution (id uuid PRIMARY KEY, "tenantId" uuid, "taskId" uuid, "conversationId" uuid, "ownerId" varchar, status varchar)`)
        await db.query('INSERT INTO tenant VALUES ($1),($2)', [tenant, otherTenant])
        await db.query('INSERT INTO "user" (id,"tenantId",type) VALUES ($1,$2,$5),($3,$4,$5)', [
            user,
            tenant,
            otherUser,
            otherTenant,
            UserType.USER
        ])
        await db.query('INSERT INTO role VALUES ($1,$2,$3)', [randomUUID(), tenant, 'SUPER_ADMIN'])
        const migration = readFileSync(join(__dirname, 'migrations/20261031010000-user-notifications.sql'), 'utf8')
        await db.query(migration)
        await db.query(migration)
        for (let i = 0; i < 2; i++) {
            const redis = createClient({ url: process.env.NOTIFICATIONS_REDIS_URL })
            await redis.connect()
            clients.push(redis)
            const module = await Test.createTestingModule({
                imports: [
                    {
                        module: TestDatabaseModule,
                        global: true,
                        providers: [{ provide: DataSource, useValue: db }],
                        exports: [DataSource]
                    },
                    UserNotificationModule
                ]
            })
                .overrideProvider(REDIS_CLIENT)
                .useValue(redis)
                .compile()
            const app = module.createNestApplication({ logger: false })
            apps.push(app)
            // Authentication is the fixture boundary. Permission checks, tenant filtering, pipes and real modules run normally.
            app.use((req: Request, res: Response, next: NextFunction) => {
                const token = req.headers.authorization?.replace('Bearer ', '')
                if (!['admin', 'member', 'other', 'communication', 'client-secret'].includes(token)) {
                    res.sendStatus(401)
                    return
                }
                const isOther = token === 'other'
                Object.assign(req, {
                    user: {
                        id: isOther ? otherUser : user,
                        tenantId: isOther ? otherTenant : tenant,
                        type: token === 'communication' ? UserType.COMMUNICATION : UserType.USER,
                        ...(token === 'client-secret' ? { principalType: 'client_secret' } : {}),
                        role: {
                            name: 'USER',
                            rolePermissions:
                                token === 'admin'
                                    ? [{ permission: PermissionsEnum.ANNOUNCEMENT_MANAGE, enabled: true }]
                                    : []
                        }
                    }
                })
                next()
            })
            const context = new RequestContextMiddleware()
            app.use(context.use.bind(context))
            jest.spyOn(module.get(QueryBus), 'execute').mockImplementation(
                async (query: AssertChatConversationAccessQuery) => {
                    const row = await db.getRepository(ChatConversation).findOneBy(query.where)
                    if (denied || !row) throw new ForbiddenException()
                    return row
                }
            )
            app.setGlobalPrefix('api')
            await app.listen(0, '127.0.0.1')
            module.get(NotificationWorker).onModuleDestroy() // Tests explicitly drive claims and failure windows.
        }
        origins = await Promise.all(apps.map((app) => app.getUrl()))
    }, 60000)
    afterAll(async () => {
        for (const app of apps) await app.close()
        for (const client of clients) if (client.isOpen) await client.disconnect()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        denied = false
        await db.query(
            'TRUNCATE announcement, announcement_dismissal, announcement_audit, user_notification, notification_outbox, chat_conversation, xpert_task, xpert_task_execution, user_organization CASCADE'
        )
    })
    const request = (path: string, token = 'admin', body?: object, method = body ? 'POST' : 'GET', instance = 0) =>
        fetch(`${origins[instance]}/api/${path}`, {
            method,
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        })
    const publish = async (content = input()) => {
        const created = await request('announcement-admin', 'admin', content)
        expect(created.status).toBe(201)
        const draft = parseAnnouncement(await created.json())
        const response = await request(`announcement-admin/${draft.id}/publish`, 'admin', { revision: draft.revision })
        expect(response.status).toBe(201)
        return parseAnnouncement(await response.json())
    }
    it('validates HTTP bodies, query conversion, credentials, permission and migration adoption', async () => {
        expect(
            await db.query(
                readFileSync(join(__dirname, 'migrations/checks/20261031010000-user-notifications.sql'), 'utf8')
            )
        ).toEqual([])
        expect(
            (
                await db.query(
                    "SELECT count(*)::int AS count FROM role_permission WHERE permission='ANNOUNCEMENT_MANAGE'"
                )
            )[0].count
        ).toBe(1)
        for (const body of [
            { ...input(), tenantId: otherTenant },
            { ...input(), clients: ['lark'] },
            { ...input(), expiresAt: '2020-01-01T00:00:00Z' },
            { ...input(), action: { type: 'link', label: 'Bad', url: 'javascript:alert(1)' } }
        ]) {
            const response = await request('announcement-admin', 'admin', body)
            expect(response.status).toBe(400)
            expect(await response.json()).toMatchObject({ code: 'NOTIFICATION_INVALID' })
        }
        expect((await request('announcement-admin', 'member', input())).status).toBe(403)
        expect((await request('announcements/pending?client=web', 'communication')).status).toBe(403)
        expect((await request('announcements/pending?client=web', 'client-secret')).status).toBe(403)
        expect((await request('announcements/history?client=web&limit=2&offset=0')).status).toBe(200)
        expect((await request('announcements/history?client=web&userId=bad')).status).toBe(400)
        expect((await request('announcements/history?client=web&limit=0')).status).toBe(400)
        const draft = parseAnnouncement(await (await request('announcement-admin', 'admin', input())).json())
        expect((await request(`announcements/${draft.id}?client=web`, 'member')).status).toBe(404)
    })
    it('dismisses once across clients, preserves history and suppresses edits but allows new IDs', async () => {
        const item = await publish()
        expect((await request(`announcements/${item.id}?client=web`, 'other')).status).toBe(404)
        expect((await request(`announcements/${item.id}/dismissal`, 'other', {}, 'PUT')).status).toBe(404)
        await Promise.all([0, 1].map((i) => request(`announcements/${item.id}/dismissal`, 'member', {}, 'PUT', i)))
        expect(await db.getRepository(AnnouncementDismissal).count()).toBe(1)
        const before = parseNotificationSnapshot(
            await (await request('user-notifications/sync?client=desktop', 'member')).json()
        )
        expect(before.announcements).toHaveLength(0)
        await request(
            `announcement-admin/${item.id}`,
            'admin',
            { ...input(), title: 'Edited', revision: item.revision },
            'PATCH'
        )
        const after = parseNotificationSnapshot(
            await (await request('user-notifications/sync?client=web', 'member')).json()
        )
        expect(after.announcements).toHaveLength(0)
        expect((await (await request('announcements/history?client=desktop', 'member')).json()).items).toHaveLength(1)
        await publish()
        expect(
            parseNotificationSnapshot(await (await request('user-notifications/sync?client=web', 'member')).json())
                .announcements
        ).toHaveLength(1)
    })
    it('rejects concurrent edits and retargeting, and removes withdrawn/expired rows from pending', async () => {
        const item = await publish()
        const edits = await Promise.all(
            [1, 2].map((n) =>
                request(
                    `announcement-admin/${item.id}`,
                    'admin',
                    { ...input(), title: `Edit ${n}`, revision: item.revision },
                    'PATCH'
                )
            )
        )
        expect(edits.map((r) => r.status).sort()).toEqual([200, 409])
        expect(
            (
                await request(
                    `announcement-admin/${item.id}`,
                    'admin',
                    { ...input(), clients: ['web'], revision: item.revision + 1 },
                    'PATCH'
                )
            ).status
        ).toBe(409)
        await request(`announcement-admin/${item.id}/withdraw`, 'admin', { revision: item.revision + 1 })
        expect((await (await request('announcements/history?client=web', 'member')).json()).items).toHaveLength(0)
        const expired = await publish({ ...input(), expiresAt: new Date(Date.now() + 10000).toISOString() })
        await db
            .getRepository(AnnouncementEntity)
            .update(expired.id, { startsAt: new Date(Date.now() - 20000), expiresAt: new Date(Date.now() - 1000) })
        expect(
            parseNotificationSnapshot(await (await request('user-notifications/sync?client=web', 'member')).json())
                .announcements
        ).toHaveLength(0)
        expect((await (await request('announcements/history?client=web', 'member')).json()).items).toHaveLength(1)
    })
    it('skips obsolete schedules, activates current schedules, and rolls back business/outbox together', async () => {
        const future = await publish({ ...input(), startsAt: new Date(Date.now() + 60000).toISOString() })
        expect(
            parseNotificationSnapshot(await (await request('user-notifications/sync?client=web', 'member')).json())
                .announcements
        ).toHaveLength(0)
        await request(`announcement-admin/${future.id}/withdraw`, 'admin', { revision: future.revision })
        const spy = jest.spyOn(apps[0].get(NotificationRealtime), 'publish')
        await db.query('UPDATE notification_outbox SET "availableAt"=now()')
        await apps[0].get(NotificationWorker).tick()
        expect(spy).toHaveBeenCalledTimes(2) // Immediate publication/withdrawal only; obsolete timer is acknowledged.
        spy.mockRestore()
        await expect(
            db.transaction(async (manager) => {
                await enqueueNotification(manager, tenant, user, 'rolled-back', { type: 'changed' })
                throw new Error('rollback')
            })
        ).rejects.toThrow('rollback')
        expect(await db.getRepository(NotificationOutbox).countBy({ eventKey: 'rolled-back' })).toBe(0)
    })
    const completion = async (finish = true) => {
        const taskId = randomUUID(),
            executionId = randomUUID(),
            assistantId = randomUUID(),
            conversationId = randomUUID()
        await db.getRepository(XpertTask).insert({
            id: taskId,
            tenantId: tenant,
            organizationId: organization,
            runAsUserId: user,
            xpertId: assistantId
        })
        await db
            .getRepository(UserOrganization)
            .insert({ tenantId: tenant, organizationId: organization, userId: user, isActive: true })
        await db.getRepository(ChatConversation).insert({
            id: conversationId,
            tenantId: tenant,
            organizationId: organization,
            createdById: user,
            xpertId: assistantId,
            threadId: randomUUID(),
            status: 'idle'
        })
        await db.getRepository(ScheduledTaskExecution).insert({
            id: executionId,
            tenantId: tenant,
            taskId,
            conversationId,
            status: ScheduledTaskExecutionStatus.RUNNING,
            ownerId: 'owner'
        })
        const store = new TypeOrmScheduledTaskExecutionStore(db.getRepository(ScheduledTaskExecution))
        if (finish) {
            expect(
                await store.updateOwned(executionId, 'owner', ScheduledTaskExecutionStatus.RUNNING, {
                    status: ScheduledTaskExecutionStatus.SUCCEEDED
                })
            ).toBe(true)
            expect(
                await store.updateOwned(executionId, 'owner', ScheduledTaskExecutionStatus.RUNNING, {
                    status: ScheduledTaskExecutionStatus.SUCCEEDED
                })
            ).toBe(false)
        }
        return { taskId, executionId, assistantId, conversationId }
    }
    it('keeps task completion and outbox atomic on insert failure; terminal failures never notify', async () => {
        const { executionId } = await completion(false)
        const store = new TypeOrmScheduledTaskExecutionStore(db.getRepository(ScheduledTaskExecution))
        await db.query(
            `CREATE FUNCTION reject_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER reject_notification BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION reject_notification()`
        )
        try {
            await expect(
                store.updateOwned(executionId, 'owner', ScheduledTaskExecutionStatus.RUNNING, {
                    status: ScheduledTaskExecutionStatus.SUCCEEDED
                })
            ).rejects.toThrow('test failure')
            expect((await db.getRepository(ScheduledTaskExecution).findOneByOrFail({ id: executionId })).status).toBe(
                ScheduledTaskExecutionStatus.RUNNING
            )
            expect(await db.getRepository(NotificationOutbox).count()).toBe(0)
        } finally {
            await db.query(
                'DROP TRIGGER reject_notification ON notification_outbox; DROP FUNCTION reject_notification()'
            )
        }
        await store.updateOwned(executionId, 'owner', ScheduledTaskExecutionStatus.RUNNING, {
            status: ScheduledTaskExecutionStatus.FAILED
        })
        expect(await db.getRepository(NotificationOutbox).count()).toBe(0)
    })
    it('bounds connections while serving notifications and draining the outbox by default', async () => {
        const r = apps[0].get(NotificationRealtime)
        const deferred = r.stream({ tenantId: tenant, userId: user })
        const subscriptions = Array.from({ length: 8 }, () => r.stream({ tenantId: tenant, userId: user }).subscribe())
        try {
            expect(() => r.stream({ tenantId: tenant, userId: user })).toThrow()
            const rejected = jest.fn()
            deferred.subscribe({ error: rejected })
            expect(rejected).toHaveBeenCalledTimes(1)
            expect(r.activeConnections(tenant)).toBe(8)
        } finally {
            subscriptions.forEach((subscription) => subscription.unsubscribe())
        }
        const item = await publish()
        expect((await request('user-notifications/sync?client=web', 'member')).status).toBe(200)
        expect(await db.getRepository(AnnouncementEntity).countBy({ id: item.id })).toBe(1)
        await apps[0].get(NotificationWorker).tick()
        expect(await db.getRepository(NotificationOutbox).countBy({ state: 'sent' })).toBe(1)
    })
    it('projects one scheduled completion with concurrent workers and replays after broadcast failure', async () => {
        await completion()
        const realtime = apps[0].get(NotificationRealtime),
            worker = apps[0].get(NotificationWorker)
        const failure = jest.spyOn(realtime, 'publish').mockRejectedValueOnce(new Error('redis unavailable'))
        await worker.tick()
        expect(await db.getRepository(UserNotificationEntity).count()).toBe(1)
        expect(await db.getRepository(NotificationOutbox).countBy({ state: 'pending' })).toBe(1)
        failure.mockRestore()
        await db.query(
            'UPDATE notification_outbox SET "availableAt"=now(), "leaseUntil"=now()-interval \'1 minute\', "leaseId"=gen_random_uuid()'
        )
        await Promise.all(apps.map((app) => app.get(NotificationWorker).tick()))
        expect(await db.getRepository(UserNotificationEntity).count()).toBe(1)
        expect(await db.getRepository(NotificationOutbox).countBy({ state: 'sent' })).toBe(1)
        const value = parseNotificationSnapshot(
            await (await request('user-notifications/sync?client=web', 'member')).json()
        )
        expect(value.notifications).toHaveLength(1)
        expect((await request(`user-notifications/${value.notifications[0].id}/read`, 'other', {}, 'PUT')).status).toBe(
            404
        )
        expect(
            (await request(`user-notifications/${value.notifications[0].id}/read`, 'member', {}, 'PUT')).status
        ).toBe(200)
        expect(
            parseNotificationSnapshot(await (await request('user-notifications/sync?client=desktop', 'member')).json())
                .notifications[0].readAt
        ).not.toBeNull()
        await db.getRepository(UserOrganization).update({ userId: user }, { isActive: false })
        expect(
            parseNotificationSnapshot(await (await request('user-notifications/sync?client=web', 'member')).json())
                .notifications
        ).toHaveLength(0)
    })
    it('rechecks source authorization and keeps denied notification IDs opaque', async () => {
        await completion()
        await apps[0].get(NotificationWorker).tick()
        const row = await db.getRepository(UserNotificationEntity).findOneByOrFail({ userId: user })
        denied = true
        expect((await request(`user-notifications/${row.id}/read`, 'member', {}, 'PUT')).status).toBe(404)
        expect(
            parseNotificationSnapshot(await (await request('user-notifications/sync?client=web', 'member')).json())
                .notifications
        ).toHaveLength(0)
    })
    it('serves an authenticated SSE hint without business content and repairs a missed subscription window', async () => {
        const controller = new AbortController()
        const response = await fetch(`${origins[1]}/api/user-notifications/stream`, {
            headers: { authorization: 'Bearer member' },
            signal: controller.signal
        })
        try {
            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).toContain('text/event-stream')
            expect(response.headers.get('x-accel-buffering')).toBe('no')
            const reader = response.body.getReader()
            const frame = new TextDecoder().decode((await reader.read()).value)
            expect(frame).toContain('sync.required')
            expect(frame).not.toContain(tenant)
            expect(frame).not.toContain(user)
            await reader.cancel()
            await publish()
            const snapshot = parseNotificationSnapshot(
                await (await request('user-notifications/sync?client=desktop', 'member', undefined, 'GET', 1)).json()
            )
            expect(snapshot.announcements).toHaveLength(1)
        } finally {
            controller.abort()
        }
    })
    it('broadcasts across API instances, filters recipients, and serves a complete reconnect snapshot', async () => {
        const received: string[] = [],
            other: string[] = []
        const r = apps[1].get(NotificationRealtime)
        const subscription = r.stream({ tenantId: tenant, userId: user }).subscribe((event) => {
            if (event.data.type === 'sync.required') received.push(event.data.eventId)
        })
        const otherSubscription = r.stream({ tenantId: otherTenant, userId: otherUser }).subscribe((event) => {
            if (event.data.type === 'sync.required') other.push(event.data.eventId)
        })
        try {
            await publish()
            await apps[0].get(NotificationWorker).tick()
            await new Promise((resolve) => setTimeout(resolve, 400))
            expect(received.length).toBe(2)
            expect(other.length).toBe(1)
            const recovered = parseNotificationSnapshot(
                await (await request('user-notifications/sync?client=desktop', 'member', undefined, 'GET', 1)).json()
            )
            expect(recovered.announcements).toHaveLength(1)
        } finally {
            subscription.unsubscribe()
            otherSubscription.unsubscribe()
        }
    })
})
