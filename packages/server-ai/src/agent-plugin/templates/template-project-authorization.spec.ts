import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import type { TemplateAgentSource } from '@xpert-ai/contracts'
import { AssertProjectAssistantAccessHandler } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../xpert-project/services/project-xpert-binding.service'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { XpertProjectMembership } from '../../xpert-project/entities/project-membership.entity'
import type { RuntimeResourceService } from '../runtime-resource.service'
import {
    AuthorizeTemplateExecutionCommand,
    AuthorizeTemplateExecutionHandler
} from './resolve-template-execution.command'

jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))

describe('Project template task authorization', () => {
    let module: TestingModule
    let tenantId: string
    let organizationId: string
    let member: boolean
    let linked: boolean
    let archived: boolean
    const source: TemplateAgentSource = {
        kind: 'agent_plugin_template',
        bindingId: 'binding',
        version: 'one',
        digest: 'digest',
        packageName: 'reviewers',
        templateKey: 'reviewer'
    }
    let authorize: (projectId?: string) => Promise<unknown>
    let prepareResources: jest.Mock

    beforeEach(async () => {
        tenantId = 'tenant'
        organizationId = 'organization'
        member = linked = true
        archived = false
        jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockImplementation(() => organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('member')
        const projects = {
            findOne: jest.fn(async (options: { where: { id: string; tenantId: string; organizationId: string } }) =>
                options.where.id === 'project' &&
                options.where.tenantId === 'tenant' &&
                options.where.organizationId === 'organization'
                    ? {
                          id: 'project',
                          tenantId,
                          organizationId,
                          ownerId: 'owner',
                          status: archived ? 'archived' : 'active'
                      }
                    : null
            )
        }
        const members = { findOne: jest.fn(async () => (member ? { role: 'member' } : null)) }
        const bindings = { resolveCurrentById: jest.fn(async () => ({ id: 'assistant' })), contains: () => linked }
        const access = new XpertProjectAccessService(
            projects as unknown as Repository<XpertProject>,
            members as unknown as Repository<XpertProjectMembership>,
            bindings as unknown as XpertProjectXpertBindingService
        )
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [AssertProjectAssistantAccessHandler, { provide: XpertProjectAccessService, useValue: access }]
        }).compile()
        await module.init()
        prepareResources = jest.fn(async () => ({ templates: [source] }))
        const handler = new AuthorizeTemplateExecutionHandler(
            { resolve: prepareResources } as unknown as RuntimeResourceService,
            { execute: async () => ({ agent: { team: { id: 'assistant' } } }) } as unknown as QueryBus,
            module.get(CommandBus)
        )
        authorize = (projectId = 'project') =>
            handler.execute(
                new AuthorizeTemplateExecutionCommand(
                    'assistant',
                    { revision: 1, resources: [{ bindingId: source.bindingId, version: source.version }] },
                    source,
                    projectId
                )
            )
    })
    afterEach(async () => {
        await module?.close()
        jest.restoreAllMocks()
    })

    it('allows a Project-only member without requiring standalone Assistant file authority', async () => {
        // No Assistant file handler is registered: Project execution must not enter that ACL.
        await expect(authorize()).resolves.toEqual({ id: 'assistant' })
        expect(prepareResources).toHaveBeenCalledWith('assistant', expect.any(Object), 'project')
    })

    it.each(['membership', 'binding', 'archive'] as const)(
        'rejects %s changes on subsequent calls and replay',
        async (change) => {
            await authorize()
            if (change === 'membership') member = false
            if (change === 'binding') linked = false
            if (change === 'archive') archived = true
            prepareResources.mockClear()
            await expect(authorize()).rejects.toThrow(ForbiddenException)
            expect(prepareResources).not.toHaveBeenCalled()
        }
    )

    it.each(['tenant', 'organization', 'project'] as const)(
        'rejects forged %s scope before resource preparation',
        async (scope) => {
            if (scope === 'tenant') tenantId = 'other'
            if (scope === 'organization') organizationId = 'other'
            await expect(authorize(scope === 'project' ? 'other' : 'project')).rejects.toThrow(ForbiddenException)
            expect(prepareResources).not.toHaveBeenCalled()
        }
    )
})
