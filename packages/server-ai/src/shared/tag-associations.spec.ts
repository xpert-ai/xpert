import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { TagCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext, Tag } from '@xpert-ai/server-core'
import { In, IsNull, Repository } from 'typeorm'
import type { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { assertValidTagAssociations } from './tag-associations'

const tagId = '11111111-1111-4111-8111-111111111111'
const secondTagId = '22222222-2222-4222-8222-222222222222'

function setup(overrides: Partial<Tag> = {}) {
    const tag = Object.assign(new Tag(), {
        id: tagId,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        category: TagCategoryEnum.XPERT,
        isActive: true,
        ...overrides
    })
    const query = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([])
    }
    const tagRepository = { find: jest.fn().mockResolvedValue([tag]) }
    const repository = {
        createQueryBuilder: jest.fn(() => query),
        manager: { getRepository: jest.fn(() => tagRepository) }
    }
    const access = {
        assertCan: jest.fn().mockResolvedValue({ workspace: { tenantId: 'tenant-1', organizationId: 'org-1' } })
    }
    const validate = (
        entity: Parameters<typeof assertValidTagAssociations>[2] = { id: 'resource-1', tags: [{ id: tagId }] },
        target = TagCategoryEnum.XPERT,
        sourceId?: string
    ) =>
        assertValidTagAssociations(
            repository as unknown as Repository<{ id: string }>,
            access as unknown as XpertWorkspaceAccessService,
            entity,
            target,
            sourceId
        )
    return { validate, tag, query, tagRepository, repository, access }
}

describe('tag association validation', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
    })
    afterEach(() => jest.restoreAllMocks())

    it('accepts enabled organization and tenant-shared tags without requiring definition-edit permission', async () => {
        const { validate, tag, tagRepository } = setup()
        tagRepository.find.mockResolvedValue([tag, { ...tag, id: secondTagId, organizationId: null }])
        await expect(validate({ tags: [{ id: tagId }, { id: secondTagId }] })).resolves.toBeUndefined()
        expect(tagRepository.find).toHaveBeenCalledWith({
            where: [
                { id: In([tagId, secondTagId]), tenantId: 'tenant-1', organizationId: IsNull() },
                { id: In([tagId, secondTagId]), tenantId: 'tenant-1', organizationId: 'org-1' }
            ]
        })
        expect(RequestContext.hasPermission).not.toHaveBeenCalled()
    })

    it.each([
        ['stopped', { isActive: false }],
        ['another tenant', { tenantId: 'tenant-2' }],
        ['another organization', { organizationId: 'org-2' }],
        ['wrong target', { targets: ['knowledgebase'] }]
    ] as [string, Partial<Tag>][])('rejects a newly associated tag that is %s', async (_, changes) => {
        const { validate } = setup(changes)
        await expect(validate()).rejects.toBeInstanceOf(BadRequestException)
    })

    it('validates prompt tags through their dedicated relation and preserves existing disabled associations', async () => {
        const { repository, access, query, tagRepository } = setup({ targets: ['prompt_workflow'], isActive: false })
        query.getRawMany.mockResolvedValue([{ id: tagId }])
        await expect(
            assertValidTagAssociations(
                repository as unknown as Repository<{ id: string }>,
                access as unknown as XpertWorkspaceAccessService,
                { workspaceId: 'workspace-1', tags: [{ id: tagId }] },
                'prompt_workflow',
                'prompt-1',
                'organizationTags'
            )
        ).resolves.toBeUndefined()
        expect(query.innerJoin).toHaveBeenCalledWith('resource.organizationTags', 'tag')
        expect(tagRepository.find).not.toHaveBeenCalled()
    })

    it('does not trust an enabled flag or targets supplied by the client', async () => {
        const { validate } = setup({ isActive: false })
        await expect(validate({ tags: [{ id: tagId, isActive: true, targets: ['xpert'] }] })).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('rejects nonexistent or deleted IDs', async () => {
        const { validate, tagRepository } = setup()
        tagRepository.find.mockResolvedValue([])
        await expect(validate()).rejects.toBeInstanceOf(BadRequestException)
    })

    it.each([{ tags: [{ id: 'invalid-id' }] }, { tags: [{ id: 3 }] }, { tags: ['tag-name'] }, { tags: { id: tagId } }])(
        'rejects malformed association input $tags before querying storage',
        async ({ tags }) => {
            const { validate, repository, tagRepository } = setup()
            await expect(validate({ tags })).rejects.toBeInstanceOf(BadRequestException)
            expect(repository.createQueryBuilder).not.toHaveBeenCalled()
            expect(tagRepository.find).not.toHaveBeenCalled()
        }
    )

    it.each([{ tags: undefined }, { tags: null }, { tags: [] }])(
        'allows omitted or cleared tags ($tags)',
        async ({ tags }) => {
            const { validate, repository, tagRepository } = setup()
            await expect(validate({ tags })).resolves.toBeUndefined()
            expect(repository.createQueryBuilder).not.toHaveBeenCalled()
            expect(tagRepository.find).not.toHaveBeenCalled()
        }
    )

    it('leaves ID-less legacy tag definitions to the existing create/import policy', async () => {
        const { validate, tagRepository } = setup()
        await expect(validate({ tags: [{ name: 'Imported', category: 'xpert' }] })).resolves.toBeUndefined()
        expect(tagRepository.find).not.toHaveBeenCalled()
    })

    it('checks each ID once without modifying the caller payload', async () => {
        const { validate, tagRepository } = setup()
        const tags = [{ id: tagId }, { id: tagId }]
        await expect(validate({ tags })).resolves.toBeUndefined()
        expect(tagRepository.find.mock.calls[0][0].where[0].id).toEqual(In([tagId]))
        expect(tags).toEqual([{ id: tagId }, { id: tagId }])
    })

    it('retains persisted historical links without requiring them to remain selectable', async () => {
        const { validate, query, tagRepository } = setup({ isActive: false, targets: ['knowledgebase'] })
        query.getRawMany.mockResolvedValue([{ id: tagId }])
        await expect(validate()).resolves.toBeUndefined()
        expect(query.where).toHaveBeenCalledWith('resource.id = :resourceId', { resourceId: 'resource-1' })
        expect(query.andWhere).toHaveBeenCalledWith('resource.tenantId = :tenantId', { tenantId: 'tenant-1' })
        expect(tagRepository.find).not.toHaveBeenCalled()
    })

    it('still validates additions when historical links are retained', async () => {
        const { validate, query, tagRepository } = setup({ id: secondTagId, isActive: false })
        query.getRawMany.mockResolvedValue([{ id: tagId }])
        await expect(validate({ id: 'resource-1', tags: [{ id: tagId }, { id: secondTagId }] })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(tagRepository.find.mock.calls[0][0].where[0].id).toEqual(In([secondTagId]))
    })

    it('revalidates a removed historical link when it is added back', async () => {
        const { validate, query } = setup({ isActive: false })
        query.getRawMany.mockResolvedValueOnce([{ id: tagId }]).mockResolvedValueOnce([])
        await expect(validate()).resolves.toBeUndefined()
        await expect(validate()).rejects.toBeInstanceOf(BadRequestException)
    })

    it('allows a version backup to inherit only the source resource persisted links', async () => {
        const { validate, query, tagRepository } = setup({ isActive: false })
        query.getRawMany.mockResolvedValue([{ id: tagId }])
        await expect(validate({ tags: [{ id: tagId }] }, TagCategoryEnum.XPERT, 'source-1')).resolves.toBeUndefined()
        expect(query.where).toHaveBeenCalledWith('resource.id = :resourceId', { resourceId: 'source-1' })
        expect(tagRepository.find).not.toHaveBeenCalled()
    })

    it('uses the authorized workspace scope instead of the selected organization', async () => {
        const { validate, access, tagRepository } = setup({ organizationId: 'workspace-org' })
        access.assertCan.mockResolvedValue({ workspace: { tenantId: 'tenant-1', organizationId: 'workspace-org' } })
        await expect(validate({ workspaceId: 'workspace-1', tags: [{ id: tagId }] })).resolves.toBeUndefined()
        expect(access.assertCan).toHaveBeenCalledWith('workspace-1', 'write')
        expect(tagRepository.find.mock.calls[0][0].where[1].organizationId).toBe('workspace-org')
    })

    it('does not allow organization tags on a tenant-scoped resource', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const { validate, tagRepository } = setup()
        await expect(validate()).rejects.toBeInstanceOf(BadRequestException)
        expect(tagRepository.find).toHaveBeenCalledWith({
            where: {
                id: In([tagId]),
                tenantId: 'tenant-1',
                organizationId: IsNull()
            }
        })
    })

    it('requires a tenant context', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(null)
        const { validate, tagRepository } = setup()
        await expect(validate()).rejects.toBeInstanceOf(ForbiddenException)
        expect(tagRepository.find).not.toHaveBeenCalled()
    })

    it('accepts legacy toolset categories and gives explicit targets precedence over category', async () => {
        const { validate, tag } = setup({ category: TagCategoryEnum.TOOLSET })
        await expect(validate({ tags: [{ id: tagId }] }, TagCategoryEnum.TOOLSET)).resolves.toBeUndefined()
        tag.targets = [TagCategoryEnum.XPERT]
        await expect(validate({ tags: [{ id: tagId }] }, TagCategoryEnum.TOOLSET)).rejects.toBeInstanceOf(
            BadRequestException
        )
        await expect(validate()).resolves.toBeUndefined()
    })
})
