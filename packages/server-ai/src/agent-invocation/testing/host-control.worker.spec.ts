import process from 'node:process'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { spawn, ChildProcess } from 'node:child_process'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    AgentRuntimeRegistry,
    IAgentRuntimeStrategy,
    AgentRuntimeContext,
    AgentRuntimeObservation,
    DefaultRuntimeCapabilityRegistry,
    BUILTIN_GLOBAL_SCOPE,
    AgentInvocationRequest
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from '../invocation-runtime'
import { AgentInvocationStore, StoredAgentInvocation } from '../invocation-store'

// Test-only independent host process; no pub/sub or in-memory state is shared with its peer.
;(process.env.XPERT_HOST_FIXTURE ? it : it.skip)(
    'serves a disposable host fixture',
    async () => {
        const config = z
            .object({
                url: z.string().url(),
                host: z.string().uuid(),
                schema: z.string().regex(/^host_control_[a-f0-9]+$/)
            })
            .parse(JSON.parse(process.env.XPERT_HOST_FIXTURE))
        if (!new URL(config.url).pathname.endsWith('_test')) throw Error('Disposable database required')
        const db = await new DataSource({
            type: 'postgres',
            url: config.url,
            extra: { options: `-c search_path=${config.schema}` }
        }).initialize()
        class Store extends AgentInvocationStore {
            async insert(record: StoredAgentInvocation) {
                return (
                    (
                        await db.query(
                            'INSERT INTO invocation(id,revision,data) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
                            [record.invocation.id, record.invocation.revision, record]
                        )
                    ).length === 1
                )
            }
            async read(id: string) {
                return (await db.query('SELECT data FROM invocation WHERE id=$1', [id]))[0]?.data
            }
            async replace(record: StoredAgentInvocation, revision: number) {
                const result = await db.query(
                    'UPDATE invocation SET data=$1, revision=$2 WHERE id=$3 AND revision=$4 RETURNING id',
                    [record, record.invocation.revision, record.invocation.id, revision]
                )
                return result[0].length === 1
            }
        }
        let child: ChildProcess,
            closed: Promise<void>,
            allowExit = false,
            original: AgentRuntimeContext
        const handle = { sessionId: 'fixed-session', runId: 'fixed-turn' }
        const strategy: IAgentRuntimeStrategy = {
            capabilities: {
                recovery: 'none',
                hostAffinity: 1,
                completionEvidence: 2,
                cancellation: true,
                idempotentCancellation: true,
                interactions: false,
                background: true
            },
            async start(_request, context) {
                original = context
                await db.query("INSERT INTO effect(event) VALUES ('tool_start')")
                child = spawn(
                    process.execPath,
                    [
                        '-e',
                        "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));setInterval(()=>process.stdout.write('tick'),20)"
                    ],
                    { stdio: ['pipe', 'pipe', 'ignore'] }
                )
                child.stdout.resume()
                closed = new Promise((resolve) => child.once('close', () => resolve()))
                await new Promise((resolve) => child.stdout.once('data', resolve))
                return { status: 'running', handle }
            },
            async inspect() {
                return { status: 'running', handle }
            },
            async cancel(): Promise<AgentRuntimeObservation> {
                await db.query("INSERT INTO effect(event) VALUES ('cancel_delivered')")
                if (!allowExit) return { status: 'cancelling', handle }
                child.stdin.end()
                await closed
                await db.query("INSERT INTO effect(event) VALUES ('tool_exit')")
                return {
                    status: 'cancelled',
                    handle,
                    controlEvidence: {
                        version: 1,
                        source: 'provider',
                        scope: 'operation',
                        state: 'settled',
                        subject: { kind: 'invocation', id: original.invocationId },
                        sessionId: handle.sessionId,
                        runId: handle.runId,
                        target: original.executionTarget,
                        outcome: 'cancelled',
                        receiptKey: 'controlled-single-process-exit',
                        observedAt: new Date().toISOString()
                    }
                }
            }
        }
        const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
        registry.register('fixture', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
        const runtime = new AgentInvocationRuntime(new Store(), registry)
        const api = runtime.scoped({
            scope: {
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                parentExecutionId: 'parent',
                callerAgentKey: 'agent'
            },
            authorize: async () => undefined,
            capabilities: new DefaultRuntimeCapabilityRegistry()
        })
        const request: AgentInvocationRequest = {
            callId: 'one-tool',
            target: {
                provider: 'fixture',
                bindingId: 'binding',
                reference: 'profile',
                revision: '1',
                configuration: {}
            },
            input: { prompt: 'single side effect' }
        }
        let id: string
        await db.query('INSERT INTO host(id) VALUES ($1)', [config.host])
        let finished = false
        while (!finished) {
            const pending = await db.query('SELECT * FROM command WHERE host=$1 AND done=false ORDER BY created', [
                config.host
            ])
            for (const raw of pending) {
                const message = z
                    .object({
                        op: z.enum(['start', 'cancel', 'inspect', 'poll', 'release', 'close']),
                        id: z.string(),
                        invocation: z.string().nullable()
                    })
                    .parse(raw)
                try {
                    id ??= message.invocation
                    let result: unknown
                    if (message.op === 'start') {
                        const started = await api.start(request)
                        result = started
                        id = started.id
                    }
                    if (message.op === 'cancel') result = await api.cancel(id)
                    if (message.op === 'inspect') result = await api.inspect(id)
                    if (message.op === 'poll') {
                        await runtime.reconcileOwned()
                        result = await api.inspect(id)
                    }
                    if (message.op === 'release') {
                        allowExit = true
                        await runtime.reconcileOwned()
                        result = await api.inspect(id)
                    }
                    await db.query('UPDATE command SET done=true,response=$2 WHERE id=$1', [message.id, { result }])
                    if (message.op === 'close') finished = true
                } catch (error) {
                    await db.query('UPDATE command SET done=true,response=$2 WHERE id=$1', [
                        message.id,
                        { error: error instanceof Error ? error.message : 'fixture failed' }
                    ])
                }
            }
            if (!finished) await new Promise((resolve) => setTimeout(resolve, 20))
        }
        if (child && child.exitCode === null && child.signalCode === null) {
            child.stdin.end()
            await closed
        }
        await db.destroy()
    },
    90_000
)
