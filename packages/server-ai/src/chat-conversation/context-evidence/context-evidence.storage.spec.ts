jest.mock('@xpert-ai/server-core', () => ({ TenantOrganizationBaseEntity: class {} }))

import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { In, IsNull } from 'typeorm'
import { ContextEvidence } from './context-evidence.entity'
import { ContextEvidenceStorage } from './context-evidence.schema'
import { DatabaseContextEvidenceStorage } from './context-evidence.storage'

it('resolves the storage provider, scopes every database read, and uses bounded immutable inserts', async () => {
    const query = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({})
    }
    const repository = { createQueryBuilder: () => query, find: jest.fn().mockResolvedValue([]) }
    const module = await Test.createTestingModule({
        providers: [
            { provide: ContextEvidenceStorage, useClass: DatabaseContextEvidenceStorage },
            { provide: getRepositoryToken(ContextEvidence), useValue: repository }
        ]
    }).compile()
    try {
        const storage = module.get(ContextEvidenceStorage)
        const scope = {
            tenantId: 'tenant',
            organizationId: null,
            userId: 'actor',
            conversationId: 'conversation',
            threadId: 'thread',
            agentKey: 'agent'
        }
        const records = Array.from({ length: 201 }, (_, i) => ({ evidenceId: String(i), payload: `original ${i}` }))
        await storage.put(scope, records)
        expect(query.values.mock.calls.map(([rows]) => rows.length)).toEqual([100, 100, 1])
        expect(query.values.mock.calls[0][0][0]).toMatchObject({
            ...records[0],
            tenantId: 'tenant',
            organizationId: null,
            conversationId: 'conversation',
            threadId: 'thread',
            agentKey: 'agent',
            createdById: 'actor'
        })
        expect(query.orIgnore).toHaveBeenCalledTimes(3)
        await storage.get(scope, ['archive'])
        expect(repository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: IsNull(),
                conversationId: 'conversation',
                threadId: 'thread',
                agentKey: 'agent',
                evidenceId: In(['archive'])
            },
            select: { evidenceId: true, payload: true }
        })
        repository.find.mockClear()
        await storage.get({ ...scope, organizationId: 'org' }, [])
        expect(repository.find).not.toHaveBeenCalled()
    } finally {
        await module.close()
    }
})
