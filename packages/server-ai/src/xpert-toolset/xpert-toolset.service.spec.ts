jest.mock('./provider/builtin', () => ({
    createBuiltinToolset: jest.fn()
}))

import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import { IBuiltinTool, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/server-core'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/index'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { createBuiltinToolset } from './provider/builtin'
import { XpertToolset } from './xpert-toolset.entity'
import { XpertToolsetService } from './xpert-toolset.service'

describe('XpertToolsetService', () => {
    afterEach(() => jest.restoreAllMocks())

    function tagWriteFixture() {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        const query = {
            innerJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawMany: jest.fn().mockResolvedValue([])
        }
        const tag = {
            id: '11111111-1111-4111-8111-111111111111',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            category: 'toolset',
            isActive: false
        }
        const tagRepository = { find: jest.fn().mockResolvedValue([tag]) }
        const entity = { id: 'toolset-1', name: 'Toolset', workspaceId: 'workspace-1', tags: [{ id: tag.id }] }
        const repository = {
            findOne: jest.fn().mockResolvedValue({ ...entity, tags: [] }),
            create: jest.fn((input) => input),
            save: jest.fn(async (input) => input),
            delete: jest.fn(),
            softRemove: jest.fn(async (input) => input),
            recover: jest.fn(async (input) => input),
            createQueryBuilder: jest.fn(() => query),
            manager: { getRepository: jest.fn(() => tagRepository) }
        }
        const workspaceAccess = {
            assertCan: jest.fn().mockResolvedValue({
                workspace: { id: 'workspace-1', tenantId: 'tenant-1', organizationId: 'org-1' }
            })
        }
        const service = new XpertToolsetService(
            repository as unknown as ConstructorParameters<typeof XpertToolsetService>[0],
            workspaceAccess as unknown as ConstructorParameters<typeof XpertToolsetService>[1],
            {} as I18nService,
            {} as CommandBus,
            {} as QueryBus,
            {} as AgentMiddlewareRuntimeService
        )
        return { service, repository, entity, tag, tagRepository, query, workspaceAccess }
    }

    it.each(['create', 'save', 'update', 'updateToolset'] as const)(
        'rejects a newly associated stopped tag through %s',
        async (method) => {
            const { service, repository, entity } = tagWriteFixture()
            const result =
                method === 'update' || method === 'updateToolset'
                    ? service[method](entity.id, entity)
                    : service[method](entity)
            await expect(result).rejects.toBeInstanceOf(BadRequestException)
            expect(repository.save).not.toHaveBeenCalled()
        }
    )

    it.each(['update', 'updateToolset'] as const)(
        'accepts enabled toolset tags and retains stopped historical associations through %s',
        async (method) => {
            const { service, repository, entity, tag, query, tagRepository } = tagWriteFixture()
            tag.isActive = true
            await expect(service.create(entity)).resolves.toMatchObject({ tags: entity.tags })
            tag.isActive = false
            query.getRawMany.mockResolvedValue([{ id: tag.id }])
            repository.findOne.mockResolvedValue(entity)
            tagRepository.find.mockClear()
            await expect(service[method](entity.id, { name: 'Renamed' })).resolves.toMatchObject({
                name: 'Renamed',
                tags: entity.tags
            })
            expect(tagRepository.find).not.toHaveBeenCalled()
        }
    )

    it('ignores entity relations and audit fields on create while keeping nested tool data', async () => {
        const { service, repository } = tagWriteFixture()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('current-user')
        const input = {
            id: 'injected-id',
            name: 'Created',
            workspaceId: 'workspace-1',
            tenantId: 'foreign-tenant',
            organizationId: 'foreign-org',
            createdById: 'foreign-user',
            workspace: { id: 'foreign-workspace' },
            createdBy: { id: 'foreign-user' },
            tools: [
                {
                    name: 'search',
                    toolset: { id: 'foreign-toolset' },
                    tenantId: 'foreign-tenant',
                    parameters: { query: 'test' },
                    schema: { type: 'object' }
                }
            ]
        }
        const saved = await service.create(input)
        expect(saved).toMatchObject({
            name: 'Created',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'current-user',
            updatedById: 'current-user',
            tools: [{ name: 'search', tenantId: 'tenant-1', parameters: { query: 'test' } }]
        })
        expect(saved.id).toBeUndefined()
        expect(saved.workspace).toBeUndefined()
        expect(saved.createdBy).toBeUndefined()
        expect(saved.tools[0].toolset).toBeUndefined()
        expect(repository.save).toHaveBeenCalledTimes(1)
    })

    it('preserves omitted fields and supports clearing fields and associations explicitly', async () => {
        const { service, repository } = tagWriteFixture()
        const stored = Object.assign(new XpertToolset(), {
            id: 'toolset-1',
            workspaceId: 'workspace-1',
            name: 'Before',
            credentials: { secret: 'kept' },
            description: 'Before',
            tools: [Object.assign(new XpertTool(), { id: 'tool-1', name: 'search' })],
            tags: [{ id: '11111111-1111-4111-8111-111111111111' }]
        })
        repository.findOne.mockResolvedValue(stored)
        await service.update(stored.id, { name: 'After', credentials: undefined })
        expect(stored.credentials).toEqual({ secret: 'kept' })
        expect(stored.tools).toHaveLength(1)
        expect(stored.tags).toHaveLength(1)
        await service.update(stored.id, { description: null, credentials: null, tools: [], tags: [] })
        expect(stored).toMatchObject({ name: 'After', description: null, credentials: null, tools: [], tags: [] })
    })

    it('requires source write permission before moving to a writable workspace', async () => {
        const { service, repository, workspaceAccess } = tagWriteFixture()
        workspaceAccess.assertCan.mockImplementation(async (id, action) => {
            if (id === 'workspace-1' && action === 'write') throw new ForbiddenException()
            return { workspace: { id, tenantId: 'tenant-1', organizationId: 'org-1' } }
        })
        await expect(service.update('toolset-1', { workspaceId: 'workspace-2' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(workspaceAccess.assertCan).not.toHaveBeenCalledWith('workspace-2', 'write')
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('uses the authorized target workspace scope and requires destination write permission', async () => {
        const { service, repository, workspaceAccess } = tagWriteFixture()
        workspaceAccess.assertCan.mockImplementation(async (id) => ({
            workspace: { id, tenantId: 'tenant-1', organizationId: id === 'workspace-2' ? null : 'org-1' }
        }))
        await expect(service.update('toolset-1', { workspaceId: 'workspace-2' })).resolves.toMatchObject({
            workspaceId: 'workspace-2',
            tenantId: 'tenant-1',
            organizationId: null
        })
        expect(workspaceAccess.assertCan).toHaveBeenCalledWith('workspace-2', 'write')
        repository.save.mockClear()
        workspaceAccess.assertCan.mockRejectedValue(new ForbiddenException())
        await expect(service.update('toolset-1', { workspaceId: 'workspace-3' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('rejects tool IDs belonging to another toolset before cascade save', async () => {
        const { service, repository } = tagWriteFixture()
        repository.manager.getRepository.mockReturnValue({ find: jest.fn().mockResolvedValue([]) })
        await expect(
            service.update('toolset-1', { tools: [{ id: 'foreign-tool', name: 'search' }] })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('retains owned tool IDs for cascade updates and scopes newly added tools', async () => {
        const { service, repository } = tagWriteFixture()
        const toolRepository = { find: jest.fn().mockResolvedValue([{ id: 'tool-1' }]) }
        repository.manager.getRepository.mockReturnValue(toolRepository)
        const saved = await service.update('toolset-1', {
            tools: [
                { id: 'tool-1', name: 'search', disabled: true },
                { name: 'new-tool', parameters: {} }
            ]
        })
        expect(saved.tools).toEqual([
            expect.objectContaining({ id: 'tool-1', name: 'search', disabled: true }),
            expect.objectContaining({ name: 'new-tool', tenantId: 'tenant-1', organizationId: 'org-1' })
        ])
        expect(toolRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ toolsetId: 'toolset-1' })
            })
        )
    })

    it.each(['softRemove', 'softRecover', 'delete', 'softDelete'] as const)(
        'requires workspace write permission for %s',
        async (method) => {
            const { service, workspaceAccess } = tagWriteFixture()
            workspaceAccess.assertCan.mockImplementation(async (id, action) => {
                if (action === 'write') throw new ForbiddenException()
                return { workspace: { id, tenantId: 'tenant-1', organizationId: 'org-1' } }
            })
            await expect(service[method]('toolset-1')).rejects.toBeInstanceOf(ForbiddenException)
        }
    )

    it.each(['softRemove', 'softRecover'] as const)(
        'retains write scope even with a narrow select in %s',
        async (method) => {
            const { service, workspaceAccess } = tagWriteFixture()
            workspaceAccess.assertCan.mockImplementation(async (id, action) => {
                if (action === 'write') throw new ForbiddenException()
                return { workspace: { id, tenantId: 'tenant-1', organizationId: 'org-1' } }
            })
            await expect(service[method]('toolset-1', { select: { id: true } })).rejects.toBeInstanceOf(
                ForbiddenException
            )
        }
    )

    it('preserves bad-request responses for database write failures', async () => {
        const { service, repository } = tagWriteFixture()
        repository.save.mockRejectedValue(new Error('Constraint rejected the write'))
        await expect(service.create({ name: 'New', workspaceId: 'workspace-1' })).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('reports a referenced toolset as a bad request when deletion is blocked by a foreign key', async () => {
        const { service, repository } = tagWriteFixture()
        repository.delete.mockRejectedValue(
            new QueryFailedError('DELETE', [], Object.assign(new Error('Referenced'), { code: '23503' }))
        )
        await expect(service.delete('toolset-1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('uses the entity lifecycle methods for soft removal and recovery', async () => {
        const { service, repository } = tagWriteFixture()
        await service.softRemove('toolset-1')
        expect(repository.softRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'toolset-1' }), undefined)
        await service.softRecover('toolset-1')
        expect(repository.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ withDeleted: true }))
        expect(repository.recover).toHaveBeenCalledWith(expect.objectContaining({ id: 'toolset-1' }), undefined)
    })

    it('hydrates persisted builtin tools with the latest provider schema', async () => {
        const latestSchema = {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    'x-ui': {
                        title: {
                            en_US: 'Prompt',
                            zh_Hans: '提示词'
                        }
                    }
                }
            }
        }
        const latestTool: IBuiltinTool = {
            identity: {
                name: 'seedream_text_to_image',
                author: 'yu rongku',
                label: {
                    en_US: 'Seedream text to image'
                },
                provider: 'seedream_aigc'
            },
            description: {
                human: {
                    en_US: 'Generate an image.'
                },
                llm: 'Generate an image.'
            },
            schema: latestSchema
        }
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'ListBuiltinToolProvidersQuery') {
                    return [{ identity: { name: 'seedream_aigc', tags: [] } }]
                }
                if (query.constructor.name === 'ListBuiltinToolsQuery') {
                    return [latestTool]
                }
                return null
            })
        }
        const testingModule = await Test.createTestingModule({
            providers: [
                XpertToolsetService,
                {
                    provide: getRepositoryToken(XpertToolset),
                    useValue: {}
                },
                {
                    provide: XpertWorkspaceAccessService,
                    useValue: {}
                },
                {
                    provide: I18nService,
                    useValue: {}
                },
                {
                    provide: ConfigService,
                    useValue: {}
                },
                {
                    provide: ToolsetRegistry,
                    useValue: {}
                },
                {
                    provide: CommandBus,
                    useValue: {}
                },
                {
                    provide: QueryBus,
                    useValue: queryBus
                },
                {
                    provide: AgentMiddlewareRuntimeService,
                    useValue: { createScopedApi: jest.fn() }
                }
            ]
        }).compile()
        const service = testingModule.get(XpertToolsetService)
        const toolset = Object.assign(new XpertToolset(), {
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: 'seedream_aigc',
            tools: [
                Object.assign(new XpertTool(), {
                    name: 'seedream_text_to_image',
                    disabled: false,
                    description: 'Custom description',
                    schema: {
                        type: 'object',
                        properties: {
                            sequential_image_generation: {
                                type: 'string'
                            }
                        }
                    }
                })
            ]
        })

        const [hydrated] = await service.afterLoad([toolset])

        expect(hydrated.tools[0]).toEqual(
            expect.objectContaining({
                name: 'seedream_text_to_image',
                disabled: false,
                description: 'Custom description',
                schema: latestSchema
            })
        )
    })

    it('validates a builtin toolset with the current model provider runtime', async () => {
        const getModelProvider = jest.fn()
        const createModelClient = jest.fn()
        const createScopedApi = jest.fn().mockReturnValue({ createModelClient, getModelProvider })
        const validateCredentials = jest.fn().mockResolvedValue(undefined)
        jest.mocked(createBuiltinToolset).mockResolvedValue({ validateCredentials } as never)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')

        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'ListBuiltinToolProvidersQuery') {
                    return [
                        {
                            identity: {
                                name: 'zhipu_cogvideo',
                                author: 'XpertAI Team',
                                description: { en_US: 'Zhipu CogVideo' },
                                icon: 'icon.svg',
                                label: { en_US: 'Zhipu CogVideo' },
                                tags: []
                            }
                        }
                    ]
                }
                return {}
            })
        }
        const testingModule = await Test.createTestingModule({
            providers: [
                XpertToolsetService,
                { provide: getRepositoryToken(XpertToolset), useValue: {} },
                { provide: XpertWorkspaceAccessService, useValue: {} },
                { provide: I18nService, useValue: {} },
                { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost/') } },
                { provide: ToolsetRegistry, useValue: {} },
                { provide: CommandBus, useValue: {} },
                { provide: QueryBus, useValue: queryBus },
                { provide: AgentMiddlewareRuntimeService, useValue: { createScopedApi } }
            ]
        }).compile()
        const service = testingModule.get(XpertToolsetService)
        jest.spyOn(service, 'create').mockResolvedValue({ id: 'toolset-1' } as XpertToolset)

        await service.createBuiltinToolset('zhipu_cogvideo', { credentials: {} })

        expect(createScopedApi).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })
        expect(createBuiltinToolset).toHaveBeenCalledWith(
            'zhipu_cogvideo',
            null,
            expect.objectContaining({
                modelRuntime: { createModelClient, getModelProvider }
            })
        )
        expect(validateCredentials).toHaveBeenCalledWith({})
        expect(queryBus.execute.mock.calls.some(([query]) => query.constructor.name === 'EnvStateQuery')).toBe(false)
    })
})
