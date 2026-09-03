import { ForbiddenException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { McpInvocationAudit, McpPublication, McpPublicationCapability } from './entities'
import { McpInvocationAuditService } from './mcp-invocation-audit.service'

describe('McpInvocationAuditService', () => {
    it('stores only structural argument metadata and never bearer values', async () => {
        const saved: McpInvocationAudit[] = []
        const repository = {
            create: jest.fn((input) => Object.assign(new McpInvocationAudit(), input)),
            save: jest.fn(async (audit) => {
                saved.push(audit)
                return audit
            })
        } as unknown as Repository<McpInvocationAudit>
        const service = new McpInvocationAuditService(repository)
        const secret = 'xpert_mcp_secret_that_must_not_be_logged'

        await service.start({
            publication: Object.assign(new McpPublication(), {
                id: 'publication-1',
                tenantId: 'tenant-1'
            }),
            principal: {
                authMethod: 'api_key',
                credentialPrefix: secret.slice(0, 24),
                subjectType: 'user',
                subjectId: 'user-1',
                userId: 'user-1',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                publicationId: 'publication-1',
                scopes: ['tools:call']
            },
            capability: Object.assign(new McpPublicationCapability(), {
                id: 'capability-1',
                toolsetId: 'toolset-1',
                capabilityKey: 'generic_search',
                publicName: 'generic_search'
            }),
            requestId: 'request-1',
            arguments: { query: 'MCP', apiKey: secret }
        })

        expect(saved[0].argumentSummary).toEqual({
            keys: ['query', 'apiKey'],
            bytes: expect.any(Number)
        })
        expect(saved[0].clientName).toBe(secret.slice(0, 24))
        expect(saved[0].organizationId).toBe('organization-1')
        expect(JSON.stringify(saved[0])).not.toContain(secret)
        expect(saved[0]).not.toHaveProperty('authorization')
    })

    it('marks forbidden capability execution attempts as denied', async () => {
        const repository = {
            create: jest.fn((input) => Object.assign(new McpInvocationAudit(), input)),
            save: jest.fn(async (audit) => audit)
        } as unknown as Repository<McpInvocationAudit>
        const service = new McpInvocationAuditService(repository)
        const audit = new McpInvocationAudit()

        await service.failed(audit, Date.now(), new ForbiddenException())

        expect(audit.status).toBe('denied')
    })

    it('returns one audit page with the total matching records', async () => {
        const items = [Object.assign(new McpInvocationAudit(), { id: 'audit-11' })]
        const queryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([items, 23])
        }
        const repository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        } as unknown as Repository<McpInvocationAudit>
        const service = new McpInvocationAuditService(repository)

        await expect(service.search('publication-1', 10, 10)).resolves.toEqual({ items, total: 23 })
        expect(queryBuilder.skip).toHaveBeenCalledWith(10)
        expect(queryBuilder.take).toHaveBeenCalledWith(10)
    })

    it('limits shared Publication audit history to the current organization', async () => {
        const queryBuilder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0])
        }
        const service = new McpInvocationAuditService({
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder)
        } as unknown as Repository<McpInvocationAudit>)

        await service.search('publication-1', 0, 10, 'organization-1')

        expect(queryBuilder.andWhere).toHaveBeenCalledWith('audit.organizationId = :organizationId', {
            organizationId: 'organization-1'
        })
    })
})
