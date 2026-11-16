import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { ExecutionReviewApi, TXpertProjectAccessRole } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AssistantPrincipalAccessService } from '../../xpert/assistant-principal/assistant-principal-access.service'
import { noAssistantPrincipal } from '../../xpert/assistant-principal/testing/no-assistant-principal.fixture'
import {
    AssertProjectAssistantAccessCommand,
    AssertProjectAssistantAccessHandler
} from '../../xpert-project/commands/assert-project-assistant-access.command'
import { XpertProjectMembership } from '../../xpert-project/entities/project-membership.entity'
import { XpertProject } from '../../xpert-project/entities/project.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../xpert-project/services/project-xpert-binding.service'
import { bindExecutionReviewAccess } from './execution-review-access'

const scope = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'supervisor',
    projectId: 'project',
    xpertId: 'assistant'
}
const operations = {
    list: (api: ExecutionReviewApi) => api.list('intent', { queue: 'pending', page: 1, pageSize: 10 }),
    get: (api: ExecutionReviewApi) => api.get('intent', 'execution'),
    submit: (api: ExecutionReviewApi) =>
        api.submit('intent', {
            executionId: 'execution',
            bundleHash: 'version',
            disposition: 'confirmed',
            use: 'case_only'
        })
}

describe('project execution review authorization', () => {
    let role: TXpertProjectAccessRole | null
    let archived: boolean
    let bound: boolean
    let api: ExecutionReviewApi
    const data = { list: jest.fn(), get: jest.fn(), submit: jest.fn() }

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                XpertProjectAccessService,
                AssertProjectAssistantAccessHandler,
                {
                    provide: getRepositoryToken(XpertProject),
                    useValue: {
                        findOne: async () => ({
                            id: scope.projectId,
                            ownerId: role === 'owner' ? scope.userId : 'other',
                            status: archived ? 'archived' : 'active'
                        })
                    }
                },
                {
                    provide: getRepositoryToken(XpertProjectMembership),
                    useValue: { findOne: async () => role && { role } }
                },
                {
                    provide: XpertProjectXpertBindingService,
                    useValue: { resolveCurrentById: async () => ({ id: scope.xpertId }), contains: () => bound }
                },
                { provide: AssistantPrincipalAccessService, useValue: noAssistantPrincipal },
                {
                    provide: CommandBus,
                    useFactory: (handler: AssertProjectAssistantAccessHandler) => ({
                        execute: (cmd: AssertProjectAssistantAccessCommand) => handler.execute(cmd)
                    }),
                    inject: [AssertProjectAssistantAccessHandler]
                }
            ]
        }).compile()
        api = bindExecutionReviewAccess(module.get(CommandBus), scope, data)
    })

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
        role = 'manager'
        archived = false
        bound = true
        jest.clearAllMocks()
    })
    afterEach(() => jest.restoreAllMocks())

    it.each(Object.entries(operations))('%s revalidates roles and scope on the same bound API', async (_, invoke) => {
        for (role of ['owner', 'manager'] as const) await invoke(api)
        for (role of ['member', 'editor', null] as const)
            await expect(invoke(api)).rejects.toBeInstanceOf(ForbiddenException)
        role = 'manager'
        archived = true
        await expect(invoke(api)).rejects.toBeInstanceOf(ForbiddenException)
        archived = false
        bound = false
        await expect(invoke(api)).rejects.toBeInstanceOf(ForbiddenException)
        bound = true
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('other')
        await expect(invoke(api)).rejects.toBeInstanceOf(ForbiddenException)
        expect(Object.values(data).reduce((total, method) => total + method.mock.calls.length, 0)).toBe(2)
    })
})
