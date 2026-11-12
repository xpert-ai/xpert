jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskStep } from '../entities/project-task-step.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectTaskService } from './project-task.service'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const base = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }
const taskBase = { ...base, projectId: uuid, createdById: { ...uuid, nullable: true } }
const schemas = [
    new EntitySchema<XpertProject>({ name: 'XpertProject', target: XpertProject, tableName: 'xpert_project', columns: base }),
    new EntitySchema<XpertProjectTask>({ name: 'XpertProjectTask', target: XpertProjectTask, tableName: 'xpert_project_task', columns: {
        ...taskBase, name: text, title: { ...text, nullable: true }, kind: text, status: text,
        revision: { type: 'int', version: true }, createdAt: { type: 'timestamptz', createDate: true },
        reviewSubject: { type: 'jsonb', nullable: true }
    }, relations: {
        steps: { type: 'one-to-many', target: 'XpertProjectTaskStep', inverseSide: 'task' },
        executions: { type: 'one-to-many', target: 'XpertProjectTaskExecution', inverseSide: 'task' }
    } }),
    new EntitySchema<XpertProjectTaskStep>({ name: 'XpertProjectTaskStep', target: XpertProjectTaskStep, tableName: 'xpert_project_task_step', columns: {
        ...taskBase, taskId: uuid, stepIndex: { type: 'int' }, description: text, status: text,
        notes: { ...text, default: '' }
    }, relations: { task: { type: 'many-to-one', target: 'XpertProjectTask', joinColumn: { name: 'taskId' } } } }),
    new EntitySchema<XpertProjectTaskExecution>({ name: 'XpertProjectTaskExecution', target: XpertProjectTaskExecution, tableName: 'xpert_project_task_execution', columns: {
        ...taskBase, taskId: uuid, status: text, invocationId: { ...uuid, nullable: true }, purpose: { type: 'jsonb', nullable: true }
    }, relations: { task: { type: 'many-to-one', target: 'XpertProjectTask', joinColumn: { name: 'taskId' } } } })
]
type CoordinationPatch = Partial<Pick<XpertProjectTaskExecution,
    'tenantId' | 'organizationId' | 'projectId' | 'taskId' | 'purpose' | 'invocationId'>>

integration('Task completion guards / PostgreSQL', () => {
    let database: DataSource
    let service: XpertProjectTaskService
    const schema = `task_completion_${randomUUID().replace(/-/g, '')}`
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const projectId = randomUUID(), taskId = randomUUID(), childId = randomUUID(), stepId = randomUUID()
    const subject = { implementationTaskId: childId, implementationExecutionId: randomUUID(),
        specificationDigest: `sha256:${'a'.repeat(64)}` }

    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_')) throw new Error('Dedicated test database required')
        database = await new DataSource({ type: 'postgres', url }).initialize()
        await database.query(`CREATE SCHEMA ${schema}`)
        await database.destroy()
        database = await new DataSource({ type: 'postgres', url, schema,
            extra: { options: `-c search_path=${schema}` }, entities: schemas }).initialize()
        await database.synchronize()
        service = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
        Object.assign(service, { repository: database.getRepository(XpertProjectTask),
            projectRepository: { findOne: async () => ({ id: projectId, settings: { managementMode: 'advanced' }, xperts: [] }) } })
    })
    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        await database.query('TRUNCATE xpert_project_task_execution, xpert_project_task_step, xpert_project_task, xpert_project CASCADE')
        await database.getRepository(XpertProject).insert({ id: projectId, tenantId: actor.tenantId, organizationId: actor.organizationId })
        await database.getRepository(XpertProjectTask).insert([taskRow(taskId), taskRow(childId)])
        await database.getRepository(XpertProjectTaskStep).insert({ ...taskRow(stepId), taskId,
            stepIndex: 1, description: 'Check result', status: 'pending', notes: '' })
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => {
        if (database?.isInitialized) { await database.query(`DROP SCHEMA ${schema} CASCADE`); await database.destroy() }
    })

    function taskRow(id: string) {
        return { id, projectId, tenantId: actor.tenantId, organizationId: actor.organizationId,
            createdById: actor.userId, name: 'Work', kind: 'task' as const, status: 'in_progress' as const, revision: 1 }
    }
    async function protect(kind: 'review' | 'summary') {
        if (kind === 'review') await database.getRepository(XpertProjectTask).update(taskId, { reviewSubject: subject })
        else {
            await database.getRepository(XpertProjectTask).update(taskId, { kind: 'summary' })
            await addCoordination()
        }
    }
    async function addCoordination(patch: CoordinationPatch = {}) {
        await database.getRepository(XpertProjectTaskExecution).insert({ id: randomUUID(), taskId: childId,
            projectId, tenantId: actor.tenantId, organizationId: actor.organizationId, status: 'succeeded',
            purpose: { type: 'implementation', coordination: { taskId, specificationDigest: subject.specificationDigest } }, ...patch })
    }

    it.each(['review', 'summary'] as const)('rejects explicit completion of %s through ordinary write paths', async (kind) => {
        await protect(kind)
        for (const status of ['done', 'completed'] as const) {
            await expect(service.updateTask(projectId, taskId, { status })).rejects.toThrow()
            await expect(service.saveAll({ id: taskId, projectId, name: 'Changed', status, steps: [] })).rejects.toThrow()
            await expect(service.updateTaskSteps(projectId, undefined, { id: taskId, status })).rejects.toThrow()
        }
        expect(await database.getRepository(XpertProjectTask).findOneBy({ id: taskId }))
            .toMatchObject({ name: 'Work', status: 'in_progress' })
    })

    it.each(['review', 'summary'] as const)('rolls back steps when implicit %s completion is rejected', async (kind) => {
        await protect(kind)
        await expect(service.updateTaskSteps(projectId, undefined,
            { id: taskId, steps: [{ stepIndex: 1, status: 'done', notes: 'Should roll back' }] })).rejects.toThrow()
        expect(await database.getRepository(XpertProjectTaskStep).findOneBy({ id: stepId }))
            .toMatchObject({ status: 'pending', notes: '' })
        expect(await database.getRepository(XpertProjectTask).findOneBy({ id: taskId }))
            .toMatchObject({ status: 'in_progress' })
    })

    it.each(['review', 'summary'] as const)('allows nonterminal updates to a protected %s', async (kind) => {
        await protect(kind)
        await service.updateTask(projectId, taskId, { status: 'blocked', title: 'Needs attention' })
        expect(await database.getRepository(XpertProjectTask).findOneBy({ id: taskId }))
            .toMatchObject({ status: 'blocked', title: 'Needs attention' })
    })

    it('retains automatic completion for an ordinary task without runtime attempts', async () => {
        await service.updateTaskSteps(projectId, undefined, { id: taskId, steps: [{ stepIndex: 1, status: 'done' }] })
        expect(await database.getRepository(XpertProjectTask).findOneBy({ id: taskId })).toMatchObject({ status: 'done' })
    })

    it.each(['tenant', 'organization', 'project', 'summary'] as const)('ignores unrelated %s coordination', async (boundary) => {
        await database.getRepository(XpertProjectTask).update(taskId, { kind: 'summary' })
        const patch: CoordinationPatch = {}
        if (boundary === 'tenant') patch.tenantId = randomUUID()
        if (boundary === 'organization') patch.organizationId = randomUUID()
        if (boundary === 'project') patch.projectId = randomUUID()
        if (boundary === 'summary') patch.purpose = { type: 'implementation',
            coordination: { taskId: randomUUID(), specificationDigest: subject.specificationDigest } }
        await addCoordination(patch)
        await service.updateTask(projectId, taskId, { status: 'done' })
        expect(await database.getRepository(XpertProjectTask).findOneBy({ id: taskId })).toMatchObject({ status: 'done' })
    })

    it('still requires a decision for an ordinary task with a Runtime invocation', async () => {
        await addCoordination({ taskId, purpose: { type: 'implementation' }, invocationId: randomUUID() })
        await expect(service.updateTask(projectId, taskId, { status: 'done' })).rejects.toThrow()
    })
})
