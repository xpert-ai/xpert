jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import type { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { InvocationActivityItem, InvocationActivityState } from './activity.entity'
import { InvocationActivityService } from './activity.service'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VolumeClient, VolumeHandle, type VolumeScope } from '../../shared/volume'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const },
    text = { type: 'varchar' as const },
    int = { type: 'int' as const }
const base = {
    id: { ...uuid, primary: true },
    tenantId: uuid,
    organizationId: uuid,
    createdAt: { type: 'timestamptz' as const, createDate: true },
    updatedAt: { type: 'timestamptz' as const, updateDate: true }
}
integration('persisted execution activity', () => {
    let db: DataSource, service: InvocationActivityService
    let directory: string
    const schema = `activity_${randomUUID().replace(/-/g, '')}`
    const invocation: AgentInvocation = {
        id: randomUUID(),
        revision: 1,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        scope: {
            tenantId: randomUUID(),
            organizationId: randomUUID(),
            userId: randomUUID(),
            parentExecutionId: randomUUID(),
            callerAgentKey: 'agent'
        },
        request: {
            target: {
                bindingId: randomUUID(),
                provider: 'fixture',
                revision: '1',
                reference: 'fixture',
                configuration: {}
            },
            callId: randomUUID(),
            input: { prompt: 'fixture' }
        }
    }
    beforeAll(async () => {
        directory = await mkdtemp(join(tmpdir(), 'activity-output-'))
        db = await new DataSource({ type: 'postgres', url }).initialize()
        await db.query(`CREATE SCHEMA ${schema}`)
        await db.destroy()
        db = await new DataSource({
            type: 'postgres',
            url,
            schema,
            synchronize: true,
            entities: [
                new EntitySchema<InvocationActivityState>({
                    name: 'InvocationActivityState',
                    target: InvocationActivityState,
                    columns: {
                        ...base,
                        seq: int,
                        bytes: int,
                        sourceCursor: { ...text, nullable: true },
                        closed: { type: 'boolean' },
                        expired: { type: 'boolean', default: false },
                        expiresAt: { type: 'timestamptz', nullable: true },
                        gaps: { type: 'jsonb' }
                    }
                }),
                new EntitySchema<InvocationActivityItem>({
                    name: 'InvocationActivityItem',
                    target: InvocationActivityItem,
                    columns: {
                        ...base,
                        invocationId: uuid,
                        seq: int,
                        firstSeq: int,
                        itemId: text,
                        hash: text,
                        item: { type: 'jsonb' }
                    }
                })
            ]
        }).initialize()
        const volumes = new (class extends VolumeClient {
            resolve(scope: VolumeScope) {
                return new VolumeHandle(scope, join(directory, scope.tenantId, scope.jobId), '', '', directory)
            }
            resolveRoot() {
                return { serverRoot: directory, hostRoot: directory }
            }
        })()
        service = new InvocationActivityService(db, volumes)
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA ${schema} CASCADE`)
            await db.destroy()
        }
        if (directory) await rm(directory, { recursive: true, force: true })
    })
    it('merges tool result with its original command; retries do not add duplicate records', async () => {
        const sink = service.recorder(invocation)
        const start = {
            id: 'call',
            content: {
                kind: 'tool' as const,
                name: 'shell',
                status: 'running' as const,
                detail: { type: 'command' as const, command: 'node test.cjs', outputMode: 'merged' as const }
            }
        }
        await Promise.all([sink.append({ items: [start] }), sink.append({ items: [start] })])
        const first = await service.page(invocation)
        expect(first.items).toHaveLength(1)
        await sink.append({
            items: [{ id: 'call', content: { kind: 'tool', status: 'succeeded', output: '42' } }],
            sourceCursor: '10',
            expectedSourceCursor: ''
        })
        const page = await service.page(invocation, first.nextCursor)
        expect(page.items[0].content).toMatchObject({
            name: 'shell',
            output: '42',
            detail: { command: 'node test.cjs' }
        })
        expect(page.items[0].firstSeq).toBe(first.items[0].firstSeq)
        await sink.append({ items: [], sourceCursor: '5', expectedSourceCursor: '' })
        expect((await sink.readCheckpoint()).sourceCursor).toBe('10')
        await sink.append({ items: [start] })
        expect((await sink.readCheckpoint()).seq).toBe(2)
    })
    it('retains completed data across service reconstruction and marks interrupted capture independently', async () => {
        const restarted = new InvocationActivityService(db)
        const partial = await restarted.page({ ...invocation, status: 'cancelled' })
        expect(partial.state).toBe('closed')
        expect(partial.gaps).toContain('interrupted')
        await restarted.recorder(invocation).append({ items: [], complete: true })
        const complete = await new InvocationActivityService(db).page({ ...invocation, status: 'succeeded' })
        expect(complete.gaps).toEqual([])
        expect(complete.items.length).toBe(1)
        expect((await restarted.page({ ...invocation, id: randomUUID() })).state).toBe('not_recorded')
    })
    it('stores long captured output in a private volume and exposes only a bounded authorized slice', async () => {
        const run = { ...invocation, id: randomUUID() }
        const output = '公开号码 "test"\n'.repeat(9000) + 'Bearer test-private-token'
        await service.recorder(run).append({
            items: [{ id: 'large', content: { kind: 'tool', status: 'succeeded', output } }],
            complete: true
        })
        const item = (await service.page(run)).items[0]
        if (item.content.kind !== 'tool') throw Error('Expected tool')
        expect(item.content.output).toHaveLength(65536)
        expect(item.content.outputRef.length).toBeGreaterThan(65536)
        let text = item.content.output,
            offset = text.length
        while (true) {
            const page = await service.output(run, item.content.outputRef.key, offset)
            text += page.text
            offset = page.nextOffset
            if (!page.hasMore) break
        }
        expect(text).toBe(output.replace('Bearer test-private-token', 'Bearer [REDACTED]'))
        await expect(service.output(run, '0'.repeat(64), 0)).rejects.toThrow()
        await expect(
            service.output({ ...run, scope: { ...run.scope, tenantId: randomUUID() } }, item.content.outputRef.key, 0)
        ).rejects.toThrow()
    })
    it('expires only activity rows while retaining the execution result and metadata', async () => {
        await db
            .getRepository(InvocationActivityState)
            .createQueryBuilder()
            .update()
            .set({ expiresAt: new Date(0) })
            .execute()
        expect((await service.page(invocation)).state).toBe('expired')
        await service.purgeExpired()
        expect(await db.getRepository(InvocationActivityItem).count()).toBe(0)
        expect(await db.getRepository(InvocationActivityState).count()).toBe(2)
    })
})
