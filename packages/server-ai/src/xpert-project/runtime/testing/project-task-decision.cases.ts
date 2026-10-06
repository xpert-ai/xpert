import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { ProjectTaskDecisionInput, ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../../../agent-invocation/invocation.entity'
import { TypeOrmAgentInvocationStore } from '../../../agent-invocation/typeorm-invocation.store'
import { AgentInvocationFactoryService } from '../../../agent-invocation/invocation-factory.service'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ProjectTaskDecisionService } from '../project-task-decision.service'
import { ProjectTaskDispatchService } from '../project-task-dispatch.service'
import { ProjectTaskCaller } from '../project-task-dispatch.schema'
import { ProjectTaskRuntimeContextService } from '../project-task-runtime-context.service'

type Fixture = {
    database: DataSource
    store: TypeOrmAgentInvocationStore
    service: ProjectTaskDispatchService
    factory: AgentInvocationFactoryService
    scope: AgentInvocationScope
    caller: ProjectTaskCaller
    input: ProjectTaskDispatchInput
    context: ProjectTaskRuntimeContextService
}

export function projectTaskDecisionCases(fixture: () => Fixture) {
    describe('business acceptance and independent review', () => {
        let f: Fixture, decisions: ProjectTaskDecisionService
        beforeEach(() => {
            f = fixture()
            jest.spyOn(f.context, 'actor').mockImplementation(() => f.scope)
            const access = Object.assign(
                Object.create(XpertProjectAccessService.prototype) as XpertProjectAccessService,
                { assertCanEdit: jest.fn() }
            )
            decisions = new ProjectTaskDecisionService(
                f.database.getRepository(XpertProjectTask),
                access,
                f.context,
                f.factory
            )
        })
        async function finish(invocationId: string, text = 'Implementation with checks') {
            const saved = await f.store.read(invocationId, f.scope)
            const invocation = {
                ...saved.invocation,
                status: 'succeeded' as const,
                result: { text },
                revision: saved.invocation.revision + 1,
                updatedAt: new Date().toISOString()
            }
            await f.store.replace({ ...saved, invocation }, saved.invocation.revision)
            return invocation
        }
        async function implemented(): Promise<ProjectTaskDecisionInput> {
            const receipt = await f.service.dispatch(f.scope.projectId, f.input, f.caller)
            const invocation = await finish(receipt.invocationId)
            await f.database.getRepository(XpertProjectTask).update({ id: f.input.taskId }, { status: 'review' })
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: f.input.taskId })
            const attempt = await f.database
                .getRepository(XpertProjectTaskExecution)
                .findOneBy({ id: receipt.taskExecutionId })
            return {
                requestId: randomUUID(),
                taskId: task.id,
                expectedRevision: task.revision,
                implementationExecutionId: attempt.id,
                specificationDigest: attempt.specificationSnapshot.digest,
                evidence: [{ type: 'invocation_result', invocationId: invocation.id, revision: invocation.revision }],
                outcome: 'accept',
                rationale: 'Checked exact implementation',
                checks: ['Inspected test evidence']
            }
        }
        it('commits decision and task status once; retry preserves the original result', async () => {
            const input = await implemented()
            const result = await decisions.decide(f.scope.projectId, input, f.caller)
            expect(result.outcome).toBe('accept')
            expect(await decisions.decide(f.scope.projectId, input, f.caller)).toEqual(result)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: f.input.taskId })
            expect(task.status).toBe('done')
            expect(task.decisions).toHaveLength(1)
            await expect(
                decisions.decide(f.scope.projectId, { ...input, rationale: 'changed' }, f.caller)
            ).rejects.toThrow()
        })
        it('one concurrent decision wins the task revision', async () => {
            const input = await implemented()
            const results = await Promise.allSettled([
                decisions.decide(f.scope.projectId, input, f.caller),
                decisions.decide(f.scope.projectId, { ...input, requestId: randomUUID(), outcome: 'rework' }, f.caller)
            ])
            expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
        })
        it('rejects changed specifications even with the current generic revision', async () => {
            const input = await implemented()
            await f.database
                .getRepository(XpertProjectTask)
                .update({ id: input.taskId }, { requirements: ['New requirements'] })
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            await expect(
                decisions.decide(f.scope.projectId, { ...input, expectedRevision: task.revision }, f.caller)
            ).rejects.toThrow()
        })
        it('rejects old result revisions and another responsible caller', async () => {
            const input = await implemented()
            await expect(
                decisions.decide(
                    f.scope.projectId,
                    {
                        ...input,
                        evidence: [{ type: 'invocation_result', invocationId: f.input.requestId, revision: 0 }]
                    },
                    f.caller
                )
            ).rejects.toThrow()
            const original = f.scope.callerAgentKey
            f.scope.callerAgentKey = 'other-agent'
            await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
            f.scope.callerAgentKey = original
        })
        it('keeps rework history and rejects acceptance of an older implementation', async () => {
            const input = await implemented()
            await decisions.decide(f.scope.projectId, { ...input, outcome: 'rework' }, f.caller)
            const task = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            expect(task.status).toBe('todo')
            const next = await f.service.dispatch(
                f.scope.projectId,
                { ...f.input, requestId: randomUUID(), expectedRevision: task.revision },
                f.caller
            )
            await finish(next.invocationId)
            await f.database.getRepository(XpertProjectTask).update({ id: input.taskId }, { status: 'review' })
            const latest = await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            await expect(
                decisions.decide(
                    f.scope.projectId,
                    { ...input, requestId: randomUUID(), expectedRevision: latest.revision },
                    f.caller
                )
            ).rejects.toThrow()
            expect(latest.decisions).toHaveLength(1)
        })
        for (const verdict of ['pass', 'changes_required', 'indeterminate', 'prose'] as const) {
            it(`independent review ${verdict} cannot silently complete the task`, async () => {
                const input = await implemented()
                const binding = await f.database
                    .getRepository(AgentRuntimeBindingEntity)
                    .findOneBy({ id: f.input.bindingId })
                binding.target = {
                    ...binding.target,
                    provider: 'opencode',
                    configuration: { executionEnvironment: { type: 'computer' } }
                }
                await f.database.getRepository(AgentRuntimeBindingEntity).save(binding)
                // The implementation keeps its original binding snapshot; use a separate review binding.
                const reviewBindingId = randomUUID()
                await f.database.getRepository(AgentRuntimeBindingEntity).save({
                    ...binding,
                    id: reviewBindingId,
                    target: { ...binding.target, bindingId: reviewBindingId }
                })
                binding.target = { ...binding.target, provider: 'test', configuration: {} }
                await f.database.getRepository(AgentRuntimeBindingEntity).save(binding)
                const purpose = {
                    type: 'review' as const,
                    implementationExecutionId: input.implementationExecutionId,
                    implementationInvocationId:
                        input.evidence[0].type === 'invocation_result' ? input.evidence[0].invocationId : '',
                    specificationDigest: input.specificationDigest,
                    evidence: input.evidence
                }
                const receipt = await f.service.dispatch(
                    f.scope.projectId,
                    {
                        ...f.input,
                        bindingId: reviewBindingId,
                        requestId: randomUUID(),
                        expectedRevision: input.expectedRevision,
                        purpose
                    },
                    f.caller
                )
                const row = await f.database
                    .getRepository(AgentInvocationEntity)
                    .findOneBy({ id: receipt.invocationId })
                expect(row.invocation.request.input.prompt).toContain('All tools are disabled')
                expect(row.invocation.request.dispatch.projectTask.purpose).toEqual(purpose)
                await finish(
                    receipt.invocationId,
                    verdict === 'prose'
                        ? 'Everything passed'
                        : JSON.stringify({
                              version: 1,
                              verdict,
                              specificationDigest: purpose.specificationDigest,
                              implementationInvocationId: purpose.implementationInvocationId,
                              evidence: purpose.evidence,
                              findings: ['Reviewed supplied tests'],
                              limitations: ['No independent execution']
                          })
                )
                expect((await f.database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe(
                    'review'
                )
                await expect(decisions.decide(f.scope.projectId, input, f.caller)).rejects.toThrow()
                const decision = decisions.decide(
                    f.scope.projectId,
                    { ...input, reviewExecutionId: receipt.taskExecutionId },
                    f.caller
                )
                if (verdict === 'pass') await expect(decision).resolves.toMatchObject({ outcome: 'accept' })
                else await expect(decision).rejects.toThrow()
            })
        }
    })
}
