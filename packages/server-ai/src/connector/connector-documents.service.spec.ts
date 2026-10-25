import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ConnectorDocumentsService } from './connector-documents.service'

describe('Interactive connector documents', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
    const context = { actor, assistantId: 'assistant', projectId: 'project' }
    const binding = {
        bindingId: 'binding',
        provider: 'example',
        granted: true,
        status: 'active',
        label: 'Example',
        scope: { type: 'project', projectId: 'project' }
    }
    const runtimeOptions = jest.fn(),
        getRuntimeConnectorCredentialForScope = jest.fn(),
        read = jest.fn(),
        search = jest.fn()
    const service = new ConnectorDocumentsService(
        { runtimeOptions, getRuntimeConnectorCredentialForScope } as never,
        { getRuntime: async () => ({ documents: { read, search } }) } as never
    )
    beforeEach(() => {
        jest.resetAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(actor.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(actor.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.userId)
        runtimeOptions.mockResolvedValue({ items: [binding] })
        getRuntimeConnectorCredentialForScope.mockResolvedValue({ credentials: { token: 'secret' } })
    })
    afterEach(() => jest.restoreAllMocks())
    it('projects only public catalog metadata and refuses client-selected IDs outside the catalog', async () => {
        expect(JSON.stringify(await service.sources(context))).not.toContain('credentials')
        await expect(service.read({ ...context, bindingId: 'foreign', locator: 'doc' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(getRuntimeConnectorCredentialForScope).not.toHaveBeenCalled()
        expect(read).not.toHaveBeenCalled()
    })
    it('resolves a host-selected binding with exact identity and project after live catalog authorization', async () => {
        await service.read({ ...context, bindingId: 'binding', locator: 'doc' })
        expect(runtimeOptions).toHaveBeenCalledWith('assistant', 'project', true)
        expect(getRuntimeConnectorCredentialForScope).toHaveBeenCalledWith(
            { bindingId: 'binding' },
            {
                ...actor,
                xpertId: 'assistant',
                projectId: 'project',
                viewHost: { type: 'agent', id: 'assistant' },
                connectorBindingIds: ['binding']
            }
        )
        expect(read).toHaveBeenCalledTimes(1)
    })
    it('revocation, cross-actor identity and project denial prevent all provider calls', async () => {
        runtimeOptions.mockResolvedValueOnce({ items: [{ ...binding, granted: false }] })
        await expect(service.read({ ...context, bindingId: 'binding', locator: 'doc' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        await expect(service.sources({ ...context, actor: { ...actor, userId: 'other' } })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        runtimeOptions.mockRejectedValueOnce(new ForbiddenException())
        await expect(
            service.search({ ...context, bindingId: 'binding', query: '', pageSize: 25 })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(read).not.toHaveBeenCalled()
        expect(search).not.toHaveBeenCalled()
    })
})
