import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ContentResourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import { UserOrganization, UserGroup } from '@xpert-ai/server-core'
import { ContentIdentityService } from './content-identity.service'
import { ContentResourceService } from './content-resource.service'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'member' }
describe('Content identity and authorization composition', () => {
  it('wires explicit identity dependencies and fails closed before plugin dispatch after revocation', async () => {
    const exists = jest.fn().mockResolvedValue(true)
    const groupQuery = { select: jest.fn().mockReturnThis(), innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([{ id: 'group' }]) }
    const authorize = jest.fn().mockResolvedValue({ providerKey: 'source', resourceId: 'item' })
    const get = jest.fn().mockReturnValue({ title: 'Only authorization', authorize })
    const module = await Test.createTestingModule({ providers: [ContentIdentityService, ContentResourceService,
      { provide: getRepositoryToken(UserOrganization), useValue: { exists } },
      { provide: getRepositoryToken(UserGroup), useValue: { createQueryBuilder: () => groupQuery } },
      { provide: ContentResourceProviderRegistry, useValue: { get } }
    ] }).compile()
    try {
      const service = module.get(ContentResourceService)
      const input = { actor, providerKey: 'source', resourceId: 'item', operation: 'read' as const }
      await service.authorize(input)
      expect(authorize).toHaveBeenCalledWith({ ...input, principal: { ...actor, groupIds: ['group'] } })
      expect(service.identities).toBe(module.get(ContentIdentityService))
      expect(get).toHaveBeenCalledWith('source', actor.organizationId)
      exists.mockResolvedValue(false)
      await expect(service.authorize(input)).rejects.toThrow(ForbiddenException)
      expect(authorize).toHaveBeenCalledTimes(1)
    } finally { await module.close() }
  })
})
