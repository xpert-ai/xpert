jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))
import { randomUUID } from 'node:crypto'
import { ProjectTaskExperts, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertProjectTaskService } from '../services/project-task.service'
import { ListProjectExpertsCommand } from './list-project-experts.command'
import { projectExpertsFixture } from './testing/project-experts.fixture'

describe('Project expert discovery and explicit assignment integration', () => {
    let f: Awaited<ReturnType<typeof projectExpertsFixture>>
    beforeEach(async () => {
        f = await projectExpertsFixture()
    })
    afterEach(async () => {
        await f?.module.close()
        jest.restoreAllMocks()
    })
    const discover = () => f.commands.execute(new ListProjectExpertsCommand(f.project.id, f.caller))

    it('unblocks private-chat MVP 04 by discovering self, assigning, rereading and delegating to Codex', async () => {
        const dispatch = () =>
            f.tool('project_dispatch_task').invoke(
                {
                    taskId: f.task.id,
                    bindingId: f.target.bindingId,
                    expectedRevision: 3
                },
                { configurable: { tool_call_id: 'dispatch-before-assignment' } }
            )
        await expect(dispatch()).rejects.toMatchObject({ status: 409 })
        await expect(f.update.invoke({ tasks: [{ id: f.task.id, assigneeXpertId: f.actor.id }] })).rejects.toThrow()

        const found: ProjectTaskExperts = await f.tool('project_list_experts').invoke(
            {},
            {
                configurable: { tool_call_id: 'discover-self' }
            }
        )
        expect(found).toEqual({
            currentExpert: { xpertId: f.expert.id, agentKey: f.caller.agentKey, assigneeXpertId: f.expert.id },
            experts: [{ assigneeXpertId: f.expert.id, name: f.expert.name, title: f.expert.title, isCurrent: true }]
        })
        expect(f.task.assigneeXpertId).toBeNull()
        expect(f.task.revision).toBe(3)
        expect(f.start).not.toHaveBeenCalled()
        expect(f.projects.save).not.toHaveBeenCalled()
        expect(f.tasks.save).not.toHaveBeenCalled()
        expect(f.membership.findOne).not.toHaveBeenCalled() // Human owner is not an Assistant membership.

        await f.update.invoke({ tasks: [{ id: f.task.id, assigneeXpertId: found.currentExpert.assigneeXpertId }] })
        expect(f.task.assigneeXpertId).toBe(f.expert.id)
        expect(f.start).not.toHaveBeenCalled()
        await expect(dispatch()).rejects.toMatchObject({ status: 409 }) // Old revision stays invalid.
        const detail = await f.tool('project_get_task').invoke({ taskId: f.task.id })
        expect(detail.revision).toBe(4)
        const runtimes = await f.tool('project_list_task_runtimes').invoke(
            {},
            {
                configurable: { tool_call_id: 'list-runtimes' }
            }
        )
        expect(runtimes[0].bindingId).toBe(f.target.bindingId)
        expect(runtimes[0]).not.toHaveProperty('assigneeXpertId')
        await f.tool('project_dispatch_task').invoke(
            {
                taskId: f.task.id,
                bindingId: runtimes[0].bindingId,
                expectedRevision: detail.revision
            },
            { configurable: { tool_call_id: 'dispatch-assigned-task' } }
        )
        expect(f.start).toHaveBeenCalledTimes(1)
        expect(f.attempts).toHaveLength(1)
        expect(f.attempts[0].xpertId).toBe(f.expert.id)
        expect(f.start.mock.calls[0][1].target.provider).toBe('codex-computer')
    })

    it('deduplicates historical bindings and returns a current ID that assignment accepts', async () => {
        const old = Object.assign(new Xpert(), f.expert, { id: randomUUID(), latest: false, version: '5' })
        f.records.set(old.id, old)
        f.project.xperts = [old, old]
        f.caller.xpertId = old.id
        f.execution.xpertId = old.id
        f.execution.xpert = old
        const result = await discover()
        expect(result.currentExpert).toEqual({
            xpertId: old.id,
            agentKey: f.caller.agentKey,
            assigneeXpertId: f.expert.id
        })
        expect(result.experts).toHaveLength(1)
        await f.update.invoke({ tasks: [{ id: f.task.id, assigneeXpertId: result.experts[0].assigneeXpertId }] })
        expect(f.task.assigneeXpertId).toBe(f.expert.id)
        expect(f.project.xperts).toEqual([old, old])
        expect(f.projects.save).not.toHaveBeenCalled()
    })

    it('lists only bound, published, current, in-scope and currently authorized experts', async () => {
        const add = (changes: Partial<Xpert>, linked = true) => {
            const item = Object.assign(new Xpert(), f.expert, { id: randomUUID(), slug: randomUUID() }, changes)
            f.records.set(item.id, item)
            f.grants.add(item.id)
            if (linked) f.project.xperts.push(item)
            return item
        }
        const colleague = add({ title: 'Reviewer' })
        const revoked = add({})
        f.grants.delete(revoked.id)
        add({ publishAt: null })
        add({ latest: false })
        add({ tenantId: randomUUID() })
        add({ organizationId: randomUUID() })
        add({}, false)
        const result = await discover()
        expect(result.experts.map((item) => item.assigneeXpertId)).toEqual([f.expert.id, colleague.id])
        expect(result.experts[1].isCurrent).toBe(false)
        expect(JSON.stringify(result)).not.toContain('must not be returned')
        f.grants.delete(colleague.id)
        expect((await discover()).experts).toHaveLength(1)
        f.grants.delete(f.expert.id)
        expect(await discover()).toEqual({
            currentExpert: { xpertId: f.expert.id, agentKey: f.caller.agentKey, assigneeXpertId: null },
            experts: []
        })
    })

    it('rejects a removed expert or a Runtime binding ID at assignment time', async () => {
        const result = await discover()
        await expect(
            f.update.invoke({ tasks: [{ id: f.task.id, assigneeXpertId: f.target.bindingId }] })
        ).rejects.toThrow()
        f.project.xperts = []
        await expect(
            f.update.invoke({ tasks: [{ id: f.task.id, assigneeXpertId: result.currentExpert.assigneeXpertId }] })
        ).rejects.toThrow()
        expect(f.task.assigneeXpertId).toBeNull()
        expect(f.start).not.toHaveBeenCalled()
    })

    it('stores canonical expert IDs in batch assignment too', async () => {
        const old = Object.assign(new Xpert(), f.expert, { id: randomUUID(), latest: false, version: '5' })
        f.records.set(old.id, old)
        f.project.xperts = [old]
        f.tasks.find.mockResolvedValueOnce([f.task])
        await f.module.get(XpertProjectTaskService).batchUpdate(f.project.id, {
            ids: [f.task.id],
            assigneeXpertId: old.id
        })
        expect(f.task.assigneeXpertId).toBe(f.expert.id)
    })

    it('keeps a USER_XPERT client secret within its Assistant audience', async () => {
        const colleague = Object.assign(new Xpert(), f.expert, { id: randomUUID(), slug: 'other' })
        f.records.set(colleague.id, colleague)
        f.project.xperts.push(colleague)
        f.grants.add(colleague.id)
        f.auth.principal = {
            ...f.actor,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: f.expert.id }
        }
        expect((await discover()).experts.map((item) => item.assigneeXpertId)).toEqual([f.expert.id])
    })

    it('returns null currentExpert for the Project general agent, including an empty directory', async () => {
        f.caller = { ...f.caller, type: 'project_agent', xpertId: undefined, agentKey: 'general_agent' }
        f.execution.type = 'project_agent'
        f.execution.xpertId = null
        f.execution.xpert = null
        f.execution.agentKey = 'general_agent'
        expect(await discover()).toMatchObject({ currentExpert: null, experts: [{ isCurrent: false }] })
        f.project.xperts = []
        expect(await discover()).toEqual({ currentExpert: null, experts: [] })
    })

    it.each(['tenant', 'organization', 'user', 'project', 'conversation', 'execution', 'thread', 'expert', 'agent'])(
        'rejects a mismatched %s scope before returning identities',
        async (dimension) => {
            if (dimension === 'tenant') f.actor.tenantId = randomUUID()
            if (dimension === 'organization')
                jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(randomUUID())
            if (dimension === 'user') f.actor.id = randomUUID()
            if (dimension === 'project') f.conversation.projectId = randomUUID()
            if (dimension === 'conversation') f.caller.conversationId = randomUUID()
            if (dimension === 'execution') f.caller.executionId = randomUUID()
            if (dimension === 'thread') f.caller.threadId = randomUUID()
            if (dimension === 'expert') f.caller.xpertId = randomUUID()
            if (dimension === 'agent') f.caller.agentKey = 'another-agent'
            await expect(discover()).rejects.toMatchObject({ status: 403 })
            expect(f.start).not.toHaveBeenCalled()
        }
    )

    it.each(['removed', 'archived', 'member'])('rechecks %s Project authorization', async (change) => {
        if (change === 'removed') f.project.xperts = []
        if (change === 'archived') f.project.status = 'archived'
        if (change === 'member') {
            f.project.ownerId = randomUUID()
            f.membership.findOne.mockResolvedValue({ role: 'member' })
        }
        await expect(discover()).rejects.toMatchObject({ status: 403 })
    })

    it('does not hide infrastructure failures as an empty directory', async () => {
        f.xperts.createQueryBuilder.mockImplementationOnce(() => {
            throw new Error('database unavailable')
        })
        await expect(discover()).rejects.toThrow('database unavailable')
    })
})
