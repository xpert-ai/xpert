import { AiModelTypeEnum, ModelReplacementInput, TXpertTeamDraft } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Xpert } from '../xpert.entity'
import { ModelReplacementService } from './replacement.service'
import { draftRevision } from './replacement'

describe('model replacement authorization and revisions', () => {
    const source = { copilotId: 'source', model: 'chat', modelType: AiModelTypeEnum.LLM as const }
    const input: ModelReplacementInput = { source, target: { ...source, copilotId: 'target' }, policy: 'reset' }
    const draft: TXpertTeamDraft = { team: { copilotModel: source }, nodes: [], connections: [] }
    function setup() {
        const current = {
            id: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace',
            latest: true,
            draft: structuredClone(draft)
        }
        const repository = {
            findOne: jest.fn().mockResolvedValue(current),
            update: jest.fn(),
            manager: { transaction: jest.fn() }
        }
        const operations = {
            save: jest.fn().mockResolvedValue({ id: 'operation' }),
            findOne: jest.fn(),
            update: jest.fn(),
            manager: repository.manager
        }
        const manager = { getRepository: (type: typeof Xpert) => (type === Xpert ? repository : operations) }
        repository.manager.transaction.mockImplementation((callback) => callback(manager))
        const access = { assertCanWrite: jest.fn().mockResolvedValue({}) }
        const catalog = [
            {
                id: 'target',
                modelProvider: { id: 'provider' },
                providerWithModels: { models: [{ model: 'chat', model_type: AiModelTypeEnum.LLM, features: [] }] }
            }
        ]
        const queries = { execute: jest.fn().mockResolvedValueOnce(catalog).mockResolvedValueOnce([]) }
        const validation = { validate: jest.fn().mockResolvedValue([]) }
        return {
            service: new ModelReplacementService(
                repository as never,
                operations as never,
                access as never,
                queries as never,
                validation as never
            ),
            repository,
            operations,
            access,
            current
        }
    }
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('actor')
    })
    afterEach(() => jest.restoreAllMocks())
    it('refuses a draft changed since preview', async () => {
        const { service, repository } = setup()
        expect(await service.execute({ input, selections: [{ id: 'assistant', revision: 'stale' }] })).toEqual([
            expect.objectContaining({ status: 'conflict' })
        ])
        expect(repository.update).not.toHaveBeenCalled()
    })
    it('rechecks write access at execution time', async () => {
        const { service, repository, access, operations } = setup()
        access.assertCanWrite.mockRejectedValue(new Error('Revoked'))
        expect(
            await service.execute({ input, selections: [{ id: 'assistant', revision: draftRevision(draft) }] })
        ).toEqual([expect.objectContaining({ status: 'failed' })])
        expect(repository.update).not.toHaveBeenCalled()
        expect(operations.save).not.toHaveBeenCalled()
    })
    it('locks the current row, saves a reversible snapshot and updates only the draft', async () => {
        const { service, repository, operations } = setup()
        expect(
            await service.execute({ input, selections: [{ id: 'assistant', revision: draftRevision(draft) }] })
        ).toEqual([{ id: 'assistant', status: 'updated', operationId: 'operation' }])
        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant',
                    organizationId: 'org',
                    id: 'assistant',
                    latest: true
                }),
                lock: { mode: 'pessimistic_write' }
            })
        )
        expect(Object.keys(repository.update.mock.calls[0][1])).toEqual(['draft'])
        expect(operations.save).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'actor', beforeDraft: draft }))
    })
    it('cannot restore over later draft edits', async () => {
        const { service, repository, operations } = setup()
        operations.findOne.mockResolvedValue({
            id: 'operation',
            xpertId: 'assistant',
            beforeDraft: draft,
            afterRevision: 'different'
        })
        await expect(service.restore('operation')).rejects.toThrow()
        expect(repository.update).not.toHaveBeenCalled()
    })
})
