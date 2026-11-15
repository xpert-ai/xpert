import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PluginEventJournal } from '@xpert-ai/plugin-sdk'
import { RuntimeMessageAccessService } from '../handoff/runtime-messaging/runtime-message-access.service'
import { runtimeMessageError } from '../handoff/runtime-messaging/runtime-message.errors'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { AgentEventRuntime, AgentEventSources, sourceContext } from './agent-event.runtime'
import { randomUUID } from 'node:crypto'
import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import type { PluginAgentEvent, PluginAgentEventSource } from '@xpert-ai/plugin-sdk'
import { AgentEventStore } from './agent-event.store'
import { AGENT_EVENT_ENTITIES, AgentEventBinding, AgentEventInbox, AgentEventPartition } from './agent-event.entity'
import { AgentEventBindingService } from './agent-event-binding.service'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !/^\/xpert_pipeline_test_[a-z0-9_]+$/.test(new URL(url).pathname))
    throw new Error('Dedicated test database required')
const integration = url ? describe : describe.skip
integration('Event Inbox PostgreSQL', () => {
    const schema = 'inbox_' + randomUUID().replaceAll('-', '')
    let db: DataSource, store: AgentEventStore, binding: AgentEventBinding
    const tenantId = randomUUID()
    const organizationId = randomUUID()
    @Entity('user')
    class User {
        @PrimaryColumn('uuid') id: string
    }
    @Entity('tenant')
    class Tenant {
        @PrimaryColumn('uuid') id: string
    }
    @Entity('organization')
    class Organization {
        @PrimaryColumn('uuid') id: string
    }
    const connect = () =>
        new DataSource({
            type: 'postgres',
            url,
            schema,
            uuidExtension: 'pgcrypto',
            entities: [User, Tenant, Organization, ...AGENT_EVENT_ENTITIES],
            extra: { options: '-c search_path=' + schema + ',public' }
        }).initialize()
    const source: PluginAgentEventSource = {
        key: 'test',
        protocolVersion: 1,
        eventTypes: [{ type: 'test.fact', schemaVersion: 1 }],
        configure: async () => {},
        drain: async () => ({ more: false }),
        handle: async () => ({ status: 'ignored', reasonCode: 'test' })
    }
    const event = (sourceEventId: string, subject: string): PluginAgentEvent => ({
        sourceEventId,
        type: 'test.fact',
        schemaVersion: 1,
        bindingRevision: 1,
        occurredAt: '2026-11-15T00:00:00Z',
        subject: { kind: 'case', key: subject },
        fact: { key: sourceEventId, revision: '1', sha256: 'a'.repeat(64) }
    })
    beforeAll(async () => {
        db = await connect()
        await db.query('CREATE SCHEMA ' + schema)
        await db.synchronize()
        await db.query('INSERT INTO tenant VALUES ($1)', [tenantId])
        await db.query('INSERT INTO organization VALUES ($1)', [organizationId])
        store = new AgentEventStore(db)
        ;[binding] = await db.query(
            `INSERT INTO agent_event_binding(id,"tenantId","organizationId","workspaceId","xpertId","userId",
      plugin,adapter,"sourceBindingRef","publishedAt",revision,state) VALUES ($1,$2,$3,$4,$5,$6,'test','test','source',now(),1,'enabled') RETURNING *`,
            [randomUUID(), tenantId, organizationId, randomUUID(), randomUUID(), randomUUID()]
        )
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            try {
                await db.query('DROP SCHEMA ' + schema + ' CASCADE')
            } finally {
                await db.destroy()
            }
        }
    })
    it('creates the registered tables and preserves a receipt and lease across a second synchronization', async () => {
        const published = await store.publish(binding, source, event('schema-sync', 'sync'))
        if (published.status !== 'accepted') throw new Error('Expected an accepted receipt')
        const claim = (await store.claim(binding))!
        await store.complete(claim, { status: 'ignored', reasonCode: 'sync_check' })
        const receipts = db.getRepository(AgentEventInbox)
        const partitions = db.getRepository(AgentEventPartition)
        const receipt = await receipts.findOneByOrFail({ id: published.receiptId })
        const lease = await partitions.findOneByOrFail({ id: claim.partition })
        expect(receipt).toMatchObject({ state: 'ignored', seq: '1', tenantId, organizationId })
        expect(lease).toMatchObject({ fence: '1', tenantId, organizationId })

        expect((await db.driver.createSchemaBuilder().log()).upQueries).toEqual([])
        await db.synchronize()
        expect(await receipts.findOneByOrFail({ id: receipt.id })).toEqual(receipt)
        expect(await partitions.findOneByOrFail({ id: lease.id })).toEqual(lease)
        expect(await store.publish(binding, source, receipt.event)).toEqual({
            status: 'duplicate',
            receiptId: receipt.id
        })
    })

    it('rejects missing or foreign scope on bindings, partitions and receipts', async () => {
        const foreign = randomUUID()
        await db.query('INSERT INTO organization VALUES ($1)', [foreign])
        const fact = event('scope-constraints', 'scope')
        const publication = await store.publish(binding, source, fact)
        if (publication.status !== 'accepted') throw new Error('Expected an accepted receipt')
        const claim = (await store.claim(binding))!
        await store.complete(claim, { status: 'ignored', reasonCode: 'scope_check' })
        await expect(
            db.getRepository(AgentEventPartition).insert({ binding: binding.id, kind: 'test', subject: 'missing' })
        ).rejects.toMatchObject({ code: '23514' })
        for (const entity of [AgentEventPartition, AgentEventInbox]) {
            const id = entity === AgentEventPartition ? claim.partition : publication.receiptId
            const repo = db.getRepository(entity)
            await expect(repo.update(id, { organizationId: foreign })).rejects.toMatchObject({ code: '23503' })
            await expect(repo.update(id, { organizationId: null })).rejects.toMatchObject({ code: '23514' })
        }
        await expect(db.getRepository(AgentEventBinding).update(binding.id, { tenantId: null })).rejects.toMatchObject({
            code: '23514'
        })
        const forged = { ...binding, organizationId: foreign }
        expect(await store.publish(forged, source, fact)).toEqual({ status: 'rejected', code: 'binding_changed' })
        expect(await store.claim(forged)).toBeUndefined()
    })

    it('configures with a scoped repository, preserves the revision on retries, and audits the acting user', async () => {
        const actor = { tenantId: binding.tenantId, organizationId: binding.organizationId, userId: binding.userId }
        await db.query('INSERT INTO "user"(id) VALUES ($1)', [actor.userId])
        const target = { xpertId: binding.xpertId, workspaceId: binding.workspaceId, publishedAt: binding.publishedAt }
        const input = {
            plugin: 'test',
            adapter: 'test',
            sourceBindingRef: 'configure',
            expectedRevision: 0,
            enabled: true
        }
        const service = new AgentEventBindingService(db.getRepository(AgentEventBinding))
        const [first, second] = await Promise.all([
            service.configure(actor, target, input),
            service.configure(actor, target, input)
        ])
        expect(second.id).toBe(first.id)
        await service.updateCapture(first, true)
        expect(await service.configure(actor, target, input)).toMatchObject({
            id: first.id,
            revision: 1,
            state: 'enabled',
            createdById: actor.userId
        })
        expect(await service.findOwned(first.id, { ...actor, organizationId: randomUUID() })).toBeNull()
        await service.updateCapture(first, false)
        expect(await service.findOwned(first.id, actor)).toMatchObject({ revision: 1, capture: false })
    })
    it('separates identical source IDs in different organizations and rejects undeclared envelope fields', async () => {
        const other = { ...binding, id: randomUUID(), organizationId: randomUUID() }
        await db.query('INSERT INTO organization VALUES ($1)', [other.organizationId])
        await db.query(
            `INSERT INTO agent_event_binding(id,"tenantId","organizationId","workspaceId","xpertId","userId",
            plugin,adapter,"sourceBindingRef","publishedAt",revision,state)
            SELECT $2,"tenantId",$3,"workspaceId","xpertId","userId",plugin,adapter,"sourceBindingRef","publishedAt",revision,state
            FROM agent_event_binding WHERE id=$1`,
            [binding.id, other.id, other.organizationId]
        )
        const fact = event('scope-check', 'isolated')
        const publications = await Promise.all([binding, other].map((b) => store.publish(b, source, fact)))
        expect(publications.map((p) => p.status)).toEqual(['accepted', 'accepted'])
        expect(new Set(publications.map((p) => 'receiptId' in p && p.receiptId)).size).toBe(2)
        expect(await store.publish(other, source, { ...fact, payload: 'untrusted' } as PluginAgentEvent)).toEqual({
            status: 'rejected',
            code: 'invalid_event'
        })
        const receiptId = publications[0].status !== 'rejected' && publications[0].receiptId
        const service = new AgentEventBindingService(db.getRepository(AgentEventBinding))
        const actor = { tenantId: binding.tenantId, organizationId: binding.organizationId, userId: binding.userId }
        expect(await service.findReceipt(String(receiptId), actor)).toMatchObject({ id: receiptId, state: 'pending' })
        expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id: String(receiptId) })).toMatchObject({
            tenantId,
            organizationId
        })
        expect(
            await service.findReceipt(String(receiptId), { ...actor, organizationId: other.organizationId })
        ).toBeNull()
        expect((await db.getRepository(AgentEventInbox).findOneByOrFail({ id: String(receiptId) })).seq).toEqual(
            expect.any(String)
        )
        const claim = await store.claim(binding)
        expect(claim?.event.sourceEventId).toBe('scope-check')
        expect(await store.complete(claim!, { status: 'ignored', reasonCode: 'test' })).toBe(true)
    })
    it('deduplicates racing publishers, serializes each subject, fences stale completion and restores overdue work', async () => {
        const first = event('one', 'A')
        const receipts = await Promise.all(Array.from({ length: 8 }, () => store.publish(binding, source, first)))
        expect(receipts.filter((x) => x.status === 'accepted')).toHaveLength(1)
        expect(new Set(receipts.map((x) => x.status !== 'rejected' && x.receiptId)).size).toBe(1)
        expect(await store.publish(binding, source, { ...first, type: 'test.conflict' })).toMatchObject({
            code: 'identity_conflict'
        })
        expect(
            await store.publish(binding, source, { ...first, sourceEventId: 'invalid', schemaVersion: 2 })
        ).toMatchObject({ code: 'unsupported_version' })
        await store.publish(binding, source, event('two', 'A'))
        await store.publish(binding, source, event('three', 'B'))
        const claims = await Promise.all([store.claim(binding), store.claim(binding)])
        const a = claims.find((x) => x?.event.subject.key === 'A')!,
            b = claims.find((x) => x?.event.subject.key === 'B')!
        expect(a.event.sourceEventId).toBe('one')
        expect(b.event.sourceEventId).toBe('three')
        expect(await store.claim(binding)).toBeUndefined()
        await db.query('UPDATE agent_event_partition SET expires=now() WHERE id=$1', [a.partition])
        const replacement = (await store.claim(binding))!
        expect(BigInt(replacement.fence)).toBeGreaterThan(BigInt(a.fence))
        expect(await store.complete(a)).toBe(false)
        expect(await store.complete(replacement, { status: 'ignored', reasonCode: 'baseline' })).toBe(true)
        const next = (await store.claim(binding))!
        expect(next.event.sourceEventId).toBe('two')
        await db.query('UPDATE agent_event_inbox SET attempt=10 WHERE id=$1', [next.receiptId])
        await store.complete(next)
        expect(await db.query('SELECT state FROM agent_event_inbox WHERE id=$1', [next.receiptId])).toEqual([
            { state: 'isolated' }
        ])
        await db.query("UPDATE agent_event_binding SET state='paused',revision=2 WHERE id=$1", [binding.id])
        expect(await store.publish(binding, source, event('four', 'C'))).toMatchObject({ code: 'binding_changed' })
        expect(await store.claim(binding)).toBeUndefined()
    })
    describe('recovery across instances', () => {
        let peer: DataSource
        beforeAll(async () => {
            peer = await connect()
            await peer.query('INSERT INTO "user"(id) VALUES ($1) ON CONFLICT DO NOTHING', [binding.userId])
        })
        afterAll(async () => {
            if (peer?.isInitialized) await peer.destroy()
        })

        const freshBinding = () =>
            db.getRepository(AgentEventBinding).save({
                ...binding,
                id: randomUUID(),
                sourceBindingRef: randomUUID(),
                state: 'enabled' as const,
                revision: 1
            })
        const accepted = async (b: AgentEventBinding, name: string, subject = name) => {
            const result = await store.publish(b, source, { ...event(name, subject), bindingRevision: b.revision })
            if (result.status !== 'accepted') throw new Error('Expected an accepted receipt')
            return result.receiptId
        }
        const actor = async (run: () => Promise<void>) => run()
        const worker = async (database: DataSource, b: AgentEventBinding, adapter = source, authenticate = actor) => {
            const module = await Test.createTestingModule({
                providers: [
                    AgentEventRuntime,
                    { provide: AgentEventStore, useValue: new AgentEventStore(database) },
                    {
                        provide: AgentEventBindingService,
                        useValue: new AgentEventBindingService(database.getRepository(AgentEventBinding))
                    },
                    { provide: AgentEventSources, useValue: { resolve: () => adapter } },
                    {
                        provide: PublishedXpertAccessService,
                        useValue: {
                            getAccessiblePublishedXpert: async () => ({
                                workspaceId: b.workspaceId,
                                publishAt: b.publishedAt
                            })
                        }
                    },
                    {
                        provide: RuntimeMessageAccessService,
                        useValue: { withControlActor: (_scope: unknown, run: () => Promise<void>) => authenticate(run) }
                    }
                ]
            })
                .useMocker(() => ({}))
                .compile()
            return module.get(AgentEventRuntime)
        }

        it('fences stale journal reads and rejection writes while a second instance advances the route', async () => {
            const old = await freshBinding()
            const current = { ...old, revision: 2 }
            const journal = new PluginEventJournal('test_recovery')
            const ctx = (b: AgentEventBinding) => sourceContext(b, new AbortController().signal)
            const capture = (database: DataSource, b: AgentEventBinding, name: string) =>
                database.transaction(async (tx) => {
                    await journal.configure(tx, ctx(b), true)
                    await journal.capture(
                        tx,
                        { binding: b.id, revision: b.revision, enabled: true },
                        event(name, name),
                        { name },
                        name,
                        '1'
                    )
                })
            await db.query(
                'CREATE TABLE test_recovery_route(binding uuid PRIMARY KEY, tenant uuid, org uuid, ref varchar, revision int, enabled boolean)'
            )
            await db.query(
                'CREATE TABLE test_recovery_fact(seq bigserial PRIMARY KEY, id uuid UNIQUE, binding uuid, source varchar, event jsonb, snapshot jsonb, receipt uuid, error varchar)'
            )
            await capture(db, old, 'before')
            await journal.drain(
                db,
                ctx(old),
                {
                    publish: async () => {
                        await peer.getRepository(AgentEventBinding).update(old.id, { revision: 2 })
                        await capture(peer, current, 'after')
                        return { status: 'rejected', code: 'invalid_event' }
                    }
                },
                32
            )
            expect(await db.query('SELECT error FROM test_recovery_fact ORDER BY seq')).toEqual([
                { error: null },
                { error: null }
            ])
            const stalePublish = jest.fn()
            await journal.drain(db, ctx(old), { publish: stalePublish }, 32)
            expect(stalePublish).not.toHaveBeenCalled()

            // Repair current-revision facts quarantined by an older SDK. A previous revision without a receipt remains terminal.
            await db.query("UPDATE test_recovery_fact SET error='binding_changed' WHERE source='after'")
            const drain = (database: DataSource) =>
                journal.drain(
                    database,
                    ctx(current),
                    {
                        publish: (fact) => new AgentEventStore(database).publish(current, source, fact)
                    },
                    32
                )
            await Promise.all([drain(db), drain(peer)])
            const receipts = await db.getRepository(AgentEventInbox).findBy({ binding: old.id })
            expect(receipts).toHaveLength(1)
            expect(await db.query('SELECT source,receipt,error FROM test_recovery_fact ORDER BY seq')).toEqual([
                { source: 'before', receipt: null, error: 'binding_changed' },
                { source: 'after', receipt: receipts[0].id, error: null }
            ])
        })

        it('keeps a stale publisher retryable for plugins that persist every returned rejection', async () => {
            const old = await freshBinding()
            const fact = { ...event('new-revision', 'case'), bindingRevision: 2 }
            const terminalError = jest.fn()
            const legacy: PluginAgentEventSource = {
                ...source,
                drain: async (_ctx, publisher) => {
                    await peer.getRepository(AgentEventBinding).update(old.id, { revision: 2 })
                    const result = await publisher.publish(fact)
                    if (result.status === 'rejected') terminalError(result.code)
                    return { more: false }
                }
            }
            await expect((await worker(db, old, legacy)).process(old)).rejects.toThrow('event_binding_changed')
            expect(terminalError).not.toHaveBeenCalled()
            const current = { ...old, revision: 2 }
            const resumed: PluginAgentEventSource = {
                ...source,
                drain: async (_ctx, publisher) => {
                    await publisher.publish(fact)
                    return { more: false }
                }
            }
            await (await worker(peer, current, resumed)).process(current)
            const receipts = await db.getRepository(AgentEventInbox).findBy({ binding: old.id })
            expect(receipts).toHaveLength(1)
            expect(receipts[0]).toMatchObject({ sourceEventId: fact.sourceEventId, state: 'ignored', attempt: 1 })
        })

        it('isolates a head after ten expired leases, hands off its successor once and rejects the old owner', async () => {
            const b = await freshBinding()
            const head = await accepted(b, 'head', 'case'),
                next = await accepted(b, 'next', 'case')
            const peerStore = new AgentEventStore(peer)
            const race = async () => {
                const claims = (await Promise.all([store.claim(b), peerStore.claim(b)])).filter((c) => c !== undefined)
                expect(claims).toHaveLength(1)
                return claims[0]
            }
            let stale = await race()
            for (let attempt = 1; attempt <= 10; attempt++) {
                if (attempt > 1) stale = await race()
                expect(stale.receiptId).toBe(head)
                await peer.query('UPDATE agent_event_partition SET expires=now() WHERE id=$1', [stale.partition])
            }
            const successor = await race()
            expect(successor.receiptId).toBe(next)
            expect(BigInt(successor.fence)).toBeGreaterThan(BigInt(stale.fence))
            expect(await store.complete(stale)).toBe(false)
            expect(await peerStore.complete(successor, { status: 'ignored', reasonCode: 'test' })).toBe(true)
            expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id: head })).toMatchObject({
                state: 'isolated',
                attempt: 10,
                error: 'lease_expired'
            })
            const service = new AgentEventBindingService(db.getRepository(AgentEventBinding))
            await service.retry(b, head)
            expect(await peerStore.claim(b)).toMatchObject({ receiptId: head })
            expect(await store.complete(stale)).toBe(false)
        })

        it('continues consuming accepted receipts while intake is failing or still waiting on another instance', async () => {
            const b = await freshBinding()
            const id = await accepted(b, 'already-accepted')
            let signalHandled!: () => void
            const handled = new Promise<void>((resolve) => {
                signalHandled = resolve
            })
            const handle = jest.fn(async () => {
                signalHandled()
                return { status: 'ignored' as const, reasonCode: 'test' }
            })
            let release!: () => void
            const gate = new Promise<void>((resolve) => {
                release = resolve
            })
            const adapter = {
                ...source,
                handle,
                drain: async () => {
                    await gate
                    throw new Error('source offline')
                }
            }
            const [a, other] = await Promise.all([worker(db, b, adapter), worker(peer, b, adapter)])
            const scans = Promise.allSettled([a.process(b), other.process(b)])
            let timeout: ReturnType<typeof setTimeout>
            try {
                await Promise.race([
                    handled,
                    new Promise<never>((_, reject) => {
                        timeout = setTimeout(() => reject(new Error('consumption waited for intake')), 2000)
                    })
                ])
            } finally {
                clearTimeout(timeout)
                release()
                await scans
            }
            expect((await scans).map((result) => result.status)).toEqual(['rejected', 'rejected'])
            expect(handle).toHaveBeenCalledTimes(1)
            expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id })).toMatchObject({
                state: 'ignored',
                attempt: 1
            })
            expect(await db.getRepository(AgentEventBinding).findOneByOrFail({ id: b.id })).toMatchObject({
                state: 'enabled',
                lastError: 'event_source_unavailable'
            })
        })

        it('revokes once on membership denial, fences in-flight work and ignores a late denial after reauthorization', async () => {
            const b = await freshBinding()
            const head = await accepted(b, 'in-flight', 'case'),
                next = await accepted(b, 'waiting', 'case')
            const claim = (await store.claim(b))!
            const deny = async () => {
                throw runtimeMessageError('Access')
            }
            const sourceHandle = jest.fn()
            const adapter = { ...source, handle: sourceHandle }
            const [one, two] = await Promise.all([worker(db, b, adapter, deny), worker(peer, b, adapter, deny)])
            const service = new AgentEventBindingService(db.getRepository(AgentEventBinding))
            await Promise.all([one.process(b), two.process(b)])
            await service.recordScan(b, null)
            expect(await db.getRepository(AgentEventBinding).findOneByOrFail({ id: b.id })).toMatchObject({
                state: 'revoked',
                lastError: 'event_access_changed'
            })
            for (const id of [head, next]) {
                expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id })).toMatchObject({
                    state: 'blocked',
                    decision: { status: 'blocked', reasonCode: 'event_access_changed' }
                })
            }
            expect(await store.complete(claim)).toBe(false)
            expect(await service.findEnabled(b.id, b.tenantId, b.organizationId)).toBeNull()
            expect((await service.reserveDue()).some((row) => row.id === b.id)).toBe(false)
            let authenticationStarted!: () => void
            const started = new Promise<void>((resolve) => {
                authenticationStarted = resolve
            })
            let resume!: () => void
            const gate = new Promise<void>((resolve) => {
                resume = resolve
            })
            const slow = await worker(peer, b, adapter, async () => {
                authenticationStarted()
                await gate
                return deny()
            })
            const delayedScan = slow.process(b)
            await started
            const current = await service.configure(b, b, { ...b, expectedRevision: 1, enabled: true })
            await service.updateCapture(current, true)
            const newReceipt = await accepted(current, 'new')
            resume()
            await delayedScan
            await service.recordScan(b, 'old_failure')
            expect(await service.findEnabled(b.id, b.tenantId, b.organizationId)).toMatchObject({
                revision: 2,
                lastError: null
            })
            expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id: newReceipt })).toMatchObject({
                state: 'pending'
            })
            expect(sourceHandle).not.toHaveBeenCalled()
        })

        it('serializes manual retry with revocation on a different replica', async () => {
            const b = await freshBinding()
            const id = await accepted(b, 'isolated')
            const repo = db.getRepository(AgentEventInbox)
            await repo.update(id, { state: 'isolated', attempt: 10 })
            const service = new AgentEventBindingService(db.getRepository(AgentEventBinding))
            const second = new AgentEventBindingService(peer.getRepository(AgentEventBinding))
            const [retry] = await Promise.all([
                service.retry(b, id).then(
                    () => true,
                    (err) => {
                        if (!(err instanceof ConflictException)) throw err
                        return false
                    }
                ),
                second.revoke(b)
            ])
            expect((await repo.findOneByOrFail({ id })).state).toBe(retry ? 'blocked' : 'isolated')
            await expect(service.retry(b, id)).rejects.toThrow('receipt_not_retryable')
        })

        it('keeps a transient identity failure retryable and scopes a plugin denial to its own receipt', async () => {
            const b = await freshBinding()
            const id = await accepted(b, 'limited')
            const unavailable = await worker(db, b, source, async () => {
                throw new ServiceUnavailableException()
            })
            await expect(unavailable.process(b)).rejects.toThrow()
            expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id })).toMatchObject({
                state: 'pending',
                attempt: 0
            })
            const limited = await worker(peer, b, {
                ...source,
                handle: async () => {
                    throw new ForbiddenException()
                }
            })
            await limited.process(b)
            expect(await db.getRepository(AgentEventInbox).findOneByOrFail({ id })).toMatchObject({
                state: 'blocked',
                attempt: 1
            })
            expect(await db.getRepository(AgentEventBinding).findOneByOrFail({ id: b.id })).toMatchObject({
                state: 'enabled'
            })
        })
    })
})
