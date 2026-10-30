import { IsNull, Repository } from 'typeorm'
import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { PlatformToolsetBinding } from '../plugin-resource/app-platform/platform-toolset-binding.entity'
import { hydrateManagedToolsetCredentials } from './managed-toolset-credentials'

describe('managed tool credentials', () => {
    const target = () => Object.assign(new XpertToolset(), {
        id: 'target', tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace',
        category: XpertToolsetCategoryEnum.BUILTIN, type: 'image-service', credentials: null
    })
    function setup() {
        const binding = { findOneBy: jest.fn().mockResolvedValue({ sourceId: 'source' }) }
        const source = { id: 'source', credentials: { apiKey: 'test-only-secret' } }
        const repository = { manager: { getRepository: jest.fn().mockReturnValue(binding) },
            findOneBy: jest.fn().mockResolvedValue(source) }
        return { binding, source, repository, hydrate: (items: XpertToolset[]) =>
            hydrateManagedToolsetCredentials(repository as unknown as Repository<XpertToolset>, items) }
    }
    it('resolves only an exact persisted target binding and a same-tenant shared source', async () => {
        const { repository, binding, hydrate } = setup(), runtime = target()
        await hydrate([runtime])
        expect(repository.manager.getRepository).toHaveBeenCalledWith(PlatformToolsetBinding)
        expect(binding.findOneBy).toHaveBeenCalledWith({ targetId: 'target', tenantId: 'tenant', organizationId: 'org' })
        expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'source', tenantId: 'tenant', organizationId: IsNull(),
            workspaceId: IsNull(), type: 'image-service', category: XpertToolsetCategoryEnum.BUILTIN })
        expect(runtime.credentials).toEqual({ apiKey: 'test-only-secret' })
    })
    it('keeps ordinary toolsets unchanged without resolving a credential source', async () => {
        const { binding, repository, hydrate } = setup(), runtime = target()
        binding.findOneBy.mockResolvedValue(null)
        await hydrate([runtime])
        expect(repository.findOneBy).not.toHaveBeenCalled()
        expect(runtime.credentials).toBeNull()
    })
    it.each([null, { id: 'target', credentials: {} }])('fails closed for unavailable or self-referential sources', async (source) => {
        const { repository, hydrate } = setup()
        repository.findOneBy.mockResolvedValue(source)
        await expect(hydrate([target()])).rejects.toThrow()
    })
})
