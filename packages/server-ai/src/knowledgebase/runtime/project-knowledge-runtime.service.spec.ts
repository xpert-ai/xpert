import { ForbiddenException, ConflictException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { ProjectKnowledgeRuntimeService } from './project-knowledge-runtime.service'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'

jest.mock('../knowledgebase.service', () => ({ KnowledgebaseService: class {} }))
const resource = { providerKey: 'platform.project', resourceId: 'project-1' }
const actor = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }
const library = { id: 'kb-1', resourceRef: resource }
function fixture() {
    const findOneBy = jest.fn().mockResolvedValue(library)
    const findOneByOrFail = jest.fn().mockResolvedValue(library)
    const add = jest.fn()
    const relation = { of: jest.fn().mockReturnThis(), loadMany: jest.fn().mockResolvedValue([]), add }
    const manager = { getRepository: jest.fn().mockReturnValue({ findOneOrFail: jest.fn().mockResolvedValue({ id: 'project-1' }) }),
        createQueryBuilder: jest.fn().mockReturnValue({ relation: jest.fn().mockReturnValue(relation) }) }
    const repository = { findOneBy, findOneByOrFail, manager: { transaction: jest.fn(work => work(manager)) } }
    const createForResource = jest.fn().mockResolvedValue(library)
    const assertManage = jest.fn().mockResolvedValue({})
    const service = new ProjectKnowledgeRuntimeService(repository as unknown as Repository<Knowledgebase>,
        { createForResource } as unknown as KnowledgebaseService,
        { assertManage } as unknown as ProjectAccessRuntimeService)
    return { service, findOneBy, findOneByOrFail, createForResource, assertManage, relation, add }
}
afterEach(() => jest.restoreAllMocks())
beforeEach(() => {
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
})
describe('Content knowledge provisioning', () => {
    it('requires Project management and binds one Project-owned library', async () => {
        const f = fixture()
        await expect(f.service.ensureBinding({ actor, title: 'Team', projectId: 'project-1' })).resolves.toEqual({ knowledgebaseId: 'kb-1' })
        expect(f.assertManage).toHaveBeenCalledWith({ actor: { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }, projectId: 'project-1' })
        expect(f.add).toHaveBeenCalledWith('kb-1')
        f.relation.loadMany.mockResolvedValue([library])
        await f.service.ensureBinding({ actor, title: 'Team', projectId: 'project-1' })
        expect(f.add).toHaveBeenCalledTimes(1)
    })
    it('rejects a context/actor mismatch before provisioning', async () => {
        const f = fixture()
        await expect(f.service.ensureBinding({ actor: { ...actor, userId: 'other' }, title: 'Team', projectId: 'project-1' })).rejects.toThrow(ForbiddenException)
        expect(f.assertManage).not.toHaveBeenCalled()
        expect(f.findOneBy).not.toHaveBeenCalled()
    })
    it('never provisions after a Project authorization failure', async () => {
        const f = fixture(); f.assertManage.mockRejectedValue(new ForbiddenException())
        await expect(f.service.ensureBinding({ actor, title: 'Team', projectId: 'project-1' })).rejects.toThrow(ForbiddenException)
        expect(f.findOneBy).not.toHaveBeenCalled(); expect(f.add).not.toHaveBeenCalled()
    })
    it('recovers a concurrent creation without adopting an unrelated resource', async () => {
        const f = fixture(); f.findOneBy.mockResolvedValueOnce(null); f.createForResource.mockRejectedValue(new Error('duplicate'))
        await expect(f.service.ensureBinding({ actor, title: 'Team', projectId: 'project-1' })).resolves.toEqual({ knowledgebaseId: 'kb-1' })
        expect(f.createForResource).toHaveBeenCalledWith(expect.objectContaining({ recall: { mode: 'keyword', topK: 8 } }), resource)
        f.findOneByOrFail.mockResolvedValue({ id: 'other-kb', resourceRef: { providerKey: 'other', resourceId: 'private' } })
        await expect(f.service.ensureBinding({ actor, title: 'Team', projectId: 'project-1' })).rejects.toThrow(ConflictException)
    })
})
