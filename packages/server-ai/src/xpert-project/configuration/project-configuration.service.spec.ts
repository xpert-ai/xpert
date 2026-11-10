import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ForbiddenException } from '@nestjs/common'
import { projectTaskConfigurationSchema } from '@xpert-ai/contracts'
import { ProjectConfigurationService } from './project-configuration.service'
import { XpertProjectConfiguration } from './project-configuration.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectAccessRuntimeService } from '../services/project-access-runtime.service'
import { XpertProjectTypeService } from '../services/project-type.service'
import { ModelExecutionPolicyService } from '../../model-execution/execution-policy'
import { parseExecutionPolicy } from '../../model-execution/execution-policy'

async function setup() {
    const project = { id: 'project', tenantId: 'tenant', organizationId: 'org', status: 'active',
        applicationKey: 'platform', projectTypeKey: 'coding' }
    let row: Pick<XpertProjectConfiguration, 'values' | 'revision'> | null = null
    const repository = {
        findOneBy: jest.fn(async () => row), create: jest.fn((value) => value),
        save: jest.fn(async (value) => { row = value; return value }),
        manager: { transaction: jest.fn() }
    }
    const manager = { findOneOrFail: jest.fn(async () => project), getRepository: jest.fn(() => repository) }
    repository.manager.transaction.mockImplementation((work) => work(manager))
    const access = { assertCanRead: jest.fn(async () => ({ project, role: 'owner' })),
        assertCanManage: jest.fn(async () => ({ project, role: 'owner' })) }
    const runtimeAccess = { assertEdit: jest.fn(async () => project), assertHumanManageWithinTransaction: jest.fn() }
    const types = { resolve: jest.fn(() => ({ configuration: { schema: projectTaskConfigurationSchema(7200) } })) }
    const policies = { require: jest.fn(async () => parseExecutionPolicy({})) }
    const module = await Test.createTestingModule({ providers: [ProjectConfigurationService,
        { provide: getRepositoryToken(XpertProjectConfiguration), useValue: repository },
        { provide: XpertProjectAccessService, useValue: access },
        { provide: ProjectAccessRuntimeService, useValue: runtimeAccess },
        { provide: XpertProjectTypeService, useValue: types },
        { provide: ModelExecutionPolicyService, useValue: policies }
    ] }).compile()
    return { service: module.get(ProjectConfigurationService), access, runtimeAccess, repository, manager, policies }
}

describe('Project configuration persistence', () => {
    it('reads defaults without creating a configuration row', async () => {
        const f = await setup()
        expect(await f.service.get('project')).toMatchObject({ revision: 0, values: {},
            effectiveValues: { taskExecutionMaxDurationSeconds: 7200 },
            taskExecution: { defaultDurationSeconds: 3600, tenantMaxDurationSeconds: 7200, effectiveMaxDurationSeconds: 7200 } })
        expect(f.repository.save).not.toHaveBeenCalled()
        expect(f.repository.findOneBy).toHaveBeenCalledWith({ projectId: 'project', tenantId: 'tenant', organizationId: 'org' })
    })
    it('reports the tenant ceiling without rewriting the requested configuration', async () => {
        const f = await setup()
        f.policies.require.mockResolvedValue(parseExecutionPolicy({ limits: { ...parseExecutionPolicy({}).limits, maxDurationSeconds: 1800 } }))
        expect(await f.service.get('project')).toMatchObject({
            values: {}, effectiveValues: { taskExecutionMaxDurationSeconds: 7200 },
            taskExecution: { configuredMaxDurationSeconds: 7200, tenantMaxDurationSeconds: 1800,
                effectiveMaxDurationSeconds: 1800 }
        })
        expect(f.repository.save).not.toHaveBeenCalled()
    })
    it('saves only overrides, rejects stale revisions and resets to type defaults', async () => {
        const f = await setup()
        expect(await f.service.update('project', { revision: 0, values: { taskExecutionMaxDurationSeconds: 5400 } }))
            .toMatchObject({ revision: 1, taskExecution: { effectiveMaxDurationSeconds: 5400 } })
        await expect(f.service.update('project', { revision: 0, values: {} })).rejects.toThrow()
        expect(f.repository.save).toHaveBeenCalledTimes(1)
        expect(await f.service.update('project', { revision: 1, values: {} }))
            .toMatchObject({ revision: 2, values: {}, taskExecution: { effectiveMaxDurationSeconds: 7200 } })
    })
    it('checks management access and schema before entering the write transaction', async () => {
        const f = await setup()
        await expect(f.service.update('project', { revision: 0, values: { injected: true } })).rejects.toThrow()
        expect(f.repository.manager.transaction).not.toHaveBeenCalled()
        f.access.assertCanManage.mockRejectedValue(new ForbiddenException())
        await expect(f.service.update('project', { revision: 0, values: {} })).rejects.toThrow()
        expect(f.repository.manager.transaction).not.toHaveBeenCalled()
    })
    it('revalidates lifecycle and manager access after acquiring the write lock', async () => {
        const f = await setup()
        f.runtimeAccess.assertHumanManageWithinTransaction.mockRejectedValue(new ForbiddenException())
        await expect(f.service.update('project', { revision: 0, values: {} })).rejects.toThrow()
        expect(f.repository.save).not.toHaveBeenCalled()
    })
    it('uses the persisted actor scope for execution and does not allow revoked access', async () => {
        const f = await setup(), actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
        expect(await f.service.taskDuration('project', actor)).toMatchObject({ maxDurationSeconds: 7200, configurationRevision: 0 })
        expect(f.runtimeAccess.assertEdit).toHaveBeenCalledWith({ actor, projectId: 'project' })
        f.runtimeAccess.assertEdit.mockRejectedValue(new ForbiddenException())
        await expect(f.service.taskDuration('project', actor)).rejects.toThrow()
    })
})
