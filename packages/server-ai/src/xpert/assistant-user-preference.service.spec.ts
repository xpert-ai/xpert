import { ASSISTANT_USER_PREFERENCES_VERSION } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { AssistantUserPreferenceService } from './assistant-user-preference.service'

describe('AssistantUserPreferenceService', () => {
    let repository: {
        findOne: jest.Mock
        create: jest.Mock
        save: jest.Mock
        createQueryBuilder: jest.Mock
    }
    let service: AssistantUserPreferenceService

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')

        repository = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value),
            createQueryBuilder: jest.fn()
        }
        service = new AssistantUserPreferenceService(repository as never)
    })

    it('reads a typed domain from the current user and Assistant scope', async () => {
        repository.findOne.mockResolvedValue({
            preferences: {
                version: ASSISTANT_USER_PREFERENCES_VERSION,
                modelSelection: { selectedModelId: 'mdl_fast' }
            }
        })

        await expect(service.getDomain('assistant-1', 'modelSelection')).resolves.toEqual({
            selectedModelId: 'mdl_fast'
        })
        expect(repository.findOne).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                assistantId: 'assistant-1',
                userId: 'user-1'
            })
        })
    })

    it('atomically patches one preference domain on an existing row', async () => {
        const query = createUpdateQuery(1)
        repository.createQueryBuilder.mockReturnValue(query)

        await service.setDomain('assistant-1', 'modelSelection', { selectedModelId: 'mdl_fast' })

        expect(query.setParameter).toHaveBeenCalledWith('preferenceDomain', 'modelSelection')
        expect(query.setParameter).toHaveBeenCalledWith(
            'preferenceValue',
            JSON.stringify({ selectedModelId: 'mdl_fast' })
        )
        const update = query.set.mock.calls[0][0].preferences()
        expect(update).toContain('jsonb_set')
        expect(update).toContain('ARRAY[:preferenceDomain]')
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('creates a versioned preference document when no row exists', async () => {
        repository.createQueryBuilder.mockReturnValue(createUpdateQuery(0))

        await service.setDomain('assistant-1', 'modelSelection', { selectedModelId: 'mdl_fast' })

        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                assistantId: 'assistant-1',
                userId: 'user-1',
                preferences: {
                    version: ASSISTANT_USER_PREFERENCES_VERSION,
                    modelSelection: { selectedModelId: 'mdl_fast' }
                }
            })
        )
        expect(repository.save).toHaveBeenCalled()
    })

    it('retries the atomic patch after a concurrent unique insert', async () => {
        repository.createQueryBuilder
            .mockReturnValueOnce(createUpdateQuery(0))
            .mockReturnValueOnce(createUpdateQuery(1))
        repository.save.mockRejectedValueOnce({ code: '23505' })

        await expect(
            service.setDomain('assistant-1', 'modelSelection', { selectedModelId: 'mdl_fast' })
        ).resolves.toBeUndefined()
        expect(repository.createQueryBuilder).toHaveBeenCalledTimes(2)
    })

    it('clears only the requested domain and supports compare-and-clear', async () => {
        const query = createUpdateQuery(1)
        const deleteQuery = createDeleteQuery()
        repository.createQueryBuilder.mockReturnValueOnce(query).mockReturnValueOnce(deleteQuery)
        const expected = { selectedModelId: 'mdl_removed' }

        await expect(service.clearDomain('assistant-1', 'modelSelection', expected)).resolves.toBe(true)

        const update = query.set.mock.calls[0][0].preferences()
        expect(update).toContain('#- ARRAY[:preferenceDomain]')
        expect(query.andWhere).toHaveBeenCalledWith(
            '"preferences" -> :preferenceDomain = CAST(:expectedPreferenceValue AS jsonb)'
        )
        expect(query.setParameter).toHaveBeenCalledWith('expectedPreferenceValue', JSON.stringify(expected))
        expect(deleteQuery.andWhere).toHaveBeenCalledWith(`("preferences" - 'version') = '{}'::jsonb`)
    })

    it('uses the delegated organization scope carried by an API principal', async () => {
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue({
            requestedOrganizationId: 'delegated-organization'
        })

        await service.getPreferences('assistant-1')

        expect(repository.findOne).toHaveBeenCalledWith({
            where: expect.objectContaining({ organizationId: 'delegated-organization' })
        })
    })

    it('uses the tenant-level preference key when organization scope is absent', async () => {
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

        await service.getPreferences('assistant-1')

        const organizationCondition = repository.findOne.mock.calls[0][0].where.organizationId
        expect(organizationCondition).toEqual(expect.objectContaining({ _type: 'isNull' }))
    })

    it('requires a stable user identity', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue(null)

        await expect(service.getPreferences('assistant-1')).rejects.toBeInstanceOf(ForbiddenException)
    })
})

function createUpdateQuery(affected: number) {
    const query = {
        update: jest.fn(),
        set: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        setParameter: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected })
    }
    query.update.mockReturnValue(query)
    query.set.mockReturnValue(query)
    query.where.mockReturnValue(query)
    query.andWhere.mockReturnValue(query)
    query.setParameter.mockReturnValue(query)
    return query
}

function createDeleteQuery() {
    const query = {
        delete: jest.fn(),
        from: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected: 1 })
    }
    query.delete.mockReturnValue(query)
    query.from.mockReturnValue(query)
    query.where.mockReturnValue(query)
    query.andWhere.mockReturnValue(query)
    return query
}
