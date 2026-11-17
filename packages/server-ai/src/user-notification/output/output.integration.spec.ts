import 'reflect-metadata'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { ForbiddenException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { parseOpenConversationAction } from '@xpert-ai/contracts'
import {
    ChatChannelRegistry,
    RequestContextMiddleware,
    type RuntimeCapabilityRegistry,
    WorkbenchDecisionCapability,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
import { withPluginViewAction } from '../../../../server/src/view-extension/view-action-scope'
import { WorkbenchDecisionService } from '../../agent-event/workbench-decision.service'
import { RuntimeCapabilityModule } from '../../shared/runtime/runtime-capability.module'
import { PrivateDecisionRouter } from './private-decision-router'
import { digest } from './output-store'
import { ExternalIdentityBinding, IntegrationService } from '@xpert-ai/server-core'
import { AnnouncementService } from '../../announcement/announcement.service'
import { UserNotificationService } from '../notification.service'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Test, type TestingModule } from '@nestjs/testing'
import { DataSource, EntitySchema } from 'typeorm'
import type { AgentOutputReference, AgentOutputSource } from '@xpert-ai/plugin-sdk'
import { AgentEventBinding } from '../../agent-event/agent-event.entity'
import { AgentEventSources, sourceContext } from '../../agent-event/agent-event.runtime'
import { EventBindingAccessService } from '../../agent-event/event-binding-access.service'
import { RuntimeMessageAccessService } from '../../handoff/runtime-messaging/runtime-message-access.service'
import {
    AgentOutputDelivery,
    AgentOutputMember,
    AgentOutputMessage,
    AgentOutputPreference,
    NotificationOutbox,
    USER_NOTIFICATION_ENTITIES,
    UserNotificationEntity
} from '../notification.entities'
import { OutputDispatch } from './output-dispatch'
import { OutputPreferences, verifiedLarkRecipient } from './output-preferences'
import { OutputStore, quietUntil } from './output-store'

test('quiet hours end on the local clock across both DST changes', () => {
    const quiet = { zone: 'America/New_York', start: '22:00', end: '07:00' }
    expect(quietUntil(new Date('2026-03-08T04:30:00Z'), quiet)?.toISOString()).toBe('2026-03-08T11:00:00.000Z')
    expect(quietUntil(new Date('2026-11-01T03:30:00Z'), quiet)?.toISOString()).toBe('2026-11-01T12:00:00.000Z')
    expect(quietUntil(new Date('2026-11-01T12:00:00Z'), quiet)).toBeNull()
})

test('confirmed OAuth identity is usable only for the same Feishu application and subject', () => {
    const binding = { subjectId: 'union-1', profile: { unionId: 'union-1', appId: 'app-1', openId: 'open-1' } }
    expect(verifiedLarkRecipient(binding, 'app-1')).toEqual({ appId: 'app-1', recipient: 'open-1' })
    expect(verifiedLarkRecipient(binding, 'app-2')).toBeNull()
    expect(verifiedLarkRecipient({ ...binding, subjectId: 'union-2' }, 'app-1')).toBeNull()
})

const integration = process.env.NOTIFICATIONS_PG_URL ? describe : describe.skip
integration('agent output with separate PostgreSQL transactions and worker leases', () => {
    const schema = 'agent_output_test_' + randomUUID().replace(/-/g, '')
    const scope = { tenantId: randomUUID(), userId: randomUUID(), organizationId: randomUUID() }
    let mod: TestingModule
    let db: DataSource, dispatch: OutputDispatch, binding: AgentEventBinding, store: OutputStore
    const kind = 'fixture.output',
        quietKind = 'fixture.quiet'
    const send = jest.fn(async () => ({ status: 'accepted', messageId: 'channel-message' }))
    const target = jest.fn(async () => ({ fingerprint: 'verified', send }))
    let notifications: UserNotificationService,
        preferences: OutputPreferences,
        router: PrivateDecisionRouter,
        capabilities: RuntimeCapabilityRegistry
    const conversationAction = jest.fn(async (b: AgentEventBinding, conversationId: string, threadId?: string) =>
        parseOpenConversationAction({ type: 'open_conversation', assistantId: b.xpertId, conversationId, threadId })
    )
    const denied = new Set<string>()
    let pending: AgentOutputReference[] = []
    const source: AgentOutputSource = {
        kinds: [kind, quietKind].map((key) => ({ key, label: { en_US: 'Output', zh_Hans: '输出' } })),
        listPending: async () => pending,
        acknowledge: async () => {},
        defer: async () => {},
        resolveForRecipient: async (_, ref) =>
            denied.has(ref.key) ? { status: 'forbidden' } : { status: 'visible', title: ref.key }
    }
    const reference = (): AgentOutputReference => ({
        schemaVersion: 1,
        kind,
        key: randomUUID(),
        revision: '1',
        publishedAt: new Date().toISOString(),
        recipientId: scope.userId
    })
    beforeAll(async () => {
        db = await new DataSource({
            type: 'postgres',
            url: process.env.NOTIFICATIONS_PG_URL,
            schema,
            extra: { options: '-c search_path=' + schema + ',public' },
            entities: [
                ...USER_NOTIFICATION_ENTITIES,
                new EntitySchema<ExternalIdentityBinding>({
                    name: 'ExternalIdentityBinding',
                    target: ExternalIdentityBinding,
                    tableName: 'external_identity_binding',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        userId: { type: 'uuid' },
                        provider: { type: 'varchar' },
                        subjectId: { type: 'varchar' }
                    }
                }),
                new EntitySchema<AgentEventBinding>({
                    target: AgentEventBinding,
                    name: 'AgentEventBinding',
                    tableName: 'agent_event_binding',
                    columns: {
                        id: { primary: true, type: 'uuid' },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid' },
                        userId: { type: 'uuid' },
                        workspaceId: { type: 'uuid' },
                        xpertId: { type: 'uuid' },
                        plugin: { type: 'varchar' },
                        adapter: { type: 'varchar' },
                        capture: { type: 'boolean', default: true },
                        projectId: { type: 'uuid', nullable: true },
                        sourceBindingRef: { type: 'varchar' },
                        revision: { type: 'int' },
                        state: { type: 'varchar' }
                    }
                })
            ]
        }).initialize()
        await db.query('CREATE SCHEMA "' + schema + '"')
        await db.query(
            'CREATE TABLE tenant (id uuid PRIMARY KEY); CREATE TABLE "user"(id uuid PRIMARY KEY); CREATE TABLE agent_event_binding(id uuid PRIMARY KEY,"tenantId" uuid,"organizationId" uuid,"userId" uuid,"workspaceId" uuid,"xpertId" uuid,"projectId" uuid,capture boolean default true,plugin varchar,adapter varchar,"sourceBindingRef" varchar,revision integer,state varchar)'
        )
        await db.query(`CREATE TABLE role (id uuid PRIMARY KEY, "tenantId" uuid, name varchar);
            CREATE TABLE role_permission (id uuid PRIMARY KEY, "createdAt" timestamptz, "updatedAt" timestamptz,
                "tenantId" uuid, "roleId" uuid, permission varchar, enabled boolean)`)
        await db.query(
            'CREATE TABLE external_identity_binding (id uuid PRIMARY KEY,"tenantId" uuid,"userId" uuid,provider varchar,"subjectId" varchar)'
        )
        for (const migration of [
            '20261031010000-user-notifications',
            '20261116090000-agent-output',
            '20261117090000-private-decisions'
        ]) {
            await db.query(readFileSync(join(__dirname, '../migrations', migration + '.sql'), 'utf8'))
        }
        await db.query('INSERT INTO tenant VALUES ($1)', [scope.tenantId])
        await db.query('INSERT INTO "user" VALUES ($1)', [scope.userId])
        binding = await db.manager.save(AgentEventBinding, {
            ...scope,
            id: randomUUID(),
            workspaceId: randomUUID(),
            xpertId: randomUUID(),
            state: 'enabled',
            revision: 1,
            sourceBindingRef: randomUUID(),
            adapter: 'fixture',
            plugin: 'fixture'
        })
        mod = await Test.createTestingModule({
            imports: [RuntimeCapabilityModule],
            providers: [
                OutputDispatch,
                PrivateDecisionRouter,
                WorkbenchDecisionService,
                OutputStore,
                UserNotificationService,
                { provide: 'preferenceEditor', useClass: OutputPreferences },
                {
                    provide: AnnouncementService,
                    useValue: { list: async () => ({ items: [{ title: 'Maintenance' }], total: 1 }) }
                },
                { provide: QueryBus, useValue: {} },
                { provide: IntegrationService, useValue: {} },
                { provide: ChatChannelRegistry, useValue: {} },
                { provide: DataSource, useValue: db },
                { provide: AgentEventSources, useValue: { resolve: () => ({ outputs: source }) } },
                {
                    provide: EventBindingAccessService,
                    useValue: { assertAccessible: async () => {}, conversationAction }
                },
                {
                    provide: RuntimeMessageAccessService,
                    useValue: { withControlActor: (_: unknown, work: () => Promise<unknown>) => work() }
                },
                { provide: OutputPreferences, useValue: { target } }
            ]
        }).compile()
        await mod.init()
        dispatch = mod.get(OutputDispatch)
        router = mod.get(PrivateDecisionRouter)
        capabilities = mod.get(XPERT_RUNTIME_CAPABILITIES_TOKEN)
        store = mod.get(OutputStore)
        notifications = mod.get(UserNotificationService)
        preferences = mod.get('preferenceEditor')
    })
    function asRecipient<T>(work: () => Promise<T>) {
        const req = Object.assign(new IncomingMessage(new Socket()), {
            user: { id: scope.userId, tenantId: scope.tenantId }
        })
        req.headers['organization-id'] = scope.organizationId
        return new Promise<T>((resolve, reject) =>
            new RequestContextMiddleware().use(req, new ServerResponse(req), () => work().then(resolve, reject))
        )
    }

    afterAll(async () => {
        await mod?.close()
        if (db?.isInitialized) {
            await db.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE')
            await db.destroy()
        }
    })
    it('checks private decision columns and detects an incorrectly rebuilt message index', async () => {
        const check = readFileSync(join(__dirname, '../migrations/checks/20261117090000-private-decisions.sql'), 'utf8')
        const runner = db.createQueryRunner()
        await runner.startTransaction()
        try {
            expect(await runner.query(check)).toEqual([])
            await runner.query('DROP INDEX uq_agent_output_decision_message')
            await runner.query(`CREATE UNIQUE INDEX uq_agent_output_decision_message ON agent_output_delivery
                ("tenantId","organizationId","decisionIntegrationId","decisionAppId","providerMessageId")`)
            expect(await runner.query(check)).toEqual([{ missing: 'uq_agent_output_decision_message' }])
            await runner.query('ALTER TABLE agent_output_delivery ALTER COLUMN "decisionRoute" TYPE json')
            await runner.query('ALTER TABLE agent_output_delivery DROP COLUMN "decisionChatDigest"')
            await runner.query('ALTER TABLE agent_output_delivery ALTER COLUMN "decisionAppId" SET NOT NULL')
            await runner.query('DROP INDEX uq_agent_output_decision_message')
            await runner.query(
                'CREATE UNIQUE INDEX uq_agent_output_decision_message ON agent_output_delivery ("providerMessageId")'
            )
            expect((await runner.query(check)).map((r: { missing: string }) => r.missing).sort()).toEqual([
                'decisionAppId',
                'decisionChatDigest',
                'decisionRoute',
                'uq_agent_output_decision_message'
            ])
        } finally {
            await runner.rollbackTransaction()
            await runner.release()
        }
    })
    const collect = () => store.collect(binding, sourceContext(binding, new AbortController().signal), source)
    async function lease(deliveryId: string) {
        const q = await db.manager.findOneByOrFail(NotificationOutbox, { eventKey: 'output:' + deliveryId })
        q.leaseId = randomUUID()
        return db.manager.save(q)
    }
    it('collapses concurrent handoffs, freezes the authorized members of a quiet-hours summary, and filters subsequent reads', async () => {
        const now = new Date()
        const time = (minutes: number) => new Date(now.getTime() + minutes * 60000).toISOString().slice(11, 16)
        const preference = await db.manager.save(AgentOutputPreference, {
            ...scope,
            kind,
            channel: 'in_app',
            enabled: true,
            enabledSince: new Date(0),
            revision: 1,
            quiet: { zone: 'UTC', start: time(-10), end: time(10) }
        })
        pending = [reference(), reference(), reference()]
        await Promise.all([collect(), collect()])
        expect(await db.manager.countBy(AgentOutputMessage, scope)).toBe(3)
        const d = await db.manager.findOneByOrFail(AgentOutputDelivery, { ...scope, channel: 'in_app' })
        expect(await db.manager.countBy(AgentOutputMember, { deliveryId: d.id })).toBe(3)
        const q = await lease(d.id)
        expect(await dispatch.dispatch(q, d.id)).toBe('deferred')
        expect(
            await db.manager.countBy(UserNotificationEntity, { tenantId: scope.tenantId, userId: scope.userId })
        ).toBe(0)
        await db.manager.update(AgentOutputPreference, preference.id, { quiet: null })
        denied.add(pending[0].key)
        const next = await lease(d.id)
        await Promise.all([dispatch.dispatch(next, d.id), dispatch.dispatch(next, d.id)])
        expect(
            await db.manager.countBy(UserNotificationEntity, { tenantId: scope.tenantId, userId: scope.userId })
        ).toBe(1)
        expect((await dispatch.view(d.id, scope.tenantId, scope.userId)).map((i) => i.title).sort()).toEqual(
            pending
                .slice(1)
                .map((r) => r.key)
                .sort()
        )
        expect(await dispatch.view(d.id, scope.tenantId, randomUUID())).toEqual([])
        denied.add(pending[1].key)
        expect(await dispatch.view(d.id, scope.tenantId, scope.userId)).toHaveLength(1)
    })
    it('rolls back a partial handoff, recovers one message and rejects changed facts or audience', async () => {
        const ref = { ...reference(), kind: 'fixture.atomic' }
        const acknowledge = jest.fn(async () => {})
        const collector: AgentOutputSource = {
            ...source,
            kinds: [{ key: ref.kind, label: { en_US: 'Atomic handoff', zh_Hans: '原子交接' } }],
            acknowledge
        }
        const run = (input: AgentOutputReference) => {
            pending = [input]
            return store.collect(binding, sourceContext(binding, new AbortController().signal), collector)
        }
        await db.query('ALTER TABLE agent_output_member ADD CONSTRAINT fail_new_member CHECK (false) NOT VALID')
        try {
            await expect(run(ref)).rejects.toThrow()
        } finally {
            await db.query('ALTER TABLE agent_output_member DROP CONSTRAINT fail_new_member')
        }
        const key = { ...scope, kind: ref.kind }
        expect(acknowledge).not.toHaveBeenCalled()
        expect(await db.manager.countBy(AgentOutputMessage, key)).toBe(0)
        expect(await db.manager.countBy(AgentOutputDelivery, key)).toBe(0)
        await Promise.all([run(ref), run(ref)])
        expect(await db.manager.countBy(AgentOutputMessage, key)).toBe(1)
        expect(await db.manager.countBy(AgentOutputDelivery, key)).toBe(1)
        await expect(run({ ...ref, revision: '2' })).rejects.toMatchObject({ status: 409 })
        await expect(run({ ...ref, publishedAt: new Date(0).toISOString() })).rejects.toMatchObject({ status: 409 })
        await expect(run({ ...ref, recipientId: randomUUID() })).rejects.toMatchObject({ status: 403 })
        expect(acknowledge).toHaveBeenCalledTimes(2)
    })

    it('fences a replaced private target and never retries an interrupted remote attempt', async () => {
        const pref = await db.manager.save(AgentOutputPreference, {
            ...scope,
            kind,
            channel: 'lark',
            enabled: true,
            enabledSince: new Date(0),
            revision: 1,
            integrationId: randomUUID(),
            targetDigest: 'verified'
        })
        pending = [reference()]
        await collect()
        const first = await db.manager.findOneByOrFail(AgentOutputDelivery, {
            ...scope,
            channel: 'lark',
            state: 'pending'
        })
        await db.manager.update(AgentOutputPreference, pref.id, { revision: 2 })
        await dispatch.dispatch(await lease(first.id), first.id)
        expect((await db.manager.findOneByOrFail(AgentOutputDelivery, { id: first.id })).state).toBe('cancelled')
        expect(send).not.toHaveBeenCalled()
        pending = [reference()]
        await collect()
        const second = await db.manager.findOneByOrFail(AgentOutputDelivery, {
            ...scope,
            channel: 'lark',
            state: 'pending'
        })
        await db.manager.update(AgentOutputDelivery, second.id, { attemptId: randomUUID(), attemptedAt: new Date() })
        target.mockRejectedValueOnce(new Error('remote unavailable'))
        await dispatch.dispatch(await lease(second.id), second.id)
        expect((await db.manager.findOneByOrFail(AgentOutputDelivery, { id: second.id })).state).toBe('unknown')
        expect(send).not.toHaveBeenCalled()
    })
    it('continues the batch on an ACK failure and makes progress past a full page of deferred references', async () => {
        const refs = Array.from({ length: 35 }, reference)
        const held = new Map<string, string | null>()
        const acknowledged = new Set<string>()
        const collector: AgentOutputSource = {
            ...source,
            listPending: async (_, limit) =>
                refs.filter((r) => !acknowledged.has(r.key) && !held.has(r.key)).slice(0, limit),
            acknowledge: async (_, ref) => {
                if (ref.key === refs[1].key) return 'conflict'
                if (ref.key !== refs[2].key && refs.findIndex((r) => r.key === ref.key) < 33 && !recovered)
                    throw new Error('temporary')
                acknowledged.add(ref.key)
            },
            defer: async (_, ref, at) => {
                held.set(ref.key, at)
            }
        }
        let recovered = false
        const scan = () => store.collect(binding, sourceContext(binding, new AbortController().signal), collector)
        await expect(scan()).rejects.toThrow()
        expect(held.size).toBe(31)
        expect(acknowledged).toEqual(new Set([refs[2].key]))
        expect(held.get(refs[1].key)).toBeNull()
        expect(Date.parse(held.get(refs[0].key)!)).toBeGreaterThan(Date.now())
        await expect(scan()).rejects.toThrow('temporary')
        expect(acknowledged).toEqual(new Set([refs[2].key, ...refs.slice(33).map((r) => r.key)]))
        recovered = true
        held.delete(refs[0].key)
        await scan()
        expect(acknowledged.has(refs[0].key)).toBe(true)
        expect(await db.manager.countBy(AgentOutputMessage, { outputKey: refs[0].key })).toBe(1)
    })

    it('lists readable outputs and announcements even when a delivered item becomes unverifiable', async () => {
        const [valid, unavailable] = [reference(), reference()]
        pending = [valid, unavailable]
        await collect()
        const deliveryFor = async (ref: AgentOutputReference) => {
            const message = await db.manager.findOneByOrFail(AgentOutputMessage, { outputKey: ref.key })
            return (await db.manager.findOneByOrFail(AgentOutputMember, { messageId: message.id, channel: 'in_app' }))
                .deliveryId
        }
        for (const ref of pending) {
            const id = await deliveryFor(ref)
            await dispatch.dispatch(await lease(id), id)
        }
        const original = source.resolveForRecipient
        source.resolveForRecipient = (ctx, ref) =>
            ref.key === unavailable.key ? Promise.resolve({ status: 'unavailable' }) : original(ctx, ref)
        try {
            const list = await asRecipient(() => notifications.list(0, 100, true))
            const snapshot = await asRecipient(() => notifications.snapshot('web', true))
            for (const rows of [list.items, snapshot.notifications]) {
                const titles = rows.flatMap((row) => (row.kind === 'agent.output' ? row.titles : []))
                expect(titles).toContain(valid.key)
                expect(titles).not.toContain(unavailable.key)
            }
            expect(snapshot.announcements[0].title).toBe('Maintenance')
        } finally {
            source.resolveForRecipient = original
        }
    })

    it('keeps a handled decision in history and rechecks access for every open', async () => {
        const ref = reference()
        pending = [ref]
        await collect()
        const message = await db.manager.findOneByOrFail(AgentOutputMessage, { outputKey: ref.key })
        const { deliveryId } = await db.manager.findOneByOrFail(AgentOutputMember, {
            messageId: message.id,
            channel: 'in_app'
        })
        const original = source.resolveForRecipient
        const label = { en_US: 'Decision', zh_Hans: '采购决定' }
        let state: 'pending' | 'handled' = 'pending'
        let allowed = true
        source.resolveForRecipient = async (ctx, value) =>
            value.key !== ref.key
                ? original(ctx, value)
                : !allowed
                  ? { status: 'forbidden' }
                  : {
                        status: 'visible',
                        title: 'Case C',
                        workbench: {
                            state,
                            title: label,
                            openLabel: label,
                            viewKey: 'fixture__workbench',
                            selectionId: ctx.sourceBindingRef
                        }
                    }
        try {
            await dispatch.dispatch(await lease(deliveryId), deliveryId)
            const list = () => asRecipient(() => notifications.list(0, 100, true, true))
            const find = async () =>
                (await list()).items.find((n) => n.kind === 'agent.output' && n.source.deliveryId === deliveryId)
            const notice = await find()
            expect(notice).toMatchObject({ items: [{ workbench: { state: 'pending', assistantId: binding.xpertId } }] })
            const read = () => asRecipient(() => notifications.read(notice!.id))
            expect(await read()).toMatchObject({ items: [{ workbench: { state: 'pending' } }] })
            state = 'handled'
            expect(await find()).toMatchObject({ id: notice!.id, items: [{ workbench: { state: 'handled' } }] })
            allowed = false
            await expect(read()).rejects.toThrow()
            expect(await find()).toBeUndefined()
        } finally {
            source.resolveForRecipient = original
        }
    })

    it('delivers a non-UUID branch and preserves the title when optional navigation is invalid or inaccessible', async () => {
        const ref = reference(),
            conversationId = randomUUID()
        pending = [ref]
        await collect()
        const message = await db.manager.findOneByOrFail(AgentOutputMessage, { outputKey: ref.key })
        const { deliveryId } = await db.manager.findOneByOrFail(AgentOutputMember, {
            messageId: message.id,
            channel: 'in_app'
        })
        let threadId = 'branch-thread'
        const original = source.resolveForRecipient
        source.resolveForRecipient = async () => ({
            status: 'visible',
            title: ref.key,
            conversation: { conversationId, threadId }
        })
        try {
            await dispatch.dispatch(await lease(deliveryId), deliveryId)
            const view = () => dispatch.view(deliveryId, scope.tenantId, scope.userId)
            expect((await view())[0].action?.threadId).toBe('branch-thread')
            conversationAction.mockRejectedValueOnce(new Error('navigation unavailable'))
            expect((await view())[0]).toMatchObject({ title: ref.key, action: null })
            threadId = ' '
            expect((await view())[0]).toMatchObject({ title: ref.key, action: null })
        } finally {
            source.resolveForRecipient = original
        }
    })

    it('merges pending members under the extended quiet window, preserving attempted deliveries', async () => {
        const time = (delta: number) => new Date(Date.now() + delta * 60_000).toISOString().slice(11, 16)
        const edit = (end: number | null) =>
            asRecipient(() =>
                preferences.save({
                    kind: quietKind,
                    channel: 'in_app',
                    enabled: true,
                    integrationId: null,
                    quiet: end === null ? null : { zone: 'UTC', start: time(-10), end: time(end) }
                })
            )
        const frozen = { ...reference(), kind: quietKind }
        pending = [frozen]
        await collect()
        const frozenMessage = await db.manager.findOneByOrFail(AgentOutputMessage, { outputKey: frozen.key })
        const frozenMember = await db.manager.findOneByOrFail(AgentOutputMember, { messageId: frozenMessage.id })
        const attemptId = randomUUID()
        await db.manager.update(AgentOutputDelivery, frozenMember.deliveryId, { attemptId, attemptedAt: new Date() })
        await edit(10)
        const [first, second] = [reference(), reference()].map((ref) => ({ ...ref, kind: quietKind }))
        pending = [first]
        await collect()
        await edit(20)
        pending = [second]
        await collect()
        const ids = []
        for (const ref of [first, second]) {
            const message = await db.manager.findOneByOrFail(AgentOutputMessage, { outputKey: ref.key })
            ids.push(
                (await db.manager.findOneByOrFail(AgentOutputMember, { messageId: message.id, channel: 'in_app' }))
                    .deliveryId
            )
        }
        expect(ids[0]).toBe(ids[1])
        expect(await dispatch.dispatch(await lease(ids[0]), ids[0])).toBe('deferred')
        await edit(null)
        await dispatch.dispatch(await lease(ids[0]), ids[0])
        const titles = (await dispatch.view(ids[0], scope.tenantId, scope.userId)).map((i) => i.title)
        expect(titles.sort()).toEqual([first.key, second.key].sort())
        expect(await db.manager.countBy(AgentOutputMember, { deliveryId: frozenMember.deliveryId })).toBe(1)
        expect(await db.manager.findOneByOrFail(AgentOutputDelivery, { id: frozenMember.deliveryId })).toMatchObject({
            state: 'pending',
            attemptId
        })
        await edit(30)
        expect((await db.manager.findOneByOrFail(AgentOutputDelivery, { id: ids[0] })).state).toBe('delivered')
    })
    it('binds a private reply to the original member, verified human, channel revision and quote', async () => {
        const integrationId = randomUUID(),
            chatId = 'test-dm',
            parentId = 'test-original',
            receiptId = randomUUID()
        const ref = { ...reference(), kind: 'fixture.buyer', revision: 'r8' }
        const chosen = { key: 'accept', replyCommand: '确认', label: { en_US: 'Accept', zh_Hans: '选择接受' } }
        const decision = {
            type: 'human_decision' as const,
            schemaVersion: 1 as const,
            requestVersion: 4,
            choices: [chosen, { key: 'reject', label: { en_US: 'Decline', zh_Hans: '不接受' } }]
        }
        const pref = await db.manager.save(AgentOutputPreference, {
            ...scope,
            channel: 'lark',
            kind: ref.kind,
            revision: 1,
            enabled: true,
            enabledSince: new Date(0),
            integrationId,
            targetDigest: 'verified'
        })
        const identity = await db.manager.save(ExternalIdentityBinding, {
            ...scope,
            id: randomUUID(),
            provider: 'lark',
            subjectId: 'bound-union'
        })
        const { id: messageId } = await db.manager.save(AgentOutputMessage, {
            ...scope,
            bindingId: binding.id,
            bindingRevision: 1,
            plugin: binding.plugin,
            kind: ref.kind,
            outputKey: ref.key,
            reference: ref
        })
        const d = await db.manager.save(AgentOutputDelivery, {
            ...scope,
            channel: 'lark',
            kind: ref.kind,
            groupKey: randomUUID(),
            preferenceRevision: 1,
            state: 'accepted',
            attemptId: randomUUID(),
            providerMessageId: parentId,
            decisionAppId: 'verified-app',
            decisionIntegrationId: integrationId,
            decisionChatDigest: digest([chatId])
        })
        const member = await db.manager.save(AgentOutputMember, {
            tenantId: scope.tenantId,
            deliveryId: d.id,
            messageId,
            channel: 'lark',
            included: true
        })
        await db.manager.update(AgentOutputDelivery, d.id, {
            decisionRoute: { memberId: member.id, fingerprint: 'verified', decision }
        })
        const channel = {
            ...binding,
            plugin: '@xpert-ai/plugin-lark',
            adapter: 'lark.inbound',
            sourceBindingRef: integrationId
        }
        const event = {
            type: 'lark.message.received',
            subject: { kind: 'lark-chat', key: chatId }
        } as import('@xpert-ai/plugin-sdk').PluginAgentEvent
        const reply = {
            parentId,
            chatId,
            openId: 'buyer-open',
            unionId: 'bound-union',
            input: { type: 'quoted_text' as const, text: '确认' }
        }
        const run = (overrides: Partial<typeof reply> = {}, channelOverride = {}) =>
            router.submit(
                { ...channel, ...channelOverride },
                { receiptId, event },
                { ...reply, ...overrides },
                new AbortController().signal
            )
        const decisionId = randomUUID()
        type SubmitDecision = NonNullable<AgentOutputSource['submitDecision']>
        const submit = jest.fn<ReturnType<SubmitDecision>, Parameters<SubmitDecision>>(async () => ({
            status: 'recorded',
            decisionId
        }))
        const patchError = new ForbiddenException('provider refused the patch')
        const updateDecision = jest.fn(async () => {}).mockRejectedValueOnce(patchError)
        source.submitDecision = submit
        target.mockReset().mockImplementation(async () => ({
            fingerprint: 'verified',
            appId: 'verified-app',
            recipient: 'buyer-open',
            subject: 'bound-union',
            updateDecision,
            send
        }))
        try {
            expect(await run({ openId: 'other-person' })).toEqual({ status: 'forbidden' })
            expect(await run({ unionId: 'other-union' })).toEqual({ status: 'forbidden' })
            expect(await run({ parentId: 'forward' })).toEqual({ status: 'unrelated' })
            expect(await run({ chatId: 'other-dm' })).toEqual({ status: 'forbidden' })
            expect(await run({ input: { type: 'quoted_text', text: chosen.label.zh_Hans } })).toEqual({
                status: 'forbidden'
            })
            expect(await run({}, { sourceBindingRef: randomUUID() })).toEqual({ status: 'unrelated' })
            expect(submit).not.toHaveBeenCalled()
            expect(updateDecision).not.toHaveBeenCalled()
            // The source has committed. A channel error, even HTTP 403, must reach the receipt retry loop.
            await expect(run()).rejects.toBe(patchError)
            expect(await run()).toEqual({ status: 'recorded', decisionId })
            expect(updateDecision.mock.calls).toEqual([
                [parentId, 'recorded', chosen.label.zh_Hans],
                [parentId, 'recorded', chosen.label.zh_Hans]
            ])
            expect(submit.mock.calls.map(([, input]) => input.commandId)).toEqual([receiptId, receiptId])
            expect(submit).toHaveBeenCalledWith(
                expect.objectContaining({ userId: scope.userId, bindingId: binding.id }),
                {
                    schemaVersion: 1,
                    requestId: ref.key,
                    requestVersion: 4,
                    sourceRevision: 'r8',
                    choice: 'accept',
                    commandId: receiptId
                },
                'lark'
            )
            for (const status of ['already_recorded', 'stale', 'closed'] as const) {
                submit.mockResolvedValueOnce({ status })
                expect(await run()).toEqual({ status })
                expect(updateDecision).toHaveBeenLastCalledWith(parentId, status, chosen.label.zh_Hans)
            }
            updateDecision.mockClear()
            for (const status of ['conflicting_choice', 'forbidden'] as const) {
                submit.mockResolvedValueOnce({ status })
                expect(await run()).toEqual({ status })
            }
            submit.mockClear()
            await db.manager.update(AgentOutputMessage, messageId, { reference: { ...ref, key: randomUUID() } })
            expect(await run()).toEqual({ status: 'forbidden' })
            await db.manager.update(AgentOutputMessage, messageId, { reference: ref })
            // Another instance revokes the producer after the channel input has reached identity resolution.
            const verifiedTarget = await target()
            target.mockImplementationOnce(async () => {
                await db.manager.update(AgentEventBinding, binding.id, { state: 'paused', revision: 2 })
                return verifiedTarget
            })
            expect(await run()).toEqual({ status: 'forbidden' })
            await db.manager.update(AgentEventBinding, binding.id, { state: 'enabled', revision: 3 })
            expect(await run()).toEqual({ status: 'forbidden' })
            expect(submit).not.toHaveBeenCalled()
            await db.manager.update(AgentEventBinding, binding.id, { revision: 1 })

            await db.manager.update(AgentOutputPreference, pref.id, { revision: 2 })
            expect(await run()).toEqual({ status: 'forbidden' })
            await db.manager.update(AgentOutputPreference, pref.id, { revision: 1 })
            await db.manager.delete(ExternalIdentityBinding, identity.id)
            expect(await run()).toEqual({ status: 'forbidden' })
            expect(submit).not.toHaveBeenCalled()
            expect(updateDecision).not.toHaveBeenCalled()
        } finally {
            delete source.submitDecision
            await db.manager.update(AgentEventBinding, binding.id, { state: 'enabled', revision: 1 })
            target.mockImplementation(async () => ({ fingerprint: 'verified', send }))
        }
    })

    it('requires an active authorized view invocation for the exact published source binding', async () => {
        const context = {
            ...scope,
            workspaceId: binding.workspaceId,
            hostType: 'agent',
            hostId: binding.xpertId
        } as import('@xpert-ai/contracts').XpertResolvedViewHostContext
        const submit = jest.fn(async () => ({ status: 'recorded' as const, decisionId: randomUUID() }))
        source.submitDecision = submit
        const command = {
            schemaVersion: 1 as const,
            requestId: 'review/42',
            sourceRevision: 'head-sha',
            requestVersion: 1,
            commandId: randomUUID(),
            choice: 'accept'
        }
        expect(WorkbenchDecisionCapability.id).toBe('platform.view.workbench-decision')
        const workbench = capabilities.require(WorkbenchDecisionCapability)
        const apply = () => workbench.submit(binding.adapter, binding.sourceBindingRef, command)
        const run = (plugin: string, userId = scope.userId) =>
            withPluginViewAction({ ...context, userId }, plugin, apply)
        try {
            expect(await apply()).toEqual({ status: 'forbidden' })
            expect(await run('unrelated-plugin')).toEqual({ status: 'forbidden' })
            expect(await run(binding.plugin, randomUUID())).toEqual({ status: 'forbidden' })
            expect((await run(binding.plugin)).status).toBe('recorded')
            expect(submit).toHaveBeenCalledWith(expect.objectContaining({ userId: scope.userId }), command, 'workbench')
            await db.manager.update(AgentEventBinding, binding.id, { state: 'revoked' })
            expect(await run(binding.plugin)).toEqual({ status: 'forbidden' })
            expect(submit).toHaveBeenCalledTimes(1)
        } finally {
            delete source.submitDecision
            await db.manager.update(AgentEventBinding, binding.id, { state: 'enabled' })
        }
    })
})
