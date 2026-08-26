import type { McpPrincipal } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { McpPublication } from './entities'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'

describe('McpPublicationAuthorizationService', () => {
    let findOne: jest.Mock
    let service: McpPublicationAuthorizationService

    beforeEach(() => {
        findOne = jest.fn()
        service = new McpPublicationAuthorizationService({ findOne } as unknown as Repository<User>)
    })

    it('checks current organization membership on every user request', async () => {
        findOne.mockResolvedValue(user(true))
        await expect(service.assertCanRun(publication(), principal())).resolves.toBeUndefined()

        findOne.mockResolvedValue(user(false))
        await expect(service.assertCanRun(publication(), principal())).rejects.toBeInstanceOf(ForbiddenException)
        expect(findOne).toHaveBeenCalledTimes(2)
    })

    it.each([
        ['tenant', { tenantId: 'another-tenant' }],
        ['organization', { organizationId: 'another-organization' }],
        ['publication', { publicationId: 'another-publication' }]
    ])('rejects a principal bound to another %s before loading the user', async (_label, override) => {
        await expect(service.assertCanRun(publication(), { ...principal(), ...override })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(findOne).not.toHaveBeenCalled()
    })

    it('allows a service account already bound to the publication scope without a workspace lookup', async () => {
        const serviceAccount: McpPrincipal = {
            ...principal(),
            subjectType: 'service_account',
            subjectId: '10000000-0000-4000-8000-000000000006',
            userId: undefined,
            clientId: '10000000-0000-4000-8000-000000000006'
        }

        await expect(service.assertCanRun(publication(), serviceAccount)).resolves.toBeUndefined()
        expect(findOne).not.toHaveBeenCalled()
    })
})

function publication() {
    return Object.assign(new McpPublication(), {
        id: '10000000-0000-4000-8000-000000000001',
        tenantId: '10000000-0000-4000-8000-000000000002',
        organizationId: '10000000-0000-4000-8000-000000000003'
    })
}

function principal(): McpPrincipal {
    return {
        authMethod: 'oauth',
        subjectType: 'user',
        subjectId: '10000000-0000-4000-8000-000000000005',
        userId: '10000000-0000-4000-8000-000000000005',
        tenantId: publication().tenantId,
        organizationId: publication().organizationId ?? undefined,
        publicationId: publication().id,
        scopes: ['tools:list']
    }
}

function user(isActive: boolean) {
    return Object.assign(new User(), {
        id: principal().userId,
        tenantId: publication().tenantId,
        organizations: [
            {
                organizationId: publication().organizationId,
                isActive
            }
        ]
    })
}
