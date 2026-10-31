import { AiModelTypeEnum, DefaultModelRole, DEFAULT_MODEL_DEFINITIONS, RoleDefaultInput } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { CopilotRoleDefaultService } from './role-default.service'

describe('role default resolution', () => {
    const binding = { copilotId: 'c4bb6d2e-9e9c-4cd3-9223-f993de3feb0b', modelType: AiModelTypeEnum.LLM, model: 'chat' }
    const settings = { findBy: jest.fn(), findOneBy: jest.fn(), manager: { transaction: jest.fn() } }
    const connections = { findOne: jest.fn() }
    const queries = { execute: jest.fn() }
    const service = new CopilotRoleDefaultService(settings as never, connections as never, queries as never)
    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => jest.restoreAllMocks())
    it('uses an explicit organization binding independently of legacy connection roles', async () => {
        settings.findOneBy.mockResolvedValue({ mode: 'fixed', binding })
        expect(await service.resolve('tenant', 'org', DefaultModelRole.Primary)).toEqual({
            configured: true,
            binding,
            sourceOrganizationId: 'org'
        })
        expect(connections.findOne).not.toHaveBeenCalled()
    })
    it('does not fall through an explicitly disabled role', async () => {
        settings.findOneBy.mockResolvedValue({ mode: 'disabled' })
        expect((await service.resolve('tenant', 'org', DefaultModelRole.Primary)).binding).toBeNull()
        expect(settings.findOneBy).toHaveBeenCalledTimes(1)
    })
    it('preserves an unmigrated organization default before a tenant override', async () => {
        settings.findOneBy.mockResolvedValue(null)
        connections.findOne.mockResolvedValue({ id: binding.copilotId, copilotModel: binding })
        expect(await service.resolve('tenant', 'org', DefaultModelRole.Primary)).toEqual({
            configured: false,
            binding,
            sourceOrganizationId: 'org'
        })
        expect(settings.findOneBy).toHaveBeenCalledTimes(1)
    })
    it('inherits a tenant binding only when requested or when no local legacy default exists', async () => {
        settings.findOneBy.mockResolvedValueOnce({ mode: 'inherit' }).mockResolvedValueOnce({ mode: 'fixed', binding })
        expect(await service.resolve('tenant', 'org', DefaultModelRole.Primary)).toEqual({
            configured: true,
            binding,
            sourceOrganizationId: null
        })
    })
    it('rejects wrong model types and unavailable connections before any write', async () => {
        const wrongType: RoleDefaultInput = { role: DefaultModelRole.Embedding, mode: 'fixed', binding }
        await expect(service.save([wrongType])).rejects.toThrow()
        queries.execute.mockResolvedValue([])
        await expect(service.save([{ role: DefaultModelRole.Primary, mode: 'fixed', binding }])).rejects.toThrow()
        expect(settings.manager.transaction).not.toHaveBeenCalled()
    })
    it.each(DEFAULT_MODEL_DEFINITIONS.filter((item) => item.group === 'types'))(
        'persists the correct type and rejects an LLM for $role',
        async ({ role, modelType }) => {
            const typedBinding = { ...binding, modelType }
            const upsert = jest.fn()
            settings.manager.transaction.mockImplementation((callback) =>
                callback({ getRepository: () => ({ upsert }) })
            )
            jest.spyOn(service, 'list').mockResolvedValue([])
            queries.execute
                .mockResolvedValueOnce([
                    {
                        id: binding.copilotId,
                        modelProvider: { id: 'provider' },
                        providerWithModels: { models: [{ model: binding.model, model_type: modelType }] }
                    }
                ])
                .mockResolvedValueOnce([])
            await service.save([{ role, mode: 'fixed', binding: typedBinding }])
            expect(upsert).toHaveBeenCalledWith(
                expect.objectContaining({ role, binding: { ...typedBinding, options: {} } }),
                ['tenantId', 'scopeKey', 'role']
            )
            await expect(service.save([{ role, mode: 'fixed', binding }])).rejects.toThrow()
        }
    )
    it('inherits speech defaults without probing legacy connection roles', async () => {
        const speech = { ...binding, modelType: AiModelTypeEnum.TTS }
        settings.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce({ mode: 'fixed', binding: speech })
        expect(await service.resolve('tenant', 'org', DefaultModelRole.TextToSpeech)).toEqual({
            configured: true,
            binding: speech,
            sourceOrganizationId: null
        })
        expect(connections.findOne).not.toHaveBeenCalled()
    })
    it('falls back to the tenant legacy binding only when no local assignment exists', async () => {
        settings.findOneBy.mockResolvedValue(null)
        connections.findOne.mockImplementation(async ({ where }) =>
            typeof where.organizationId === 'string' ? null : { id: binding.copilotId, copilotModel: binding }
        )
        expect(await service.resolve('tenant', 'org', DefaultModelRole.Primary)).toEqual({
            configured: false,
            binding,
            sourceOrganizationId: null
        })
    })
    it('an explicit inherit ignores a legacy organization default', async () => {
        settings.findOneBy.mockResolvedValueOnce({ mode: 'inherit' }).mockResolvedValueOnce(null)
        connections.findOne.mockResolvedValue({ id: binding.copilotId, copilotModel: binding })
        expect((await service.resolve('tenant', 'org', DefaultModelRole.Primary)).sourceOrganizationId).toBeNull()
        expect(connections.findOne).toHaveBeenCalledTimes(1)
        expect(connections.findOne.mock.calls[0][0].where.organizationId).not.toBe('org')
    })
    it('setup follows the assigned connection without relying on its old role', async () => {
        settings.findOneBy.mockResolvedValue({ mode: 'fixed', binding })
        connections.findOne.mockResolvedValue({ id: binding.copilotId, role: 'embedding', enabled: false })
        expect(await service.setupConnection(DefaultModelRole.Primary)).toMatchObject({
            id: binding.copilotId,
            role: 'embedding',
            copilotModel: binding
        })
        expect(connections.findOne).toHaveBeenCalledWith({
            where: { id: binding.copilotId, tenantId: 'tenant', organizationId: 'org' }
        })
    })
    it('setup cannot edit a tenant-owned connection through an organization assignment', async () => {
        settings.findOneBy.mockResolvedValue({ mode: 'fixed', binding })
        connections.findOne.mockResolvedValue(null)
        expect(await service.setupConnection(DefaultModelRole.Primary)).toBeNull()
        expect(connections.findOne).toHaveBeenCalledTimes(1)
    })
    it('lists all common types with unconfigured types ready to inherit', async () => {
        settings.findBy.mockResolvedValue([])
        settings.findOneBy.mockResolvedValue(null)
        connections.findOne.mockResolvedValue(null)
        const rows = await service.list()
        expect(rows).toHaveLength(DEFAULT_MODEL_DEFINITIONS.length)
        expect(rows.find((row) => row.role === DefaultModelRole.Realtime)).toMatchObject({
            mode: 'inherit',
            binding: null,
            available: false
        })
    })
})
