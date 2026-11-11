jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { CommandBus } from '@nestjs/cqrs'
import i18next from 'i18next'
import { Repository } from 'typeorm'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { ProjectTaskRuntimeReadService } from './project-task-runtime-read.service'

const taskId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const invocationId = '33333333-3333-4333-8333-333333333333'
const attemptId = '44444444-4444-4444-8444-444444444444'
const purpose = { type: 'review', mode: 'execution', candidatePaths: ['plugin'],
    implementationExecutionId: '55555555-5555-4555-8555-555555555555', implementationInvocationId: invocationId,
    specificationDigest: `sha256:${'a'.repeat(64)}`, evidence: [{ type: 'invocation_result', invocationId, revision: 3 }] }

function fixture(status = 'succeeded') {
    const invocation = { id: invocationId, status, revision: 4, scope: { callerType: 'xpert' }, request: {
        target: { provider: 'codex-computer' }, dispatch: { projectTask: { projectId, projectTaskId: taskId, taskExecutionId: attemptId } }
    }, result: { text: '```xpert-task-result\n{"version":1,"summary":{},"items":[]}\n```' } }
    const inspect = jest.fn().mockResolvedValue(invocation)
    const assertCanRead = jest.fn()
    const findOneBy = jest.fn().mockResolvedValue({ id: invocationId, invocation })
    const repository = Object.assign(Object.create(Repository.prototype) as Repository<XpertProjectTask>, {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({ id: taskId, projectId, title: 'Plugin', requirements: ['Works'], steps: [],
            executions: [{ id: attemptId, taskId, projectId, invocationId, attempt: 1, purpose }] }),
        manager: { getRepository: () => ({ findOneBy, find: jest.fn().mockResolvedValue([]) }) }
    })
    const service = new ProjectTaskRuntimeReadService(repository,
        Object.assign(Object.create(XpertProjectAccessService.prototype) as XpertProjectAccessService, { assertCanRead }),
        Object.assign(Object.create(ProjectTaskRuntimeContextService.prototype) as ProjectTaskRuntimeContextService, {
            actor: () => ({ tenantId: 'tenant', organizationId: 'organization', userId: 'owner' })
        }),
        Object.assign(Object.create(AgentInvocationFactoryService.prototype) as AgentInvocationFactoryService, {
            createCapturedApi: () => ({ inspect })
        }), Object.create(CommandBus.prototype) as CommandBus)
    return { service, inspect, assertCanRead, findOneBy, invocation, repository }
}

beforeAll(async () => { await i18next.init({ lng: 'en' }) })

it('exposes bounded rejection diagnostics to the authorized caller without accepting the report', async () => {
    const f = fixture()
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReport: null,
        reviewReportDiagnostic: { code: 'outer_envelope_invalid', issues: expect.arrayContaining([
            { path: 'summary', message: 'Expected string; received object.' }
        ]) }
    })
    expect(f.findOneBy).toHaveBeenCalledWith({ id: invocationId, tenantId: 'tenant', organizationId: 'organization', ownerId: 'owner' })
})

it.each(['queued', 'running', 'failed', 'cancelled'])('does not diagnose report delivery for a %s invocation', async (status) => {
    const result = await fixture(status).service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReportDiagnostic: null })
})

it('retains the read authorization boundary before reporting any diagnostic', async () => {
    const f = fixture()
    f.assertCanRead.mockRejectedValue(new Error('Denied'))
    await expect(f.service.get(projectId, taskId)).rejects.toThrow('Denied')
    expect(f.inspect).not.toHaveBeenCalled()
    expect(f.findOneBy).not.toHaveBeenCalled()
})

it('does not inspect or expose diagnostics for an invocation outside the current owner scope', async () => {
    const f = fixture()
    f.findOneBy.mockResolvedValue(null)
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).not.toHaveProperty('reviewReportDiagnostic')
    expect(f.inspect).not.toHaveBeenCalled()
})

it('rejects a mismatched invocation task reference before inspection or diagnostics', async () => {
    const f = fixture()
    f.invocation.request.dispatch.projectTask.projectTaskId = '55555555-5555-4555-8555-555555555555'
    await expect(f.service.get(projectId, taskId)).rejects.toThrow()
    expect(f.inspect).not.toHaveBeenCalled()
})

it('returns a valid non-passing report as a verdict, not a delivery defect', async () => {
    const f = fixture()
    f.invocation.result.text = JSON.stringify({ version: 1, verdict: 'changes_required',
        implementationInvocationId: invocationId, specificationDigest: purpose.specificationDigest,
        evidence: purpose.evidence, findings: ['The result is incorrect'], limitations: [] })
    const result = await f.service.get(projectId, taskId)
    expect(result.executions[0]).toMatchObject({ reviewReport: { verdict: 'changes_required' }, reviewReportDiagnostic: null })
})
