import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import Bull from 'bull'
import { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { ProjectTaskDispatchService } from '../../../xpert-project/runtime/project-task-dispatch.service'
import { ProjectTaskCaller } from '../../../xpert-project/runtime/project-task-dispatch.schema'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../runtime-message.entity'

type Fixture = {
    database: DataSource
    service: ProjectTaskDispatchService
    scope: AgentInvocationScope
    caller: ProjectTaskCaller
    input: ProjectTaskDispatchInput
    start: jest.Mock
}

export function queueRecoveryCases(fixture: () => Fixture) {
    const integration = process.env.XPERT_EXECUTION_TEST_REDIS_URL ? it : it.skip
    integration(
        'recovers killed producer/receiver/consumer processes and a restarted Redis without duplicate execution',
        async () => {
            const { database, service, scope, caller, input, start } = fixture()
            const redis = new URL(process.env.XPERT_EXECUTION_TEST_REDIS_URL)
            const container = process.env.XPERT_EXECUTION_TEST_REDIS_CONTAINER
            if (redis.hostname !== '127.0.0.1' || !container?.startsWith('xpert-recovery-test-'))
                throw new Error('Dedicated recovery-test Redis required')
            const label = execFileSync(
                'docker',
                ['inspect', '--format', '{{index .Config.Labels "ai.xpert.test"}}', container],
                { encoding: 'utf8' }
            ).trim()
            if (label !== 'runtime-recovery') throw new Error('Refusing to restart unrelated Redis')
            const receipt = await service.dispatch(scope.projectId, input, caller)
            const queueName = `xpert-recovery-${randomUUID()}`
            const schema = database.options.type === 'postgres' ? database.options.schema : undefined
            async function phase(name: string, killed = false) {
                await new Promise<void>((resolve, reject) => {
                    const child = spawn(
                        process.execPath,
                        [
                            require.resolve('jest/bin/jest'),
                            '--config',
                            'packages/server-ai/jest.config.ts',
                            '--runInBand',
                            '--runTestsByPath',
                            'packages/server-ai/src/handoff/runtime-messaging/testing/queue-recovery.worker.spec.ts'
                        ],
                        {
                            cwd: process.cwd(),
                            env: {
                                ...process.env,
                                XPERT_EXECUTION_TEST_REDIS_URL: redis.href,
                                XPERT_RECOVERY_CHILD: JSON.stringify({
                                    phase: name,
                                    schema,
                                    invocationId: receipt.invocationId,
                                    queue: queueName
                                })
                            },
                            stdio: ['ignore', 'pipe', 'pipe']
                        }
                    )
                    let log = ''
                    const collect = (chunk: Buffer) => {
                        log = (log + chunk.toString()).slice(-6000)
                    }
                    child.stdout.on('data', collect)
                    child.stderr.on('data', collect)
                    let timedOut = false
                    const timer = setTimeout(() => {
                        timedOut = true
                        child.kill('SIGKILL')
                    }, 90_000)
                    child.once('error', reject)
                    child.once('exit', (code, signal) => {
                        clearTimeout(timer)
                        if (!timedOut && (killed ? signal === 'SIGKILL' : code === 0)) resolve()
                        else reject(new Error(`${name}: ${code}/${signal}\n${log}`))
                    })
                })
            }
            await phase('persist', true)
            expect(
                (await database.getRepository(AgentInvocationEntity).findOneByOrFail({ id: receipt.invocationId }))
                    .invocation.status
            ).toBe('succeeded')
            expect(
                (
                    await database
                        .getRepository(AgentRuntimeDelivery)
                        .findOneByOrFail({ invocationId: receipt.invocationId })
                ).state
            ).toBe('pending')
            await phase('send')
            await phase('receive-crash', true)
            expect(
                await database.getRepository(AgentRuntimeInbox).countBy({ invocationId: receipt.invocationId })
            ).toBe(1)
            execFileSync('docker', ['restart', container], { stdio: 'ignore' })
            // Docker Desktop may reassign an ephemeral published port on restart.
            redis.port = execFileSync('docker', ['port', container, '6379/tcp'], { encoding: 'utf8' })
                .trim()
                .split(':')
                .at(-1)
            for (let attempt = 0; attempt < 40; attempt++) {
                try {
                    execFileSync('docker', ['exec', container, 'redis-cli', 'ping'], { stdio: 'ignore' })
                    break
                } catch {
                    if (attempt === 39) throw new Error('Restarted Redis did not become ready')
                    await new Promise((resolve) => setTimeout(resolve, 250))
                }
            }
            await phase('receive')
            expect(
                await database.getRepository(AgentRuntimeInbox).countBy({ invocationId: receipt.invocationId })
            ).toBe(1)
            await phase('consume-crash', true)
            const claimed = await database
                .getRepository(AgentRuntimeInbox)
                .findOneByOrFail({ invocationId: receipt.invocationId })
            expect(claimed.phase).toBe('started')
            // Let the production lease actually expire; do not edit stored claims or clocks.
            await new Promise((resolve) =>
                setTimeout(resolve, Math.max(0, claimed.leaseUntil.getTime() - Date.now()) + 500)
            )
            await phase('consume')
            const finished = await database.getRepository(AgentRuntimeInbox).findOneByOrFail({ id: claimed.id })
            expect(finished.claim).toEqual(claimed.claim)
            expect(await database.getRepository(XpertAgentExecution).countBy({ threadId: caller.threadId })).toBe(2)
            expect(start).toHaveBeenCalledTimes(1)
            const queue = new Bull(queueName, redis.href)
            try {
                expect(await queue.getJobCounts()).toMatchObject({ waiting: 0, active: 0, failed: 0 })
            } finally {
                await queue.close()
            }
        },
        480_000
    )
}
