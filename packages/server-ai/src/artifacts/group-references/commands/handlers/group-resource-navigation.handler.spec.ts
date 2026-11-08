import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { GroupResourceNavigationHandler } from './group-resource-navigation.handler'
import { GroupResourceNavigationCommand } from '../group-resource-navigation.command'
import { ArtifactGroupReferenceService } from '../../artifact-group-reference.service'

describe('group navigation metadata', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'human' }
    const list = jest.fn(),
        resolve = jest.fn()
    let handler: GroupResourceNavigationHandler
    beforeEach(async () => {
        list.mockReset()
        resolve.mockReset()
        const module = await Test.createTestingModule({
            providers: [
                GroupResourceNavigationHandler,
                { provide: ArtifactGroupReferenceService, useValue: { list, resolve } }
            ]
        }).compile()
        handler = module.get(GroupResourceNavigationHandler)
    })
    it('searches accepted references across sparse pages without leaking source metadata', async () => {
        list.mockResolvedValueOnce({ items: [{ id: 'wrong', title: 'Other' }], nextOffset: 100 }).mockResolvedValueOnce(
            {
                items: [{ id: 'ref', title: 'Inventory', runtimeProjectId: 'B', ownerProjectId: 'A', versionId: 'v' }],
                nextOffset: null
            }
        )
        expect(
            await handler.execute(new GroupResourceNavigationCommand(actor, 'group', { query: 'inventory', offset: 0 }))
        ).toEqual({
            items: [{ referenceId: 'ref', projectId: 'B', title: 'Inventory' }],
            hasMore: false
        })
        expect(list.mock.calls.map((call) => call[2].offset)).toEqual([0, 100])
    })
    it('reauthorizes every reference before navigation and propagates revoked access', async () => {
        resolve.mockRejectedValue(new ForbiddenException())
        await expect(
            handler.execute(
                new GroupResourceNavigationCommand(actor, 'group', { referenceIds: ['foreign-or-revoked'] })
            )
        ).rejects.toThrow(ForbiddenException)
        expect(resolve).toHaveBeenCalledWith(actor, 'group', 'foreign-or-revoked')
    })
})
